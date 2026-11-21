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

test("resumen Real 2025: sin campo publicable, 5 bloqueantes y 1 advertencia", async () => {
  const r = await A.resumenGrupo("real_2025");
  assert.equal("publicable" in r, false); // el agente no opina sobre la compuerta
  assert.deepEqual(r.alertas, { bloqueantes: 5, advertencias: 1 });
  assert.equal((r.impactoDeTodosLosErroresJuntos as any).distorsionTotalDelEbit, "-Q14,736,105");
});

test("resumen Presupuesto 2026: 4 bloqueantes y errores que se compensan", async () => {
  const r = await A.resumenGrupo("ppto_2026");
  assert.equal(r.alertas.bloqueantes, 4);
  assert.equal((r.impactoDeTodosLosErroresJuntos as any).distorsionTotalDelEbit, "-Q9,769,846");
});

test("indicadores FERR", async () => {
  const r: any = await A.indicadoresEmpresa("FERR");
  assert.equal(r.ebit, "Q4,410,000");
  assert.equal(r.roic, "14.97%");
});

test("puente HERR cuadra: base + operativo + cambiario = nuevo", async () => {
  const p = (await fuente.puente("HERR"))!;
  const suma = Number(p.base) + Number(p.operativo) + Number(p.cambiario);
  assert.ok(Math.abs(suma - Number(p.nuevo)) < 0.01);
  const f = A.formatearPuente(p);
  assert.equal(f.ebitNuevo_GTQ, "Q2,422,365.22");
  assert.equal(f.porcentajeDelCambio, "operativo 68.3% · cambiario 31.7%");
});

test("tendencia EBIT grupo: reforecast por debajo del presupuesto", async () => {
  const t = await A.tendencia("GRUPO", "ebit");
  assert.equal(t.desvioReforecastVsPpto, "-Q937,864");
  assert.equal(t.cambio_real2025_a_ppto2026, "8.30% (Q1,190,966)");
});

test("proyección 2027 EBIT grupo, con supuesto y limitación", async () => {
  const p: any = await A.proyectar2027("GRUPO", "ebit");
  assert.equal(p.tipoDato, "proyectado");
  assert.equal(p.proyeccion2027, "Q14,860,668");
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
  assert.equal(t.cambio_real2025_a_ppto2026, "+0.28 pp");
});

test("calculadora", () => {
  assert.equal(A.calcular("sumar", [53850000, 21660000]).resultado, "Q75,510,000");
  assert.equal(A.calcular("variacion_pct", [100, 110]).resultado, "10.00%");
  assert.ok("error" in A.calcular("sumar", []));
});

test("formato del producto", async () => {
  const { q, pct, puntos } = await import("../src/formato.js");
  assert.equal(q(14350000), "Q14,350,000");
  assert.equal(q(-1645012), "-Q1,645,012");
  assert.equal(pct(0.0963), "9.63%");
  assert.equal(puntos(0.0028), "+0.28 pp");
});

test("gráficas armadas por código", async () => {
  const { graficaPara } = await import("../src/graficas.js");
  const barras = await graficaPara([{ nombre: "compararEmpresas", args: { metrica: "roic" } }]);
  assert.equal(barras?.tipo, "barras");
  assert.deepEqual(barras?.etiquetas, ["HERR", "FERR", "AGRO", "TRAC", "LOGI", "CONC"]);
  assert.equal(barras?.referencia?.valor, 0.11);
  const cascada = await graficaPara([{ nombre: "puente", args: { empresa: "HERR" } }]);
  assert.deepEqual(cascada?.series[0].valores, [2260000, 110825.53, 51539.69, 2422365.22]);
  const linea = await graficaPara([{ nombre: "proyectar2027", args: { sujeto: "GRUPO", metrica: "ebit" } }]);
  assert.equal(linea?.etiquetas.length, 4);
  assert.deepEqual(linea?.series[0].proyectado, [false, false, false, true]);
  assert.equal(await graficaPara([{ nombre: "listarAlertas", args: {} }]), undefined);
});
