import { describe, expect, it } from "vitest";
import { calcular, calcularGrupo } from "../../src/calculo/consolidar";
import { calcularIndicadores } from "../../src/calculo/indicadores";
import Decimal from "../../src/decimal";
import { cargarAlertasFixture, cargarDatasetFixture, cargarValoresEsperados } from "../../src/fixtures";
import { VERSIONES, type CodigoEmpresa, type Dataset, type Indicadores } from "../../src/types";
import { cerca, corregirTodo } from "./helpers";

const fixture = cargarDatasetFixture();
const corregido = corregirTodo(fixture);
const esperados = cargarValoresEsperados();

function comparar(got: Indicadores, want: Record<string, string>) {
  const fallos: string[] = [];
  for (const k of ["ventas", "ebit", "nopat", "eva"] as const) {
    if (!cerca(got[k].valor, want[k], "0.01")) fallos.push(`${k}: ${got[k].valor.toFixed(2)} ≠ ${want[k]}`);
  }
  for (const k of ["roic", "roce"] as const) {
    if (!cerca(got[k], want[k], "0.0001")) fallos.push(`${k}: ${got[k].toFixed(4)} ≠ ${want[k]}`);
  }
  expect(fallos).toEqual([]);
}

function empresa(d: Dataset, version: string, codigo: CodigoEmpresa) {
  const regs = d.registros.filter((r) => r.version === version && r.empresa === codigo);
  return calcularIndicadores(regs, d.parametros.wacc, "empresa");
}

describe("calcularGrupo", () => {
  for (const v of VERSIONES) {
    it(`${v} con errores`, () => comparar(calcularGrupo(fixture, v), esperados.grupo[v].conErrores));
    it(`${v} corregido`, () => comparar(calcularGrupo(corregido, v), esperados.grupo[v].corregido));
  }

  it("control: ventas a terceros Real 2025 = 175,000,000.00", () => {
    expect(calcularGrupo(fixture, "real_2025").ventas.valor.toFixed(2)).toBe("175000000.00");
  });

  it("origen de ventas del grupo son solo filas venta_ext", () => {
    const ids = new Set(calcularGrupo(fixture, "real_2025").ventas.origen);
    const tipos = fixture.registros.filter((r) => ids.has(r.id)).map((r) => r.tipo);
    expect(new Set(tipos)).toEqual(new Set(["venta_ext"]));
  });
});

describe("indicadores por empresa", () => {
  for (const v of VERSIONES) {
    it(`${v} con errores`, () => {
      for (const [e, want] of Object.entries(esperados.empresasConErrores[v] ?? {})) {
        comparar(empresa(fixture, v, e as CodigoEmpresa), want as Record<string, string>);
      }
    });
    it(`${v} corregido`, () => {
      for (const [e, want] of Object.entries(esperados.empresasCorregido[v] ?? {})) {
        comparar(empresa(corregido, v, e as CodigoEmpresa), want as Record<string, string>);
      }
    });
  }

  it("denominador cero devuelve 0 sin lanzar", () => {
    const i = calcularIndicadores([], new Decimal("0.11"), "grupo");
    expect(i.roic.isZero() && i.roce.isZero()).toBe(true);
  });
});

describe("calcular (compuerta)", () => {
  const alertas = cargarAlertasFixture();
  for (const v of VERSIONES) {
    it(`${v}: no publicable con el fixture`, () => {
      const c = calcular(fixture, v, alertas);
      expect(c.publicable).toBe(false);
      expect(c.grupo).toBeNull();
      expect(Object.keys(c.empresas)).toHaveLength(6);
    });
  }

  it("conAlertas y eliminación Real 2025", () => {
    const c = calcular(fixture, "real_2025", alertas);
    expect(c.empresas.FERR.conAlertas).toBe(false);
    expect(c.empresas.CONC.conAlertas).toBe(true);
    expect(c.empresas.TRAC.conAlertas).toBe(true); // IC-2025-03
    expect(c.eliminacionesIC.diferenciaNoConciliada.toFixed(2)).toBe("195000.00");
  });

  it("sin alertas bloqueantes publica el grupo", () => {
    const c = calcular(corregido, "real_2025", alertas.filter((a) => a.severidad !== "bloqueante"));
    expect(c.publicable).toBe(true);
    expect(c.grupo!.ebit.valor.toFixed(2)).toBe("14350000.00");
  });
});
