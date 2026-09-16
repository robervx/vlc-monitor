# 044 — Panel de emergencia meteorológica avanzada

```yaml
id: 044
titulo: "Pestaña de días de emergencia/alerta: lluvia y viento por zona, pluviómetros vs. capacidad de absorción, altimetría de la ciudad"
estado: Draft
tipo: indice-compuesto
depende_de: [001, 040]
propietario: ""
version: 1
```

> **Estado:** `Draft`, sin empezar — **tercer punto** de la tanda de trabajo post-V1 (ver
> `docs/03_PLAN_POST_V1.md`), después de spec `043` (cámaras externas). Due-diligence
> ligera hecha esta sesión (solo alcanzabilidad de dominios candidatos, no formato de
> datos ni condiciones de uso) — el trabajo real de investigación está sin empezar.
> **Muy probable que esta spec se divida en 2-4 specs independientes** al hacer la
> investigación real (cada sub-señal tiene una fuente y un patrón de actualización
> distintos) — ver §7.

## 1. Problema / motivación

Spec `001` da el tiempo "ahora mismo" a nivel ciudad (un único punto). El usuario quiere
una **pestaña/vista específica para días de emergencia declarada** (lluvia intensa,
alertas activas) con más detalle del que hace falta un día normal:

1. **Cantidad de lluvia por zona de la ciudad** (no un único dato de ciudad).
2. **Rachas de viento por zona.**
3. **Pluviómetros — litros/hora acumulados, en relación a la capacidad de absorción** de
   cada zona (para saber dónde el agua puede empezar a acumularse antes de que se vea).
4. **Plano de altimetría de Valencia** — qué zonas son más altas y cuáles más bajas, para
   anticipar dónde se acumula el agua por gravedad.

## 2. Fuente(s) de datos

**No verificada en profundidad todavía.** Due-diligence ligera de esta sesión (solo
alcanzabilidad, no estructura de datos ni licencia):

| Sub-señal | Fuente candidata | Verificación ligera de hoy | Nota |
|---|---|---|---|
| Lluvia/viento por zona | Red de estaciones AEMET (varias por provincia) u Open-Meteo con varias coordenadas (una por distrito, en vez del único punto de ciudad de spec 001) | No verificado — Open-Meteo (ya en uso, spec 001) es la vía más barata de probar primero: pedir varias coordenadas en vez de una | Aumenta el número de llamadas a la fuente — hay que decidir cadencia/TTL con cuidado (`CLAUDE.md` §2) |
| Pluviómetros / litros por hora vs. capacidad | **SAIH Júcar** (Sistema Automático de Información Hidrológica, Confederación Hidrográfica del Júcar) — `saih.chj.es` | **Dominio alcanzable** (`http://saih.chj.es/` → 200; sin `robots.txt` publicado, sin restricción declarada) | Es la fuente más prometedora para datos reales de pluviometría en tiempo real de la cuenca del Júcar (incluye Valencia) — pendiente confirmar si publica datos abiertos/API o solo un visor web, y si cubre estaciones dentro del término municipal. "Capacidad de absorción" **no es un dato que publique ninguna fuente conocida** — habría que definir una heurística propia y documentarla como tal (no como dato oficial), o descartar esa parte si no hay fuente. |
| Altimetría de la ciudad | IGN (Instituto Geográfico Nacional) — Modelo Digital del Terreno (MDT), servicios `WCS`/`WMS` del CNIG/IDEE | Consulta rápida sin resultado claro (endpoint probado no resolvió) — pendiente investigar la URL correcta del servicio | Es un dato **estático** (la altimetría no cambia), así que técnicamente es más parecido a spec `020` (grafo viario, dato base versionado) que a una capa en vivo — probablemente un seed una sola vez, no un pipeline con caché/TTL. |

## 3. Contrato de datos (normalizado)

A definir por sub-señal tras la investigación (§2) — no se congela un contrato único
todavía porque puede que acaben siendo 2-4 specs independientes (§7). Cada una seguiría el
patrón normal de este repo (`CLAUDE.md` §2): contrato de datos propio, congelado antes de
escribir código.

## 4. Pipeline (seed → caché → endpoint)

A definir por sub-señal. La altimetría, al ser estática, encaja mejor como **seed único
versionado** (como el grafo viario de spec `020`) que como caché con TTL; lluvia/viento
por zona y pluviómetros sí son datos en vivo con su propio TTL, a decidir contra la
cadencia real de cada fuente.

## 5. Contrato de capa de mapa

Pestaña/página propia dentro de la vista `/inteligencia` (spec `040`), pensada para
activarse en días de alerta — a diseñar si aparece siempre visible o solo cuando hay una
alerta oficial activa (spec `001` v4, `aviso-oficial-meteo`), que sería coherente con el
principio "avisa, no actúa" y no sobrecargar la UI en días normales.

## 6. Criterios de aceptación (Definition of Done)

- [ ] Cada sub-señal con su fuente real verificada por llamada directa, no solo
      documentación (`CLAUDE.md` §8.2) — o descartada explícitamente si no existe fuente
      viable (como pasó con "capacidad de absorción" si no aparece ningún dato oficial).
- [ ] Si "capacidad de absorción" se implementa sin fuente oficial, la heurística usada
      queda documentada explícitamente en la spec y marcada como estimación, nunca
      presentada como dato oficial (mismo criterio de honestidad que `CLAUDE.md` §4 para
      capas `MOCK`).
- [ ] Altimetría verificada contra datos reales del IGN, no interpolada a ojo.
- [ ] `npm run typecheck` / `npm run test` / `npm run build` sin regresiones.

## 7. Riesgos y fuera de alcance

- **Riesgo principal — alcance mezclado**: esta spec junta 4 sub-señales con fuentes,
  cadencias y naturaleza de dato (viva vs. estática) muy distintas. Al empezar la
  investigación real, lo más probable es que se divida en 2-4 specs propias (ej.
  `044-lluvia-viento-por-zona`, `045-pluviometros-saih`, `046-altimetria-valencia` — los
  números finales dependen de qué esté libre en `specs/INDEX.md` cuando se creen). Este
  documento queda como el punto de partida/investigación, no como el contrato final.
- **Riesgo — "capacidad de absorción"**: no se conoce ninguna fuente pública que publique
  esto directamente para Valencia. Si no aparece al investigar, se documenta como
  descartado (igual que se hizo con EMT en spec `007` o con Waze en spec `015`) en vez de
  inventar un cálculo sin base.
- **Fuera de alcance v1**: cualquier modelo predictivo de inundación — esto es
  visualización de datos ya medidos, no una simulación hidrológica nueva (mismo límite que
  el resto del repo, "sin modelo estadístico nuevo").

## 8. Historial

| Versión | Fecha | Cambio |
|---|---|---|
| 1 | 2026-09-17 | Creación (Draft), a petición explícita del usuario — tercer punto de la tanda de trabajo post-V1. Due-diligence ligera: SAIH Júcar (`saih.chj.es`) alcanzable, candidato fuerte para pluviometría; IGN como candidato para altimetría, sin confirmar endpoint; "lluvia/viento por zona" probablemente extensible desde Open-Meteo (ya en uso, spec 001) pidiendo varias coordenadas. "Capacidad de absorción" sin fuente identificada. Pendiente de investigación real antes de implementar — probable división en varias specs (§7). |
