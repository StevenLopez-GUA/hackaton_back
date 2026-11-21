# Agente financiero (Groq)

Analiza la salida del motor de consolidación (`backend_idea (v3).md`): resume el grupo, explica errores y puentes, detecta qué empresas destruyen valor y proyecta 2027 por tendencia. **Los números los calcula el código; el LLM solo elige qué consultar y redacta.**

## Correr
```bash
npm install
cp .env.example .env        # pega tu GROQ_API_KEY (https://console.groq.com/keys)
npx tsx src/cli.ts "¿Qué empresas destruyen valor?"
npx tsx src/cli.ts --informe
npx tsx src/cli.ts --alerta A-04
npx tsx src/cli.ts --puente HERR
npx tsx src/servidor.ts      # http://localhost:3001
npm test                     # 11 pruebas de los cálculos (sin IA ni internet)
```

Modelo: `openai/gpt-oss-120b` en Groq (`GROQ_MODEL` en `.env`). La capa gratuita permite 8,000 tokens por minuto; el cliente reintenta solo si se alcanza el límite.

## API
| Método | Ruta | Body | Respuesta |
|---|---|---|---|
| POST | `/agente/preguntar` | `{ "pregunta": "..." }` | `Respuesta` |
| POST | `/api/explicar` | `{ "tipo": "alerta", "id": "A-04" }` o `{ "tipo": "puente", "empresa": "HERR" }` | `Respuesta` (mismo contrato que el v3) |
| GET | `/agente/informe` | — | `Respuesta` con el informe ejecutivo |

```ts
type Respuesta = { texto: string; fuente: "ia" | "plantilla"; modelo?: string;
  herramientasUsadas: { nombre: string; args: unknown }[]; ms: number; error?: string };
```
Si Groq falla (sin internet, key inválida o límite de uso), `fuente` es `"plantilla"` y el texto sale de `src/plantillas.ts`. El demo nunca se cae.

## Cómo funciona
`pregunta → Groq (con herramientas) → el modelo pide p. ej. riesgos(real_2025) → el código calcula → Groq redacta con esas cifras`.

| Archivo | Qué hace |
|---|---|
| `src/contrato.ts` | Tipos del backend v3 |
| `src/fuente.ts` | `FuenteMock` (lee `fixtures/`) o `FuenteHttp` (llama al backend real) |
| `src/analisis.ts` | Tendencia entre versiones, proyección 2027, riesgos (ROIC < WACC), resúmenes |
| `src/herramientas.ts` | Herramientas que ve el modelo |
| `src/prompts.ts` | Reglas del agente: no inventar cifras, etiquetar real/calculado/proyectado |
| `src/agente.ts` | `preguntar()`, `explicar()` e `informe()` |

## Integrar con el backend real
1. Pon `FUENTE=http` y `BACKEND_URL=http://localhost:3000/api` en `.env`.
2. Revisa los mapeos de `FuenteHttp` en `src/fuente.ts` contra las respuestas reales.
3. O impórtalo directamente: copia `src/` a `backend/src/agente` y llama `explicar()` desde la ruta `/api/explicar`.

## Limitaciones (decirlas en el pitch)
- El dataset no tiene meses, solo Real 2025, Presupuesto 2026 y Reforecast 2026. La **proyección 2027 es una extrapolación por tendencia** con supuesto visible, no un modelo estadístico.
- Con Groq los datos se envían a un servicio externo. Con datos ficticios no hay problema; con datos reales habría que usar un modelo local.
- `fixtures/` tiene el detalle por empresa solo para Real 2025 (son los valores esperados del v3); 2026 está a nivel grupo.
