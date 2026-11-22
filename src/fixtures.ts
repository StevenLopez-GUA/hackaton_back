// COMPARTIDO. Carga los fixtures (montos como string) y los convierte a Decimal.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import Decimal from "./decimal";
import type { Alerta, Dataset } from "./types";

const dec = (v: string | null) => (v === null ? null : new Decimal(v));
const ruta = (archivo: string) => join(process.cwd(), "fixtures", archivo);

export function cargarDatasetFixture(): Dataset {
  const raw = JSON.parse(readFileSync(ruta("dataset.json"), "utf8"));
  return {
    empresas: raw.empresas,
    parametros: { ...raw.parametros, wacc: new Decimal(raw.parametros.wacc), toleranciaIC: new Decimal(raw.parametros.toleranciaIC) },
    tasas: Object.fromEntries(
      Object.entries(raw.tasas).map(([m, t]: [string, any]) => [
        m,
        { cierre: new Decimal(t.cierre), promedio: new Decimal(t.promedio), presupuesto: new Decimal(t.presupuesto) },
      ]),
    ),
    registros: raw.registros.map((r: any) => ({ ...r, monto: new Decimal(r.monto), tasa: dec(r.tasa), montoGrupo: dec(r.montoGrupo) })),
    intercompania: raw.intercompania.map((r: any) => ({ ...r, monto2025: new Decimal(r.monto2025), saldoCierre: new Decimal(r.saldoCierre) })),
    totales: raw.totales.map((t: any) => ({ ...t, declarado: new Decimal(t.declarado), sumaLineas: new Decimal(t.sumaLineas) })),
    faltantes: raw.faltantes,
    avisosIngesta: raw.avisosIngesta ?? [],
  };
}

// Alertas esperadas (sin textos). Sirven de stub y de objetivo de tests.
export function cargarAlertasFixture(): Alerta[] {
  return JSON.parse(readFileSync(ruta("alertas_esperadas.json"), "utf8")).map((a: any) => ({
    mensaje: "",
    porQueImporta: "",
    comoSeCorrige: "",
    ...a,
  }));
}

export function cargarValoresEsperados(): any {
  return JSON.parse(readFileSync(ruta("valores_esperados.json"), "utf8"));
}
