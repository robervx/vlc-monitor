# Plan post-V1 — próxima tanda de trabajo

**Fecha:** 2026-09-17. El [Definition of Done de V1](02_DEFINITION_OF_DONE_V1.md) quedó
completo (12/12 pasos) el mismo día. Este documento recoge la siguiente tanda de trabajo,
definida con el usuario para continuar en otra sesión — no es una fase cerrada del
`ROADMAP.md` todavía en el sentido de "lista para implementar sin más": las 4 piezas están
en `Draft`, con distinto nivel de investigación ya hecho, ninguna con el contrato de datos
congelado.

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
3. **[`044`](../specs/044-panel-emergencia-meteorologica.md)** — Pestaña de días de
   emergencia/alerta: lluvia y viento por zona de la ciudad, pluviómetros (litros/hora vs.
   capacidad de absorción — sin fuente identificada todavía para la parte de capacidad),
   plano de altimetría de Valencia (puntos altos/bajos). Candidatos de fuente: SAIH Júcar
   (pluviometría, dominio verificado alcanzable) e IGN (altimetría, endpoint sin
   confirmar). **Muy probable que se divida en 2-4 specs** al investigar en profundidad —
   ver spec 044 §7.
4. **[`045`](../specs/045-panel-sintesis-ia.md)** — Panel de síntesis con IA: resumen de
   todas las señales del producto para insights de calidad y recomendaciones fundamentadas,
   con guardrails. El usuario pidió explícitamente **analizar antes de implementar** — esta
   spec es ese análisis inicial. Bloqueante explícito: requiere una decisión de
   producto/ADR (coste, proveedor, fiabilidad) antes de poder pasar a `Approved`, mismo
   peso que el bloqueante de contenido real que tuvo spec `042`. Rompe deliberadamente el
   principio "sin modelo estadístico/IA nuevo" que siguen todas las demás specs de
   correlación de este repo (`010`/`013`/`024`/`041`) — por eso va último y con más
   fricción explícita antes de arrancar.

## Cómo retomar cada una

Todas están en `Draft` con una sección de due-diligence ligera (solo alcanzabilidad de
dominios/`robots.txt`, no estructura de datos ni condiciones de uso reales) — el primer
paso real de cada una es la misma investigación en profundidad que ya se ha hecho para
cada spec `Implemented` de este repo (`CLAUDE.md` §8.2), no asumir que lo apuntado aquí ya
vale como verificación.

- **`027` v4** y **`043`**: ya `Implemented` (2026-09-17) — siguiente paso real: **`044`**.
- **`044`**: investigar si SAIH Júcar (`saih.chj.es`) publica datos abiertos/API o solo un
  visor web; confirmar endpoint de altimetría del IGN; decidir si "capacidad de absorción"
  tiene fuente viable o se descarta explícitamente.
- **`045`**: no tocar código — la tarea es preparar la decisión de producto/ADR (§0 de la
  spec) para que el usuario la resuelva antes de que esto avance.

## Qué NO es esta tanda

No sustituye ni reabre nada del DoD de V1 ya cerrado (`docs/02_DEFINITION_OF_DONE_V1.md`).
No es una fase nueva confirmada en `ROADMAP.md` en el sentido de "aprobada para
implementar sin más" — cuando cada spec pase de `Draft` a `Approved` (contrato de datos
verificado), es el momento de reflejarlo también en `ROADMAP.md` como fase F11, no antes.
