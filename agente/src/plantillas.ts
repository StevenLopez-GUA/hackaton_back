// Texto de respaldo cuando Groq falla (sin internet, key inválida, límite de uso). El demo nunca se cae.
import type { Alerta } from "./contrato.js";

export const plantillaAlerta = (a: Alerta) =>
  `Qué pasó: ${a.mensaje} (${a.ubicacion}).\n` +
  `Por qué importa: ${a.porQueImporta ?? (a.severidad === "bloqueante"
    ? "Es un error bloqueante: contamina el número del grupo y no se puede publicar hasta corregirlo."
    : "Es una advertencia: no cambia los indicadores, pero el archivo no cuadra.")}\n` +
  `Cómo se corrige: ${a.comoSeCorrige ?? "Revisar la fila indicada en el archivo de la empresa y corregir el dato en origen."}`;

export const plantillaPuente = (p: any) =>
  `El EBIT de ${p.empresa} pasa de GTQ ${p.base} a GTQ ${p.nuevo}. ` +
  `De ese cambio, GTQ ${p.operativo} se explican por el negocio (efecto operativo) ` +
  `y GTQ ${p.cambiario} por la tasa de cambio ${p.moneda}/GTQ (efecto cambiario).`;

export const plantillaGenerica = (datos: unknown) =>
  `No se pudo generar la explicación con IA en este momento. Datos verificados:\n${JSON.stringify(datos, null, 2)}`;
