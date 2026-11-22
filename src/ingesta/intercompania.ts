import type * as XLSX from "xlsx";
import { desdeExcel } from "../decimal";
import type { AvisoIngesta, CodigoEmpresa, Empresa, FilaIC } from "../types";
import { filas, hoja } from "./excel";
import { normalizar, textoCelda } from "./normalizar";

function columna(encabezados: string[], ...claves: string[]): number {
  const idx = encabezados.findIndex((h) => claves.some((c) => normalizar(h) === normalizar(c) || normalizar(h).includes(normalizar(c))));
  return idx;
}

export function leerIntercompania(
  libro: XLSX.WorkBook,
  archivo: string,
  empresa: CodigoEmpresa,
  empresas: Record<CodigoEmpresa, Empresa>,
): { filasIc: FilaIC[]; avisos: AvisoIngesta[] } {
  const todas = filas(hoja(libro, "Intercompania"));
  const encabezado = todas.find((f) => normalizar(textoCelda(f.celdas[0])) === "referencia");
  if (!encabezado) {
    return {
      filasIc: [],
      avisos: [{
        id: `${archivo}:Intercompania:1`,
        archivo,
        hoja: "Intercompania",
        fila: 1,
        detalle: "No se encontró el encabezado Referencia.",
      }],
    };
  }

  const headers = encabezado.celdas.map((c) => textoCelda(c));
  const col = {
    referencia: 0,
    tipo: columna(headers, "tipo"),
    contraparte: columna(headers, "contraparte"),
    concepto: columna(headers, "concepto"),
    moneda: columna(headers, "moneda"),
    monto2025: columna(headers, "monto 2025"),
    saldo: columna(headers, "saldo"),
  };
  const nombres = new Map(Object.entries(empresas).map(([codigo, e]) => [normalizar(e.nombre), codigo as CodigoEmpresa]));
  const filasIc: FilaIC[] = [];
  const avisos: AvisoIngesta[] = [];

  for (const f of todas) {
    if (f.fila <= encabezado.fila) continue;
    const referencia = textoCelda(f.celdas[col.referencia]);
    if (!referencia) continue;
    const tipo = textoCelda(f.celdas[col.tipo]);
    const nombre = textoCelda(f.celdas[col.contraparte]);
    const contraparte = nombres.get(normalizar(nombre));
    if ((tipo !== "venta_ic" && tipo !== "costo_ic") || !contraparte) {
      avisos.push({
        id: `${archivo}:Intercompania:${f.fila}`,
        archivo,
        hoja: "Intercompania",
        fila: f.fila,
        detalle: contraparte ? `Tipo de intercompañía no reconocido: ${tipo}` : `Contraparte desconocida: ${nombre}`,
      });
      continue;
    }
    filasIc.push({
      id: `${archivo}:Intercompania:${f.fila}`,
      referencia,
      empresa,
      tipo,
      contraparte,
      concepto: textoCelda(f.celdas[col.concepto]),
      moneda: textoCelda(f.celdas[col.moneda]).toUpperCase(),
      monto2025: desdeExcel(f.celdas[col.monto2025]),
      saldoCierre: desdeExcel(f.celdas[col.saldo]),
    });
  }

  return { filasIc, avisos };
}
