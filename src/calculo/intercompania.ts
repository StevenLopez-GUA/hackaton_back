// PERSONA B. Conciliación intercompañía.
// Real 2025: alertas solo desde la hoja Intercompania (por referencia).
// 2026: alertas desde registros de la versión, cruzados por par vendedor→comprador.
// Eliminación (toda versión): suma de venta_ic / costo_ic en registros, sin excluirIds ni nulos.
import Decimal from "../decimal";
import type { Alerta, CodigoEmpresa, ConciliarIC, Dataset, Version } from "../types";

type Lado = { ids: string[]; monto: Decimal; saldo: Decimal; concepto: string; ok: boolean };

const natural = (a: string, b: string) => a.localeCompare(b, "es", { numeric: true, sensitivity: "base" });

function miles(d: Decimal): string {
  const [entero, frac] = d.abs().toFixed(2).split(".");
  const cuerpo = entero.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  const txt = frac === "00" ? cuerpo : `${cuerpo}.${frac}`;
  return d.isNeg() ? `-${txt}` : txt;
}

function parentesis(d: Decimal): string {
  return `(${d.isNeg() ? "-" : "+"}${miles(d.abs())})`;
}

function aGtq(monto: Decimal, moneda: string, tipo: "promedio" | "cierre", tasas: Dataset["tasas"]): Decimal | null {
  const tasa = tasas[moneda]?.[tipo];
  if (!tasa || tasa.isZero()) return null;
  return monto.div(tasa);
}

function ladoVacio(): Lado {
  return { ids: [], monto: new Decimal(0), saldo: new Decimal(0), concepto: "", ok: true };
}

function agregar(lado: Lado, id: string, monto: Decimal | null, saldo: Decimal | null, concepto: string) {
  lado.ids.push(id);
  if (!lado.concepto) lado.concepto = concepto;
  if (monto === null || saldo === null) lado.ok = false;
  else {
    lado.monto = lado.monto.plus(monto);
    lado.saldo = lado.saldo.plus(saldo);
  }
}

function texto(vendedor: CodigoEmpresa, comprador: CodigoEmpresa, venta: Lado, costo: Lado, conSaldo: boolean): string {
  const saldos = conSaldo
    ? ` Saldos: ${venta.ids.length ? miles(venta.saldo) : "—"} vs ${costo.ids.length ? miles(costo.saldo) : "—"}.`
    : "";
  if (!venta.ids.length) {
    return `${comprador} registra compra de ${costo.concepto} a ${vendedor} por ${miles(costo.monto)} GTQ; ${vendedor} no reporta la venta.${saldos}`;
  }
  if (!costo.ids.length) {
    return `${vendedor} reporta venta de ${venta.concepto} a ${comprador} por ${miles(venta.monto)} GTQ; ${comprador} no registra la compra.${saldos}`;
  }
  const delta = parentesis(costo.monto.minus(venta.monto));
  return `${vendedor} reporta venta de ${venta.concepto} a ${comprador} por ${miles(venta.monto)} GTQ; ${comprador} registra la compra por ${miles(costo.monto)} GTQ ${delta}.${saldos}`;
}

function alertaSiDescuadra(
  version: Version,
  referencia: string | undefined,
  vendedor: CodigoEmpresa,
  comprador: CodigoEmpresa,
  venta: Lado,
  costo: Lado,
  tolerancia: Decimal,
  conSaldo: boolean,
): Alerta | null {
  const falta = venta.ids.length === 0 || costo.ids.length === 0;
  const descuadre =
    !venta.ok ||
    !costo.ok ||
    venta.monto.minus(costo.monto).abs().gt(tolerancia) ||
    (conSaldo && venta.saldo.minus(costo.saldo).abs().gt(tolerancia));
  if (!falta && !descuadre) return null;
  const alerta: Alerta = {
    id: "",
    regla: "intercompania",
    severidad: "bloqueante",
    empresa: [vendedor, comprador],
    versiones: [version],
    filaIds: [...venta.ids, ...costo.ids].sort(natural),
    mensaje: texto(vendedor, comprador, venta, costo, conSaldo),
    porQueImporta:
      "Vendedor y comprador no reportan la misma operación. El grupo elimina ambos lados y la diferencia queda sin conciliar.",
    comoSeCorrige: "Igualar monto y saldo entre las dos empresas, o documentar el corte si la diferencia es de timing.",
  };
  if (referencia) alerta.referencia = referencia;
  return alerta;
}

function alertasReal(dataset: Dataset): Alerta[] {
  const grupos = new Map<string, typeof dataset.intercompania>();
  for (const fila of dataset.intercompania) {
    grupos.set(fila.referencia, [...(grupos.get(fila.referencia) ?? []), fila]);
  }
  const alertas: Alerta[] = [];
  for (const [referencia, filas] of grupos) {
    const venta = ladoVacio();
    const costo = ladoVacio();
    for (const fila of filas) {
      const monto = aGtq(fila.monto2025, fila.moneda, "promedio", dataset.tasas);
      const saldo = aGtq(fila.saldoCierre, fila.moneda, "cierre", dataset.tasas);
      agregar(fila.tipo === "venta_ic" ? venta : costo, fila.id, monto, saldo, fila.concepto);
    }
    const ventaFila = filas.find((f) => f.tipo === "venta_ic");
    const costoFila = filas.find((f) => f.tipo === "costo_ic");
    const vendedor = ventaFila?.empresa ?? costoFila!.contraparte;
    const comprador = costoFila?.empresa ?? ventaFila!.contraparte;
    const alerta = alertaSiDescuadra(
      "real_2025",
      referencia,
      vendedor,
      comprador,
      venta,
      costo,
      dataset.parametros.toleranciaIC,
      true,
    );
    if (alerta) alertas.push(alerta);
  }
  return alertas;
}

function alertasVersion(dataset: Dataset, version: Version, excluir: Set<string>): Alerta[] {
  const pares = new Map<string, { vendedor: CodigoEmpresa; comprador: CodigoEmpresa; venta: Lado; costo: Lado }>();
  for (const r of dataset.registros) {
    if (r.version !== version || (r.tipo !== "venta_ic" && r.tipo !== "costo_ic")) continue;
    if (excluir.has(r.id) || r.montoGrupo === null || !r.contraparte) continue;
    const vendedor = r.tipo === "venta_ic" ? r.empresa : r.contraparte;
    const comprador = r.tipo === "venta_ic" ? r.contraparte : r.empresa;
    const clave = `${vendedor}|${comprador}`;
    const par = pares.get(clave) ?? { vendedor, comprador, venta: ladoVacio(), costo: ladoVacio() };
    agregar(r.tipo === "venta_ic" ? par.venta : par.costo, r.id, r.montoGrupo, new Decimal(0), r.concepto);
    pares.set(clave, par);
  }
  const alertas: Alerta[] = [];
  for (const par of pares.values()) {
    const alerta = alertaSiDescuadra(
      version,
      undefined,
      par.vendedor,
      par.comprador,
      par.venta,
      par.costo,
      dataset.parametros.toleranciaIC,
      false,
    );
    if (alerta) alertas.push(alerta);
  }
  return alertas;
}

function eliminacion(dataset: Dataset, version: Version, excluir: Set<string>) {
  let ventas = new Decimal(0);
  let costos = new Decimal(0);
  for (const r of dataset.registros) {
    if (r.version !== version || excluir.has(r.id) || r.montoGrupo === null) continue;
    if (r.tipo === "venta_ic") ventas = ventas.plus(r.montoGrupo);
    else if (r.tipo === "costo_ic") costos = costos.plus(r.montoGrupo);
  }
  return { ventasEliminadas: ventas, costosEliminados: costos, diferenciaNoConciliada: ventas.minus(costos) };
}

export const conciliarIC: ConciliarIC = (dataset, version, excluirIds) => {
  const excluir = new Set(excluirIds);
  const alertas = version === "real_2025" ? alertasReal(dataset) : alertasVersion(dataset, version, excluir);
  return { eliminacion: eliminacion(dataset, version, excluir), alertas };
};
