# Prompt — Persona B: intercompañía, consolidación, indicadores y endpoints de cálculo

## Rol

Eres un ingeniero backend senior en TypeScript trabajando conmigo en un hackatón de un día. Construimos un
motor de consolidación financiera. Somos 2 en el backend: yo soy **Persona B** (cálculos). Persona A hace la
ingesta de Excel y el validador en paralelo. No debemos bloquearnos ni pisarnos archivos.

## Lee esto antes de escribir código

1. `docs/backend_idea.md` — especificación completa (fórmulas, supuestos, contrato de API).
2. `src/types.ts` — contrato de tipos y firmas. **No lo modifiques.** Si necesitas un cambio, detente y dímelo.
3. `README.md` — dueños de cada archivo y reglas del equipo.
4. `src/decimal.ts`, `src/monedas.ts`, `src/pipeline.ts`, `src/fixtures.ts`, `src/estado.ts`, `src/http.ts`.
5. `fixtures/dataset.json` — tus datos de entrada desde el minuto uno (ya normalizados y convertidos a GTQ).
6. `fixtures/valores_esperados.json` y `fixtures/alertas_esperadas.json` — los resultados que tu código debe reproducir.

No necesitas leer los Excel: `getDataset()` ya devuelve el fixture. Cuando Persona A termine la ingesta, el dataset
vendrá de los Excel con exactamente la misma forma.

## Tu alcance

- **Tuyo:** `src/calculo/**`, `src/routes/rutasB.ts`, `tests/b/**`.
- **No tocar:** `src/ingesta/**`, `src/validador/**`, `src/routes/rutasA.ts`, `tests/a/**` (Persona A).
- **Compartido, no tocar sin avisarme:** `src/types.ts`, `src/monedas.ts`, `src/decimal.ts`, `src/fixtures.ts`,
  `src/estado.ts`, `src/pipeline.ts`, `src/http.ts`, `src/app.ts`, `fixtures/**`, `package.json`.
- No instales dependencias nuevas sin preguntarme.

## Qué implementas (firmas en `src/types.ts`)

- `conciliarIC(dataset, version, excluirIds)` en `src/calculo/intercompania.ts` (hoy STUB: reemplázalo con la misma firma)
- `calcularGrupo(dataset, version)` y `calcular(dataset, version, alertas)` en `src/calculo/consolidar.ts` (hoy STUB)
- Endpoints de `src/routes/rutasB.ts`

Lo que viene de Persona A y hoy es STUB: `validar()` (devuelve las alertas esperadas) y `corregir()` (devuelve
`null`). Usa siempre `obtenerAlertas(dataset)` de `src/pipeline.ts` para tener las alertas completas con IDs finales.

## Fórmulas (no las cambies sin avisarme)

Por empresa (base individual, incluye intercompañía):
- `EBIT = venta_ext + venta_ic − costo_ext − costo_ic − gasto_op − depreciacion`

Grupo (intercompañía eliminada):
- `EBIT = venta_ext − costo_ext − gasto_op − depreciacion`

Ambos niveles:
- `ventas = venta_ext (+ venta_ic solo en empresa)`
- `NOPAT = EBIT − impuesto`
- `capital = Σ capital` · `capitalEmpleado = Σ activos − Σ pasivos_cte`
- `ROIC = NOPAT / capital` · `ROCE = EBIT / capitalEmpleado` · `EVA = NOPAT − WACC × capital` (WACC de `parametros`)
- `gasto_fin` no entra en ningún indicador.

Siempre sobre `montoGrupo` (GTQ). Los registros con `montoGrupo = null` (moneda sin tasa) no se suman; ya los
cubre una alerta de moneda.

## Tareas en orden (cada una con su criterio de aceptación)

### T1. Conciliación intercompañía — `src/calculo/intercompania.ts`

**Real 2025** (solo con `dataset.intercompania`, no con los registros del Presupuesto, para no duplicar alertas):
- Agrupa por `referencia`. Vendedor = fila `venta_ic`, comprador = fila `costo_ic`.
- `monto2025` se convierte con tasa **promedio** y `saldoCierre` con tasa **cierre**, ambas de la moneda de la fila.
- Alerta si falta un lado, o si la diferencia en monto o en saldo supera `parametros.toleranciaIC` (100 GTQ).
  Una sola alerta por referencia. `filaIds` = ids de las filas IC existentes, `empresa = [vendedor, comprador]`,
  `versiones = ["real_2025"]`, `referencia`, severidad `bloqueante`.
- Textos claros. Ejemplo: "LOGI reporta venta de fletes a AGRO por 1,150,000 GTQ; AGRO registra la compra por
  1,265,000 GTQ (+115,000). Saldos: 287,500 vs 316,250."

**Presupuesto y Reforecast 2026** (con los registros de esa versión, excluyendo `excluirIds`):
- Cruza `venta_ic` (empresa → contraparte) contra `costo_ic` (contraparte ← empresa) por par, en GTQ.
- Mismas reglas de tolerancia y lado faltante.

**Eliminación** (cualquier versión): `ventasEliminadas = Σ venta_ic`, `costosEliminados = Σ costo_ic` (registros de esa
versión, sin `excluirIds`, sin nulos), `diferenciaNoConciliada = ventas − costos`.

**Acepta (`tests/b/intercompania.test.ts`):**
- Real 2025: exactamente las 2 alertas `intercompania` de `fixtures/alertas_esperadas.json` (compara `filaIds`,
  `versiones`, `referencia`, `empresa`).
- IC-2025-04 tiene −3.83 GTQ de diferencia en saldo y **no** genera alerta.
- Presupuesto y Reforecast 2026: cero alertas, usando `excluirIds = idsDuplicados(alertas esperadas)`.
- Eliminación Real 2025: 8,500,000.00 / 8,305,000.00 / 195,000.00.

### T2. Indicadores — `src/calculo/indicadores.ts`

- Función pura `calcularIndicadores(registros, wacc, nivel: "empresa" | "grupo") → Indicadores`.
- Cada `Resultado.origen` lleva los ids de los registros que lo componen (ventas: filas de venta; EBIT: todas las de
  resultados que entran; NOPAT: EBIT + impuesto; capital; capitalEmpleado: activos + pasivos_cte; EVA: NOPAT + capital).
- Denominador cero → `Decimal(0)` y un `console.warn`; no lances excepción.

### T3. Consolidador — `src/calculo/consolidar.ts`

- `calcularGrupo(dataset, version)`: indicadores del grupo **sin compuerta**.
- `calcular(dataset, version, alertas)`:
  - `empresas[codigo]`: indicadores individuales y `conAlertas` (hay alguna alerta de esa versión que menciona a la empresa).
  - `publicable`: no hay ninguna alerta `bloqueante` cuya `versiones` incluya la versión.
  - `grupo`: `calcularGrupo(...)` si es publicable; si no, `null`.
  - `eliminacionesIC`: de `conciliarIC(dataset, version, idsDuplicados(alertas)).eliminacion`.
- No excluyas duplicados ni corrijas nada aquí: los valores "con errores" incluyen los errores a propósito.
- **Acepta (`tests/b/consolidar.test.ts`)** contra `fixtures/valores_esperados.json`, tolerancia 0.01 en montos y
  0.0001 en fracciones:
  - `grupo[version].conErrores` con `calcularGrupo` sobre el fixture, en las 3 versiones.
  - `empresasConErrores[version]` sobre el fixture.
  - `grupo[version].corregido` y `empresasCorregido[version]` sobre un dataset corregido con un helper **de test**
    (`tests/b/helpers.ts`): quitar HERR fila 17, `gasto_op` en valor absoluto, moneda funcional en filas con moneda
    distinta y reconvertir con `convertir()`.
  - Control: ventas a terceros del grupo Real 2025 = 175,000,000.00.
  - Con el fixture, `calcular()` da `publicable: false` y `grupo: null` en las 3 versiones.

### T4. Trazabilidad — `src/calculo/trazabilidad.ts`

- `trazar(dataset, version, metrica, nivel)` con `metrica ∈ ventas | ebit | nopat | capital | capitalEmpleado | eva` y
  `nivel ∈ "grupo" | CodigoEmpresa`.
- Forma (ver `docs/backend_idea.md`): `{ metrica, nivel, version, valor, componentes: [{ nombre: tipo, signo, valor, hijos }] }`.
  En grupo, `hijos` es por empresa con su `origen`; en empresa, `hijos` es por registro (`nombre: concepto`, `origen: [id]`).
- **Acepta:** la suma de los componentes con su signo da el `valor`; EBIT grupo Real 2025 corregido = 14,350,000.00.

### T5. Endpoints mañana — `src/routes/rutasB.ts`

Base `/api`. Montos con `monto()`, fracciones con `fraccion()` y errores con `enviarError()` de `src/http.ts`.
Valida `version`, `empresa`, `metrica` y `nivel` (400 si no son válidos). Usa `getDataset()` y `obtenerAlertas()` en cada request.

- `GET /consolidado?version=`
- `GET /trazabilidad?metrica=&nivel=&version=`
- **Acepta:** respuestas con la forma exacta de los ejemplos de `docs/backend_idea.md`.

### T6. Tarde

**`src/calculo/impacto.ts` → `GET /impacto-errores?version=`**
- Para cada alerta de la versión: si `corregir(dataset, alerta)` no es `null`, compara `calcularGrupo` antes y después →
  `ImpactoError` (EBIT del grupo + ROIC, ROCE y EVA del grupo + EBIT y ROIC de la empresa afectada).
- Alertas `intercompania`: item sin corrección, con la diferencia no conciliada y el efecto en el EBIT individual de
  cada lado. El EBIT del grupo no cambia porque toda la IC se elimina.
- `total`: con todas las correcciones aplicadas juntas.
- Mientras `corregir` sea STUB, prueba con `vi.mock("../../src/validador/corregir", ...)` usando tu helper de test.
- **Acepta:** Real 2025 → la alerta de moneda de CONC (A-05) da diferencia −14,736,104.70; total con errores
  −386,104.70 y corregido 14,350,000.00. Presupuesto 2026 → signo y moneda por separado tienen impactos grandes y
  opuestos; juntos dan el corregido de `valores_esperados.json`.

**`src/calculo/puente.ts` → `GET /puente?empresa=&metrica=&desde=&hasta=`**
- `metrica ∈ ebit | ventas`. Valor local con `monto` de los registros de la empresa (sin las copias de
  `idsDuplicados`). Tasa de resultados de la moneda funcional: `tasas[moneda][elegirTipoTasa(version, "venta_ext")]`.
- `operativo = (L_nuevo − L_base) / t_base` · `cambiario = L_nuevo × (1/t_nuevo − 1/t_base)` · `base = L_base / t_base` ·
  `nuevo = L_nuevo / t_nuevo`.
- Si la empresa tiene filas en otra moneda para esas versiones, responde 409 con la alerta que lo causa (no mezcles monedas).
- **Acepta:** HERR, ebit, real_2025 → ppto_2026 = base 2,260,000.00 + operativo 110,825.53 + cambiario 51,539.69 =
  nuevo 2,422,365.22, y `base + operativo + cambiario = nuevo` exacto.

**`src/calculo/escenario.ts` → `POST /escenario`**
- Body: `{ version, aplicarCorrecciones?: "todas" | string[], aceptarIC?: string[], tasas?: { [moneda]: { [tipoTasa]: string } } }`.
  `aplicarCorrecciones` usa IDs de alertas del dataset actual. `aceptarIC` usa **referencias** (`"IC-2025-05"`), no IDs,
  porque los IDs se renumeran al corregir.
- Pasos: copia el dataset → aplica tasas editadas y `convertir()` → aplica las correcciones en orden →
  `obtenerAlertas()` del nuevo dataset → quita las IC aceptadas → `calcular()`.
- **Nunca** llames `setDataset`: el escenario no se guarda.
- Respuesta: misma forma que `/consolidado` más `escenario: { correccionesAplicadas, icAceptadas, tasasEditadas }`.
- **Acepta:** Real 2025 con `"todas"` y `aceptarIC: ["IC-2025-03", "IC-2025-05"]` → `publicable: true` y EBIT del
  grupo 14,350,000.00 (esto requiere el `corregir` real de Persona A o tu mock).

## Reglas técnicas

- Dinero siempre con `Decimal` importado de `src/decimal.ts`. Nunca `number` para montos.
- Funciones puras sobre `(dataset, version, ...)`: sin estado escondido. De eso depende correr el motor dos veces.
- TypeScript estricto, sin `any` salvo al parsear JSON.
- Código y nombres en español, igual que los tipos.
- Ningún número lo calcula una IA.

## Definición de terminado

- `npm run typecheck` y `npm run test:b` en verde.
- `tests/contrato.test.ts` sigue en verde.
- Ningún archivo fuera de tu alcance modificado.

## Flujo de git

- Rama `persona-b`. Commits pequeños con mensaje claro (`calculo: conciliación IC real 2025`).
- Merge a `main` cada vez que una tarea pase sus tests (idealmente cada hora). Antes: `git pull origin main`.
- **Integración 1 (cerca del mediodía):** Persona A cambia el seed a los Excel reales. Tus tests deben seguir pasando
  sin tocar nada; si no, el problema está en el contrato y lo resolvemos juntos.

## Si algo no está claro

No inventes. Deja `// TODO(pregunta): ...`, sigue con el supuesto de `docs/backend_idea.md` y avísame.
Si un valor esperado no coincide, muéstrame el cálculo paso a paso antes de cambiar el test.

Empieza leyendo los archivos indicados y dame un plan corto de T1–T5 antes de escribir código.
