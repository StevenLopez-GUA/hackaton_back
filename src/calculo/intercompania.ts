// PERSONA B. STUB: devuelve las alertas IC esperadas en real_2025 y eliminación en cero.
// Reemplazar por la conciliación real (Real 2025 por Referencia; 2026 por par vendedor-comprador).
import Decimal from "../decimal";
import { cargarAlertasFixture } from "../fixtures";
import type { ConciliarIC } from "../types";

export const conciliarIC: ConciliarIC = (_dataset, version, _excluirIds) => ({
  eliminacion: { ventasEliminadas: new Decimal(0), costosEliminados: new Decimal(0), diferenciaNoConciliada: new Decimal(0) },
  alertas: cargarAlertasFixture().filter((a) => a.regla === "intercompania" && a.versiones.includes(version)),
});
