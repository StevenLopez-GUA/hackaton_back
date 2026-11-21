// Texto de respaldo cuando Groq falla (sin internet, key inválida, límite de uso). El demo nunca se cae.
import type { Alerta } from "./contrato.js";
import { q } from "./formato.js";

export const plantillaAlerta = (a: Alerta) =>
  `Qué pasó: ${a.mensaje} (${a.ubicacion}).\n` +
  `Por qué importa: ${a.porQueImporta ?? (a.severidad === "bloqueante"
    ? "Es un error bloqueante: contamina el número del grupo y no se puede publicar hasta corregirlo."
    : "Es una advertencia: no cambia los indicadores, pero el archivo no cuadra.")}\n` +
  `Cómo se corrige: ${a.comoSeCorrige ?? "Revisar la fila indicada en el archivo de la empresa y corregir el dato en origen."}`;

export const plantillaPuente = (p: any) =>
  `El EBIT de ${p.empresa} pasa de ${q(Number(p.base), 2)} a ${q(Number(p.nuevo), 2)}. ` +
  `De ese cambio, ${q(Number(p.operativo), 2)} se explican por el negocio (efecto operativo) ` +
  `y ${q(Number(p.cambiario), 2)} por la tasa de cambio ${p.moneda}/GTQ (efecto cambiario).`;

export const plantillaGenerica = (datos: unknown) =>
  `No se pudo generar la explicación con IA en este momento. Datos verificados:\n${JSON.stringify(datos, null, 2)}`;
