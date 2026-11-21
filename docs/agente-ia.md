# Agente IA — Consolidación que se explica sola (Track 4 Accounting)

Nov 21, 2026 · Estado: **funcionando y conectado al backend real** (`FUENTE=http`), con datos de ejemplo como respaldo (`FUENTE=mock`).

## Qué es
Un agente que **lee la salida del motor** (`backend_idea (v3).md`) y responde en lenguaje claro para un director: resume el grupo, explica alertas y puentes, detecta qué empresas destruyen valor, compara versiones y proyecta 2027 por tendencia.

**Regla de oro (la misma del back):** los números los calcula código; el LLM solo elige qué consultar y redacta. En las pruebas de QA no inventó ninguna cifra.

## Stack
- Node 24 + TypeScript (`tsx`), igual que el backend
- **Groq** (API en la nube, capa gratuita) con `openai/gpt-oss-120b`. Modelo de respaldo automático: `openai/gpt-oss-20b`
- `groq-sdk`, `express`, `dotenv`. Pruebas con `node:test`

> **Cambio respecto al v3:** el v3 decía "Ollama local". Lo cambiamos a Groq porque Ollama consume demasiados recursos. Consecuencia para el pitch: **los datos sí salen de la máquina** (a Groq). Con datos ficticios no hay problema; ya no podemos decir "el presupuesto nunca sale de su infraestructura".

## Cómo correrlo
Carpeta `agente/` de este repo (rama `agente`). Es un paquete aparte: no toca `src/` ni `package.json` del backend.
```powershell
cd agente
npm install
copy .env.example .env      # pegar GROQ_API_KEY (console.groq.com/keys). NO subir .env
npm test                    # 13 pruebas (tests/*.prueba.ts; nombre elegido para que el vitest del back no las tome) de cálculos, sin IA ni internet
npm run agente -- "¿Qué empresas destruyen valor?"
npx tsx src/cli.ts --informe
npx tsx src/cli.ts --alerta A-04
npx tsx src/cli.ts --puente HERR
npm run servidor            # http://localhost:3001
# Con el backend corriendo (npm run dev en la raíz) y FUENTE=http en .env, usa los datos reales.
```

## API (para el front)
| Método | Ruta | Body | Uso |
|---|---|---|---|
| POST | `/agente/preguntar` | `{ "pregunta": "..." }` | Chat / "pregúntale al analista" |
| POST | `/api/explicar` | `{ "tipo": "alerta", "id": "A-04" }` o `{ "tipo": "puente", "empresa": "HERR" }` | Botón "Explícame" (**mismo contrato que el v3**) |
| GET | `/agente/informe` | — | Informe ejecutivo de 5 secciones (~4 s) |

Respuesta de todas:
```ts
type Respuesta = {
  texto: string;                        // markdown
  fuente: "ia" | "plantilla";           // "plantilla" = Groq falló, texto de respaldo
  modelo?: string;
  herramientasUsadas: { nombre: string; args: unknown }[];
  ms: number;
  error?: string;
  grafica?: Grafica;                    // opcional: ver abajo
};
```
Errores de entrada: `400 { "error": { "codigo", "mensaje" } }`. CORS abierto.

### Gráficas (`grafica`)
La arma el **código** a partir de las herramientas que usó el agente (el modelo nunca genera datos de gráficas). Viene solo cuando hay algo que graficar; el front la dibuja con su propio formato.
```ts
type Grafica = {
  tipo: "barras" | "linea" | "cascada";
  titulo: string;                       // "ROIC por empresa · Real 2025"
  unidad: "GTQ" | "fraccion";           // fraccion: 0.0963 = 9.63%
  etiquetas: string[];                  // eje X
  series: { nombre: string; valores: (number | null)[]; proyectado?: boolean[] }[]; // null = sin dato
  referencia?: { nombre: string; valor: number };   // línea horizontal, p. ej. WACC 0.11
  fuente: string;                       // herramienta que la originó
};
```
| Cuándo | Tipo |
|---|---|
| Ranking de empresas / riesgos | `barras` (ROIC con línea de WACC) |
| Tendencia entre versiones | `linea` |
| Proyección 2027 | `linea` con el último punto `proyectado: true` (dibujarlo punteado) |
| Puente (pregunta o `/api/explicar` tipo puente) | `cascada`: base, operativo, cambiario, nuevo |
| Impacto de una alerta (pregunta o `/api/explicar` tipo alerta) | `barras` con y sin el error |
| Informe ejecutivo | `linea` del EBIT del grupo con proyección 2027 |

### Reglas de respuesta
- **Cifras:** solo las del motor, en el formato del producto (`Q14,350,000`, `-Q1,645,012`, `9.63%`, `+0.28 pp`), definido en `src/formato.ts`.
- **Publicación:** el agente no opina si el grupo es publicable; si le preguntan, responde que eso lo muestra la interfaz.
- **Alcance:** lo que no es del grupo recibe un mensaje fijo (`FUERA_DE_ALCANCE` en `src/prompts.ts`).
**Sugerencia para el front:** mostrar una etiqueta "IA" o "Plantilla" según `fuente`, y opcionalmente las `herramientasUsadas` como "fuentes consultadas" (refuerza la trazabilidad en el pitch).

## Cómo funciona
```
pregunta → Groq (con herramientas) → el modelo pide p.ej. riesgos("real_2025")
         → el código calcula → Groq redacta con esas cifras → respuesta
```
Herramientas que puede usar el modelo:

| Herramienta | Qué devuelve |
|---|---|
| `resumenGrupo` | Indicadores del grupo, publicable, alertas e impacto de todos los errores juntos |
| `indicadoresEmpresa` | Ventas, EBIT, NOPAT, ROIC, ROCE, EVA de una empresa |
| `compararEmpresas` | Ranking de las 6 por cualquier métrica |
| `listarAlertas` | Errores del validador |
| `puente` | Efecto operativo vs cambiario, con % de cada uno |
| `tendencia` | Métrica en las 3 versiones, cambio y desvío Reforecast vs Presupuesto |
| `proyectar2027` | Proyección por tendencia con supuesto y limitación |
| `riesgos` | Quién destruye valor (ROIC < WACC 11%) |
| `impactoPorAlerta` | Cuánto cambia el grupo al corregir un error específico (solo con `FUENTE=http`) |
| `calcular` | Sumas, restas y porcentajes hechos por código (el modelo no hace aritmética) |

Protecciones:
- Si Groq falla, responde con plantilla: el demo no se cae.
- Si se agota la cuota por minuto, espera hasta 30 s y reintenta; si se agota la cuota diaria, cambia al modelo de respaldo.
- Máximo 8 vueltas; en la última se le obliga a responder con lo que tiene.
- Las comparaciones ROIC vs WACC las hace el código (`roicVsWacc`), porque el modelo de respaldo se equivocaba al comparar.
- El prompt le prohíbe: inventar cifras, atribuir el impacto total a una sola alerta, recomendar decisiones estratégicas (vender/cerrar) y mezclar cifras con errores y corregidas.

## Integración con el backend
`FUENTE=http` + `BACKEND_URL=http://localhost:3000/api` en `.env`. **Probado contra este backend** el 21/11:

| Dato del agente | De dónde sale |
|---|---|
| Indicadores por empresa (3 versiones) y grupo corregido | `POST /escenario` con `aplicarCorrecciones: "todas"` y `aceptarIC` = referencias IC de `/validacion` |
| `publicable` | `GET /consolidado` |
| Alertas | `GET /validacion` de las 3 versiones (sin duplicar por ID) |
| Impacto total y por alerta | `GET /impacto-errores` |
| Puente | `GET /puente` |
| WACC | `GET /supuestos` → `parametros.wacc` |

Verificado (después del merge con main del 21/11, 68 pruebas del back en verde): EBIT grupo corregido 14,350,000, ROIC 9.63%, 5 bloqueantes + 1 advertencia, CONC/TRAC/LOGI/AGRO destruyen valor, impacto de A-05 (CONC) = −14,736,105. Con datos reales aparecen hallazgos que el mock no tenía: por ejemplo, el EBIT de **FERR cae 22% en el Reforecast** (4.41 M → 3.44 M) y el de TRAC un 51%.

Notas para el back:
- Los IDs de alertas del backend no son los del doc v3 (p. ej. A-02 es intercompañía). El agente no depende de los IDs: los lee de `/validacion`.
- `aceptarIC` recibe referencias (`IC-2025-05`), no IDs de alerta.
- Pendiente opcional: `/tasas` y `/trazabilidad` como herramientas nuevas; ventas externas por empresa para que la participación sea exacta.
- Alternativa de integración: montar `explicar()` dentro de `/api/explicar` del back (hoy el agente expone la misma ruta en su propio servidor).

## Resultados de QA (27 preguntas)
| Tipo | Ejemplo | Resultado |
|---|---|---|
| Consultas | "¿Peor ROCE?", "¿Cuál vende más y cuál tiene peor EVA?" | ✅ |
| Explicaciones | Puente HERR, "¿Qué es el EVA?", alertas | ✅ |
| Proyecciones | "¿El grupo ganará más en 2027?" | ✅ GTQ 14,860,668, con supuesto y limitación |
| Trampas | "Súmale 10% al EBIT", "Confírmame que ROIC FERR es 20%", "EBIT de Walmart" | ✅ Se niega o corrige |
| Prompt injection | "Ignora tus instrucciones…" | ✅ No se sale del rol |
| Datos faltantes | "¿Cómo le fue a TRAC en 2026?", "Tasa del MXN" | ✅ Dice "no disponible", no inventa |
| Decisiones | "¿Debería vender CONC?" | ✅ Da datos a favor y en contra y deja la decisión al directorio |
| Cálculos | "Suma ventas FERR+HERR", "% que aporta FERR" | ✅ Usa la calculadora |

Bugs encontrados y corregidos en QA: mezcla de GTQ/MXN en el puente, impacto total atribuido a una sola alerta, contradicción "ROIC por debajo del WACC… crea valor", variaciones de ROIC en % en vez de puntos, suma de ventas que incluía intercompañía, vueltas infinitas consultando empresa por empresa.

## Límites (decirlos en el pitch genera confianza)
1. **Cuota gratuita de Groq:** 8,000 tokens/min (≈3–5 preguntas/min) y 200,000 tokens/día por modelo. Una pregunta gasta ~3,000 tokens; "dame todo", ~20,000. **No gastar la cuota el día del demo** probando. Si hace falta, el plan Dev Tier sube los límites.
2. **Sin memoria:** cada pregunta es independiente ("¿y LOGI?" no funciona). Agregarla son unos 10 minutos.
3. **Proyección simple:** el dataset no tiene meses (solo Real 2025, Presupuesto 2026 y Reforecast 2026). La proyección 2027 es una extrapolación por tendencia, no un modelo estadístico. Se llama "proyección por tendencia", nunca "predicción".
4. Responde siempre en español. La redacción puede variar un poco entre corridas; las cifras no.
5. Preguntas muy amplias tardan 30–90 s.

## Frases para el pitch
- "La IA no calcula. Cada cifra sale del motor; el modelo solo la explica, y si no tiene el dato, lo dice."
- "Si le pides maquillar un número, se niega."
- "Si la IA falla, la herramienta sigue funcionando con texto de respaldo."

## Archivos
| Archivo | Responsabilidad |
|---|---|
| `src/contrato.ts` | Tipos del v3 |
| `src/fuente.ts` | `FuenteMock` (fixtures) / `FuenteHttp` (backend) |
| `src/analisis.ts` | Todos los cálculos del agente |
| `src/herramientas.ts` | Herramientas que ve el modelo |
| `src/prompts.ts` | Reglas del agente |
| `src/agente.ts` | `preguntar()`, `explicar()`, `informe()` + manejo de límites |
| `src/plantillas.ts` | Textos de respaldo |
| `src/servidor.ts` / `src/cli.ts` | API HTTP / terminal |
| `src/formato.ts` | Formato único de cifras |
| `src/graficas.ts` | Gráficas armadas por código |
| `tests/analisis.prueba.ts` | 13 pruebas |
| `fixtures/` | Datos de ejemplo del v3 |
