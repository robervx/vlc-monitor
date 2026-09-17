# ADR-005 — Panel de síntesis con IA: proveedor, coste y guardrails

**Fecha:** 2026-09-17 (revisado el mismo día — ver "Revisión v2" al final)
**Estado:** Aceptado — decisión explícita del usuario, resuelve el bloqueante de spec `045` §0.

---

## Contexto

Spec `045` (`specs/045-panel-sintesis-ia.md`) propone algo que ninguna otra spec de
correlación de este repo hace: usar un modelo de lenguaje para sintetizar en prosa las
señales ya calculadas (Pulso de Distrito, insights, apoyo a decisión, contexto mediático,
avisos oficiales). Rompe deliberadamente el principio "sin modelo estadístico/IA nuevo" de
`010`/`013`/`024`/`041`, así que quedó explícitamente bloqueada hasta que el product owner
decidiera coste, proveedor y fiabilidad — mismo peso que tuvo el bloqueante de revisión de
contenido de spec `042`.

La spec ya recogía (§0.1) una investigación de opciones concretas sin decidir nada. El
usuario aprobó esa opción tal cual se le presentó.

## Decisión (versión vigente — ver "Revisión v2")

1. **Proveedor: Google Generative AI directo, cuota gratuita** — paquete `@ai-sdk/google`
   (no Vercel AI Gateway, ver "Revisión v2" para por qué se descartó). Autenticación por
   `GOOGLE_GENERATIVE_AI_API_KEY`, que el usuario provisiona con su propia cuenta gratuita
   de Google AI Studio (`ai.google.dev`) — el gasto cae dentro de la cuota diaria gratuita
   de esa cuenta personal, no genera factura.
2. **Modelo: `gemini-3.6-flash`** (familia "Flash" de Google, pensada para uso de alto
   volumen dentro de la cuota gratuita) — la tarea es resumir 5-6 señales ya calculadas en
   unas pocas frases, no necesita el modelo "Pro" más grande/lento. Verificado en vivo
   (curl real) que es el modelo vigente que Google recomienda tras retirar `2.5-flash`;
   `3.8-flash` existe pero devolvió `503` (alta demanda) en las pruebas — ver "Revisión v3".
3. **Cadencia: caché con TTL de 90 min, nunca una llamada por carga de página.** Mismo
   patrón `getOrFetch` que el resto del repo (`CLAUDE.md` §2). El TTL se subió de 20 a 90
   min tras verificar en vivo la cuota real (ver "Revisión v3") — a 20 min, un día activo
   pediría más refrescos de los que la cuota gratuita aguanta.
4. **Guardrails, verificables por código, no solo un prompt:**
   - El modelo solo genera texto — `generateObject` con un esquema `zod` fijo
     (`SintesisIASchema`), nunca `tools`/function-calling ni capacidad de ejecutar nada.
   - Cada insight y cada recomendación debe traer `fuenteSpec` no vacío — si el modelo
     devuelve una afirmación sin fuente, la respuesta se rechaza entera (no se sirve a
     medias) y el endpoint degrada a "sin síntesis disponible ahora mismo" (stale-on-error,
     igual que cualquier otra fuente de este repo).
   - **"Parámetros de actuación" del modelo** (pedido explícito del usuario, "sacarle el
     máximo rendimiento dentro de su capacidad"): `temperature: 0.3` (esto es síntesis
     factual sobre datos ya calculados, no redacción creativa); `maxOutputTokens: 1024`;
     `thinkingConfig: { thinkingBudget: 0 }` (desactiva el razonamiento interno del modelo
     — bug real encontrado en vivo, ver "Revisión v3"); `maxRetries: 1` (no 3, el valor por
     defecto del SDK — cada reintento cuenta contra la cuota gratuita, ya ajustada).
   - Aviso fijo "generado por IA, puede contener errores" siempre visible en la UI, igual
     de prominente que el badge `MOCK` de spec `003` — nunca en letra pequeña.
   - Ninguna recomendación es una acción ejecutable — mismo criterio que spec `041` §0.

## Qué NO cambia

- `CLAUDE.md` §4 sigue íntegro: "avisa, no actúa" aplica igual con o sin IA de por medio.
- El modelo consume exclusivamente los endpoints internos ya existentes (`insights/v1/actual`,
  `decision/v1/sugerencias`, `pulso/v1/distrito`, `mediatico/v1/items`, `meteo/v1/avisos`) —
  nunca datos en bruto de una fuente externa directamente (`CLAUDE.md` §3.3).
- Esta decisión no reabre el principio "sin modelo estadístico nuevo" del resto de specs de
  correlación (`010`/`013`/`024`/`041`) — sigue aplicando ahí; `045` es la única excepción
  deliberada, documentada como tal.

## Consecuencia

Spec `045` pasa de `Draft` a `Approved`/`Implemented` con este ADR como respaldo del
bloqueante de §0. Implementación real sujeta a que el despliegue real tenga
`GOOGLE_GENERATIVE_AI_API_KEY` provisionada (clave gratuita del usuario, obtenida en
`ai.google.dev`) — sin esa credencial en este entorno de desarrollo, el endpoint se
implementó y probó con el error de autenticación real (502 controlado, nunca un dato
inventado); la llamada real al proveedor queda pendiente de verificación en el primer
despliegue con la clave provisionada (mismo tipo de hueco que Upstash Redis en spec 001
§4).

## Revisión v2 (2026-09-17, misma sesión) — cambio de proveedor

Tras aprobar la decisión de arriba, el usuario reconsideró: quiere un proveedor
**gratuito de verdad** ("mejor una gratuita de momento con todos los parámetros de
actuación bien definidos... creo que hay una gratuita de Gemini que se puede utilizar...
y que podemos configurar para sacarle el máximo rendimiento dentro de su capacidad"), no
Vercel AI Gateway con un modelo barato mediante facturación.

**Por qué Vercel AI Gateway no encaja con "gratuito de verdad":** el Gateway da $5 de
crédito gratis al mes y luego facturación por token (precio de lista del proveedor, sin
margen, pero facturación al fin y al cabo) — no es la cuota gratuita nativa de una cuenta
de proveedor. La cuota gratuita real de Gemini (límites diarios de peticiones/tokens
sin coste, mientras no se superen) solo se obtiene con una clave de Google AI Studio
usada directamente contra la API de Google, no a través del Gateway de Vercel.

**Cambio aplicado:**
- Proveedor: `@ai-sdk/google` (paquete directo, no el Gateway) — `google('gemini-3.6-flash')`.
- Auth: `GOOGLE_GENERATIVE_AI_API_KEY`, clave personal gratuita del usuario
  (`ai.google.dev`/Google AI Studio), no Vercel.
- El resto de la decisión (§ arriba) no cambia: mismo esquema de guardrails
  (`generateObject` + `zod`), misma UI, mismos guardrails de trazabilidad. Solo cambia de
  quién es la cuenta que paga (o no paga) la llamada.
- Se añaden explícitamente los "parámetros de actuación" que pidió el usuario:
  `temperature: 0.3`, `maxOutputTokens: 1024` (ver punto 4 de la decisión).

## Revisión v3 (2026-09-17, misma sesión) — verificación en vivo con la clave real del usuario

El usuario proporcionó su propia clave de Google AI Studio para probar el endpoint de
verdad. Se verificó con llamadas reales (`curl` directo a la API de Google, y un script
`tsx` aislado contra el propio `generateObject` de este repo) — no solo con el error de
autenticación como hasta la Revisión v2. Tres hallazgos reales:

1. **`gemini-3.8-flash` no responde de forma fiable con esta clave** (`503`, "alta
   demanda", en varios intentos) — `gemini-3.6-flash` sí respondió consistentemente
   cuando la cuota lo permitía. Se cambia el modelo de la decisión a `3.6-flash`.
2. **Bug real: el modelo agota `maxOutputTokens` en tokens de "pensamiento" interno**
   antes de escribir el JSON de salida — probado con el prompt real de esta spec:
   `reasoningTokens: 979` de `outputTokens: 1009` totales, dejando solo ~30 tokens para el
   JSON, que queda truncado a medias (`finishReason: 'length'`, el objeto no valida el
   esquema). Es una tarea de síntesis factual acotada, no necesita razonamiento
   extendido — se añade `thinkingConfig: { thinkingBudget: 0 }` para desactivarlo. No se
   pudo confirmar en vivo tras aplicar el arreglo por el hallazgo 3 (cuota agotada), pero
   el diagnóstico es inequívoco (el propio `usage` de la respuesta lo desglosa) y la
   solución es la documentada por Google para este caso exacto.
3. **La cuota gratuita real es muy ajustada**: tras ~20 peticiones (entre las pruebas de
   esta sesión, contando que cada llamada fallida del SDK reintentaba 3 veces por
   defecto — ver punto 4 de la decisión, bajado a 1 reintento) la API empezó a devolver
   HTTP 429 ("Quota exceeded... limit: 20, model: gemini-3.6-flash"). El mensaje de
   Google no especifica si la ventana es por minuto/hora/día; los reintentos con espera
   (hasta ~2 min) siguieron devolviendo 429, indicio de que la ventana es más larga que
   unos pocos minutos. **Consecuencia de diseño**: se sube el TTL de caché de 20 a 90 min
   (máximo ~16 refrescos/día en vez de ~72) para quedar cómodamente por debajo de esa
   cuota en uso normal. Si aun así se agota, el endpoint ya degrada solo (stale-on-error o
   502 controlado) — nunca rompe el panel ni inventa una síntesis.

**No se pudo cerrar una verificación 100% en vivo del camino feliz completo** (una
respuesta real y válida a través del propio endpoint `/api/sintesis/v1/actual`, con los 5
handlers reales agregados) porque la cuota se agotó durante las pruebas de diagnóstico
antes de poder confirmarlo una última vez con el arreglo ya aplicado. Sí se confirmó por
separado: (a) la clave autentica correctamente, (b) `gemini-3.6-flash` responde con texto
real cuando hay cuota, (c) el mecanismo de guardrails/schema funciona con una llamada más
simple (fuera del prompt real, con cuota fresca). Pendiente: repetir la verificación del
camino feliz completo cuando la cuota se recupere — no bloqueante, el sistema ya degrada
con seguridad mientras tanto.
