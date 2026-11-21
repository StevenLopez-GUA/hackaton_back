# Prompt — Persona A: ingesta, validación y endpoints de entrada

## Rol

Eres un ingeniero backend senior en TypeScript trabajando conmigo en un hackatón de un día. Construimos un
motor de consolidación financiera. Somos 2 en el backend: yo soy **Persona A** (datos de entrada y reglas).
Persona B hace los cálculos en paralelo. No debemos bloquearnos ni pisarnos archivos.

## Lee esto antes de escribir código

1. `docs/backend_idea.md` — especificación completa (fórmulas, reglas, contrato de API).
2. `src/types.ts` — contrato de tipos y firmas. **No lo modifiques.** Si necesitas un cambio, detente y dímelo.
3. `README.md` — dueños de cada archivo y reglas del equipo.
4. `src/decimal.ts`, `src/monedas.ts`, `src/pipeline.ts`, `src/fixtures.ts`, `src/estado.ts`, `src/http.ts`.
5. `fixtures/dataset.json` y `fixtures/alertas_esperadas.json` — son la **salida exacta** que debe producir tu código.
6. Los Excel en `data/`. Ábrelos con SheetJS y mira la estructura real antes de suponer nada.

## Tu alcance

- **Tuyo:** `src/ingesta/**`, `src/validador/**`, `src/routes/rutasA.ts`, `tests/a/**`.
- **No tocar:** `src/calculo/**`, `src/routes/rutasB.ts`, `tests/b/**` (Persona B).
- **Compartido, no tocar sin avisarme:** `src/types.ts`, `src/monedas.ts`, `src/decimal.ts`, `src/fixtures.ts`,
  `src/estado.ts`, `src/pipeline.ts`, `src/http.ts`, `src/app.ts`, `fixtures/**`, `package.json`.
- No instales dependencias nuevas sin preguntarme (genera conflictos en `package-lock.json`).

## Qué implementas (firmas en `src/types.ts`)

- `cargarDataset(archivos) → Dataset` en `src/ingesta/index.ts`
- `validar(dataset) → Alerta[]` en `src/validador/index.ts` (hoy es un STUB: reemplázalo con la misma firma)
- `corregir(dataset, alerta) → { dataset, supuesto } | null` en `src/validador/corregir.ts` (hoy STUB)
- Endpoints de `src/routes/rutasA.ts`

## Tareas en orden (cada una con su criterio de aceptación)

### T1. Lector de Excel — `src/ingesta/excel.ts`

- `leerLibro(buffer)` con `XLSX.read(buffer, { type: "buffer" })`.
- `filas(ws)` devuelve `{ fila: number; celdas: unknown[] }[]` donde `fila` es el **número de fila real de Excel (1-based)**.
  Usa `sheet_to_json(ws, { header: 1, defval: null, blankrows: true, raw: true })` y suma el offset de
  `XLSX.utils.decode_range(ws["!ref"]).s.r`. Si el número de fila sale mal, todos los IDs de trazabilidad salen mal.
- Todo número que venga de una celda pasa por `desdeExcel()` de `src/decimal.ts`.
- **Acepta:** la fila de encabezados de `Presupuesto` sale como fila 4 en los 6 archivos de empresa.

### T2. Parámetros del grupo — `src/ingesta/parametros.ts`

Lee el archivo que empieza con `00_`:
- `Empresas`: busca la fila cuyo primer valor es `Código`; lee hasta la primera fila vacía. Columnas: código,
  nombre, país, moneda, actividad, archivo.
- `Tasas`: busca la fila cuyo primer valor es `Moneda`; lee hasta la primera fila vacía. Columnas 3, 4 y 5 son
  cierre, promedio y presupuesto. Ignora la última columna (referencia) y la nota de NIO.
- `Parametros`: pares etiqueta-valor. Ubica cada uno por palabra clave en la etiqueta (`Moneda del grupo`,
  `WACC`, `Tolerancia`, `Período de cierre`, `Año presupuestario`). `31-dic-2025` se guarda como `2025-12-31`.
- **No leas `CLAVE_ERRORES` ni `Control_esperado`.**
- **Acepta:** `empresas`, `tasas` y `parametros` iguales a los de `fixtures/dataset.json`.

### T3. Presupuesto — `src/ingesta/presupuesto.ts`

- Detecta la fila de encabezados como la primera fila que contiene un sinónimo de "tipo".
- Diccionario de sinónimos (compara normalizando: minúsculas, sin tildes, espacios colapsados):

  | Campo | Sinónimos |
  |---|---|
  | concepto | concepto, partida, line item |
  | tipo | tipo, clasificación, type |
  | contraparte | contraparte, empresa relacionada, counterparty |
  | moneda | moneda, divisa, currency |
  | real_2025 | real 2025, cierre 2025, actual 2025 |
  | ppto_2026 | presupuesto original 2026, presupuesto 2026 v1, budget 2026 |
  | reforecast_2026 | reforecast 2026, reforecast 2026 v2 |
  | (ignorar) | variación, var %, diferencia, dif %, variance |

- Si un campo requerido no resuelve, agrega un `AvisoIngesta` y no inventes la columna.
- Descarta filas con concepto vacío (son totales o notas). Las columnas de variación no se ingieren.
- Cada fila genera **3 registros**, uno por versión, con `id = "<archivo>:Presupuesto:<fila>:<version>"`.
- `contraparte`: el nombre legal (con tildes) se mapea a código usando `Empresas` (comparación normalizada).
  Nombre desconocido → `AvisoIngesta`.
- `moneda` tal cual viene en la fila (trim, mayúsculas). No la "arregles": los errores de moneda son a propósito.
- Una fila con monto 0 sí existe (TRAC fila 8, Real 2025).
- Al final, aplica `convertir(registros, tasas)` de `src/monedas.ts`.
- **Acepta:** 213 registros con los mismos `id`, `tipo`, `contraparte`, `moneda`, `monto`, `tipoTasa` que el fixture,
  y `montoGrupo` con diferencia menor a 0.000001.

### T4. Intercompañía — `src/ingesta/intercompania.ts`

- Fila de encabezados: primer valor `Referencia`. Lee las filas con referencia no vacía (las de totales tienen la
  columna A vacía).
- `FilaIC.id = "<archivo>:Intercompania:<fila>"`, contraparte mapeada a código.
- **Acepta:** 15 filas iguales a `fixtures/dataset.json > intercompania`.

### T5. Totales declarados — `src/ingesta/totales.ts`

Para `Balance_General` y `Estado_Resultados` de cada empresa (encabezado: primer valor `Código local`):
- **Sección:** fila con texto en columna A y monto vacío → reinicia el acumulador.
- **Línea:** fila con **código grupo en columna C** y monto numérico → suma al acumulador.
  No uses la columna A para decidir: "Resultado del ejercicio" tiene la A vacía pero sí es línea (3.1.03).
- **Total a verificar:** columna A vacía, columna B empieza exactamente con `Total ` (con mayúscula inicial y
  espacio; así `TOTAL ACTIVOS` y `Utilidad bruta` no se verifican) y columna C vacía → `TotalDeclarado`.
- **Acepta:** de todos los totales de las 6 empresas, **solo uno** no cuadra:
  AGRO `Balance_General` fila 13, declarado 48,931,238 vs suma 48,811,238.

### T6. `cargarDataset()` — `src/ingesta/index.ts`

- Identifica el `00_` y asigna cada archivo a su empresa por el nombre exacto de `Empresas > Archivo`.
- Empresas sin archivo → `faltantes`. No lances excepción por un archivo faltante.
- Sin archivo `00_` → lanza un error claro (el endpoint lo convierte en 400).
- **Tests en `tests/a/ingesta.test.ts`:** lee los 7 archivos de `data/` y compara contra `cargarDatasetFixture()`;
  quitando el archivo 01, `faltantes` es `["TRAC"]`.

### T7. Validador — `src/validador/index.ts`

Reemplaza el STUB. Reglas (todas **menos** `intercompania`, que es de Persona B):

| Regla | Severidad | Cómo se agrupa |
|---|---|---|
| archivo_faltante | bloqueante | Una por empresa faltante; `filaIds: [nombre de archivo esperado]` |
| encabezado | bloqueante | Una por `AvisoIngesta` |
| duplicado | bloqueante | Clave: empresa, versión, concepto, tipo, contraparte, moneda, monto. Una sola alerta por grupo de filas repetidas, juntando las 3 versiones en `filaIds` y `versiones` |
| signo | bloqueante | Monto negativo. Una alerta por fila de Excel, con las versiones afectadas |
| moneda | bloqueante | Moneda sin tasa, o distinta a la moneda funcional de la empresa. Una por fila de Excel. Si pasan las dos, una sola alerta que diga "sin tasa" |
| total | advertencia | Un `TotalDeclarado` donde declarado ≠ suma. `filaIds: [id del total]` |

- Cada alerta lleva `mensaje`, `porQueImporta` y `comoSeCorrige` en español claro. En `porQueImporta` cuantifica en
  GTQ cuando se pueda (ejemplo: "Convertida como USD, la depreciación pasa de 2,200,000 a 16,936,105 GTQ").
- `versiones`: las versiones donde aparece el error. `total` → `["real_2025"]` (los estados son del cierre 2025);
  `archivo_faltante` y `encabezado` → las 3 versiones.
- **No asignes IDs finales:** `pipeline.ts > numerar()` los pone. Usa `id: ""`.
- **Acepta (`tests/a/validador.test.ts`):** con `cargarDataset(data/*)`, `validar()` produce exactamente las alertas de
  `fixtures/alertas_esperadas.json` que no son `intercompania`, comparando `regla`, `severidad`, `filaIds` y
  `versiones` (ordenados). Y `obtenerAlertas()` del pipeline sigue pasando `tests/contrato.test.ts`.

### T8. Correcciones — `src/validador/corregir.ts`

Devuelve un dataset **nuevo** (no mutes el original) y el supuesto en texto:
- `signo` → valor absoluto en esas filas. Supuesto: "Se asume que el signo negativo es un error de captura."
- `moneda` → moneda funcional de la empresa y reconvertir con `convertir()`. Supuesto: "Se asume que la moneda
  correcta es <moneda funcional> (moneda funcional de <empresa>)."
- `duplicado` → quita las copias usando `idsDuplicados()` de `src/pipeline.ts`. Supuesto: "Se elimina la fila repetida."
- `intercompania`, `total`, `encabezado`, `archivo_faltante` → `null` (no se corrigen automáticamente).
- **Acepta:** tras corregir las 3 alertas corregibles sobre el fixture: 210 registros, CONC fila 9 en GTQ con
  `montoGrupo = monto`, AGRO fila 12 en HNL convertida, ningún monto negativo.

### T9. Endpoints — `src/routes/rutasA.ts`

Base `/api`. Montos con `monto()` y fracciones con `fraccion()` de `src/http.ts`. Errores con `enviarError()`.
Valida `?version=` contra `VERSIONES` (400 si no es válida).

- `POST /upload` (multipart, campo `archivos`): `cargarDataset` → `setDataset` → responde el resumen del contrato
  (`archivos[]`, `faltantes`, `totalRegistros`, `alertas: { bloqueantes, advertencias }` usando `obtenerAlertas`).
  400 si no viene el `00_`.
- `GET /empresas`: código, nombre, país, moneda.
- `GET /supuestos`: parámetros y la tabla de supuestos de `docs/backend_idea.md`.
- `GET /tasas` y `PUT /tasas`: el PUT acepta parcial (`{ "MXN": { "promedio": "2.40" } }`), valida que sea decimal
  positivo y tipo de tasa conocido, reconvierte con `convertir()` y hace `setDataset`.
- `GET /validacion?version=`: `{ version, publicable, resumen, alertas }`. Solo alertas cuyo `versiones` incluye esa
  versión. `publicable = no hay bloqueantes`.
- `GET /registros?empresa=&version=&ids=`: registros filtrados (`ids` separados por coma).
- **Acepta:** probado a mano con `curl` y con al menos un test por endpoint usando `app` de `src/app.ts`.

### T10. Tarde (después de la integración con B)

- `POST /explicar`: primero una versión con **plantillas** de texto. Luego, opcional, Ollama en
  `http://localhost:11434/api/generate` con timeout de 8 s; si falla, responde la plantilla. `fuente: "ia" | "plantilla"`.
  La IA solo redacta: recibe los números ya calculados y nunca los calcula.
- `GET /sensibilidad`: mueve cada tasa ±delta una por una, recalcula con `calcularGrupo()` de Persona B y rankea por
  impacto en EBIT del grupo. Mientras `calcularGrupo` sea STUB, no lo empieces.
- Completa la sección "Cómo construimos esto" del README.

## Reglas técnicas

- Dinero siempre con `Decimal` importado de `src/decimal.ts`. Nunca `number` para montos, nunca `parseFloat`.
- Funciones puras: sin estado global fuera de `src/estado.ts`.
- TypeScript estricto, sin `any` salvo al parsear JSON o celdas de Excel.
- Código y nombres en español, igual que los tipos.
- No muestres ni calcules números con IA.

## Definición de terminado

- `npm run typecheck` y `npm run test:a` en verde.
- `tests/contrato.test.ts` sigue en verde.
- Ningún archivo fuera de tu alcance modificado.

## Flujo de git

- Rama `persona-a`. Commits pequeños con mensaje claro (`ingesta: lector de presupuesto`).
- Merge a `main` cada vez que una tarea pase sus tests (idealmente cada hora). Antes: `git pull origin main`.
- **Integración 1 (cerca del mediodía):** cuando T6 pase, cambiamos el seed de `src/estado.ts` a `cargarDataset()`
  con los archivos de `data/`. Ese cambio lo hacemos juntos.

## Si algo no está claro

No inventes. Deja `// TODO(pregunta): ...`, sigue con el supuesto de `docs/backend_idea.md` y avísame.
Si un test esperado no coincide con lo que ves en el Excel, muéstrame la fila exacta antes de cambiar el test.

Empieza leyendo los archivos indicados y dame un plan corto de T1–T6 antes de escribir código.
