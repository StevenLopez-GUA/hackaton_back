// COMPARTIDO. Cambios solo con acuerdo de ambos.
import { TIPOS_BALANCE, type Convertir, type ElegirTipoTasa } from "./types";

// Real 2025: resultados a tasa promedio, balance a tasa de cierre. 2026: tasa de presupuesto para todo.
export const elegirTipoTasa: ElegirTipoTasa = (version, tipo) =>
  version !== "real_2025" ? "presupuesto" : TIPOS_BALANCE.includes(tipo) ? "cierre" : "promedio";

// GTQ = monto local / tasa (tasas expresadas en moneda local por 1 GTQ).
export const convertir: Convertir = (registros, tasas) =>
  registros.map((r) => {
    const tipoTasa = elegirTipoTasa(r.version, r.tipo);
    const tasa = tasas[r.moneda]?.[tipoTasa] ?? null;
    return { ...r, tipoTasa, tasa, montoGrupo: tasa ? r.monto.div(tasa) : null };
  });
