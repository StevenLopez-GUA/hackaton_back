import Decimal from "../decimal";
import { VERSIONES, type Alerta, type CodigoEmpresa, type Dataset, type RegistroNormalizado, type Validar, type Version } from "../types";

const natural = (a: string, b: string) => a.localeCompare(b, "es", { numeric: true, sensitivity: "base" });

function miles(d: Decimal): string {
  const redondeado = d.toDecimalPlaces(0, Decimal.ROUND_HALF_UP);
  return new Intl.NumberFormat("es-GT", { maximumFractionDigits: 0 }).format(redondeado.toNumber());
}

function comoDecimal(v: Decimal | string): Decimal {
  return Decimal.isDecimal(v) ? v : new Decimal(v);
}

function alertaBase(
  regla: Alerta["regla"],
  severidad: Alerta["severidad"],
  empresa: CodigoEmpresa | CodigoEmpresa[],
  versiones: Version[],
  filaIds: string[],
  mensaje: string,
  porQueImporta: string,
  comoSeCorrige: string,
): Alerta {
  return { id: "", regla, severidad, empresa, versiones, filaIds, mensaje, porQueImporta, comoSeCorrige };
}

function porFila(registros: RegistroNormalizado[]): Map<string, RegistroNormalizado[]> {
  const grupos = new Map<string, RegistroNormalizado[]>();
  for (const r of registros) {
    const clave = `${r.archivo}:${r.fila}`;
    grupos.set(clave, [...(grupos.get(clave) ?? []), r]);
  }
  return grupos;
}

function alertasFaltantes(dataset: Dataset): Alerta[] {
  return dataset.faltantes.map((codigo) => {
    const archivo = dataset.empresas[codigo].archivo;
    return alertaBase(
      "archivo_faltante",
      "bloqueante",
      codigo,
      [...VERSIONES],
      [archivo],
      `Falta el archivo de ${codigo} (${archivo}).`,
      "Sin ese archivo la empresa no entra en la consolidación y el grupo queda incompleto en las tres versiones.",
      `Subir ${archivo} junto con el resto del paquete.`,
    );
  });
}

function alertasEncabezado(dataset: Dataset): Alerta[] {
  return dataset.avisosIngesta.map((aviso) => {
    const empresa = (Object.entries(dataset.empresas).find(([, e]) => e.archivo === aviso.archivo)?.[0] ?? "TRAC") as CodigoEmpresa;
    return alertaBase(
      "encabezado",
      "bloqueante",
      empresa,
      [...VERSIONES],
      [aviso.id],
      aviso.detalle,
      "Si el encabezado no se reconoce, las filas de esa hoja no se pueden consolidar.",
      "Renombrar la columna al sinónimo esperado y volver a cargar el archivo.",
    );
  });
}

function alertasDuplicado(dataset: Dataset): Alerta[] {
  const porClave = new Map<string, RegistroNormalizado[]>();
  for (const r of dataset.registros) {
    const clave = [r.empresa, r.version, r.concepto, r.tipo, r.contraparte ?? "", r.moneda, r.monto.toString()].join("|");
    porClave.set(clave, [...(porClave.get(clave) ?? []), r]);
  }

  const grupos = new Map<string, { empresa: CodigoEmpresa; concepto: string; ids: string[]; versiones: Set<Version>; montoGrupo: Decimal }>();
  for (const regs of porClave.values()) {
    if (regs.length < 2) continue;
    const primero = regs[0];
    const filas = [...new Set(regs.map((r) => `${r.archivo}:${r.fila}`))].sort(natural).join(",");
    const merge = [primero.empresa, filas, primero.concepto, primero.tipo, primero.contraparte ?? "", primero.moneda].join("|");
    const previo = grupos.get(merge) ?? {
      empresa: primero.empresa,
      concepto: primero.concepto,
      ids: [],
      versiones: new Set<Version>(),
      montoGrupo: new Decimal(0),
    };
    for (const r of regs) {
      previo.ids.push(r.id);
      previo.versiones.add(r.version);
      if (r.montoGrupo) previo.montoGrupo = previo.montoGrupo.plus(r.montoGrupo);
    }
    grupos.set(merge, previo);
  }

  return [...grupos.values()].map((g) => {
    const versiones = VERSIONES.filter((v) => g.versiones.has(v));
    return alertaBase(
      "duplicado",
      "bloqueante",
      g.empresa,
      versiones,
      g.ids,
      `${g.empresa} repite "${g.concepto}" en la misma versión.`,
      `La fila repetida se suma dos veces. En conjunto esas copias representan ${miles(g.montoGrupo)} GTQ si se dejan dentro.`,
      "Eliminar la fila repetida y conservar una sola copia por versión.",
    );
  });
}

function alertasSigno(dataset: Dataset): Alerta[] {
  const negativos = dataset.registros.filter((r) => r.monto.isNeg());
  return [...porFila(negativos).values()].map((regs) => {
    const primero = regs[0];
    const impacto = regs.reduce((s, r) => s.plus(r.montoGrupo?.abs() ?? new Decimal(0)), new Decimal(0));
    return alertaBase(
      "signo",
      "bloqueante",
      primero.empresa,
      VERSIONES.filter((v) => regs.some((r) => r.version === v)),
      regs.map((r) => r.id),
      `${primero.empresa} tiene monto negativo en "${primero.concepto}".`,
      `Un signo invertido resta cuando debería sumar. El efecto de esas versiones es ${miles(impacto)} GTQ.`,
      "Corregir el signo: si fue un error de captura, usar el valor absoluto.",
    );
  });
}

function alertasMoneda(dataset: Dataset): Alerta[] {
  const malas = dataset.registros.filter((r) => {
    const sinTasa = !dataset.tasas[r.moneda];
    const distinta = r.moneda !== dataset.empresas[r.empresa].moneda;
    return sinTasa || distinta;
  });
  return [...porFila(malas).values()].map((regs) => {
    const primero = regs[0];
    const funcional = dataset.empresas[primero.empresa].moneda;
    const sinTasa = regs.some((r) => !dataset.tasas[r.moneda]);
    const muestra = regs.find((r) => r.version === "real_2025") ?? regs[0];
    const tasa = dataset.tasas[muestra.moneda]?.[muestra.tipoTasa];
    const convertido = tasa ? muestra.monto.div(tasa) : null;
    const concepto = primero.concepto.toLowerCase();
    const porQueImporta = sinTasa
      ? `${miles(muestra.monto)} ${primero.moneda} no se pueden convertir a GTQ porque esa moneda no tiene tasa, así que la fila queda fuera del consolidado.`
      : `Convertida como ${primero.moneda}, ${concepto === "depreciación" ? "la depreciación" : `"${primero.concepto}"`} pasa de ${miles(muestra.monto)} a ${miles(convertido ?? new Decimal(0))} GTQ.`;
    return alertaBase(
      "moneda",
      "bloqueante",
      primero.empresa,
      VERSIONES.filter((v) => regs.some((r) => r.version === v)),
      regs.map((r) => r.id),
      sinTasa
        ? `${primero.empresa} registró "${primero.concepto}" en ${primero.moneda}, una moneda sin tasa.`
        : `${primero.empresa} registró "${primero.concepto}" en ${primero.moneda} y su moneda funcional es ${funcional}.`,
      porQueImporta,
      `Cambiar la moneda a ${funcional} (moneda funcional de ${primero.empresa}) y volver a convertir.`,
    );
  });
}

function alertasTotal(dataset: Dataset): Alerta[] {
  return dataset.totales.flatMap((t) => {
    const declarado = comoDecimal(t.declarado as Decimal | string);
    const suma = comoDecimal(t.sumaLineas as Decimal | string);
    if (declarado.eq(suma)) return [];
    const dif = declarado.minus(suma).abs();
    const tasa = dataset.tasas[dataset.empresas[t.empresa].moneda]?.cierre;
    const enGtq = tasa ? ` La diferencia equivale a ${miles(dif.div(tasa))} GTQ a la tasa de cierre.` : "";
    return [alertaBase(
      "total",
      "advertencia",
      t.empresa,
      ["real_2025"],
      [t.id],
      `${t.empresa} declara "${t.etiqueta}" por ${miles(declarado)} y la suma de las líneas es ${miles(suma)}.`,
      `El total escrito a mano no cuadra con sus líneas (${miles(dif)} de diferencia).${enGtq}`,
      "Recalcular el total a partir de las líneas del estado. No se corrige solo.",
    )];
  });
}

export const validar: Validar = (dataset) => [
  ...alertasFaltantes(dataset),
  ...alertasEncabezado(dataset),
  ...alertasDuplicado(dataset),
  ...alertasSigno(dataset),
  ...alertasMoneda(dataset),
  ...alertasTotal(dataset),
].map((a) => ({ ...a, filaIds: [...a.filaIds].sort(natural) }));
