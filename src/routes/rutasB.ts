// PERSONA B. Endpoints de cálculo.
import { Router, type Response } from "express";
import type Decimal from "decimal.js";
import { calcular } from "../calculo/consolidar";
import { METRICAS, type Metrica } from "../calculo/indicadores";
import { trazar } from "../calculo/trazabilidad";
import { getDataset } from "../estado";
import { enviarError, fraccion, monto, noImplementado } from "../http";
import { obtenerAlertas } from "../pipeline";
import { VERSIONES, type CodigoEmpresa, type Indicadores, type Version } from "../types";

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

r.get("/consolidado", (req, res) => {
  const version = leerVersion(req.query.version, res);
  if (!version) return;
  const dataset = getDataset();
  const c = calcular(dataset, version, obtenerAlertas(dataset));
  res.json({
    version: c.version,
    publicable: c.publicable,
    grupo: c.grupo && serializarIndicadores(c.grupo),
    empresas: Object.fromEntries(
      Object.entries(c.empresas).map(([e, x]) => [
        e,
        { conAlertas: x.conAlertas, indicadores: serializarIndicadores(x.indicadores) },
      ]),
    ),
    eliminacionesIC: {
      ventasEliminadas: monto(c.eliminacionesIC.ventasEliminadas),
      costosEliminados: monto(c.eliminacionesIC.costosEliminados),
      diferenciaNoConciliada: monto(c.eliminacionesIC.diferenciaNoConciliada),
    },
  });
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

r.get("/impacto-errores", noImplementado);
r.get("/puente", noImplementado);
r.post("/escenario", noImplementado);

export default r;
