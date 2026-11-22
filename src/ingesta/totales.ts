import type * as XLSX from "xlsx";
import Decimal, { desdeExcel } from "../decimal";
import type { CodigoEmpresa, TotalDeclarado } from "../types";
import { filas, hoja } from "./excel";
import { textoCelda } from "./normalizar";

const HOJAS = ["Balance_General", "Estado_Resultados"] as const;

function montoVacio(valor: unknown): boolean {
  return valor === null || valor === undefined || (typeof valor === "string" && valor.trim() === "");
}

function esNumero(valor: unknown): boolean {
  if (typeof valor === "number") return Number.isFinite(valor);
  return typeof valor === "string" && valor.trim() !== "";
}

export function leerTotales(libro: XLSX.WorkBook, archivo: string, empresa: CodigoEmpresa): TotalDeclarado[] {
  const totales: TotalDeclarado[] = [];
  for (const nombre of HOJAS) {
    const todas = filas(hoja(libro, nombre));
    const encabezado = todas.find((f) => textoCelda(f.celdas[0]) === "Código local");
    if (!encabezado) continue;
    let suma = new Decimal(0);
    let lineaIds: string[] = [];
    for (const f of todas) {
      if (f.fila <= encabezado.fila) continue;
      const a = textoCelda(f.celdas[0]);
      const b = textoCelda(f.celdas[1]);
      const c = textoCelda(f.celdas[2]);
      const d = f.celdas[3];
      if (c && esNumero(d)) {
        suma = suma.plus(desdeExcel(d));
        lineaIds.push(`${archivo}:${nombre}:${f.fila}`);
        continue;
      }
      if (!a && b.startsWith("Total ") && !c && esNumero(d)) {
        totales.push({
          id: `${archivo}:${nombre}:${f.fila}`,
          empresa,
          etiqueta: b,
          declarado: desdeExcel(d),
          sumaLineas: suma,
          lineaIds,
        });
        continue;
      }
      if (a && montoVacio(d)) {
        suma = new Decimal(0);
        lineaIds = [];
      }
    }
  }
  return totales;
}
