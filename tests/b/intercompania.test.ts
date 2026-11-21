import { describe, expect, it } from "vitest";
import { conciliarIC } from "../../src/calculo/intercompania";
import Decimal from "../../src/decimal";
import { cargarAlertasFixture, cargarDatasetFixture } from "../../src/fixtures";
import { idsDuplicados } from "../../src/pipeline";
import type { Alerta } from "../../src/types";

const dataset = cargarDatasetFixture();
const excluir = idsDuplicados(cargarAlertasFixture());
const natural = (a: string, b: string) => a.localeCompare(b, "es", { numeric: true, sensitivity: "base" });

function firma(a: Alerta) {
  return {
    filaIds: [...a.filaIds].sort(natural),
    versiones: a.versiones,
    referencia: a.referencia,
    empresa: a.empresa,
    regla: a.regla,
    severidad: a.severidad,
  };
}

describe("conciliarIC", () => {
  it("real 2025: las 2 alertas intercompañía esperadas", () => {
    const got = conciliarIC(dataset, "real_2025", excluir).alertas.map(firma).sort((a, b) =>
      (a.referencia ?? "").localeCompare(b.referencia ?? ""),
    );
    const want = cargarAlertasFixture()
      .filter((a) => a.regla === "intercompania")
      .map(firma)
      .sort((a, b) => (a.referencia ?? "").localeCompare(b.referencia ?? ""));
    expect(got).toEqual(want);
  });

  it("IC-2025-04 difiere −3.83 en saldo y no alerta", () => {
    const venta = dataset.intercompania.find((f) => f.referencia === "IC-2025-04" && f.tipo === "venta_ic")!;
    const costo = dataset.intercompania.find((f) => f.referencia === "IC-2025-04" && f.tipo === "costo_ic")!;
    const diff = venta.saldoCierre.div(dataset.tasas[venta.moneda].cierre).minus(
      costo.saldoCierre.div(dataset.tasas[costo.moneda].cierre),
    );
    expect(diff.toFixed(2)).toBe("-3.83");
    expect(diff.abs().lte(dataset.parametros.toleranciaIC)).toBe(true);
    expect(conciliarIC(dataset, "real_2025", excluir).alertas.some((a) => a.referencia === "IC-2025-04")).toBe(false);
  });

  it("presupuesto y reforecast 2026 no generan alertas", () => {
    expect(conciliarIC(dataset, "ppto_2026", excluir).alertas).toEqual([]);
    expect(conciliarIC(dataset, "reforecast_2026", excluir).alertas).toEqual([]);
  });

  it("eliminación real 2025", () => {
    const { eliminacion } = conciliarIC(dataset, "real_2025", excluir);
    expect(eliminacion.ventasEliminadas.toFixed(2)).toBe("8500000.00");
    expect(eliminacion.costosEliminados.toFixed(2)).toBe("8305000.00");
    expect(eliminacion.diferenciaNoConciliada.toFixed(2)).toBe("195000.00");
    expect(eliminacion.diferenciaNoConciliada.eq(new Decimal("195000"))).toBe(true);
  });
});
