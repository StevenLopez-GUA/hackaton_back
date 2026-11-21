// Formato único de cifras del producto (igual que la interfaz): Q14,350,000 · -Q1,645,012 · 9.63%.
// Toda cifra que ve el modelo pasa por aquí; el prompt le prohíbe reformatearlas.

export const q = (x: number, decimales = 0) =>
  `${x < 0 ? "-" : ""}Q${Math.abs(x).toLocaleString("en-US", { minimumFractionDigits: decimales, maximumFractionDigits: decimales })}`;

export const pct = (x: number) => `${(x * 100).toFixed(2)}%`;

export const puntos = (x: number) => `${x >= 0 ? "+" : ""}${(x * 100).toFixed(2)} pp`;

/** Moneda local (solo referencia en el puente): MXN 5,311,000.00 */
export const local = (moneda: string, x: number) =>
  `${moneda} ${x.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
