// PERSONA B. Indicadores puros sobre registros de UNA versión (montoGrupo, GTQ).
// Única fuente de qué tipos entran en cada métrica y con qué signo: la usa también trazabilidad.
import Decimal from "../decimal";
import type { Indicadores, RegistroNormalizado, Resultado, Tipo } from "../types";

export type Nivel = "empresa" | "grupo";
export type Metrica = "ventas" | "ebit" | "nopat" | "capital" | "capitalEmpleado" | "eva";
export const METRICAS: Metrica[] = ["ventas", "ebit", "nopat", "capital", "capitalEmpleado", "eva"];

export type Termino = { tipo: Tipo; factor: Decimal };

const t = (tipo: Tipo, factor: Decimal.Value): Termino => ({ tipo, factor: new Decimal(factor) });

// Grupo: la intercompañía se elimina completa, así que venta_ic y costo_ic no entran.
export function terminos(metrica: Metrica, nivel: Nivel, wacc: Decimal): Termino[] {
  const ic = nivel === "empresa";
  const ventas = [t("venta_ext", 1), ...(ic ? [t("venta_ic", 1)] : [])];
  const ebit = [
    ...ventas,
    t("costo_ext", -1),
    ...(ic ? [t("costo_ic", -1)] : []),
    t("gasto_op", -1),
    t("depreciacion", -1),
  ];
  const nopat = [...ebit, t("impuesto", -1)];
  switch (metrica) {
    case "ventas":
      return ventas;
    case "ebit":
      return ebit;
    case "nopat":
      return nopat;
    case "capital":
      return [t("capital", 1)];
    case "capitalEmpleado":
      return [t("activos", 1), t("pasivos_cte", -1)];
    case "eva":
      return [...nopat, t("capital", wacc.neg())];
  }
}

// Registros con montoGrupo = null (moneda sin tasa) no se suman: ya los cubre la alerta de moneda.
export function sumar(registros: RegistroNormalizado[], ts: Termino[]): Resultado {
  let valor = new Decimal(0);
  const origen: string[] = [];
  for (const r of registros) {
    const termino = ts.find((x) => x.tipo === r.tipo);
    if (!termino || r.montoGrupo === null) continue;
    valor = valor.plus(r.montoGrupo.times(termino.factor));
    origen.push(r.id);
  }
  return { valor, origen };
}

function dividir(num: Decimal, den: Decimal, nombre: string): Decimal {
  if (den.isZero()) {
    console.warn(`${nombre}: denominador cero, se devuelve 0`);
    return new Decimal(0);
  }
  return num.div(den);
}

export function calcularIndicadores(registros: RegistroNormalizado[], wacc: Decimal, nivel: Nivel): Indicadores {
  const r = (m: Metrica) => sumar(registros, terminos(m, nivel, wacc));
  const [ventas, ebit, nopat, capital, capitalEmpleado, eva] = METRICAS.map(r);
  return {
    ventas,
    ebit,
    nopat,
    capital,
    capitalEmpleado,
    roic: dividir(nopat.valor, capital.valor, "ROIC"),
    roce: dividir(ebit.valor, capitalEmpleado.valor, "ROCE"),
    eva,
  };
}
