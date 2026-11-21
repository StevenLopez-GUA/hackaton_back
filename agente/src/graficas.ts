// Gráficas que acompañan la respuesta. Las arma el CÓDIGO a partir de las herramientas que usó el agente
// (el modelo nunca genera datos de una gráfica). El front las dibuja con su propio formato.
import { fuente } from "./fuente.js";
import { valor, indicadores, type Metrica } from "./analisis.js";
import { EMPRESAS, VERSIONES, type CodigoEmpresa, type Version } from "./contrato.js";

/**
 * Contrato con el front.
 * - valores: números crudos. unidad "GTQ" = quetzales; unidad "fraccion" = porcentaje como fracción (0.0963 = 9.63%).
 * - null = sin dato (el front deja el hueco).
 * - cascada: etiquetas [inicio, ...pasos, fin]; valores del inicio y fin son totales, los pasos son variaciones.
 * - referencia: línea horizontal opcional (p. ej. WACC).
 */
export type Grafica = {
  tipo: "barras" | "linea" | "cascada";
  titulo: string;
  unidad: "GTQ" | "fraccion";
  etiquetas: string[];
  series: { nombre: string; valores: (number | null)[]; proyectado?: boolean[] }[];
  referencia?: { nombre: string; valor: number };
  fuente: string; // herramienta que la originó
};

const NOMBRE_VERSION: Record<Version, string> = { real_2025: "Real 2025", ppto_2026: "Presupuesto 2026", reforecast_2026: "Reforecast 2026" };
const NOMBRE_METRICA: Record<Metrica, string> = { ventas: "Ventas", ebit: "EBIT", nopat: "NOPAT", eva: "EVA", roic: "ROIC", roce: "ROCE" };
const unidad = (m: Metrica): Grafica["unidad"] => (m === "roic" || m === "roce" ? "fraccion" : "GTQ");
const wacc = async () => Number((await fuente.supuestos()).wacc);

async function porEmpresa(m: Metrica, v: Version, origen: string): Promise<Grafica | undefined> {
  const c = await fuente.consolidado(v);
  const filas = EMPRESAS.map((e) => ({ e, x: valor(c.empresas[e]?.indicadores, m) }))
    .filter((f) => f.x !== null).sort((a, b) => b.x! - a.x!);
  if (!filas.length) return undefined;
  return {
    tipo: "barras", titulo: `${NOMBRE_METRICA[m]} por empresa · ${NOMBRE_VERSION[v]}`, unidad: unidad(m),
    etiquetas: filas.map((f) => f.e), series: [{ nombre: NOMBRE_METRICA[m], valores: filas.map((f) => f.x) }],
    ...(m === "roic" ? { referencia: { nombre: "WACC", valor: await wacc() } } : {}), fuente: origen,
  };
}

async function tendencia(sujeto: CodigoEmpresa | "GRUPO", m: Metrica, con2027: boolean): Promise<Grafica | undefined> {
  const vals: (number | null)[] = [];
  for (const v of VERSIONES) vals.push(valor(await indicadores(sujeto, v), m));
  if (vals.every((x) => x === null)) return undefined;
  const etiquetas = VERSIONES.map((v) => NOMBRE_VERSION[v]);
  const proyectado = [false, false, false];
  if (con2027) {
    const [r, , f] = vals;
    const p = r === null || f === null || r === 0 ? null
      : unidad(m) === "fraccion" ? f + (f - r) : f * (1 + (f - r) / Math.abs(r)); // misma fórmula que proyectar2027
    etiquetas.push("Proyección 2027"); vals.push(p); proyectado.push(true);
  }
  return {
    tipo: "linea", titulo: `${NOMBRE_METRICA[m]} · ${sujeto === "GRUPO" ? "Grupo" : sujeto}`, unidad: unidad(m),
    etiquetas, series: [{ nombre: NOMBRE_METRICA[m], valores: vals, proyectado }],
    ...(m === "roic" ? { referencia: { nombre: "WACC", valor: await wacc() } } : {}),
    fuente: con2027 ? "proyectar2027" : "tendencia",
  };
}

async function puente(empresa: CodigoEmpresa): Promise<Grafica | undefined> {
  const p = await fuente.puente(empresa);
  if (!p) return undefined;
  return {
    tipo: "cascada", titulo: `Puente del EBIT · ${empresa} (${NOMBRE_VERSION[p.desde.version]} → ${NOMBRE_VERSION[p.hasta.version]})`,
    unidad: "GTQ", etiquetas: ["Base", "Efecto operativo", "Efecto cambiario", "Nuevo"],
    series: [{ nombre: "EBIT", valores: [p.base, p.operativo, p.cambiario, p.nuevo].map(Number) }], fuente: "puente",
  };
}

async function impactoAlerta(v: Version, alertaId?: string): Promise<Grafica | undefined> {
  const items = (await fuente.impactoPorAlerta(v)) as any[];
  const conDato = items.filter((i) => i.valorConError !== undefined && (!alertaId || i.alertaId === alertaId));
  if (!conDato.length) return undefined;
  return {
    tipo: "barras", titulo: `EBIT del grupo con y sin cada error · ${NOMBRE_VERSION[v]}`, unidad: "GTQ",
    etiquetas: conDato.map((i) => i.alertaId),
    series: [
      { nombre: "Con el error", valores: conDato.map((i) => Number(i.valorConError)) },
      { nombre: "Sin el error", valores: conDato.map((i) => Number(i.valorSinError)) },
    ],
    fuente: "impactoPorAlerta",
  };
}

/** Elige la gráfica de la última herramienta graficable que usó el agente. */
export async function graficaPara(usadas: { nombre: string; args: any }[]): Promise<Grafica | undefined> {
  for (const { nombre, args } of [...usadas].reverse()) {
    const v: Version = args?.version ?? "real_2025";
    try {
      switch (nombre) {
        case "compararEmpresas": return await porEmpresa(args.metrica ?? "roic", v, nombre);
        case "riesgos": return await porEmpresa("roic", v, nombre);
        case "tendencia": return await tendencia(args.sujeto, args.metrica, false);
        case "proyectar2027": return await tendencia(args.sujeto, args.metrica, true);
        case "puente": return await puente(args.empresa);
        case "impactoPorAlerta": return await impactoAlerta(v, args.alertaId);
      }
    } catch { /* una gráfica nunca rompe la respuesta */ }
  }
  return undefined;
}
