# hackaton_back — Consolidación que se explica sola

Motor de consolidación financiera multiempresa para el Track 4 (Accounting) de Build & Pitch.
Normaliza los Excel de 6 empresas, convierte a GTQ, elimina intercompañía, valida errores y calcula
EBIT, NOPAT, ROIC, ROCE y EVA con trazabilidad hasta la fila de origen.

La especificación completa está en `docs/backend_idea.md`. El contrato de código está en `src/types.ts`.

## Arrancar

```bash
npm install
npm run dev        # API en http://localhost:3000/api
npm test           # todos los tests
npm run test:a     # tests de Persona A + contrato
npm run test:b     # tests de Persona B + contrato
npm run typecheck
```

El servidor arranca con `fixtures/dataset.json` ya cargado, así que todos los endpoints de cálculo
funcionan aunque nadie haya subido archivos todavía.

## Quién es dueño de qué

| Ruta | Dueño |
|---|---|
| `src/ingesta/**`, `src/validador/**`, `src/routes/rutasA.ts`, `tests/a/**` | Persona A |
| `src/calculo/**`, `src/routes/rutasB.ts`, `tests/b/**` | Persona B |
| `src/types.ts`, `src/monedas.ts`, `src/decimal.ts`, `src/fixtures.ts`, `src/estado.ts`, `src/pipeline.ts`, `src/http.ts`, `src/app.ts`, `fixtures/**`, `package.json` | Compartido: solo se cambia con acuerdo de ambos |

Los archivos con `STUB` en el encabezado son implementaciones temporales para que nadie se bloquee.
Cada dueño reemplaza el suyo manteniendo la misma firma.

## Datos

- `data/`: los 7 Excel del reto (ficticios).
- `fixtures/dataset.json`: lo que debe producir `cargarDataset()` con esos Excel (213 registros, 15 filas IC).
- `fixtures/alertas_esperadas.json`: las 7 alertas que debe producir el pipeline completo, con sus IDs finales.
- `fixtures/valores_esperados.json`: indicadores esperados por versión, grupo y empresa, con y sin errores.

## Reglas del equipo

- Dinero con `Decimal` importado de `src/decimal.ts`. Nunca `number` para montos.
- Los números los calcula código. La IA solo redacta texto.
- Merge a `main` seguido (cada hora) con `npm run typecheck && npm test` en verde.
- Si una definición contable no está clara, no se inventa: `// TODO(pregunta): ...` y se sigue con el supuesto del doc.

## Nota de seguridad

`xlsx@0.18.5` (SheetJS en npm) tiene una vulnerabilidad conocida de prototype pollution al leer archivos
maliciosos. Para el hackatón con archivos propios es aceptable; en producción usar la versión de
cdn.sheetjs.com o validar el origen de los archivos.

## Cómo construimos esto

<!-- Completar al final: herramientas de IA usadas y para qué. -->
