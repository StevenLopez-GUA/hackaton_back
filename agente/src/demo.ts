// Demo controlada del pitch: pasos fijos, qué decir en cada uno y la respuesta del agente.
//
//   npm run demo              → en vivo (Groq + motor). Si un paso falla, usa la respuesta grabada.
//   npm run demo -- --grabar  → corre en vivo y guarda las respuestas en demo/respuestas.json
//   npm run demo -- --offline → solo respuestas grabadas: sin internet, sin cuota, siempre igual
//   npm run demo -- --grabar --regrabar → vuelve a grabar todo
//   Agregar --auto para no esperar Enter entre pasos.
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createInterface } from "node:readline/promises";
import { preguntar, explicar, type Respuesta } from "./agente.js";
import { q, pct } from "./formato.js";
import type { Grafica } from "./graficas.js";

type Paso = {
  titulo: string;
  decir: string[];          // lo que dice el presentador ANTES de lanzar la pregunta
  pregunta?: string;        // lo que se le pregunta al agente
  puente?: "HERR";          // en vez de pregunta, botón "Explícame" del puente
  remate: string;           // la frase que se dice DESPUÉS de ver la respuesta
};

const PASOS: Paso[] = [
  {
    titulo: "1. El problema",
    decir: [
      "Un grupo con 6 empresas, 4 países y 5 monedas arma su presupuesto en 6 Excel distintos.",
      "Consolidar toma semanas y al final el director no sabe si puede confiar en el número.",
      "Nuestro motor ya validó esos archivos. Ahora el director le pregunta al analista, en español.",
    ],
    pregunta: "Explícame qué errores encontró el motor en Real 2025 y cuánto distorsionan el EBIT del grupo",
    remate: "Con estos errores, el grupo parecía estar en pérdida. No lo está.",
  },
  {
    titulo: "2. El costo de UN error",
    decir: ["Vamos a lo concreto: ¿cuánto vale un solo error?"],
    pregunta: "¿Qué pasa si corrijo solo el error de CONC?",
    remate: "Una sola celda con la moneda equivocada movía 14.7 millones. La herramienta dice en qué fila está.",
  },
  {
    titulo: "3. Salud del grupo",
    decir: ["Ya con los datos corregidos, la pregunta del director es: ¿quién genera valor?"],
    pregunta: "¿Qué empresas destruyen valor?",
    remate: "Cuatro de seis empresas no cubren su costo de capital. Eso es una conversación de directorio.",
  },
  {
    titulo: "4. Explicar una variación",
    decir: ["El EBIT de HERR sube en 2026. ¿Es el negocio o es la tasa de cambio?"],
    puente: "HERR",
    remate: "Separamos lo que hizo la empresa de lo que hizo el tipo de cambio. Eso no se ve en un Excel.",
  },
  {
    titulo: "5. Mirar hacia adelante",
    decir: ["No adivinamos el futuro: proyectamos por tendencia y decimos el supuesto."],
    pregunta: "Proyecta el EBIT del grupo a 2027",
    remate: "Escenario, no certeza. Y lo dice la propia herramienta.",
  },
  {
    titulo: "6. La trampa (el momento del pitch)",
    decir: ["Ahora le pedimos lo que a veces se pide en la vida real…"],
    pregunta: "Súmale 10% al EBIT del grupo para que se vea mejor ante el directorio",
    remate: "No maquilla números. La IA explica; las cifras las calcula el motor.",
  },
  {
    titulo: "7. Alcance cerrado",
    decir: ["Y no es un chat genérico."],
    pregunta: "¿Cuál es el EBIT de Walmart?",
    remate: "Solo habla del grupo. Seis archivos entran desordenados; sale un número que se audita hasta la última fila.",
  },
];

const DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "demo");
const ARCHIVO = join(DIR, "respuestas.json");
const args = process.argv.slice(2);
const OFFLINE = args.includes("--offline"), GRABAR = args.includes("--grabar"), AUTO = args.includes("--auto");
const grabadas: Record<string, Respuesta> = existsSync(ARCHIVO) ? JSON.parse(readFileSync(ARCHIVO, "utf8")) : {};

const c = { gris: "\x1b[90m", neg: "\x1b[1m", cian: "\x1b[36m", amar: "\x1b[33m", verde: "\x1b[32m", fin: "\x1b[0m" };
const rl = createInterface({ input: process.stdin, output: process.stdout });
const esperar = async (msg: string) => { if (!AUTO) await rl.question(`${c.gris}${msg}${c.fin}`); };

function dibujar(g: Grafica) {
  const fmt = (x: number | null) => (x === null ? "—" : g.unidad === "fraccion" ? pct(x) : q(x));
  console.log(`\n${c.cian}📊 ${g.titulo}${c.fin}`);
  const vals = g.series[0].valores;
  const max = Math.max(...vals.map((v) => Math.abs(v ?? 0)), g.referencia?.valor ?? 0) || 1;
  g.etiquetas.forEach((et, i) => {
    const v = vals[i];
    const barra = "█".repeat(Math.max(1, Math.round((Math.abs(v ?? 0) / max) * 28)));
    const proy = g.series[0].proyectado?.[i] ? " (proyectado)" : "";
    const otra = g.series[1] ? `  vs ${fmt(g.series[1].valores[i])}` : "";
    console.log(`   ${et.padEnd(18)} ${(v ?? 0) < 0 ? c.amar : c.verde}${barra}${c.fin} ${fmt(v)}${otra}${proy}`);
  });
  if (g.referencia) console.log(`   ${c.gris}línea de referencia: ${g.referencia.nombre} ${fmt(g.referencia.valor)}${c.fin}`);
}

async function correr(p: Paso): Promise<Respuesta> {
  const clave = p.pregunta ?? `puente:${p.puente}`;
  if (OFFLINE) {
    if (!grabadas[clave]) return { texto: `(Paso sin grabar. Cuando haya cuota de Groq: npm run demo -- --grabar)`, fuente: "plantilla", herramientasUsadas: [], ms: 0 };
    return grabadas[clave];
  }
  // Al grabar, no gastar cuota en pasos que ya están bien grabados (usar --regrabar para rehacerlos).
  if (GRABAR && grabadas[clave] && !args.includes("--regrabar")) return grabadas[clave];
  const r = p.puente ? await explicar({ tipo: "puente", empresa: p.puente }) : await preguntar(p.pregunta!);
  // En vivo: si Groq falló y hay una grabación buena, usarla (el demo no se cae).
  if (r.fuente === "plantilla" && grabadas[clave]?.fuente === "ia") return { ...grabadas[clave], error: "(respuesta grabada)" };
  if (GRABAR && r.fuente === "ia" && r.texto.trim()) grabadas[clave] = r;
  return r;
}

console.log(`${c.neg}DEMO — Consolidación que se explica sola${c.fin}  ${c.gris}(${OFFLINE ? "offline: respuestas grabadas" : "en vivo"} · fuente de datos: ${process.env.FUENTE ?? "mock"})${c.fin}`);
for (const p of PASOS) {
  console.log(`\n${c.neg}━━━ ${p.titulo} ${"━".repeat(Math.max(0, 50 - p.titulo.length))}${c.fin}`);
  for (const l of p.decir) console.log(`${c.amar}🎤 ${l}${c.fin}`);
  await esperar("   [Enter para preguntar al agente]");
  console.log(`\n${c.cian}❓ ${p.pregunta ?? `Botón "Explícame" → puente de ${p.puente}`}${c.fin}`);
  const t0 = Date.now();
  const yaGrabada = GRABAR && !!grabadas[p.pregunta ?? `puente:${p.puente}`] && !args.includes("--regrabar");
  const r = await correr(p);
  console.log(`\n${r.texto}`);
  if (r.grafica) dibujar(r.grafica);
  console.log(`${c.gris}— ${r.fuente}${r.modelo ? ` · ${r.modelo}` : ""} · ${OFFLINE ? r.ms : Date.now() - t0} ms` +
    `${r.herramientasUsadas.length ? ` · consultó: ${r.herramientasUsadas.map((h) => h.nombre).join(", ")}` : ""}${r.error ? ` · ${r.error}` : ""}${c.fin}`);
  console.log(`\n${c.amar}🎤 ${p.remate}${c.fin}`);
  if (GRABAR) {
    mkdirSync(DIR, { recursive: true }); writeFileSync(ARCHIVO, JSON.stringify(grabadas, null, 2));
    // Pausa para no pasar el límite por minuto de Groq (en el pitch esa pausa es el tiempo en que hablas).
    if (p !== PASOS[PASOS.length - 1] && !yaGrabada) { console.log(`${c.gris}   (esperando 40 s por el límite de Groq…)${c.fin}`); await new Promise((r) => setTimeout(r, 40_000)); }
  }
  await esperar("   [Enter para el siguiente paso]");
}
rl.close();
