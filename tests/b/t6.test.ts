import { describe, expect, it } from "vitest";
import { ErrorEntrada, simularEscenario } from "../../src/calculo/escenario";
import { impactoErrores, type ItemImpacto } from "../../src/calculo/impacto";
import { puente } from "../../src/calculo/puente";
import { cargarDatasetFixture, cargarValoresEsperados } from "../../src/fixtures";
import { obtenerAlertas } from "../../src/pipeline";

const fixture = cargarDatasetFixture();
const alertas = obtenerAlertas(fixture);
const esperados = cargarValoresEsperados();

const correccion = (items: ItemImpacto[], id: string) => {
  const i = items.find((x) => x.alertaId === id);
  if (i?.tipo !== "correccion") throw new Error(`${id} sin corrección`);
  return i.impacto;
};

describe("impactoErrores", () => {
  it("Real 2025: moneda de CONC (A-05) y total", () => {
    const r = impactoErrores(fixture, "real_2025", alertas);
    const a05 = correccion(r.items, "A-05");
    expect(a05.diferencia.toFixed(2)).toBe("-14736104.70");
    expect(a05.valorSinError.toFixed(2)).toBe("14350000.00");
    expect(a05.indicadoresAfectados.find((x) => x.nombre === "roic" && x.nivel === "grupo")!.sin.toFixed(4)).toBe("0.0963");
    expect(r.total.ebitConErrores.toFixed(2)).toBe("-386104.70");
    expect(r.total.ebitCorregido.toFixed(2)).toBe("14350000.00");
  });

  it("Real 2025: IC sin corrección, efectos individuales suman la diferencia", () => {
    const r = impactoErrores(fixture, "real_2025", alertas);
    const ic = r.items.filter((x) => x.tipo === "intercompania");
    expect(ic).toHaveLength(2);
    const dif = ic.map((x) => (x.tipo === "intercompania" ? x.diferenciaNoConciliada.toFixed(2) : "")).sort();
    expect(dif).toEqual(["-115000.00", "310000.00"]); // IC-2025-05, IC-2025-03 → neto 195,000
  });

  it("Presupuesto 2026: signo y moneda grandes y opuestos; juntos dan el corregido", () => {
    const r = impactoErrores(fixture, "ppto_2026", alertas);
    const signo = correccion(r.items, "A-04").diferencia;
    const moneda = correccion(r.items, "A-05").diferencia;
    expect(signo.toFixed(2)).toBe("6720000.00");
    expect(moneda.toFixed(2)).toBe("-16489846.15");
    expect(r.total.ebitCorregido.minus(esperados.grupo.ppto_2026.corregido.ebit).abs().lte("0.01")).toBe(true);
  });
});

describe("puente", () => {
  it("HERR ebit real_2025 → ppto_2026", () => {
    const p = puente(fixture, "HERR", "ebit", "real_2025", "ppto_2026", alertas);
    if (!p.ok) throw new Error("conflicto inesperado");
    expect([p.base, p.operativo, p.cambiario, p.nuevo].map((d) => d.toFixed(2))).toEqual([
      "2260000.00", "110825.53", "51539.69", "2422365.22",
    ]);
    expect(p.base.plus(p.operativo).plus(p.cambiario).eq(p.nuevo)).toBe(true);
    expect(p.desde.local.toFixed(2)).toBe("5311000.00");
  });

  it("original → reforecast: efecto cambiario 0", () => {
    const p = puente(fixture, "HERR", "ventas", "ppto_2026", "reforecast_2026", alertas);
    expect(p.ok && p.cambiario.isZero()).toBe(true);
  });

  it("CONC ebit: fila en USD → conflicto con la alerta de moneda", () => {
    const p = puente(fixture, "CONC", "ebit", "real_2025", "ppto_2026", alertas);
    expect(p.ok).toBe(false);
    if (!p.ok) expect(p.alerta?.id).toBe("A-05");
  });
});

describe("simularEscenario", () => {
  it('Real 2025 con "todas" + IC aceptadas → publicable y EBIT 14,350,000.00', () => {
    const { consolidado, escenario } = simularEscenario(fixture, {
      version: "real_2025",
      aplicarCorrecciones: "todas",
      aceptarIC: ["IC-2025-03", "IC-2025-05"],
    });
    expect(consolidado.publicable).toBe(true);
    expect(consolidado.grupo!.ebit.valor.toFixed(2)).toBe("14350000.00");
    expect(escenario.correccionesAplicadas).toEqual(["A-03", "A-05", "A-07"]);
  });

  it("sin aceptar IC sigue bloqueado; no muta el dataset", () => {
    const antes = fixture.registros.length;
    const { consolidado } = simularEscenario(fixture, { version: "real_2025", aplicarCorrecciones: "todas" });
    expect(consolidado.publicable).toBe(false);
    expect(fixture.registros.length).toBe(antes);
  });

  it("tasa editada mueve el EBIT y se reporta", () => {
    const base = simularEscenario(fixture, { version: "real_2025" }).consolidado.empresas.HERR.indicadores.ebit.valor;
    const r = simularEscenario(fixture, { version: "real_2025", tasas: { MXN: { promedio: "2.40" } } });
    expect(r.escenario.tasasEditadas).toEqual(["MXN.promedio"]);
    expect(r.consolidado.empresas.HERR.indicadores.ebit.valor.lt(base)).toBe(true);
    expect(fixture.tasas.MXN.promedio.toString()).toBe("2.35");
  });

  it("errores de entrada", () => {
    expect(() => simularEscenario(fixture, { version: "x" })).toThrow(ErrorEntrada);
    expect(() => simularEscenario(fixture, { aplicarCorrecciones: ["A-02"] })).toThrow(/aceptarIC/);
    expect(() => simularEscenario(fixture, { aplicarCorrecciones: ["A-99"] })).toThrow(ErrorEntrada);
    expect(() => simularEscenario(fixture, { tasas: { MXN: { promedio: "-1" } } })).toThrow(ErrorEntrada);
  });
});

describe("flujo completo en las versiones 2026", () => {
  for (const [version, ebit] of [["ppto_2026", "15540966.20"], ["reforecast_2026", "14603102.21"]] as const) {
    it(`${version}: "todas" sin aceptar IC publica el corregido`, () => {
      const { consolidado, escenario } = simularEscenario(fixture, { version, aplicarCorrecciones: "todas" });
      expect(consolidado.publicable).toBe(true);
      expect(consolidado.grupo!.ebit.valor.minus(ebit).abs().lte("0.01")).toBe(true);
      expect(escenario.correccionesAplicadas).toEqual(version === "ppto_2026" ? ["A-03", "A-04", "A-05", "A-07"] : ["A-03", "A-05", "A-07"]);
    });
  }
});
