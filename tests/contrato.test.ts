// COMPARTIDO. Si esto falla, alguien rompió el contrato.
import { describe, expect, it } from "vitest";
import Decimal from "../src/decimal";
import { cargarAlertasFixture, cargarDatasetFixture } from "../src/fixtures";
import { convertir, elegirTipoTasa } from "../src/monedas";
import { idsDuplicados, obtenerAlertas } from "../src/pipeline";

const d = cargarDatasetFixture();

describe("contrato", () => {
  it("fixture completo", () => {
    expect(d.registros).toHaveLength(213);
    expect(d.intercompania).toHaveLength(15);
    expect(Object.keys(d.empresas)).toHaveLength(6);
  });

  it("elegirTipoTasa", () => {
    expect(elegirTipoTasa("real_2025", "venta_ext")).toBe("promedio");
    expect(elegirTipoTasa("real_2025", "activos")).toBe("cierre");
    expect(elegirTipoTasa("ppto_2026", "capital")).toBe("presupuesto");
  });

  it("convertir reproduce montoGrupo del fixture", () => {
    const conv = convertir(d.registros, d.tasas);
    conv.forEach((r, i) => {
      const esperado = d.registros[i].montoGrupo;
      if (esperado === null) return expect(r.montoGrupo).toBeNull();
      expect(r.montoGrupo!.minus(esperado).abs().lt(new Decimal("0.000001"))).toBe(true);
    });
  });

  it("pipeline numera las 7 alertas igual que el fixture", () => {
    const got = obtenerAlertas(d).map((a) => [a.id, a.regla, a.filaIds.join("|")]);
    const want = cargarAlertasFixture().map((a) => [a.id, a.regla, a.filaIds.join("|")]);
    expect(got).toEqual(want);
  });

  it("idsDuplicados excluye solo la copia (fila 17 de HERR)", () => {
    const ids = idsDuplicados(cargarAlertasFixture());
    expect(ids).toHaveLength(3);
    expect(ids.every((id) => id.includes(":Presupuesto:17:"))).toBe(true);
  });
});
