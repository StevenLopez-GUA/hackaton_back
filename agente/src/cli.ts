// Uso:
//   npx tsx src/cli.ts "¿Qué empresas destruyen valor?"
//   npx tsx src/cli.ts --informe
//   npx tsx src/cli.ts --alerta A-04
//   npx tsx src/cli.ts --puente HERR
import { preguntar, explicar, informe } from "./agente.js";

const [, , a, b] = process.argv;
const r =
  a === "--informe" ? await informe()
  : a === "--alerta" ? await explicar({ tipo: "alerta", id: b })
  : a === "--puente" ? await explicar({ tipo: "puente", empresa: b as any })
  : await preguntar(a ?? "Dame un resumen del grupo en Real 2025");

console.log("\n" + r.texto + "\n");
console.log(`— fuente: ${r.fuente}${r.modelo ? ` (${r.modelo})` : ""} · ${r.ms} ms`);
if (r.herramientasUsadas.length) console.log("— herramientas:", r.herramientasUsadas.map((h) => `${h.nombre}(${JSON.stringify(h.args)})`).join(", "));
if (r.grafica) console.log(`— gráfica: ${r.grafica.tipo} "${r.grafica.titulo}" (${r.grafica.etiquetas.length} puntos, fuente ${r.grafica.fuente})`);
if (r.error) console.log("— error:", r.error);
