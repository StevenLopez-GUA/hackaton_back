import { describe, expect, it } from "vitest";
import { cargarDatasetFixture } from "../../src/fixtures";
import { validar } from "../../src/validador";
import { corregir } from "../../src/validador/corregir";

describe("corregir", () => {
  it("aplica signo, moneda y duplicado sobre el fixture", () => {
    let dataset = cargarDatasetFixture();
    const aplicadas = validar(dataset).filter((a) => corregir(dataset, a) !== null);
    expect(aplicadas.map((a) => a.regla).sort()).toEqual(["duplicado", "moneda", "moneda", "signo"]);
    for (const alerta of aplicadas) {
      const resultado = corregir(dataset, alerta);
      expect(resultado).not.toBeNull();
      dataset = resultado!.dataset;
    }

    expect(dataset.registros).toHaveLength(210);
    expect(dataset.registros.some((r) => r.monto.isNeg())).toBe(false);

    const conc = dataset.registros.filter((r) => r.archivo.includes("04_concretos") && r.fila === 9);
    expect(conc.length).toBeGreaterThan(0);
    for (const r of conc) {
      expect(r.moneda).toBe("GTQ");
      expect(r.montoGrupo!.eq(r.monto)).toBe(true);
    }

    const agro = dataset.registros.filter((r) => r.archivo.includes("02_agroinsumos") && r.fila === 12);
    expect(agro.length).toBeGreaterThan(0);
    for (const r of agro) {
      expect(r.moneda).toBe("HNL");
      expect(r.montoGrupo!.eq(r.monto.div(r.tasa!))).toBe(true);
      expect(r.tasa!.eq(dataset.tasas.HNL[r.tipoTasa])).toBe(true);
    }
  });

  it("no corrige total, encabezado, archivo faltante ni intercompañía", () => {
    const dataset = cargarDatasetFixture();
    const total = validar(dataset).find((a) => a.regla === "total");
    expect(total).toBeTruthy();
    expect(corregir(dataset, total!)).toBeNull();
    expect(corregir(dataset, { ...total!, regla: "intercompania" })).toBeNull();
    expect(corregir(dataset, { ...total!, regla: "encabezado" })).toBeNull();
    expect(corregir(dataset, { ...total!, regla: "archivo_faltante" })).toBeNull();
    expect(dataset.registros).toHaveLength(213);
  });
});
