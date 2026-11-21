// Única fuente de Decimal configurado. Importar SIEMPRE desde aquí, nunca "decimal.js" directo.
import Decimal from "decimal.js";

Decimal.set({ precision: 28, rounding: Decimal.ROUND_HALF_UP });

// Normaliza números que vienen de Excel (float) a Decimal con 15 cifras significativas,
// igual que Excel. Evita artefactos tipo 65.09999999999999.
export function desdeExcel(v: unknown): Decimal {
  if (typeof v === "number") return new Decimal(v.toPrecision(15));
  if (typeof v === "string" && v.trim() !== "") return new Decimal(v.trim());
  throw new Error(`Valor numérico inválido: ${String(v)}`);
}

export default Decimal;
