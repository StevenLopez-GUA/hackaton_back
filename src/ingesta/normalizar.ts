// Comparación de encabezados y nombres legales: minúsculas, sin tildes, espacios colapsados.
export function normalizar(texto: string): string {
  return texto.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().replace(/\s+/g, " ").trim();
}

export function textoCelda(valor: unknown): string {
  if (valor === null || valor === undefined) return "";
  return String(valor).trim();
}

export function filaVacia(celdas: unknown[]): boolean {
  return celdas.every((c) => textoCelda(c) === "");
}
