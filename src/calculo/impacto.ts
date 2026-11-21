// PERSONA B. Costo del error: corre el motor con y sin cada corrección.
// Intercompañía no tiene corrección: se reporta la diferencia no conciliada y lo que cada lado metió a su EBIT
// individual (vendedor +venta, comprador −costo). Su suma es la diferencia; el EBIT del grupo no cambia.
import Decimal from "../decimal";
import type { Alerta, CodigoEmpresa, Dataset, ImpactoError, Version } from "../types";
import { corregir } from "../validador/corregir";
import { calcularEmpresa, calcularGrupo } from "./consolidar";
import { aGtq } from "./intercompania";

export type ItemImpacto =
  | { alertaId: string; regla: Alerta["regla"]; tipo: "correccion"; impacto: ImpactoError }
  | {
      alertaId: string;
      regla: "intercompania";
      tipo: "intercompania";
      referencia?: string;
      diferenciaNoConciliada: Decimal;
      efectoEbitIndividual: { empresa: CodigoEmpresa; monto: Decimal }[];
    }
  | { alertaId: string; regla: Alerta["regla"]; tipo: "sin_correccion" };

export type ImpactoErrores = {
  version: Version;
  items: ItemImpacto[];
  total: { ebitConErrores: Decimal; ebitCorregido: Decimal };
};

function comparar(antes: Dataset, despues: Dataset, version: Version, alerta: Alerta, supuesto: string): ImpactoError {
  const g0 = calcularGrupo(antes, version);
  const g1 = calcularGrupo(despues, version);
  const afectados: ImpactoError["indicadoresAfectados"] = [
    { nombre: "roic", nivel: "grupo", con: g0.roic, sin: g1.roic },
    { nombre: "roce", nivel: "grupo", con: g0.roce, sin: g1.roce },
    { nombre: "eva", nivel: "grupo", con: g0.eva.valor, sin: g1.eva.valor },
  ];
  for (const e of [alerta.empresa].flat()) {
    const e0 = calcularEmpresa(antes, version, e);
    const e1 = calcularEmpresa(despues, version, e);
    afectados.push(
      { nombre: "ebit", nivel: e, con: e0.ebit.valor, sin: e1.ebit.valor },
      { nombre: "roic", nivel: e, con: e0.roic, sin: e1.roic },
    );
  }
  return {
    supuestoCorreccion: supuesto,
    metrica: "ebit_grupo",
    valorConError: g0.ebit.valor,
    valorSinError: g1.ebit.valor,
    diferencia: g0.ebit.valor.minus(g1.ebit.valor),
    indicadoresAfectados: afectados,
  };
}

// filaIds de una alerta IC: filas de la hoja Intercompania (Real 2025) o registros del Presupuesto (2026).
function itemIC(dataset: Dataset, alerta: Alerta): ItemImpacto {
  const ids = new Set(alerta.filaIds);
  const efecto = new Map<CodigoEmpresa, Decimal>();
  const sumar = (e: CodigoEmpresa, d: Decimal) => efecto.set(e, (efecto.get(e) ?? new Decimal(0)).plus(d));
  for (const f of dataset.intercompania.filter((x) => ids.has(x.id))) {
    const gtq = aGtq(f.monto2025, f.moneda, "promedio", dataset.tasas);
    if (gtq) sumar(f.empresa, f.tipo === "venta_ic" ? gtq : gtq.neg());
  }
  for (const r of dataset.registros.filter((x) => ids.has(x.id) && x.montoGrupo !== null)) {
    sumar(r.empresa, r.tipo === "venta_ic" ? r.montoGrupo! : r.montoGrupo!.neg());
  }
  const efectoEbitIndividual = [alerta.empresa].flat().map((e) => ({ empresa: e, monto: efecto.get(e) ?? new Decimal(0) }));
  return {
    alertaId: alerta.id,
    regla: "intercompania",
    tipo: "intercompania",
    ...(alerta.referencia ? { referencia: alerta.referencia } : {}),
    diferenciaNoConciliada: efectoEbitIndividual.reduce((s, x) => s.plus(x.monto), new Decimal(0)),
    efectoEbitIndividual,
  };
}

export function impactoErrores(dataset: Dataset, version: Version, alertas: Alerta[]): ImpactoErrores {
  const deVersion = alertas.filter((a) => a.versiones.includes(version));
  const items: ItemImpacto[] = [];
  let todas = dataset;
  for (const a of deVersion) {
    if (a.regla === "intercompania") {
      items.push(itemIC(dataset, a));
      continue;
    }
    const c = corregir(dataset, a);
    if (!c) {
      items.push({ alertaId: a.id, regla: a.regla, tipo: "sin_correccion" });
      continue;
    }
    items.push({ alertaId: a.id, regla: a.regla, tipo: "correccion", impacto: comparar(dataset, c.dataset, version, a, c.supuesto) });
    // corregir() trabaja por filaIds, que no cambian al corregir: se pueden encadenar.
    todas = corregir(todas, a)?.dataset ?? todas;
  }
  return {
    version,
    items,
    total: { ebitConErrores: calcularGrupo(dataset, version).ebit.valor, ebitCorregido: calcularGrupo(todas, version).ebit.valor },
  };
}
