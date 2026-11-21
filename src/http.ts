// COMPARTIDO. Helpers de respuesta.
import type { Response } from "express";
import type Decimal from "decimal.js";

export const monto = (d: Decimal) => d.toFixed(2);     // montos en GTQ
export const fraccion = (d: Decimal) => d.toFixed(4);  // ROIC, ROCE, porcentajes

export function enviarError(res: Response, status: number, codigo: string, mensaje: string) {
  return res.status(status).json({ error: { codigo, mensaje } });
}

export const noImplementado = (_req: unknown, res: Response) =>
  enviarError(res, 501, "NO_IMPLEMENTADO", "Endpoint pendiente");
