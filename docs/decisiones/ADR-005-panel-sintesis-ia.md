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
2. **Modelo: `gemini-3-flash-preview`** (familia "Flash" de Google) — la tarea es resumir
   5-6 señales ya calculadas en unas pocas frases, no necesita el modelo "Pro" más
   grande/lento. Se probaron `gemini-3.8-flash` (`503`, alta demanda) y `gemini-3.6-flash`
   (el que Google recomienda tras retirar `2.5-flash`, pero con una cuota gratuita real de
   solo ~20 peticiones/día) antes de encontrar que `3-flash-preview` tiene cuota
   notablemente más generosa dentro de la misma cuenta — ver "Revisión v3" y "v4".
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

Spec `045` pasa a `Implemented` con este ADR como respaldo del bloqueante de §0. El
camino feliz completo (respuesta real del modelo a través del propio endpoint, con datos
reales de la ciudad) quedó **verificado en vivo el mismo día** con la clave gratuita real
del usuario — ver "Revisión v4". Para cualquier otro despliegue, basta con provisionar
`GOOGLE_GENERATIVE_AI_API_KEY` (clave gratuita, `ai.google.dev`); sin ella, el endpoint
degrada a un error controlado (502) en vez de romperse o inventar un dato, ya verificado
también.

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

**No se pudo cerrar una verificación 100% en vivo del camino feliz completo** con
`gemini-3.6-flash` en el momento de escribir esto — la cuota se agotó durante las pruebas
de diagnóstico. Resuelto en la Revisión v4 (mismo día) cambiando de modelo, no esperando
a que la cuota de `3.6-flash` se recuperase.

## Revisión v4 (2026-09-17, misma sesión) — modelo alternativo con cuota disponible, camino feliz confirmado

A petición del usuario ("investiga y plantea posibles alternativas" mientras la cuota de
`gemini-3.6-flash` seguía agotada), se investigaron modelos alternativos dentro de la
misma cuenta gratuita en vez de esperar. Hallazgos:

- **Los free-tier RPD (peticiones/día) de Gemini son específicos por modelo, no
  compartidos** — confirmado empíricamente: con `gemini-3.6-flash` todavía en 429,
  `gemini-3-flash-preview` respondió con normalidad a la primera. Fuentes públicas (no
  oficiales, Google no publica las cifras exactas por modelo) apuntan a que modelos
  "latest"/recién publicados como `3.6-flash` reciben cuotas iniciales mucho más
  restringidas (del orden de 20/día) que modelos ya establecidos de la misma familia
  (cientos o miles/día) — consistente con lo observado.
- Otros alias probados (`gemini-flash-latest`, `gemini-flash-lite-latest`,
  `gemini-3.5-flash`, `gemini-3.5-flash-lite`) devolvieron `404` — no son ids válidos
  contra la API REST directa de Google con esta clave (puede que sean solo alias del
  Gateway de Vercel u otro canal, no de la API pública v1beta).
- **`gemini-3-flash-preview` resolvió el prompt real completo de esta spec sin truncar**
  (con `thinkingConfig.thinkingBudget: 0`, igual que la Revisión v3) y **a través del
  propio endpoint en ejecución** (`GET /api/sintesis/v1/actual`, no un script aislado):
  `HTTP 200`, `fresh: true`, con datos reales del momento (tráfico denso en Extramurs,
  incidencias reales del temporal de lluvia, aviso real del Hospital Clínico) y los
  guardrails funcionando correctamente (`fuenteSpec` presente en cada afirmación,
  recomendaciones en condicional: "Podría valorarse...", "Conviene monitorizar...").
  Confirmado también en el panel real del navegador.

**Cambio aplicado:** `MODELO` en `src/server/sintesis-ia.ts` pasa de `gemini-3.6-flash` a
**`gemini-3-flash-preview`**. Único caveat: es un modelo "preview" (Google puede
cambiarlo/retirarlo sin el mismo compromiso de estabilidad que un modelo GA) — aceptable
para este caso de uso de bajo riesgo ("avisa, no actúa", nunca un dato crítico sin
revisión humana) a cambio de una cuota realmente utilizable en una cuenta gratuita.

**Con esto queda cerrada la última verificación pendiente de spec `045`** — el camino
feliz completo funciona de extremo a extremo con la cuenta gratuita real del usuario.
