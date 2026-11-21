import * as XLSX from "xlsx";

export type FilaExcel = { fila: number; celdas: unknown[] };

export function leerLibro(buffer: Buffer): XLSX.WorkBook {
  return XLSX.read(buffer, { type: "buffer" });
}

// `fila` es el número de fila real de Excel (1-based), respetando el inicio de !ref.
export function filas(ws: XLSX.WorkSheet): FilaExcel[] {
  const matriz = XLSX.utils.sheet_to_json<unknown[]>(ws, {
    header: 1,
    defval: null,
    blankrows: true,
    raw: true,
  });
  const offset = ws["!ref"] ? XLSX.utils.decode_range(ws["!ref"]).s.r : 0;
  return matriz.map((celdas, i) => ({ fila: i + 1 + offset, celdas: celdas ?? [] }));
}

export function hoja(libro: XLSX.WorkBook, nombre: string): XLSX.WorkSheet {
  const ws = libro.Sheets[nombre];
  if (!ws) throw new Error(`El libro no tiene la hoja "${nombre}".`);
  return ws;
}
