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

> **Estado:** v3 (2026-09-16) `Implemented`. Ver §8 — incluye una limitación
> honesta: el job de GitHub Actions no se ha podido ejecutar de verdad
> todavía (Playwright no soporta macOS 12, el host de esta sesión, y el
> workflow no se ha disparado aún en CI real).
>
> **v4 `Draft` (2026-09-17) — SIGUIENTE PASO, sin empezar.** Priorización de
> eventos con impacto real en vía pública (fútbol, conciertos de aforo
> grande, carreras) — ver §9. Decidido con el usuario como el primer punto
> de la nueva tanda de trabajo post-V1 (ver `docs/03_PLAN_POST_V1.md`), antes
> de cámaras externas, panel de emergencia meteorológica e IA.

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

- [x] Job de GitHub Actions con Playwright (`.github/workflows/agenda-eventos-cron.yml`), user-agent identificable (`vlc-monitor-agenda-bot/1.0`), respeta el `robots.txt` (código no toca rutas bajo `Disallow: /-/` salvo `/-/content/`) — **re-verificado en vivo el 2026-09-16**, sigue vigente. **Limitación honesta**: el job en sí no se ha podido ejecutar de verdad — Playwright no soporta macOS 12 (host de esta sesión: `ERROR: Playwright does not support chromium on mac12`) y el workflow todavía no se ha disparado en GitHub Actions real (necesita el primer push/merge o un `workflow_dispatch` manual). Pendiente de una verificación de ejecución real, mismo tipo de hueco que el autoplay de spec 038.
- [x] Parser de listado (`a.a-actualidad`, `p.label-title-agenda`, `p.label-fecha-actualidad`, `p.label-categoria-actualidad span`) + parser de ficha (`h2.agenda-titulo`, `p.bloque_texto.fecha`, `p.bloque_texto`) — **verificados contra el sitio real en navegador el 2026-09-16** (no solo documentación): selectores del listado idénticos a la verificación de 2026-09-10; la ficha también. Único cambio real encontrado: la paginación migró de un portlet Liferay/insuit a la librería `paginationjs` (`li.paginationjs-page`) — misma mecánica de fondo (clic en número, sin `href` real), el script se escribió contra el selector actual.
- [x] Normalización de fechas "DD mmm AAAA" / "DD/MM/AAAA" a ISO 8601, testeada — `src/services/agenda-eventos.ts` + 15 tests en `agenda-eventos.test.ts`.
- [x] Detección de `estructuraSospechosa` implementada y testeada (0 resultados con snapshot previo no vacío → no se sobrescribe el snapshot, se conserva marcado).
- [x] `distritosMencionados` calculado reutilizando `findDistrictMentions` de spec 023 — verificado con datos reales (p. ej. "XVI RUSSAFA ESCÈNICA" → l'Eixample, "Centre del Carme" → Ciutat Vella).
- [x] Endpoint `GET /api/agenda/v1/eventos` responde con el contrato de §3 — verificado en navegador contra un snapshot inicial real (68 eventos, capturados a mano vía navegador dado que Playwright no corre en este host — ver primer punto).
- [x] Panel visible, agrupado por distrito + bloque "València (general)", cada ítem enlaza a la ficha oficial — verificado en navegador.
- [x] **Aviso persistente de scraping, no letra pequeña**: franja superior del panel (`.agenda-panel__aviso`, fondo ámbar) — "Contenido extraído por scraping de valencia.es — no es una API ni un dataset oficial." Verificado en navegador.
- [x] Si `estructuraSospechosa: true`, la UI lo refleja (mensaje "Agenda posiblemente desactualizada...") — implementado y probado por unidad (`renderAgendaPanel`); **no probado end-to-end con un caso real de estructura rota** (haría falta que el sitio cambiase de verdad).

## 7. Riesgos y fuera de alcance

- **Riesgo — fragilidad de estructura (aceptado explícitamente por el usuario):** cualquier rediseño de `valencia.es` puede romper los selectores. Mitigado con la detección de `estructuraSospechosa` del DoD, pero no eliminado — es la naturaleza de cualquier scraping, documentado en vez de ignorado.
- **Riesgo — el acceso podría endurecerse** (rate limiting más agresivo, bloqueo de IPs de GitHub Actions) — mitigado por la frecuencia baja (6h) y un user-agent identificable; si ocurre, el comportamiento de fallo (a) de §4 cubre el caso sin romper el producto.
- **Riesgo legal/ético (evaluado):** la spec se ciñe a lo que el `robots.txt` del sitio autoriza (§2), usa un user-agent identificable y una frecuencia baja. Es rastreo de contenido público institucional dentro de la política declarada del sitio.
- **Fuera de alcance de esta versión:** geocodificación por dirección exacta de los eventos (solo se asocia a distrito por texto, vía spec 023, igual que el contexto mediático); notificaciones/alertas sobre eventos próximos (spec 014, si se retoma); cualquier filtro por categoría en la UI más allá de listar (fast-follow).

## 9. v4 — priorización de eventos con impacto en vía pública (Draft, 2026-09-17)

**Motivación (petición explícita del usuario):** de la agenda general de valencia.es (v3),
lo que más importa para operar la ciudad es un subconjunto concreto: eventos que generan
afluencia/tráfico/cortes reales, no cualquier exposición o visita guiada. El usuario pidió
explícitamente:

- Partidos del **Valencia CF** en Mestalla.
- Partidos del **Levante UD** como local en el Estadi Ciutat de València.
- Conciertos en el **Roig Arena** o cualquier otro concierto grande de la ciudad.
- **Calendario de carreras** de la ciudad (populares, maratón, etc.).

Esto son fuentes **nuevas y distintas** de valencia.es (v1-v3) — cada una con su propio
calendario, no un único sitio. Due-diligence ligera ya hecha esta sesión (solo
`robots.txt`, no estructura de página ni selectores — eso queda pendiente de verificar en
profundidad antes de implementar, mismo criterio que v1/v2 de esta spec):

| Fuente candidata | `robots.txt` | Nota |
|---|---|---|
| `valenciacf.com` (calendario/partidos) | **200, permisivo** — `User-agent: * ` sin `Disallow`, `Sitemap` publicado | Pendiente: localizar la página de calendario y verificar si el HTML se sirve sin JS (a diferencia de `valencia.es`, que exige navegador) |
| `levanteud.com` (calendario/partidos) | **200, permisivo** — solo excluye `/api/`, `/preview/`, `/_next/`; `Allow: /` explícito para Googlebot/Bingbot/YahooSlurp | Sitio en Next.js — probable que el calendario también requiera JS/Playwright, a confirmar |
| `roigarena.com` (conciertos/eventos) | **200, permisivo** — `Disallow:` vacío | Sitio en Nuxt — misma sospecha de requerir JS, a confirmar |
| Calendario de carreras | **No identificada todavía** — candidatas a investigar: sección de deportes de `valencia.es`, Federació d'Atletisme de la Comunitat Valenciana, o agregadores de carreras populares (ej. Championchip CV) | Sin verificar en absoluto |

**Diseño previsto (a confirmar al implementar):** cada fuente es de nuevo un scraper (muy
probablemente Playwright, como v1-v3 de esta spec, dado que los tres sitios de clubes/recinto
usan frameworks JS modernos) que alimenta el **mismo contrato `EventoAgenda`** (§3) con un
campo nuevo para distinguir el origen y, si aplica, marcar el evento como de "alto impacto en
vía pública" — a diseñar en el contrato de datos cuando se congele (posible campo
`impactoViaPublica: boolean` o una `categoria` reservada, a decidir contra los datos reales
de cada fuente, no de memoria). No se reemplaza la agenda general de v1-v3 — se añade como
prioridad visual/filtro dentro del mismo panel, o como sección propia si el volumen lo pide.

**Cómo retomar:** empezar verificando en navegador real (no solo `curl`) si cada sitio sirve
el calendario sin JavaScript — eso decide si hace falta Playwright (como valencia.es) o si
algún caso se puede resolver con `fetch` simple, mucho más barato de operar en Vercel.

## 8. Historial

| Versión | Fecha | Cambio |
|---|---|---|
| 1 | 2026-08-26 | Creación (Draft) — verificación en vivo: la web requiere un cliente con JavaScript, `robots.txt` autoriza explícitamente las páginas de ficha. Arquitectura fijada en GitHub Actions + Playwright (no Vercel function), siguiendo el precedente de la spec 017. Pendiente de aprobación antes de implementar. |
| 2 | 2026-09-10 | **Approved.** Re-verificación en navegador real: selectores de listado (`a.a-actualidad`, `p.label-title-agenda`, `p.label-fecha-actualidad`, `p.label-categoria-actualidad`), de ficha (`h2.agenda-titulo`, `p.bloque_texto.fecha`, `p.bloque_texto`), mecánica de paginación (portlet Liferay `CalendarAc`, click en número de página) y `robots.txt` (`Disallow: /-/` + `Allow: /-/content/`) confirmados y anotados en §2.1. Dos formatos de fecha (`DD/MM/YYYY` en listado, `DD mmm YYYY` en ficha). Contrato de datos (§3) sin cambios. Lista para implementar. |
| 3 | 2026-09-16 | **DoD completo, pasa a `Implemented`.** `src/services/agenda-eventos.ts` (funciones puras: `parsearRangoFechaListado`/`parsearRangoFechaFicha`, `construirResumen`, `detectarEstructuraSospechosa`, `construirEventoAgenda` — reutiliza `findDistrictMentions` de spec 023), 15 tests. `scripts/scrape-agenda-eventos.ts` (Playwright, headless, user-agent identificable, mismo patrón de reintentos/snapshot que spec 017) + `.github/workflows/agenda-eventos-cron.yml` (cron cada 6h, `npx playwright install --with-deps chromium`, no comitea si `estructuraSospechosa`). Endpoint `GET /api/agenda/v1/eventos` (`src/server/agenda-eventos.ts`, registrado en `_router-src.ts`) lee el snapshot estático, mismo patrón que spec 017. Capa `agendaEventos` en `map-layer-definitions.ts` (`grupo: 'contexto'`, `agregacion: 'lista'`) + panel en `main.ts` (agrupado por distrito + "València (general)", aviso persistente de scraping, franja ámbar). **Re-verificación en vivo (2026-09-16) encontró un cambio real**: la paginación migró de portlet Liferay a la librería `paginationjs` — mismo patrón de interacción (clic en número, sin `href`), solo cambia el selector CSS del contenedor de página; el resto del contrato (§2.1) se confirmó idéntico. **Bootstrap real de `data/agenda-eventos.json`**: no fue posible ejecutar Playwright en este host (macOS 12, incompatible con los builds actuales de Chromium de Playwright) — se capturó el listado completo (68 eventos reales, 4 páginas) a mano vía navegador y se procesó con las mismas funciones puras ya testeadas (`construirEventoAgenda`), confirmando el pipeline completo con datos reales (incl. `distritosMencionados`: "XVI RUSSAFA ESCÈNICA" → l'Eixample, "Centre del Carme" → Ciutat Vella). El job de GitHub Actions en sí queda pendiente de su primera ejecución real en CI. 15 tests nuevos (348/348 en total), `npm run typecheck`/`build` verdes, verificado en navegador (panel real con 68 eventos, aviso de scraping visible, agrupación por distrito). |
| 4 | 2026-09-17 | **Draft, sin empezar.** Alcance definido a petición del usuario: priorizar eventos con impacto en vía pública (Valencia CF en Mestalla, Levante UD en el Ciutat de València, conciertos del Roig Arena u otros grandes, calendario de carreras). Due-diligence ligera de `robots.txt` para `valenciacf.com`/`levanteud.com`/`roigarena.com` (los tres permisivos); fuente del calendario de carreras sin identificar todavía. Ver §9 para el detalle y cómo retomar. Primer punto de la tanda de trabajo post-V1, ver `docs/03_PLAN_POST_V1.md`. |
