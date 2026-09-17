# Plan post-V1 — próxima tanda de trabajo

**Fecha:** 2026-09-17. El [Definition of Done de V1](02_DEFINITION_OF_DONE_V1.md) quedó
completo (12/12 pasos) el mismo día. Este documento recoge la siguiente tanda de trabajo,
definida con el usuario para continuar en otra sesión. **Actualización (2026-09-17, misma
tanda): las 4 piezas (`027` v4, `043`, `044`, `045`) quedaron `Implemented`** — incluida
`045`, tras que el usuario resolviera explícitamente el bloqueante de decisión de
producto/ADR (`docs/decisiones/ADR-005-panel-sintesis-ia.md`). No es una fase nueva
confirmada en `ROADMAP.md` todavía.

## Orden de prioridad (decidido explícitamente por el usuario)

1. ~~**[`027` v4](../specs/027-agenda-eventos-scraping.md)**~~ — **Implementado
   (2026-09-17).** Agenda de eventos con impacto en vía pública (fútbol de Valencia
   CF/Levante UD como local, Roig Arena, carreras FDM) — las 4 fuentes nuevas no
   necesitaron Playwright, HTML/JSON plano vía `fetch()`.
2. ~~**[`043`](../specs/043-camaras-urbanas-externas.md)**~~ — **Implementado
   (2026-09-17).** Bloque de cámaras urbanas *externas* (red viaria que rodea Valencia).
   `livetrafik.com` descartado por protecciones anti-bot; fuente real = DGT (JSON +
   imágenes JPEG oficiales, licencia Creative Commons Attribution) — **pública por
   defecto**, mejor resultado que la hipótesis "personal" de partida. 84 cámaras.
3. ~~**[`044`](../specs/044-panel-emergencia-meteorologica.md)**~~ — **Implementado
   (2026-09-17).** Panel de emergencia meteorológica: altimetría por distrito (IGN, seed
   único), lluvia/viento por distrito (Open-Meteo multi-coordenada), pluviómetros reales
   (SAIH Júcar) — no hizo falta dividir en specs separadas. "Capacidad de absorción"
   descartada, sin fuente oficial.
4. ~~**[`045`](../specs/045-panel-sintesis-ia.md)**~~ — **Implementado (2026-09-17).**
   Panel de síntesis con IA. El usuario resolvió el bloqueante de producto/ADR aprobando
   Vercel AI Gateway + modelo barato (`anthropic/claude-haiku-4.5`) + caché de 20 min —
   ver `docs/decisiones/ADR-005-panel-sintesis-ia.md`. Guardrails por esquema (`zod`):
   `fuenteSpec` no vacío forzado, aviso "generado por IA" siempre visible. Sin
   credenciales de proveedor en este entorno de desarrollo — la llamada real al modelo
   queda pendiente del primer despliegue con `AI_GATEWAY_API_KEY`/`VERCEL_OIDC_TOKEN`.

## Cómo retomar cada una

Todas están en `Draft` con una sección de due-diligence ligera (solo alcanzabilidad de
dominios/`robots.txt`, no estructura de datos ni condiciones de uso reales) — el primer
paso real de cada una es la misma investigación en profundidad que ya se ha hecho para
cada spec `Implemented` de este repo (`CLAUDE.md` §8.2), no asumir que lo apuntado aquí ya
vale como verificación.

- Las 4 piezas de esta tanda (**`027` v4**, **`043`**, **`044`**, **`045`**) están
  `Implemented` (2026-09-17). No queda trabajo pendiente de esta tanda salvo verificar la
  llamada real al modelo de IA de `045` en el primer despliegue con credenciales.

## Qué NO es esta tanda

No sustituye ni reabre nada del DoD de V1 ya cerrado (`docs/02_DEFINITION_OF_DONE_V1.md`).
No es una fase nueva confirmada en `ROADMAP.md` en el sentido de "aprobada para
implementar sin más" — cuando cada spec pase de `Draft` a `Approved` (contrato de datos
verificado), es el momento de reflejarlo también en `ROADMAP.md` como fase F11, no antes.
