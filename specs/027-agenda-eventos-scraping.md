# 027 — Agenda general de eventos culturales (scraping resiliente)

```yaml
id: 027
titulo: "Agenda general de eventos culturales — scraping resiliente de valencia.es"
estado: Implemented
tipo: capa
depende_de: [000, 023]
propietario: ""
version: 4
```

> **Estado:** v3 (2026-09-16) `Implemented` — el job de GitHub Actions tuvo su
> primera ejecución real de CI verificada el 2026-09-17
> (`workflow_dispatch`, commit `b8d129d`), cerrando la limitación honesta que
> quedaba abierta (ver `docs/02_DEFINITION_OF_DONE_V1.md`).
>
> **v4 `Implemented` (2026-09-17)** — priorización de eventos con impacto real
> en vía pública (fútbol, Roig Arena, carreras). Ver §9 para el contrato
> congelado y el detalle de las cuatro fuentes nuevas, todas verificadas en
> vivo. Primer punto de la tanda de trabajo post-V1 (ver
> `docs/03_PLAN_POST_V1.md`).

## 1. Problema / motivación

La spec [008](008-agenda-aglomeraciones-fallas.md) acota v1 a Fallas porque no hay API/JSON/RSS para la agenda cultural general — decisión explícita, no descuido. El usuario ha decidido ahora aceptar el riesgo de scraping para tener agenda real (conciertos, exposiciones, rutas guiadas, festivales...) en vez de esperar a una fuente estructurada que no existe. Esta spec diseña ese scraping para que sea resiliente y honesto sobre su naturaleza, no un script fràgil sin red de seguridad.

## 2. Fuente(s) de datos

| Fuente | URL | Formato | Verificada manualmente el ___ |
|---|---|---|---|
| Agenda de la ciudad | `https://www.valencia.es/cas/agenda-de-la-ciudad` (listado, paginado) + `https://www.valencia.es/cas/agenda-de-la-ciudad/-/content/<slug>` (ficha por evento) | HTML, **requiere navegador con JavaScript** (ver hallazgo abajo) | **Verificada 2026-08-26; re-verificada en vivo 2026-09-10** (selectores, paginación y `robots.txt` confirmados — ver §2.1) |

**Hallazgos de la verificación en vivo, que fijan el diseño técnico:**

1. **La web requiere un cliente con JavaScript.** Una petición HTTP simple (`curl`, `fetch` fuera de navegador) a la agenda queda bloqueada por el WAF; un navegador completo sí carga la página con normalidad. `robots.txt` sí se sirve a `fetch` (200). La información es pública, pero el HTML de contenido no se sirve a clientes sin renderizado.
2. **El listado carga completo en un navegador**: 20 eventos por página con título, fechas, categoría y enlace, con paginación numerada. Hoy 4 páginas (20/20/20/12 = 72 eventos).
3. **`robots.txt` autoriza estas rutas.** Regla general `Disallow: /-/`, con excepción explícita `Allow: /-/content/` — justo el patrón de las fichas de evento (`/cas/agenda-de-la-ciudad/-/content/<slug>`). El listado (`/cas/agenda-de-la-ciudad`) no empieza por `/-/`, no tiene restricción. También expone `Sitemap: https://www.valencia.es/sitemap.xml`. El rastreo se limita a lo que `robots.txt` permite; si el sitio dejara de servir el contenido, no se insiste.

## 2.1 Contrato técnico verificado (2026-09-10, en navegador real)

**Listado** (`/cas/agenda-de-la-ciudad`):

| Dato | Selector | Notas |
|---|---|---|
| Item de evento | `a.a-actualidad` | dentro de `div.div-bloque-actualidad`; `href` = `/cas/agenda-de-la-ciudad/-/content/<slug>` |
| `id` (slug) | último segmento del `href` | estable entre refrescos |
| `titulo` | `p.label-title-agenda` | |
| fechas | `p.label-fecha-actualidad` | texto `DD/MM/YYYY - DD/MM/YYYY`; contiene un `<span class="fa fa-calendar">` a descartar |
| `categoria` | `p.label-categoria-actualidad span` | mayúsculas tal cual (ej. `VISITAS GUIADAS`, `EXPOSICIONES`) |

**Paginación:** portlet Liferay (`p_p_id` = `CalendarAc_INSTANCE_iWBt6iPSuFjM`, acción `cargarEventosAv`, POST AJAX). Los enlaces de página **no tienen `href`** (los cablea el framework "insuit" vía `data-insuit-uuid`); la URL del navegador no cambia. El scraper **hace click en el número de página siguiente (o «»») y espera a que cambie la lista de `a.a-actualidad`**. Los números de todas las páginas se muestran a la vez (sin `…`), así que el máximo se lee directo del DOM.

**Ficha** (`/-/content/<slug>`, contenedor `div.container-agenda-ciudad`):

| Dato | Selector | Notas |
|---|---|---|
| `titulo` | `h2.agenda-titulo` | |
| lugar | `li.elementoLista` | ej. `València` (no siempre útil, informativo) |
| fechas | `p.bloque_texto.fecha` | texto `FECHA: DD mmm YYYY - DD mmm YYYY`, **mes abreviado en español** (`ene feb mar abr may jun jul ago sep oct nov dic`) |
| descripción | `p.bloque_texto` (los que **no** llevan `.fecha`) | unir el texto de los párrafos; `resumen` = recorte a ~300 car. |

**Dos formatos de fecha a normalizar:** listado `DD/MM/YYYY`, ficha `DD mmm YYYY`. Ambos → ISO 8601.

Hay banner de cookies (`Aceptar` / `Configurar`); el scraper elige la opción que **no** acepta rastreo no esencial (equivalente a "Configurar" → rechazar, o ignorarlo — el contenido carga igual sin aceptar).

**Consecuencia arquitectónica (importante, no encaja en el patrón habitual de este proyecto):** hace falta un navegador headless (Playwright), no un `fetch()` en una función edge de Vercel. Una función serverless de Vercel Hobby no es un sitio razonable para arrancar Chromium (límite de tamaño de despliegue y de tiempo de ejecución, 10s en Hobby). El precedente ya existe en este mismo proyecto: la spec [017](017-historico-trafico.md) corre su cron en **GitHub Actions**, no en Vercel — esta spec sigue el mismo patrón: un job de GitHub Actions con Playwright que escrapea, normaliza y escribe el snapshot ya cacheado; el endpoint interno de Vercel solo lee ese snapshot, nunca lanza el navegador.

## 3. Contrato de datos (normalizado)

```typescript
interface EventoAgenda {
  id: string;                 // slug de la URL de ficha, estable entre refrescos
  titulo: string;
  categoria: string;           // tal cual la sirve la web (ej. "EXPOSICIONES", "CIRCO")
  fechaInicio: string;          // ISO 8601, parseado de "DD/MM/YYYY"
  fechaFin: string;              // ISO 8601
  resumen: string | null;         // primeras ~300 caracteres de la descripción de la ficha, nunca el texto íntegro (ver §7, incluso siendo contenido institucional propio, no de terceros)
  url: string;                     // enlace a la ficha completa, se abre en el Ayuntamiento, no se reproduce el resto del contenido
  distritosMencionados: DistritoMencion[];  // reutiliza el matcher de la spec 023 sobre título+resumen — [] si no hay coincidencia explícita
  fetchedAt: string;
  source: 'ajuntament-valencia-scraping';    // distinto de 'ajuntament-valencia-geoportal' — señala explícitamente que es scraping, no API estructurada
}
```

## 4. Pipeline (seed → caché → endpoint)

| Parámetro | Valor |
|---|---|
| Frecuencia de refresco (cron) | 6h — igual que Fallas (spec 008): la agenda cultural cambia lento, y una frecuencia baja reduce la carga sobre el sitio de origen. |
| TTL en caché | 6h. |
| Comportamiento si la fuente falla | **Dos modos de fallo, tratados distinto:** (a) el sitio no responde → stale-on-error, sirve el último snapshot bueno, igual que cualquier otra spec. (b) el scraping responde pero **la estructura ha cambiado** (0 eventos extraídos cuando el snapshot anterior tenía >0, o los selectores no encuentran título/fecha) → no se sobrescribe el snapshot bueno con uno vacío; se marca el snapshot como `estructuraSospechosa: true` para que quede visible que hace falta revisión humana del scraper, sin romper la UI mientras tanto. |
| Clave de caché | `agenda:eventos-valencia:v1` |
| Job de scraping | GitHub Actions, Playwright headless — navega al listado, sigue la paginación, visita cada ficha nueva/actualizada para el resumen, normaliza y escribe el snapshot en caché (mismo mecanismo que usa spec 017 para sus rollups). |
| Endpoint interno que sirve el dato | `GET /api/agenda/v1/eventos` — solo lee el snapshot ya cacheado, nunca invoca Playwright en tiempo de request. |

## 5. Contrato de capa de mapa

```typescript
{
  key: 'agendaEventos',
  specId: '027',
  renderers: ['panel'],
  zoomMinimo: 0,
  agregacion: 'lista',
  icono: '',
}
```

Panel de lista (mismo patrón visual que contexto mediático, spec 009), agrupado igual que 023 por distrito mencionado + bloque "Valencia (general)". Cada ítem enlaza a la ficha oficial (`target="_blank"`), nunca reproduce la descripción completa.

## 6. Criterios de aceptación (Definition of Done)

- [x] Job de GitHub Actions con Playwright (`.github/workflows/agenda-eventos-cron.yml`), user-agent identificable (`vlc-monitor-agenda-bot/1.0`), respeta el `robots.txt` (código no toca rutas bajo `Disallow: /-/` salvo `/-/content/`) — **re-verificado en vivo el 2026-09-16**, sigue vigente. **Ejecución real de CI verificada el 2026-09-17** (`workflow_dispatch`, corrida `35162167241`, commit `b8d129d`) — la limitación honesta que quedaba abierta (Playwright no corre en macOS 12, el workflow nunca se había disparado en GitHub real) queda cerrada.
- [x] Parser de listado (`a.a-actualidad`, `p.label-title-agenda`, `p.label-fecha-actualidad`, `p.label-categoria-actualidad span`) + parser de ficha (`h2.agenda-titulo`, `p.bloque_texto.fecha`, `p.bloque_texto`) — **verificados contra el sitio real en navegador el 2026-09-16** (no solo documentación): selectores del listado idénticos a la verificación de 2026-09-10; la ficha también. Único cambio real encontrado: la paginación migró de un portlet Liferay/insuit a la librería `paginationjs` (`li.paginationjs-page`) — misma mecánica de fondo (clic en número, sin `href` real), el script se escribió contra el selector actual.
- [x] Normalización de fechas "DD mmm AAAA" / "DD/MM/AAAA" a ISO 8601, testeada — `src/services/agenda-eventos.ts` + 15 tests en `agenda-eventos.test.ts`.
- [x] Detección de `estructuraSospechosa` implementada y testeada (0 resultados con snapshot previo no vacío → no se sobrescribe el snapshot, se conserva marcado).
- [x] `distritosMencionados` calculado reutilizando `findDistrictMentions` de spec 023 — verificado con datos reales (p. ej. "XVI RUSSAFA ESCÈNICA" → l'Eixample, "Centre del Carme" → Ciutat Vella).
- [x] Endpoint `GET /api/agenda/v1/eventos` responde con el contrato de §3 — verificado en navegador contra un snapshot inicial real (68 eventos, capturados a mano vía navegador dado que Playwright no corre en este host — ver primer punto).
- [x] Panel visible, agrupado por distrito + bloque "València (general)", cada ítem enlaza a la ficha oficial — verificado en navegador.
- [x] **Aviso persistente de scraping, no letra pequeña**: franja superior del panel (`.agenda-panel__aviso`, fondo ámbar) — "Contenido extraído por scraping de valencia.es — no es una API ni un dataset oficial." Verificado en navegador.
- [x] Si `estructuraSospechosa: true`, la UI lo refleja (mensaje "Agenda posiblemente desactualizada...") — implementado y probado por unidad (`renderAgendaPanel`); **no probado end-to-end con un caso real de estructura rota** (haría falta que el sitio cambiase de verdad).

### 6.1 Definition of Done — v4 (impacto en vía pública)

- [x] Las cuatro fuentes de §9 verificadas en vivo (llamada real, no solo `robots.txt`): `valenciacf.com/resultados?range=next`, `levanteud.com/partidos`, `roigarena.com/es/eventos/`, `fdmvalencia.es/es/tipos-eventos/carrera-populares/` — ninguna requiere Playwright, las cuatro sirven HTML/JSON plano a `fetch()` simple.
- [x] Contrato `EventoAgenda` extendido (`source` con los 4 literales nuevos, `impactoViaPublica?: boolean`) — `src/services/agenda-eventos.ts`.
- [x] Funciones puras de normalización por fuente + inferencia de año cuando el texto no lo incluye (`inferirAnio`) — `src/services/agenda-impacto-vial.ts`, 10 tests en `agenda-impacto-vial.test.ts` con fixtures de datos reales capturados en la verificación en vivo.
- [x] Extracción cruda (regex sobre HTML para VCF/FDM, parseo de JSON embebido `__NEXT_DATA__`/`__NUXT_DATA__` para Levante/Roig Arena) — `scripts/scrape-agenda-eventos.ts`, probada manualmente contra el HTML real descargado de las cuatro fuentes (no solo contra fixtures) antes de integrarla en el job.
- [x] Filtro de solo-local para fútbol: `ubicacion === 'Mestalla'` (VCF) / `venue.name === 'Ciutat de Valencia'` (Levante) — verificado con datos reales (p. ej. VCF-Racing en El Sardinero descartado, Levante-Osasuna en El Sadar descartado).
- [x] Resiliencia por fuente: cada una de las 4 fuentes se resuelve de forma aislada (`recolectarEventosImpacto`); si una falla o devuelve 0 tras haber tenido eventos, se conserva su último snapshot bueno sin bloquear a las demás ni al scraping de valencia.es.
- [x] UI: sección "⚠ Impacto en vía pública" al principio del panel (ordenada por fecha) + chip rojo distintivo por ítem, sin excluir esos eventos de la agrupación por distrito existente — `src/main.ts` (`renderAgendaPanel`, `renderItemAgenda`), `index.html` (`.media-panel__chip--impacto`). Verificado en navegador con un snapshot real (19 eventos de impacto: 1 VCF, 4 Levante, 8 Roig Arena, 5 carreras FDM) — captura con los datos reales de las cuatro fuentes, servidos por el endpoint existente sin cambios de contrato.
- [x] Aviso de scraping del panel actualizado para nombrar las 5 fuentes (antes solo citaba valencia.es).
- [x] Glosario (`src/ui/glosario.ts`, entrada `agendaEventos`) actualizado con las fuentes nuevas.
- [x] `npm run typecheck` / `npm run test` (377/377) / `npm run build` verdes.
- **Pendiente, igual que v1-v3 de esta spec:** ejecución real del job de GitHub Actions con las 4 fuentes nuevas integradas — verificado localmente contra HTML/JSON real descargado a mano (Playwright sigue sin correr en este host para la parte de valencia.es), pendiente de su primera ejecución en CI tras el push.

## 7. Riesgos y fuera de alcance

- **Riesgo — fragilidad de estructura (aceptado explícitamente por el usuario):** cualquier rediseño de `valencia.es` puede romper los selectores. Mitigado con la detección de `estructuraSospechosa` del DoD, pero no eliminado — es la naturaleza de cualquier scraping, documentado en vez de ignorado.
- **Riesgo — el acceso podría endurecerse** (rate limiting más agresivo, bloqueo de IPs de GitHub Actions) — mitigado por la frecuencia baja (6h) y un user-agent identificable; si ocurre, el comportamiento de fallo (a) de §4 cubre el caso sin romper el producto.
- **Riesgo legal/ético (evaluado):** la spec se ciñe a lo que el `robots.txt` del sitio autoriza (§2), usa un user-agent identificable y una frecuencia baja. Es rastreo de contenido público institucional dentro de la política declarada del sitio.
- **Fuera de alcance de esta versión:** geocodificación por dirección exacta de los eventos (solo se asocia a distrito por texto, vía spec 023, igual que el contexto mediático); notificaciones/alertas sobre eventos próximos (spec 014, si se retoma); cualquier filtro por categoría en la UI más allá de listar (fast-follow).

## 9. v4 — priorización de eventos con impacto en vía pública (Implemented, 2026-09-17)

**Motivación (petición explícita del usuario):** de la agenda general de valencia.es (v3),
lo que más importa para operar la ciudad es un subconjunto concreto: eventos que generan
afluencia/tráfico/cortes reales, no cualquier exposición o visita guiada:

- Partidos del **Valencia CF** en Mestalla.
- Partidos del **Levante UD** como local en el Estadi Ciutat de València.
- Conciertos en el **Roig Arena** o cualquier otro concierto grande de la ciudad.
- **Calendario de carreras** de la ciudad (populares, maratón, etc.).

**Verificación en vivo (2026-09-17) — sorpresa respecto a la due-diligence ligera previa:
ninguna de las cuatro fuentes necesita Playwright.** Las cuatro sirven HTML/JSON plano a
`fetch()` simple, sin WAF ni renderizado JS (a diferencia de valencia.es, v1-v3 de esta
spec). Esto simplifica la arquitectura: en vez de un navegador headless, el mismo job de
GitHub Actions hace `fetch()` normal para estas cuatro fuentes.

| Fuente | URL verificada | `robots.txt` | Qué se extrae |
|---|---|---|---|
| Valencia CF | `valenciacf.com/resultados?range=next` | **200, permisivo** — sin ningún `Disallow` | HTML plano (curl real). Tarjetas `card-game` con `card-game__date__date` ("dom. 20 sep. / Jor. 7"), `card-game__date__location` (**"Mestalla" en los partidos como local** — filtro directo), nombres de equipo y hora. Solo entrega los próximos ~2-3 partidos confirmados (LaLiga no publica el calendario completo con fecha/hora de golpe) |
| Levante UD | `levanteud.com/partidos` | **200, permisivo** para el bot genérico (`Disallow: /api/`, `/preview/`, `/_next/`, ninguno aplica a `/partidos`) | HTML plano con `<script id="__NEXT_DATA__">` embebido: **temporada completa de 38 jornadas** en JSON estructurado (`venue.name`, `homeTeam`/`awayTeam`, `time` ISO 8601 o `null` si LaLiga aún no ha confirmado fecha). Filtro: `venue.name === "Ciutat de Valencia"` (local) + `time` no nulo |
| Roig Arena | `roigarena.com/es/eventos/` | **200, permisivo** — `Disallow:` vacío | HTML plano (Nuxt SSR) con `<script id="__NUXT_DATA__">`: payload "devalue" (array con referencias por índice) — se escanea buscando objetos con forma de evento (`name`/`start`/`locationName`/`slug`/`category`) y se resuelve cada campo por su índice, sin decodificar el formato entero. Primera página (~8 eventos próximos destacados; el sitio anuncia 126 en total pero el resto solo aparece paginando con JS — fuera de alcance de v4, ver "fuera de alcance" más abajo) |
| Carreras populares (FDM) | `fdmvalencia.es/es/tipos-eventos/carrera-populares/` | **200, permisivo** — solo excluye `/wp-admin/` | WordPress + plugin Events Manager, HTML plano. `.event-title a` (título + URL) + dos `.event-time` (fecha "04 Oct 2026", hora "10:00 - 11:00"). Fundación Deportiva Municipal — organismo del Ayuntamiento, la fuente más oficial de las cuatro. Se leen las primeras 6 páginas (~60 filas) y se descartan las de fecha pasada — el listado **no está ordenado cronológicamente** |

**Contrato de datos — extensión de `EventoAgenda` (§3), campos nuevos:**

```typescript
interface EventoAgenda {
  // ...campos v1-v3 sin cambios...
  source:
    | 'ajuntament-valencia-scraping'
    | 'valencia-cf-scraping'
    | 'levante-ud-scraping'
    | 'roig-arena-scraping'
    | 'fdm-valencia-carreras-scraping';
  /** true si el evento genera afluencia/tráfico/cortes reales en vía pública. Ausente/false para la agenda general de valencia.es (v1-v3). */
  impactoViaPublica?: boolean;
}
```

**Diseño de resiliencia:** cada una de las cuatro fuentes se resuelve de forma aislada
(`recolectarEventosImpacto` en `scripts/scrape-agenda-eventos.ts`) — si una falla o devuelve
0 eventos nuevos habiendo tenido antes, se conserva el último snapshot bueno **de esa fuente
concreta** (no de la agenda completa), y no bloquea a las demás ni al scraping de
valencia.es. Solo el fallo estructural de valencia.es (ya existente desde v1-v3, §4)
congela el snapshot entero — es la fuente más frágil (WAF + selectores DOM) y la que ya
tenía ese criterio.

**No se reemplaza la agenda general de v1-v3** — los eventos con `impactoViaPublica: true`
se añaden al mismo array `eventos` del snapshot y se muestran además en una sección propia
("⚠ Impacto en vía pública") al principio del panel, ordenada por fecha, con un chip rojo
distintivo por ítem (`src/main.ts`, `renderAgendaPanel`/`renderItemAgenda`).

**Fuera de alcance de v4:**
- Roig Arena: solo la primera página de eventos destacados (~8), no los 126 anunciados en
  total — el resto requiere paginación por JS que no se ha investigado; suficiente para
  "próximos conciertos grandes", que es el caso de uso pedido.
- Valencia CF: sin página de calendario completo de temporada (a diferencia de Levante) —
  el sitio solo expone los ~2-3 próximos partidos confirmados vía `/resultados?range=next`;
  aceptable porque LaLiga tampoco publica fecha/hora de toda la temporada de antemano.
- Ninguna fuente identifica cortes de tráfico reales (aforos, operativos policiales) — solo
  el hecho del evento y su ubicación; el cruce con impacto real en vía pública lo hace la
  persona que consulta el panel, no el producto (`CLAUDE.md` §4, "avisa no actúa").

## 8. Historial

| Versión | Fecha | Cambio |
|---|---|---|
| 1 | 2026-08-26 | Creación (Draft) — verificación en vivo: la web requiere un cliente con JavaScript, `robots.txt` autoriza explícitamente las páginas de ficha. Arquitectura fijada en GitHub Actions + Playwright (no Vercel function), siguiendo el precedente de la spec 017. Pendiente de aprobación antes de implementar. |
| 2 | 2026-09-10 | **Approved.** Re-verificación en navegador real: selectores de listado (`a.a-actualidad`, `p.label-title-agenda`, `p.label-fecha-actualidad`, `p.label-categoria-actualidad`), de ficha (`h2.agenda-titulo`, `p.bloque_texto.fecha`, `p.bloque_texto`), mecánica de paginación (portlet Liferay `CalendarAc`, click en número de página) y `robots.txt` (`Disallow: /-/` + `Allow: /-/content/`) confirmados y anotados en §2.1. Dos formatos de fecha (`DD/MM/YYYY` en listado, `DD mmm YYYY` en ficha). Contrato de datos (§3) sin cambios. Lista para implementar. |
| 3 | 2026-09-16 | **DoD completo, pasa a `Implemented`.** `src/services/agenda-eventos.ts` (funciones puras: `parsearRangoFechaListado`/`parsearRangoFechaFicha`, `construirResumen`, `detectarEstructuraSospechosa`, `construirEventoAgenda` — reutiliza `findDistrictMentions` de spec 023), 15 tests. `scripts/scrape-agenda-eventos.ts` (Playwright, headless, user-agent identificable, mismo patrón de reintentos/snapshot que spec 017) + `.github/workflows/agenda-eventos-cron.yml` (cron cada 6h, `npx playwright install --with-deps chromium`, no comitea si `estructuraSospechosa`). Endpoint `GET /api/agenda/v1/eventos` (`src/server/agenda-eventos.ts`, registrado en `_router-src.ts`) lee el snapshot estático, mismo patrón que spec 017. Capa `agendaEventos` en `map-layer-definitions.ts` (`grupo: 'contexto'`, `agregacion: 'lista'`) + panel en `main.ts` (agrupado por distrito + "València (general)", aviso persistente de scraping, franja ámbar). **Re-verificación en vivo (2026-09-16) encontró un cambio real**: la paginación migró de portlet Liferay a la librería `paginationjs` — mismo patrón de interacción (clic en número, sin `href`), solo cambia el selector CSS del contenedor de página; el resto del contrato (§2.1) se confirmó idéntico. **Bootstrap real de `data/agenda-eventos.json`**: no fue posible ejecutar Playwright en este host (macOS 12, incompatible con los builds actuales de Chromium de Playwright) — se capturó el listado completo (68 eventos reales, 4 páginas) a mano vía navegador y se procesó con las mismas funciones puras ya testeadas (`construirEventoAgenda`), confirmando el pipeline completo con datos reales (incl. `distritosMencionados`: "XVI RUSSAFA ESCÈNICA" → l'Eixample, "Centre del Carme" → Ciutat Vella). El job de GitHub Actions en sí queda pendiente de su primera ejecución real en CI. 15 tests nuevos (348/348 en total), `npm run typecheck`/`build` verdes, verificado en navegador (panel real con 68 eventos, aviso de scraping visible, agrupación por distrito). |
| 4 | 2026-09-17 | **Implemented.** Priorización de eventos con impacto en vía pública: fútbol de Valencia CF/Levante UD como local, conciertos/eventos del Roig Arena, carreras populares de la Fundación Deportiva Municipal. Las 4 fuentes verificadas en vivo con llamada real (no solo `robots.txt`) — hallazgo importante: ninguna necesita Playwright, todas sirven HTML/JSON plano a `fetch()` simple (a diferencia de valencia.es). Contrato `EventoAgenda` extendido (`source` + `impactoViaPublica?`), `src/services/agenda-impacto-vial.ts` (funciones puras, 10 tests con fixtures de datos reales), `scripts/scrape-agenda-eventos.ts` extendido con extracción por `fetch()` + resiliencia aislada por fuente, UI con sección destacada "⚠ Impacto en vía pública" y chip distintivo (`src/main.ts`, `index.html`). Verificado en navegador con datos reales de las 4 fuentes (19 eventos de impacto). 377/377 tests, `typecheck`/`build` verdes. Ver §9 para el contrato y el detalle por fuente. |
