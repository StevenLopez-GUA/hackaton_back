// Pruebas de los cálculos (sin IA, sin internet). Correr: npm test
// Los valores esperados salen de backend_idea (v3).md.
import { test } from "node:test";
import assert from "node:assert/strict";
import * as A from "../src/analisis.js";
import { fuente } from "../src/fuente.js";
import { plantillaAlerta } from "../src/plantillas.js";

test("riesgos Real 2025: 4 destruyen valor, 2 crean", async () => {
  const r = await A.riesgos("real_2025");
  assert.deepEqual(r.destruyenValor.map((x) => x.empresa), ["CONC", "TRAC", "LOGI", "AGRO"]);
  assert.deepEqual(r.creanValor.map((x) => x.empresa).sort(), ["FERR", "HERR"]);
  assert.equal((r.grupo as any).destruyeValor, true);
  assert.equal((r.grupo as any).roic, "9.63%");
});

test("resumen Real 2025: no publicable, 5 bloqueantes y 1 advertencia", async () => {
  const r = await A.resumenGrupo("real_2025");
  assert.equal(r.publicable, false);
  assert.deepEqual(r.alertas, { bloqueantes: 5, advertencias: 1 });
  assert.equal((r.impactoDeTodosLosErroresJuntos as any).distorsionTotalDelEbit, "GTQ -14,736,105");
});

test("resumen Presupuesto 2026: 4 bloqueantes y errores que se compensan", async () => {
  const r = await A.resumenGrupo("ppto_2026");
  assert.equal(r.alertas.bloqueantes, 4);
  assert.equal((r.impactoDeTodosLosErroresJuntos as any).distorsionTotalDelEbit, "GTQ -9,769,846");
});

test("indicadores FERR", async () => {
  const r: any = await A.indicadoresEmpresa("FERR");
  assert.equal(r.ebit, "GTQ 4,410,000");
  assert.equal(r.roic, "14.97%");
});

test("puente HERR cuadra: base + operativo + cambiario = nuevo", async () => {
  const p = (await fuente.puente("HERR"))!;
  const suma = Number(p.base) + Number(p.operativo) + Number(p.cambiario);
  assert.ok(Math.abs(suma - Number(p.nuevo)) < 0.01);
  const f = A.formatearPuente(p);
  assert.equal(f.ebitNuevo_GTQ, "GTQ 2,422,365.22");
  assert.equal(f.porcentajeDelCambio, "operativo 68.3% · cambiario 31.7%");
});

test("tendencia EBIT grupo: reforecast por debajo del presupuesto", async () => {
  const t = await A.tendencia("GRUPO", "ebit");
  assert.equal(t.desvioReforecastVsPpto, "GTQ -937,864");
  assert.equal(t.cambio_real2025_a_ppto2026, "8.30% (GTQ 1,190,966)");
});

test("proyección 2027 EBIT grupo, con supuesto y limitación", async () => {
  const p: any = await A.proyectar2027("GRUPO", "ebit");
  assert.equal(p.tipoDato, "proyectado");
  assert.equal(p.proyeccion2027, "GTQ 14,860,668");
  assert.ok(p.supuesto && p.limitacion);
});

test("proyección sin datos suficientes no inventa", async () => {
  const p: any = await A.proyectar2027("FERR", "ebit"); // 2026 por empresa no está en fixtures
  assert.equal(p.proyeccion2027, "no disponible");
});

test("plantilla de alerta en tres partes", async () => {
  const a = (await fuente.alertas()).find((x) => x.id === "A-04")!;
  const t = plantillaAlerta(a);
  for (const parte of ["Qué pasó:", "Por qué importa:", "Cómo se corrige:"]) assert.ok(t.includes(parte));
});

test("ROIC: los cambios van en puntos porcentuales", async () => {
  const t = await A.tendencia("GRUPO", "roic");
  assert.equal(t.cambio_real2025_a_ppto2026, "0.28 puntos porcentuales");
});

test("calculadora", () => {
  assert.equal(A.calcular("sumar", [53850000, 21660000]).resultado, "GTQ 75,510,000");
  assert.equal(A.calcular("variacion_pct", [100, 110]).resultado, "10.00%");
  assert.ok("error" in A.calcular("sumar", []));
});
