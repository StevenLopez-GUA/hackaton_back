// PERSONA B. Endpoints de cálculo.
import { Router, type Response } from "express";
import type Decimal from "decimal.js";
import { calcular, calcularGrupo } from "../calculo/consolidar";
import { ErrorEntrada, simularEscenario } from "../calculo/escenario";
import { impactoErrores, type ItemImpacto } from "../calculo/impacto";
import { METRICAS_PUENTE, puente, type MetricaPuente } from "../calculo/puente";
import { METRICAS, type Metrica } from "../calculo/indicadores";
import { trazar } from "../calculo/trazabilidad";
import { getDataset, setDataset } from "../estado";
import { cargarDatasetFixture } from "../fixtures";
import { enviarError, fraccion, monto } from "../http";
import { obtenerAlertas } from "../pipeline";
import { VERSIONES, type CodigoEmpresa, type Consolidado, type Dataset, type Indicadores, type Version } from "../types";

const r = Router();

function leerVersion(v: unknown, res: Response): Version | null {
  const version = v ?? "real_2025";
  if (VERSIONES.includes(version as Version)) return version as Version;
  enviarError(res, 400, "VERSION_INVALIDA", `version debe ser una de: ${VERSIONES.join(", ")}`);
  return null;
}

const serializarIndicadores = (i: Indicadores) =>
  Object.fromEntries(
    Object.entries(i).map(([k, v]) => [
      k,
      "valor" in v ? { valor: monto(v.valor), origen: v.origen } : fraccion(v as Decimal),
    ]),
  );

// `base` = dataset sin escenario: de ahí salen wacc, moneda por empresa y el EBIT del grupo sin corregir.
const serializarConsolidado = (c: Consolidado, base: Dataset) => ({
  version: c.version,
  publicable: c.publicable,
  wacc: fraccion(base.parametros.wacc),
  ebitSinCorregir: monto(calcularGrupo(base, c.version).ebit.valor),
  grupo: c.grupo && serializarIndicadores(c.grupo),
  empresas: Object.fromEntries(
    Object.entries(c.empresas).map(([e, x]) => [
      e,
      {
        moneda: base.empresas[e as CodigoEmpresa].moneda,
        conAlertas: x.conAlertas,
        indicadores: serializarIndicadores(x.indicadores),
      },
    ]),
  ),
  eliminacionesIC: {
    ventasEliminadas: monto(c.eliminacionesIC.ventasEliminadas),
    costosEliminados: monto(c.eliminacionesIC.costosEliminados),
    diferenciaNoConciliada: monto(c.eliminacionesIC.diferenciaNoConciliada),
  },
});

r.get("/consolidado", (req, res) => {
  const version = leerVersion(req.query.version, res);
  if (!version) return;
  const dataset = getDataset();
  res.json(serializarConsolidado(calcular(dataset, version, obtenerAlertas(dataset)), dataset));
});

r.get("/trazabilidad", (req, res) => {
  const version = leerVersion(req.query.version, res);
  if (!version) return;
  const dataset = getDataset();
  const { metrica, nivel } = req.query;
  if (!METRICAS.includes(metrica as Metrica)) {
    return enviarError(res, 400, "METRICA_INVALIDA", `metrica debe ser una de: ${METRICAS.join(", ")}`);
  }
  if (nivel !== "grupo" && !(typeof nivel === "string" && nivel in dataset.empresas)) {
    const validos = ["grupo", ...Object.keys(dataset.empresas)].join(", ");
    return enviarError(res, 400, "NIVEL_INVALIDO", `nivel debe ser uno de: ${validos}`);
  }
  const t = trazar(dataset, version, metrica as Metrica, nivel as "grupo" | CodigoEmpresa);
  res.json({
    metrica: t.metrica,
    nivel: t.nivel,
    version: t.version,
    valor: monto(t.valor),
    componentes: t.componentes.map((c) => ({
      nombre: c.nombre,
      signo: c.signo,
      valor: monto(c.valor),
      hijos: c.hijos.map((h) => ({ nombre: h.nombre, valor: monto(h.valor), origen: h.origen })),
    })),
  });
});

const FRACCIONES = new Set(["roic", "roce"]);

const serializarItem = (i: ItemImpacto) => {
  if (i.tipo === "intercompania") {
    return {
      ...i,
      diferenciaNoConciliada: monto(i.diferenciaNoConciliada),
      efectoEbitIndividual: i.efectoEbitIndividual.map((x) => ({ empresa: x.empresa, monto: monto(x.monto) })),
    };
  }
  if (i.tipo === "sin_correccion") return i;
  const { impacto: m } = i;
  return {
    alertaId: i.alertaId,
    regla: i.regla,
    tipo: i.tipo,
    supuestoCorreccion: m.supuestoCorreccion,
    metrica: m.metrica,
    valorConError: monto(m.valorConError),
    valorSinError: monto(m.valorSinError),
    diferencia: monto(m.diferencia),
    indicadoresAfectados: m.indicadoresAfectados.map((x) => {
      const f = FRACCIONES.has(x.nombre) ? fraccion : monto;
      return { nombre: x.nombre, nivel: x.nivel, con: f(x.con), sin: f(x.sin) };
    }),
  };
};

r.get("/impacto-errores", (req, res) => {
  const version = leerVersion(req.query.version, res);
  if (!version) return;
  const dataset = getDataset();
  const i = impactoErrores(dataset, version, obtenerAlertas(dataset));
  res.json({
    version: i.version,
    items: i.items.map(serializarItem),
    total: { ebitConErrores: monto(i.total.ebitConErrores), ebitCorregido: monto(i.total.ebitCorregido) },
  });
});

r.get("/puente", (req, res) => {
  const dataset = getDataset();
  const { empresa, metrica, desde, hasta } = req.query;
  if (!(typeof empresa === "string" && empresa in dataset.empresas)) {
    return enviarError(res, 400, "EMPRESA_INVALIDA", `empresa debe ser una de: ${Object.keys(dataset.empresas).join(", ")}`);
  }
  if (!METRICAS_PUENTE.includes(metrica as MetricaPuente)) {
    return enviarError(res, 400, "METRICA_INVALIDA", `metrica debe ser una de: ${METRICAS_PUENTE.join(", ")}`);
  }
  if (!VERSIONES.includes(desde as Version) || !VERSIONES.includes(hasta as Version)) {
    return enviarError(res, 400, "VERSION_INVALIDA", `desde y hasta deben ser una de: ${VERSIONES.join(", ")}`);
  }
  const p = puente(dataset, empresa as CodigoEmpresa, metrica as MetricaPuente, desde as Version, hasta as Version, obtenerAlertas(dataset));
  if (!p.ok) {
    return res.status(409).json({
      error: {
        codigo: "MONEDA_MIXTA",
        mensaje: `${empresa} tiene filas de ${metrica} en otra moneda; corrija la moneda antes de separar el efecto cambiario.`,
        filaIds: p.filaIds,
        alerta: p.alerta,
      },
    });
  }
  const punto = (x: typeof p.desde) => ({ version: x.version, local: monto(x.local), tasa: x.tasa.toString() });
  res.json({
    empresa: p.empresa,
    metrica: p.metrica,
    moneda: p.moneda,
    desde: punto(p.desde),
    hasta: punto(p.hasta),
    base: monto(p.base),
    operativo: monto(p.operativo),
    cambiario: monto(p.cambiario),
    nuevo: monto(p.nuevo),
  });
});

r.post("/escenario", (req, res) => {
  try {
    const dataset = getDataset();
    const { consolidado, escenario } = simularEscenario(dataset, req.body);
    res.json({ ...serializarConsolidado(consolidado, dataset), escenario });
  } catch (e) {
    if (e instanceof ErrorEntrada) return enviarError(res, 400, e.codigo, e.message);
    throw e;
  }
});

// Vuelve al dataset del reto (fixture) sin esperar un reinicio. Afecta a todos, como /upload.
r.post("/reset", (_req, res) => {
  const dataset = cargarDatasetFixture();
  setDataset(dataset);
  res.json({ ok: true, totalRegistros: dataset.registros.length });
});

export default r;
