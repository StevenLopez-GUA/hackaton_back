// PERSONA B. Puente de una empresa entre dos versiones: efecto operativo vs cambiario, en GTQ.
// Valor local con `monto` (sin las copias de idsDuplicados) y tasa de resultados de la moneda funcional.
import Decimal from "../decimal";
import { elegirTipoTasa } from "../monedas";
import { idsDuplicados } from "../pipeline";
import type { Alerta, CodigoEmpresa, Dataset, Version } from "../types";
import { terminos } from "./indicadores";

export type MetricaPuente = "ebit" | "ventas";
export const METRICAS_PUENTE: MetricaPuente[] = ["ebit", "ventas"];

export type Puente = {
  ok: true;
  empresa: CodigoEmpresa;
  metrica: MetricaPuente;
  moneda: string;
  desde: { version: Version; local: Decimal; tasa: Decimal };
  hasta: { version: Version; local: Decimal; tasa: Decimal };
  base: Decimal;
  operativo: Decimal;
  cambiario: Decimal;
  nuevo: Decimal;
};
// Filas de la métrica en otra moneda: no se puede separar el efecto cambiario sin mezclar monedas.
export type ConflictoMoneda = { ok: false; filaIds: string[]; alerta: Alerta | null };

export function puente(
  dataset: Dataset,
  empresa: CodigoEmpresa,
  metrica: MetricaPuente,
  desde: Version,
  hasta: Version,
  alertas: Alerta[],
): Puente | ConflictoMoneda {
  const moneda = dataset.empresas[empresa].moneda;
  const fuera = new Set(idsDuplicados(alertas));
  const ts = terminos(metrica, "empresa", dataset.parametros.wacc);
  const filas = (v: Version) =>
    dataset.registros.filter(
      (r) => r.empresa === empresa && r.version === v && !fuera.has(r.id) && ts.some((t) => t.tipo === r.tipo),
    );

  const ajenas = [...filas(desde), ...filas(hasta)].filter((r) => r.moneda !== moneda).map((r) => r.id);
  if (ajenas.length) {
    const alerta = alertas.find((a) => a.regla === "moneda" && a.filaIds.some((id) => ajenas.includes(id))) ?? null;
    return { ok: false, filaIds: ajenas, alerta };
  }

  const punto = (v: Version) => ({
    version: v,
    local: filas(v).reduce((s, r) => s.plus(r.monto.times(ts.find((t) => t.tipo === r.tipo)!.factor)), new Decimal(0)),
    tasa: dataset.tasas[moneda][elegirTipoTasa(v, "venta_ext")],
  });
  const d = punto(desde);
  const h = punto(hasta);
  const base = d.local.div(d.tasa);
  const operativo = h.local.minus(d.local).div(d.tasa);
  const cambiario = h.local.times(new Decimal(1).div(h.tasa).minus(new Decimal(1).div(d.tasa)));
  // = L_nuevo / t_nuevo algebraicamente; por suma para que el puente cuadre exacto (difiere < 1e-20).
  const nuevo = base.plus(operativo).plus(cambiario);
  return { ok: true, empresa, metrica, moneda, desde: d, hasta: h, base, operativo, cambiario, nuevo };
}
