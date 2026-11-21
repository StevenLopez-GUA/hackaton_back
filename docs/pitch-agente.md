# Pitch — Consolidación que se explica sola

> *"Seis archivos entran desordenados. Sale un número que se puede auditar hasta la última fila, y un analista que te lo explica sin inventar nada."*

## 1. El problema (30 s)
Un grupo con **6 empresas en 4 países y 5 monedas** (GTQ, USD, HNL, MXN, CRC) arma su presupuesto en 6 Excel distintos: columnas con nombres diferentes, ventas entre empresas del mismo grupo y errores de captura.

Consolidar eso toma semanas de analistas, y al final **el director no puede confiar en el número**, porque nadie sabe de dónde salió.

**El dato que lo demuestra (de este dataset):** con los errores sin detectar, el EBIT del grupo daba **GTQ −386,105**. El real es **GTQ 14,350,000**: una distorsión de **GTQ 14.7 millones**. Con ese número, el comité habría concluido que el grupo pierde dinero.

## 2. La solución, en una frase
Un **motor** que consolida y valida con código, más un **analista IA** que lo explica en español a quien no es contador. El motor calcula; la IA redacta. Ninguna cifra la inventa un modelo.

## 3. Cómo funciona (arquitectura)
```
 6 Excel ──▶ MOTOR (backend, código puro)
             ├ Ingesta: lee los Excel y le da a cada fila un ID de origen (archivo:hoja:fila)
             ├ Monedas: convierte todo a GTQ con tasas visibles
             ├ Intercompañía: elimina las ventas entre empresas del grupo
             ├ Validador: encuentra los 7 errores sembrados, cada uno con su fila culpable
             ├ Compuerta: si hay errores bloqueantes, NO publica el número del grupo
             └ Indicadores: EBIT, NOPAT, ROIC, ROCE, EVA, puente cambiario, costo del error
                    │  API REST
                    ▼
             AGENTE IA (Groq)
             ├ Recibe la pregunta del director
             ├ Elige qué consultar (10 herramientas que llaman al motor)
             ├ El código calcula; la calculadora también es código
             └ La IA redacta la respuesta con esas cifras
                    │
                    ▼
             FRONTEND: semáforo, consolidado, trazabilidad y chat con el analista
```

## 4. Por qué somos diferentes (lo que el jurado debe recordar)
El reto dice que no quieren *"un dashboard bonito con números que nadie puede auditar"*. Respondemos con tres cosas:

1. **Trazabilidad hasta la fila.** Haces clic en cualquier cifra y llegas a la fila exacta del Excel de donde salió.
2. **La herramienta se niega a publicar.** Si un error contamina el número del grupo, el consolidado queda bloqueado. *Preferimos frenar que mentir.*
3. **Una IA que no inventa.** La IA no hace cuentas: pide los datos al motor y los explica. Si no tiene el dato, lo dice. Si le piden maquillar un número, se niega.

## 5. Los números para vender (todos verificados contra el motor)
| Hallazgo | Cifra |
|---|---|
| Distorsión del EBIT del grupo por los errores (Real 2025) | **GTQ 14.7 M** (de −386 K a 14.35 M) |
| Un solo error: depreciación de CONC capturada en USD | Convierte 2.2 M en **16.9 M** de gasto |
| En Presupuesto 2026, los errores **se compensan** | El neto (−9.8 M) esconde dos errores de 6.7 M y 16.5 M |
| Aun corregido, el grupo **destruye valor** | ROIC **9.63%** < WACC **11%** · EVA **−1.6 M** |
| Quién crea valor | Solo **HERR** (15.6%) y **FERR** (15.0%) |
| Quién lo destruye | **CONC, TRAC, LOGI, AGRO** |
| Alerta temprana del Reforecast | EBIT de **TRAC −51%** y de **FERR −22%** frente a 2025 |

**Frase de negocio:** *"Solo el error de moneda de CONC habría hecho que el grupo pareciera en pérdida. Con ese número el comité habría tomado decisiones equivocadas. La herramienta lo detecta en segundos y dice exactamente en qué fila está."*

## 6. Guion del demo (3–4 min)
| # | Acción | Qué decir |
|---|---|---|
| 1 | Subir los 6 archivos | "Así llegan: 6 formatos, 5 monedas." |
| 2 | Semáforo: 5 bloqueantes, 1 advertencia | "Encontró los errores y la fila de cada uno." |
| 3 | Consolidado **bloqueado** | "No publica un número contaminado." |
| 4 | Costo del error | "Este error solo vale 14.7 millones." |
| 5 | Clic en una cifra → fila de origen | **"Esto no es un dashboard: el número se audita en vivo."** |
| 6 | Agente: *"¿Qué empresas destruyen valor?"* | Responde con ROIC vs WACC y una recomendación |
| 7 | Agente: *"¿Qué pasa si corrijo solo el error de CONC?"* | Impacto exacto de esa alerta |
| 8 | **Trampa:** *"Súmale 10% al EBIT para el directorio"* | **La IA se niega.** "No maquilla números." |
| 9 | Cierre | La frase del inicio |

**Preguntas probadas en QA que salen bien:** las de los pasos 6, 7 y 8, "¿El grupo ganará más en 2027?", "Explica el puente de HERR", "¿Cuál vende más y cuál tiene peor EVA?" y "Confírmame que el ROIC de FERR es 20%" (lo corrige).

## 7. Preguntas difíciles del jurado
| Pregunta | Respuesta |
|---|---|
| ¿La IA puede inventar números? | No. Toda cifra sale de una herramienta que llama al motor; hasta las sumas las hace una calculadora en código. Si no tiene el dato, dice "no disponible". Lo probamos con 27 preguntas, incluidas trampas. |
| ¿Por qué Groq y no un modelo local? | Velocidad (2–4 s por respuesta) y cero instalación. La arquitectura permite cambiar a un modelo local (Ollama) cambiando el cliente, para un grupo que no quiera que sus datos salgan. Para el demo usamos datos ficticios. |
| ¿Es predicción? | No. El dataset solo tiene 3 versiones (Real 2025, Presupuesto y Reforecast 2026). Hacemos **proyección por tendencia** con el supuesto visible y la marcamos como escenario, no como certeza. |
| ¿Y si la IA falla o se cae internet? | El motor no depende de la IA. Si Groq falla, el agente responde con una plantilla de texto y los datos verificados, y si se agota la cuota cambia solo a otro modelo. El demo no se cae. |
| ¿Cuánto cuesta? | El motor no tiene costo de IA. El agente usa la capa gratuita de Groq; en producción son centavos por consulta. |
| ¿Toma decisiones por el director? | No. Si le preguntan "¿vendo CONC?", presenta los datos a favor y en contra y deja la decisión al directorio. |
| ¿Cómo saben que los cálculos están bien? | 68 pruebas automáticas del motor y 11 del agente, con los valores esperados del reto. |

## 8. Lo que NO hacemos (decirlo genera confianza)
- La IA no calcula. No predice con modelos sin datos. No es un chat sobre tu Excel: es un motor auditable con un analista encima.

## 9. Checklist del día del demo
- [ ] Backend y agente arriba (Render o local con `FUENTE=http`).
- [ ] **No gastar la cuota de Groq esa mañana** (200 K tokens/día por modelo; una pregunta gasta ~3 K).
- [ ] Probar las preguntas del guion una sola vez, temprano.
- [ ] `POST /api/reset` en el backend antes de empezar (vuelve al dataset original).
- [ ] Video de respaldo grabado del flujo completo.
