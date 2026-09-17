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
2. **Modelo: `gemini-3.8-flash`** (familia "Flash" de Google, pensada para uso de alto
   volumen dentro de la cuota gratuita) — la tarea es resumir 5-6 señales ya calculadas en
   unas pocas frases, no necesita el modelo "Pro" más grande/lento.
3. **Cadencia: caché con TTL, nunca una llamada por carga de página.** Mismo patrón
   `getOrFetch` que el resto del repo (`CLAUDE.md` §2), TTL de 20 min — la cuota gratuita
   de Google es diaria, no ilimitada, así que refrescar poco a poco protege esa cuota
   igual que protegería un presupuesto de pago.
4. **Guardrails, verificables por código, no solo un prompt:**
   - El modelo solo genera texto — `generateObject` con un esquema `zod` fijo
     (`SintesisIASchema`), nunca `tools`/function-calling ni capacidad de ejecutar nada.
   - Cada insight y cada recomendación debe traer `fuenteSpec` no vacío — si el modelo
     devuelve una afirmación sin fuente, la respuesta se rechaza entera (no se sirve a
     medias) y el endpoint degrada a "sin síntesis disponible ahora mismo" (stale-on-error,
     igual que cualquier otra fuente de este repo).
   - **"Parámetros de actuación" del modelo** (pedido explícito del usuario, "sacarle el
     máximo rendimiento dentro de su capacidad"): `temperature: 0.3` (esto es síntesis
     factual sobre datos ya calculados, no redacción creativa — menos variación entre
     llamadas con las mismas señales de entrada) y `maxOutputTokens: 1024` (tope de
     latencia/coste, generoso para resumen+insights+recomendaciones completos).
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
- Proveedor: `@ai-sdk/google` (paquete directo, no el Gateway) — `google('gemini-3.8-flash')`.
- Auth: `GOOGLE_GENERATIVE_AI_API_KEY`, clave personal gratuita del usuario
  (`ai.google.dev`/Google AI Studio), no Vercel.
- El resto de la decisión (§ arriba) no cambia: mismo esquema de guardrails
  (`generateObject` + `zod`), mismo TTL de caché, misma UI, mismos guardrails de
  trazabilidad. Solo cambia de quién es la cuenta que paga (o no paga) la llamada.
- Se añaden explícitamente los "parámetros de actuación" que pidió el usuario:
  `temperature: 0.3` y `maxOutputTokens: 1024` (ver punto 4 de la decisión).
