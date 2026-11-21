// Cálculos del agente. Todo número que el LLM cite sale de aquí o de la fuente — nunca del modelo.
import { fuente } from "./fuente.js";
import { EMPRESAS, VERSIONES, type CodigoEmpresa, type Indicadores, type Version } from "./contrato.js";

export type Metrica = "ventas" | "ebit" | "nopat" | "eva" | "roic" | "roce";
const PORCENTAJES: Metrica[] = ["roic", "roce"];

const pct = (x: number) => `${(x * 100).toFixed(2)}%`;
const gtq = (x: number) => `GTQ ${Math.round(x).toLocaleString("en-US")}`;
/** Comparación contra el WACC hecha por código (los modelos pequeños se equivocan al comparar). */
export const vsWacc = (roic: number | null, wacc = 0.11) =>
  roic === null ? "sin dato" : roic >= wacc ? `POR ENCIMA del WACC (${pct(wacc)}): crea valor` : `POR DEBAJO del WACC (${pct(wacc)}): destruye valor`;
export const fmt = (m: Metrica, x: number | null) => (x === null ? "sin dato" : PORCENTAJES.includes(m) ? pct(x) : gtq(x));

function valor(ind: Indicadores | null | undefined, m: Metrica): number | null {
  if (!ind) return null;
  const v = (ind as any)[m];
  if (v === undefined || v === null) return null;
  return Number(typeof v === "string" ? v : v.valor);
}

async function indicadores(sujeto: CodigoEmpresa | "GRUPO", version: Version) {
  const c = await fuente.consolidado(version);
  return sujeto === "GRUPO" ? c.grupoCorregido ?? c.grupo : c.empresas[sujeto]?.indicadores;
}

/** Valores de una métrica en las 3 versiones + crecimiento y desvío del reforecast. */
export async function tendencia(sujeto: CodigoEmpresa | "GRUPO", m: Metrica) {
  const vals = {} as Record<Version, number | null>;
  for (const v of VERSIONES) vals[v] = valor(await indicadores(sujeto, v), m);
  const { real_2025: r, ppto_2026: p, reforecast_2026: f } = vals;
  const esPct = PORCENTAJES.includes(m);
  // Para ROIC/ROCE el cambio se expresa en puntos porcentuales, no en % de un %.
  const cambio = (a: number | null, b: number | null) => {
    if (a === null || b === null) return "sin dato";
    if (esPct) return `${((b - a) * 100).toFixed(2)} puntos porcentuales`;
    return a === 0 ? "sin dato" : `${pct((b - a) / Math.abs(a))} (${gtq(b - a)})`;
  };
  const desvio = p !== null && f !== null ? f - p : null;
  return {
    sujeto, metrica: m, tipoDato: "calculado",
    valores: Object.fromEntries(VERSIONES.map((v) => [v, fmt(m, vals[v])])),
    cambio_real2025_a_ppto2026: cambio(r, p),
    cambio_real2025_a_reforecast2026: cambio(r, f),
    desvioReforecastVsPpto: desvio === null ? "sin dato" : esPct ? `${(desvio * 100).toFixed(2)} puntos porcentuales` : gtq(desvio),
    lectura: desvio === null ? "No hay datos suficientes de 2026 para este sujeto."
      : desvio < 0 ? "El reforecast quedó POR DEBAJO del presupuesto: la empresa va peor de lo planeado."
      : "El reforecast quedó igual o POR ENCIMA del presupuesto.",
  };
}

/** Proyección 2027 por tendencia: aplica al Reforecast 2026 el crecimiento observado Real 2025 → Reforecast 2026. */
export async function proyectar2027(sujeto: CodigoEmpresa | "GRUPO", m: Metrica) {
  const t = await tendencia(sujeto, m);
  const r = valor(await indicadores(sujeto, "real_2025"), m);
  const f = valor(await indicadores(sujeto, "reforecast_2026"), m);
  if (r === null || f === null || r === 0) {
    return { sujeto, metrica: m, tipoDato: "proyectado", proyeccion2027: "no disponible",
      limitacion: "Faltan valores de Real 2025 o Reforecast 2026 para este sujeto; no se puede proyectar." };
  }
  const g = (f - r) / Math.abs(r);
  const p2027 = PORCENTAJES.includes(m) ? f + (f - r) : f * (1 + g);
  return {
    sujeto, metrica: m, tipoDato: "proyectado",
    base_reforecast_2026: fmt(m, f),
    crecimientoAplicado: PORCENTAJES.includes(m) ? `${((f - r) * 100).toFixed(2)} puntos` : pct(g),
    proyeccion2027: fmt(m, p2027),
    supuesto: "Proyección por tendencia: se repite en 2027 el cambio observado entre Real 2025 y Reforecast 2026.",
    limitacion: "Solo hay 2 puntos de datos (no hay meses), así que es una extrapolación simple, no un modelo estadístico. Usar como escenario, no como certeza.",
    contexto: t,
  };
}

/** Empresas que destruyen valor: ROIC < WACC o EVA < 0. */
export async function riesgos(version: Version = "real_2025") {
  const wacc = Number((await fuente.supuestos()).wacc);
  const c = await fuente.consolidado(version);
  const filas = EMPRESAS.flatMap((e) => {
    const ind = c.empresas[e]?.indicadores;
    if (!ind) return [];
    const roic = valor(ind, "roic")!, eva = valor(ind, "eva")!;
    return [{ empresa: e, roic, eva }];
  }).sort((a, b) => a.eva - b.eva);
  const g = c.grupoCorregido ?? c.grupo;
  return {
    version, tipoDato: "calculado", wacc: pct(wacc),
    grupo: g ? { roic: fmt("roic", valor(g, "roic")), eva: fmt("eva", valor(g, "eva")),
      destruyeValor: (valor(g, "roic") ?? 0) < wacc } : "sin dato",
    destruyenValor: filas.filter((f) => f.roic < wacc || f.eva < 0)
      .map((f) => ({ empresa: f.empresa, roic: pct(f.roic), eva: gtq(f.eva), brechaVsWacc: `${((f.roic - wacc) * 100).toFixed(2)} puntos` })),
    creanValor: filas.filter((f) => f.roic >= wacc && f.eva >= 0)
      .map((f) => ({ empresa: f.empresa, roic: pct(f.roic), eva: gtq(f.eva) })),
    sinDatoPorEmpresa: filas.length === 0 ? "El detalle por empresa no está disponible para esta versión." : undefined,
  };
}

/** Resumen del grupo para una versión: publicable, alertas, indicadores con y sin errores. */
export async function resumenGrupo(version: Version = "real_2025") {
  const c = await fuente.consolidado(version);
  const alertas = (await fuente.alertas()).filter((a) => a.versiones.includes(version));
  const imp = await fuente.impacto(version);
  const g = c.grupoCorregido;
  return {
    version, tipoDato: "real/calculado",
    publicable: c.publicable,
    alertas: { bloqueantes: alertas.filter((a) => a.severidad === "bloqueante").length,
      advertencias: alertas.filter((a) => a.severidad === "advertencia").length },
    grupoCorregido: g ? {
      ventas: fmt("ventas", valor(g, "ventas")), ebit: fmt("ebit", valor(g, "ebit")),
      roic: fmt("roic", valor(g, "roic")), roce: fmt("roce", valor(g, "roce")), eva: fmt("eva", valor(g, "eva")), roicVsWacc: vsWacc(valor(g, "roic")),
    } : "sin dato",
    impactoDeTodosLosErroresJuntos: imp ? {
      alcance: "Efecto de TODOS los errores a la vez sobre el grupo. Para el efecto de una alerta sola usa la herramienta impactoPorAlerta.",
      ebitGrupoConTodosLosErrores: gtq(Number(imp.ebitConErrores)),
      ebitGrupoCorregido: gtq(Number(imp.ebitCorregido)),
      distorsionTotalDelEbit: gtq(Number(imp.ebitConErrores) - Number(imp.ebitCorregido)),
      roicGrupoConTodosLosErrores: imp.roicCon ? pct(Number(imp.roicCon)) : "sin dato",
      roicGrupoCorregido: imp.roicSin ? pct(Number(imp.roicSin)) : "sin dato",
      nota_cifrasConErrores: imp.nota,
    } : "sin dato",
  };
}

export async function indicadoresEmpresa(empresa: CodigoEmpresa, version: Version = "real_2025") {
  const ind = await indicadores(empresa, version);
  if (!ind) return { empresa, version, error: "No hay indicadores por empresa para esa versión (solo existe el detalle por empresa de real_2025; de 2026 solo hay cifras del grupo). No reintentes con otras herramientas." };
  const ms: Metrica[] = ["ventas", "ebit", "nopat", "roic", "roce", "eva"];
  return { empresa, version, tipoDato: "calculado (corregido)",
    ...Object.fromEntries(ms.map((m) => [m, fmt(m, valor(ind, m))])), roicVsWacc: vsWacc(valor(ind, "roic")) };
}

/** Calculadora: sumas, restas y variaciones hechas por código, para que el modelo nunca haga aritmética. */
export function calcular(operacion: "sumar" | "restar" | "variacion_pct" | "participacion_pct", valores: number[]) {
  const v = valores.map(Number);
  if (!v.length || v.some((x) => !Number.isFinite(x))) return { error: "Valores inválidos: envía números sin formato (ej. 53850000)." };
  const res =
    operacion === "sumar" ? gtq(v.reduce((a, b) => a + b, 0))
    : operacion === "restar" ? gtq(v.slice(1).reduce((a, b) => a - b, v[0]))
    : operacion === "variacion_pct" ? (v.length === 2 && v[0] !== 0 ? pct((v[1] - v[0]) / Math.abs(v[0])) : "requiere [desde, hasta] con desde ≠ 0")
    : (v.length === 2 && v[1] !== 0 ? pct(v[0] / v[1]) : "requiere [parte, total] con total ≠ 0");
  return { operacion, valores: v, resultado: res, tipoDato: "calculado" };
}

/** Las 6 empresas ordenadas de mayor a menor por una métrica (una sola llamada). */
export async function compararEmpresas(m: Metrica = "roic", version: Version = "real_2025") {
  const c = await fuente.consolidado(version);
  const filas = EMPRESAS.flatMap((e) => {
    const v = valor(c.empresas[e]?.indicadores, m);
    return v === null ? [] : [{ empresa: e, v }];
  }).sort((a, b) => b.v - a.v);
  if (!filas.length) return { metrica: m, version, error: "No hay detalle por empresa para esta versión." };
  return { metrica: m, version, tipoDato: "calculado (corregido)", orden: "de mayor a menor",
    ...(m === "ventas" || m === "ebit" ? { advertencia: "Las cifras por empresa INCLUYEN operaciones intercompañía. Su suma NO es el total consolidado del grupo (que elimina la intercompañía). Para el total del grupo usa resumenGrupo." } : {}),
    ranking: filas.map((f, i) => ({ puesto: i + 1, empresa: f.empresa, [m]: fmt(m, f.v) })) };
}

/** Costo de cada alerta por separado (lo calcula el backend corriendo el motor con y sin el error). */
export async function impactoPorAlerta(version: Version = "real_2025", alertaId?: string) {
  const items = (await fuente.impactoPorAlerta(version)) as any[];
  if (!items.length) return { version, error: "El impacto por alerta no está disponible en esta fuente de datos; solo el total de todos los errores juntos." };
  const g = (s?: string) => (s === undefined || s === "" ? undefined : gtq(Number(s)));
  const sel = alertaId ? items.filter((i) => i.alertaId === alertaId) : items;
  return { version, tipoDato: "calculado", nota: "Cada alerta se mide por separado; los efectos pueden compensarse, así que no se suman.",
    items: sel.map((i) => ({ alertaId: i.alertaId, regla: i.regla, tipo: i.tipo, supuestoCorreccion: i.supuestoCorreccion,
      ebitGrupoConError: g(i.valorConError), ebitGrupoSinEsteError: g(i.valorSinError), diferencia: g(i.diferencia),
      referencia: i.referencia, diferenciaNoConciliada: g(i.diferenciaNoConciliada),
      efectoEbitIndividual: i.efectoEbitIndividual?.map((e: any) => ({ empresa: e.empresa, monto: gtq(Number(e.monto)) })),
      indicadoresAfectados: i.indicadoresAfectados?.map((x: any) => ({ nombre: x.nombre, nivel: x.nivel,
        con: ["roic", "roce"].includes(x.nombre) ? pct(Number(x.con)) : gtq(Number(x.con)),
        sin: ["roic", "roce"].includes(x.nombre) ? pct(Number(x.sin)) : gtq(Number(x.sin)),
        ...(x.nombre === "roic" ? { conVsWacc: vsWacc(Number(x.con)), sinVsWacc: vsWacc(Number(x.sin)) } : {}) })) })) };
}

export async function listarAlertas(version?: Version) {
  const a = await fuente.alertas();
  return (version ? a.filter((x) => x.versiones.includes(version)) : a);
}

export async function puente(empresa: CodigoEmpresa) {
  const p = await fuente.puente(empresa);
  if (!p) return { empresa, error: "No hay puente calculado para esta empresa." };
  return formatearPuente(p);
}

/** Puente ya formateado con la moneda en cada cifra, para que el modelo no mezcle GTQ con moneda local. */
export function formatearPuente(p: import("./contrato.js").Puente) {
  const g = (s: string) => `GTQ ${Number(s).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const l = (s: string) => `${p.moneda} ${Number(s).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const cambioTotal = Number(p.nuevo) - Number(p.base);
  return {
    empresa: p.empresa, metrica: "EBIT", tipoDato: "calculado",
    periodo: `${p.desde.version} → ${p.hasta.version}`,
    ebitBase_GTQ: g(p.base),
    efectoOperativo_GTQ: g(p.operativo),
    efectoCambiario_GTQ: g(p.cambiario),
    ebitNuevo_GTQ: g(p.nuevo),
    cambioTotal_GTQ: g(String(cambioTotal)),
    porcentajeDelCambio: cambioTotal === 0 ? "sin cambio" :
      `operativo ${(Number(p.operativo) / cambioTotal * 100).toFixed(1)}% · cambiario ${(Number(p.cambiario) / cambioTotal * 100).toFixed(1)}%`,
    referenciaMonedaLocal: `EBIT en ${p.moneda}: ${l(p.desde.local)} → ${l(p.hasta.local)}; tasa ${p.moneda} por GTQ: ${p.desde.tasa} → ${p.hasta.tasa}`,
    comprobacion: `${g(p.base)} + ${g(p.operativo)} + ${g(p.cambiario)} = ${g(p.nuevo)}`,
  };
}
