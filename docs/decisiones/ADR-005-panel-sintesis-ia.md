# ADR-005 — Panel de síntesis con IA: proveedor, coste y guardrails

**Fecha:** 2026-09-17
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

## Decisión

1. **Proveedor: Vercel AI Gateway**, vía el paquete `ai` (AI SDK, v7) — strings de modelo
   `"proveedor/modelo"` (p. ej. `anthropic/claude-haiku-4.5`) enrutan automáticamente por el
   gateway, sin wrapper ni paquete adicional para el caso simple de este panel. Autenticación
   por OIDC (`VERCEL_OIDC_TOKEN`, se provisiona con `vercel env pull` en el proyecto real) o
   `AI_GATEWAY_API_KEY` como alternativa — ninguna clave de proveedor propia que gestionar.
2. **Modelo: uno pequeño/barato** (`anthropic/claude-haiku-4.5` u equivalente) — la tarea es
   resumir 5-6 señales ya calculadas en unas pocas frases, no una tarea que necesite el
   modelo más grande disponible.
3. **Cadencia: caché con TTL, nunca una llamada por carga de página.** Mismo patrón
   `getOrFetch` que el resto del repo (`CLAUDE.md` §2), TTL de 20 min — coherente con que
   esta es la fuente más cara del producto, se refresca mucho más despacio que tráfico o
   insights.
4. **Guardrails, verificables por código, no solo un prompt:**
   - El modelo solo genera texto — `generateObject` con un esquema `zod` fijo
     (`SintesisIASchema`), nunca `tools`/function-calling ni capacidad de ejecutar nada.
   - Cada insight y cada recomendación debe traer `fuenteSpec` no vacío — si el modelo
     devuelve una afirmación sin fuente, la respuesta se rechaza entera (no se sirve a
     medias) y el endpoint degrada a "sin síntesis disponible ahora mismo" (stale-on-error,
     igual que cualquier otra fuente de este repo).
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
`AI_GATEWAY_API_KEY`/`VERCEL_OIDC_TOKEN` provisionado — sin esas credenciales en este
entorno de desarrollo, el endpoint se implementa y prueba con las llamadas al modelo
mockeadas; la llamada real al proveedor queda pendiente de verificación en el primer
despliegue con credenciales (mismo tipo de hueco que Upstash Redis en spec 001 §4).
