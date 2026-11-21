// PERSONA A. STUB: devuelve las alertas esperadas (menos intercompania) para que B pueda trabajar.
// Reemplazar por las reglas reales: archivo_faltante, encabezado, duplicado, signo, moneda, total.
import { cargarAlertasFixture } from "../fixtures";
import type { Validar } from "../types";

export const validar: Validar = (_dataset) => cargarAlertasFixture().filter((a) => a.regla !== "intercompania");
