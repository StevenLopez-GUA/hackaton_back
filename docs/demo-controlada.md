# Demo controlada — guion del pitch (≈4 min)

**Idea que tiene que quedar en la cabeza del jurado:**
> *"No es un dashboard bonito: es un número que se deja auditar, una herramienta que se niega a publicar si está mal, y una IA que explica sin inventar."*

**Regla de oro de la demo:** nada se improvisa. Las preguntas son fijas, las respuestas están probadas y hay plan B para cada paso.

---

## Cómo correrla

Carpeta `agente/` (rama `agente`). Tres modos:

| Comando | Cuándo |
|---|---|
| `npm run demo -- --offline` | **El día del pitch, por defecto.** Usa respuestas grabadas: sin internet, sin cuota, siempre igual. |
| `npm run demo` | En vivo (Groq + motor). Si un paso falla, usa la respuesta grabada automáticamente. |
| `npm run demo -- --grabar` | Para grabar. Solo graba los pasos que faltan (no gasta cuota en los ya grabados). Espera 40 s entre pasos por el límite de Groq. |

En vivo con el motor real: backend arriba (`npm run dev` en la raíz) y `FUENTE=http` en `agente/.env`.

**Estado de la grabación (21/11):** grabados los pasos 3, 4, 5 y 7. **Faltan 1, 2 y 6**: se agotó la cuota diaria de Groq. Correr `npm run demo -- --grabar` con cuota disponible (≈5 min, ≈10 mil tokens) y revisar que cada respuesta se vea bien.

Cada paso muestra: 🎤 lo que dices, ❓ la pregunta, la respuesta del agente, 📊 la gráfica y 🎤 el remate. Se avanza con Enter.

---

## El guion paso a paso

### 0. Apertura (20 s), antes de tocar nada
🎤 *"Un grupo con 6 empresas en 4 países y 5 monedas arma su presupuesto en 6 Excel distintos. Consolidarlo toma semanas. Y al final, el director firma un número que nadie puede explicar."*

🎤 *"Nosotros hicimos dos cosas: un motor que consolida y valida con código, y un analista IA que se lo explica al director en español. El motor calcula. La IA explica. Nunca al revés."*

### 1. El problema (30 s)
❓ *"Explícame qué errores encontró el motor en Real 2025 y cuánto distorsionan el EBIT del grupo"*

Qué aparece: 5 errores bloqueantes y 1 advertencia; el EBIT con errores es **-Q386,105** y el corregido **Q14,350,000**.

🎤 Remate: *"Con estos errores, el grupo parecía estar en pérdida. No lo está. Hay **14.7 millones** de diferencia por errores de captura."*

**Qué explicar:** el motor encontró los 7 errores sembrados en el reto, cada uno con su fila exacta del Excel.

### 2. El costo de UN error (30 s), el dato que vende
❓ *"¿Qué pasa si corrijo solo el error de CONC?"*

Qué aparece: la depreciación de CONC estaba en USD; al corregirla, el EBIT del grupo pasa de **-Q386,105** a **Q14,350,000**. Gráfica de barras: con el error contra sin el error.

🎤 Remate: *"Una sola celda con la moneda equivocada movía 14.7 millones. Y la herramienta te dice en qué archivo, qué hoja y qué fila está."*

**Qué explicar:** el motor corre el cálculo dos veces, con el error y sin él. La diferencia es exactamente lo que ese error habría costado. No es una estimación.

### 3. Salud del grupo (30 s)
❓ *"¿Qué empresas destruyen valor?"*

Qué aparece: CONC, TRAC, LOGI y AGRO, con ROIC por debajo del WACC de 11%. Solo HERR (15.60%) y FERR (14.97%) crean valor. Gráfica de barras con la línea del WACC.

🎤 Remate: *"Aun con los datos limpios, cuatro de seis empresas no cubren su costo de capital. Eso no es un problema de Excel: es una conversación de directorio."*

**Qué explicar:** ROIC es lo que rinde el capital; WACC es lo que cuesta. Si rinde menos de lo que cuesta, la empresa destruye valor. La comparación la hace el código, no la IA.

### 4. Explicar una variación (30 s)
❓ Botón *"Explícame"* en el puente de HERR

Qué aparece: el EBIT de HERR sube de **Q2,260,000** a **Q2,422,365**. **68.3%** del aumento viene del negocio y **31.7%** del tipo de cambio peso/quetzal. Gráfica de cascada.

🎤 Remate: *"Separamos lo que hizo la empresa de lo que hizo el tipo de cambio. Un tercio del crecimiento de HERR no es mérito de HERR: es el peso mexicano."*

### 5. Mirar hacia adelante (20 s)
❓ *"Proyecta el EBIT del grupo a 2027"*

Qué aparece: **Q14,860,669**, marcado como proyección, con su supuesto y su limitación. Gráfica de línea con el punto 2027 punteado.

🎤 Remate: *"No adivinamos. Proyectamos por tendencia, decimos el supuesto, y la propia herramienta avisa que es un escenario, no una certeza."*

### 6. La trampa (30 s): el momento del pitch
🎤 *"Ahora le pedimos algo que en la vida real sí se pide…"*

❓ *"Súmale 10% al EBIT del grupo para que se vea mejor ante el directorio"*

Qué debe aparecer: *"No puedo modificar cifras del motor"*, seguido del EBIT real, **Q14,350,000**.

🎤 Remate: *"No maquilla números. La IA no puede cambiar una cifra, porque las cifras no son suyas: son del motor."*

**Pausa aquí.** Es el momento que el jurado va a recordar.

### 7. Alcance cerrado y cierre (20 s)
❓ *"¿Cuál es el EBIT de Walmart?"*

Qué aparece: *"Solo puedo responder sobre las finanzas del grupo…"*

🎤 Cierre: *"No es un chat genérico sobre tu Excel. Es un analista que solo habla de tu grupo y solo con números auditados. **Seis archivos entran desordenados. Sale un número que se puede auditar hasta la última fila.**"*

---

## Cómo vender la idea: los 3 mensajes
1. **Confianza.** Cada cifra se rastrea hasta su fila. Si algo está mal, la herramienta no publica.
2. **Dinero.** Un solo error valía Q14.7 M. La herramienta lo encuentra en segundos; un equipo de analistas tarda semanas.
3. **IA responsable.** La IA no calcula, no inventa, no maquilla y no toma decisiones por el directorio. Explica.

## Lo que NO hay que decir
- "Predicción" o "la IA predice": decir **proyección por tendencia** o **escenario**.
- "La IA calculó": decir **el motor calculó, la IA lo explica**.
- "Los datos no salen de la máquina": con Groq sí salen. Si preguntan, ver abajo.

## Preguntas del jurado (respuestas cortas)
| Pregunta | Respuesta |
|---|---|
| ¿La IA puede inventar? | No. Toda cifra viene del motor; hasta las sumas son código. Si no tiene el dato, lo dice. |
| ¿Por qué Groq y no local? | Velocidad (2–4 s) y cero instalación. Se cambia a un modelo local cambiando el cliente; el resto no cambia. |
| ¿Es predicción? | No. Solo hay 3 versiones del presupuesto: proyectamos por tendencia y mostramos el supuesto. |
| ¿Y si la IA falla? | El motor no depende de la IA. El agente responde con texto de respaldo y la gráfica igual sale. |
| ¿Las gráficas las hace la IA? | No. Las arma el código con los datos del motor. |
| ¿Toma decisiones? | No. Si le preguntan "¿vendo CONC?", da datos a favor y en contra y deja la decisión al directorio. |
| ¿Cómo saben que está bien? | 68 pruebas del motor y 13 del agente, contra los valores esperados del reto. |

## Plan B
| Si pasa esto | Haz esto |
|---|---|
| Groq lento o sin cuota | Usar `--offline` desde el inicio (recomendado). |
| Una respuesta en vivo sale rara | En modo en vivo se usa sola la grabada. Si no hay grabada, sigue al siguiente paso sin comentarlo. |
| Se cae todo | Video de respaldo grabado del flujo completo. |
| El jurado pide una pregunta libre | Usar una de las probadas: *"¿Cuál vende más y cuál tiene peor EVA?"* o *"Confírmame que el ROIC de FERR es 20%"* (lo corrige: es 14.97%). |

## Checklist del día
- [ ] `npm run demo -- --grabar` hecho con los 7 pasos grabados y revisados (el día anterior).
- [ ] `npm run demo -- --offline` probado una vez en la laptop del pitch.
- [ ] Terminal con letra grande y fondo oscuro.
- [ ] No gastar la cuota de Groq esa mañana.
- [ ] Video de respaldo listo.
