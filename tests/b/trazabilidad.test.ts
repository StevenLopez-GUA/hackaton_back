import { describe, expect, it } from "vitest";
import { calcularGrupo } from "../../src/calculo/consolidar";
import { METRICAS } from "../../src/calculo/indicadores";
import { trazar, type Traza } from "../../src/calculo/trazabilidad";
import Decimal from "../../src/decimal";
import { cargarDatasetFixture } from "../../src/fixtures";
import { VERSIONES, type CodigoEmpresa } from "../../src/types";
import { corregirTodo } from "./helpers";

const fixture = cargarDatasetFixture();
const corregido = corregirTodo(fixture);
const NIVELES: ("grupo" | CodigoEmpresa)[] = ["grupo", ...(Object.keys(fixture.empresas) as CodigoEmpresa[])];

const suma = (t: Traza) =>
  t.componentes.reduce((s, c) => (c.signo === "+" ? s.plus(c.valor) : s.minus(c.valor)), new Decimal(0));

describe("trazar", () => {
  it("Σ componentes con signo = valor, y Σ hijos = componente (todas las combinaciones)", () => {
    for (const v of VERSIONES)
      for (const m of METRICAS)
        for (const n of NIVELES) {
          const t = trazar(fixture, v, m, n);
          expect(suma(t).eq(t.valor), `${v} ${m} ${n}`).toBe(true);
          for (const c of t.componentes) {
            expect(c.hijos.reduce((s, h) => s.plus(h.valor), new Decimal(0)).eq(c.valor)).toBe(true);
          }
        }
  });

  it("EBIT grupo Real 2025 corregido = 14,350,000.00", () => {
    const t = trazar(corregido, "real_2025", "ebit", "grupo");
    expect(t.valor.toFixed(2)).toBe("14350000.00");
    expect(t.componentes.map((c) => c.nombre)).toEqual(["venta_ext", "costo_ext", "gasto_op", "depreciacion"]);
    expect(t.componentes[0].hijos.find((h) => h.nombre === "FERR")!.valor.toFixed(2)).toBe("52000000.00");
  });

  it("coincide con calcularGrupo", () => {
    expect(trazar(fixture, "ppto_2026", "eva", "grupo").valor.eq(calcularGrupo(fixture, "ppto_2026").eva.valor)).toBe(true);
  });

  it("nivel empresa: hijos por registro con concepto y su id", () => {
    const t = trazar(fixture, "real_2025", "ventas", "FERR");
    expect(t.valor.toFixed(2)).toBe("53850000.00");
    const hijos = t.componentes.flatMap((c) => c.hijos);
    expect(hijos.every((h) => h.origen.length === 1 && h.nombre.length > 0)).toBe(true);
  });
});
