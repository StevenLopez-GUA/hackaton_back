import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import Decimal from "../../src/decimal";
import { cargarDatasetFixture } from "../../src/fixtures";
import { filas, hoja, leerLibro } from "../../src/ingesta/excel";
import { cargarDataset } from "../../src/ingesta";
import { esEncabezadoTipo } from "../../src/ingesta/presupuesto";
const dataDir = join(process.cwd(), "data");

function paquete(excepto?: string) {
  return readdirSync(dataDir)
    .filter((nombre) => nombre.endsWith(".xlsx") && nombre !== excepto)
    .map((nombre) => ({ nombre, buffer: readFileSync(join(dataDir, nombre)) }));
}

function eqDec(a: Decimal | null, b: Decimal | null) {
  if (a === null || b === null) return a === b;
  return a.minus(b).abs().lt(new Decimal("0.000001"));
}

describe("ingesta", () => {
  it("el encabezado de Presupuesto es la fila 4 en las 6 empresas", () => {
    for (const archivo of paquete().filter((a) => !a.nombre.startsWith("00_"))) {
      const libro = leerLibro(archivo.buffer);
      const encabezado = filas(hoja(libro, "Presupuesto")).find((f) => esEncabezadoTipo(f.celdas));
      expect(encabezado?.fila, archivo.nombre).toBe(4);
    }
  });

  it("cargarDataset reproduce el fixture", () => {
    const got = cargarDataset(paquete());
    const want = cargarDatasetFixture();
    expect(got.faltantes).toEqual(want.faltantes);
    expect(got.avisosIngesta).toEqual(want.avisosIngesta);
    expect(got.empresas).toEqual(want.empresas);
    expect(got.parametros.monedaGrupo).toBe(want.parametros.monedaGrupo);
    expect(got.parametros.periodoCierre).toBe(want.parametros.periodoCierre);
    expect(got.parametros.anioPresupuesto).toBe(want.parametros.anioPresupuesto);
    expect(got.parametros.wacc.eq(want.parametros.wacc)).toBe(true);
    expect(got.parametros.toleranciaIC.eq(want.parametros.toleranciaIC)).toBe(true);
    for (const moneda of Object.keys(want.tasas)) {
      expect(got.tasas[moneda].cierre.eq(want.tasas[moneda].cierre)).toBe(true);
      expect(got.tasas[moneda].promedio.eq(want.tasas[moneda].promedio)).toBe(true);
      expect(got.tasas[moneda].presupuesto.eq(want.tasas[moneda].presupuesto)).toBe(true);
    }

    expect(got.registros).toHaveLength(213);
    expect(got.registros.map((r) => r.id)).toEqual(want.registros.map((r) => r.id));
    got.registros.forEach((r, i) => {
      const e = want.registros[i];
      expect(r.tipo).toBe(e.tipo);
      expect(r.contraparte).toBe(e.contraparte);
      expect(r.moneda).toBe(e.moneda);
      expect(r.tipoTasa).toBe(e.tipoTasa);
      expect(r.monto.eq(e.monto), r.id).toBe(true);
      expect(eqDec(r.tasa, e.tasa), r.id).toBe(true);
      expect(eqDec(r.montoGrupo, e.montoGrupo), `${r.id} ${r.montoGrupo?.toString()} vs ${e.montoGrupo?.toString()}`).toBe(true);
    });

    expect(got.intercompania).toHaveLength(15);
    got.intercompania.forEach((fila, i) => {
      const e = want.intercompania[i];
      expect(fila.id).toBe(e.id);
      expect(fila.referencia).toBe(e.referencia);
      expect(fila.empresa).toBe(e.empresa);
      expect(fila.tipo).toBe(e.tipo);
      expect(fila.contraparte).toBe(e.contraparte);
      expect(fila.concepto).toBe(e.concepto);
      expect(fila.moneda).toBe(e.moneda);
      expect(fila.monto2025.eq(e.monto2025)).toBe(true);
      expect(fila.saldoCierre.eq(e.saldoCierre)).toBe(true);
    });

    const descuadres = got.totales.filter((t) => !t.declarado.eq(t.sumaLineas));
    expect(descuadres).toHaveLength(1);
    expect(descuadres[0].id).toBe("02_agroinsumos_honduras_cierre2025.xlsx:Balance_General:13");
    expect(descuadres[0].declarado.eq(new Decimal("48931238"))).toBe(true);
    expect(descuadres[0].sumaLineas.eq(new Decimal("48811238"))).toBe(true);
  });

  it("sin el archivo 01, faltantes es TRAC", () => {
    const got = cargarDataset(paquete("01_tractores_del_istmo_cierre2025.xlsx"));
    expect(got.faltantes).toEqual(["TRAC"]);
  });

  it("sin el archivo 00_ lanza un error claro", () => {
    const archivos = paquete().filter((a) => !a.nombre.startsWith("00_"));
    expect(() => cargarDataset(archivos)).toThrow(/00_/);
  });
});
