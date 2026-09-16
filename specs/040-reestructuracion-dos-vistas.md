# 040 — Reestructuración en dos vistas (mapa operativo / hub de inteligencia)

```yaml
id: 040
titulo: "Router cliente simple con dos vistas: mapa operativo y hub de inteligencia"
estado: Implemented
tipo: fundacional
depende_de: [019, 033]
propietario: ""
version: 1
```

> **Estado:** `Implemented` (2026-09-16). Router por hash (`src/ui/router.ts`), nav en la
> cabecera, "Actualidad institucional" (039) sale del sidebar a un panel propio de
> `/inteligencia` y "Agenda de eventos" (027) se suma también al hub (ninguna de las dos
> estaba en el alcance literal de §2 v1 — decisión explícita del usuario al implementar,
> ver §8). Verificado en navegador, escritorio y móvil, con datos reales.

## 1. Problema / motivación

El sidebar único (`SIDEBAR_REGISTRY`, spec `019`) ha ido acumulando, con cada spec nueva,
una sección más en la misma columna: capas del mapa, KPIs, insights, cámaras, contexto
mediático, redes institucionales, tendencia de términos, glosario. Nació así porque cada
spec era la unidad de trabajo más pequeña que no rompía nada existente — pero el resultado
es una única vista sobrecargada que mezcla dos necesidades distintas: **operar el mapa
ahora mismo** (capas en tiempo real, tráfico, pulso, incidencias) y **consultar contexto e
inteligencia** (cámaras, prensa, redes, tendencias, y la futura página de apoyo a decisión
de spec `041`). World Monitor separa estas dos audiencias/necesidades en zonas distintas
de su producto (ver `docs/investigacion/WORLDMONITOR_TEARDOWN_VLC_PROPUESTA.md` §3.6);
esta spec traslada ese patrón sin adoptar su stack (sigue sin framework, `CLAUDE.md` §5).

## 2. Alcance

- **Vista `/` (mapa operativo)**: el mapa MapLibre+deck.gl y los paneles de capas
  "Prioritarias" tal como quedan tras spec `033` v3 (tráfico, Pulso de Distrito,
  incidencias de vía pública) + KPIs (spec `034`) + alertas (spec `013`).
- **Vista `/inteligencia` (hub)**: cámaras en vivo (`038`), contexto mediático (`009`),
  actualidad institucional (`039`), tendencia de términos (`025`), y la página de apoyo a
  decisión de spec `041` y la de protocolos de actuación de spec `042`. Las capas de
  "Contexto e informativas" que son geometría del mapa (Valenbisi, aparcamiento, Fallas,
  densidad mock) **se quedan en `/`** — son capas del mapa, no contenido editorial; solo
  se mueven los paneles que son lectura/consulta, no geometría.
- Mecanismo de navegación: **routing por hash** (`#/` y `#/inteligencia`), sin dependencia
  nueva — coherente con el resto del proyecto ("sin framework", `CLAUDE.md` §5). Un enlace
  en la cabecera (`src/ui/chasis.ts`) cambia de vista; el estado de capas/foco activo en
  la URL (`?layers=&foco=`, ya existente) se conserva al cambiar de vista.
- Los `montar*Panel()` ya extraídos (`montarCamarasPanel`, `montarMeteoActualPanel`,
  `montarDashboardKpis`, etc., todos en `src/ui/`) se re-montan en el contenedor de la
  vista que corresponda **sin reescribir su lógica interna** — es una reubicación, no una
  reimplementación.

**Cómo quedó implementado (v1):** en vez de mover nodos del DOM a dos contenedores de
vista, la vista es una capa de **visibilidad pura** — `initRouter()` (`src/ui/router.ts`)
aplica `document.documentElement.dataset.vista` y `main()` decide, en un único sitio al
final, qué `id` queda `hidden` según la vista activa. Motivo: `#media-panel`,
`#tendencia-panel` y `#camaras-panel` ya eran reparentados dinámicamente por
`layout-movil.ts` (spec 029, bottom sheet en móvil) — reparentarlos también por vista
habría hecho pelear a los dos mecanismos por el mismo padre. Con visibilidad pura ambos
son ortogonales: da igual si un panel vive en `<body>` (escritorio) o dentro de
`#info-panels` (sheet móvil), su `hidden` lo decide solo la vista activa.

Cámaras/contexto mediático/tendencia dejan de tener casilla en el selector de capas (ya
no son capas que se encienden/apagan, son contenido fijo de `/inteligencia`) — sus
`montar*Panel(toggle)` siguen intactos: reciben un `<input type="checkbox">`
**desconectado del DOM**, siempre marcado (`toggleSiempreActivo()` en `src/main.ts`), así
que arrancan, cargan datos y su polling siguen exactamente igual que antes; la vista es lo
único que decide si se ven.

"Actualidad institucional" (039) sale del sidebar — no estaba en el §2 original, pero es
justo el tipo de contenido que describe la motivación (§1) y el usuario confirmó
explícitamente sacarla al implementar. Se monta con la misma `buildActualidadRedesContent()`
ya existente, en un panel nuevo (`#actualidad-redes-panel`) dentro de `/inteligencia`.
"Agenda de eventos" (027) — tampoco citada en el §2 original — se suma al hub por el mismo
criterio que ya usa la spec para las demás (lectura/consulta, no geometría de mapa),
confirmado también con el usuario antes de tocar código.

Vista `/inteligencia` en escritorio: sin contenedor de grid propio — `<body>` pasa a
`display:flex; flex-wrap:wrap` **solo** bajo `:root[data-vista='inteligencia']:not([data-layout='movil'])`
(el resto de hijos de `<body>` —mapa, selector, sidebar, cabecera— están en
`position:fixed`/`absolute` o `hidden`, así que no participan del flujo). Las 3 tarjetas
antes ancladas al mapa (`#camaras-panel`/`#media-panel`/`#tendencia-panel`, `position:
absolute`) pasan a `position: static` en ese mismo scope; agenda y actualidad
institucional ya eran bloques normales, solo ganan aspecto de tarjeta a juego.

## 3. Contrato de datos (normalizado)

No aplica — no es una capa de datos, es una reorganización de UI/navegación. No hay
endpoint nuevo.

## 4. Pipeline (seed → caché → endpoint)

No aplica.

## 5. Contrato de capa de mapa

No aplica a esta spec en sí — el mapa sigue siendo la única instancia de MapLibre/deck.gl
de la app (spec `000`), visible en la vista `/`, no duplicada en `/inteligencia`.

## 6. Criterios de aceptación (Definition of Done)

- [x] Las dos vistas navegan por hash (`#/`, `#/inteligencia`) sin recargar la página ni
      perder el estado de la instancia de MapLibre/deck.gl — `map.resize()` al volver a
      `/mapa` (el canvas estuvo `display:none`), verificado que los tiles se repintan bien.
- [x] Todos los paneles movidos (cámaras, contexto mediático, actualidad institucional,
      tendencia, agenda) siguen funcionando igual que antes — mismo contenido real
      (verificado con datos en vivo: contexto mediático, agenda con eventos reales, cámara
      DASH reproduciendo, 13 fichas de redes), mismo polling, misma preferencia persistida
      (`imc:entidades-redes-ocultas`, verificado que sobrevive al cambio de vista).
- [x] El estado en URL (`?view=&zoom=`) sobrevive a un cambio de vista y a un refresco —
      **bug real encontrado y corregido**: `writeStateToUrl()` reconstruía la URL con
      `history.replaceState` sin conservar `location.hash`, así que cualquier movimiento
      de mapa borraba el hash de vista. Corregido añadiendo `window.location.hash` a la
      URL reconstruida (`src/main.ts`). Verificado: cargar directamente
      `?view=...&zoom=...#/inteligencia` entra directo en el hub.
- [x] Verificado en navegador (escritorio y móvil): 6 cambios de vista seguidos no
      duplican ningún panel (`#media-panel`/`#camaras-panel`/`#tendencia-panel`/
      `#agenda-panel`/`#actualidad-redes-panel` siguen siendo exactamente 1 cada uno, 13
      fichas de redes) ni añaden listeners — los paneles se montan una sola vez al
      arrancar (`toggleSiempreActivo()`, checkbox desconectado del DOM y siempre marcado);
      la vista solo decide visibilidad (`hidden`), nunca vuelve a llamar a `montar*Panel`.
      Volver a `/mapa` no pisa la preferencia real de capas (tráfico marcado y su leyenda
      siguieron activos tras un viaje de ida y vuelta a `/inteligencia`).
- [x] `npm run typecheck` (357/357) / `npm run test` / `npm run build` sin regresiones.

## 7. Riesgos y fuera de alcance

- **Riesgo principal — resuelto con visibilidad pura, no reparentado**: mover paneles ya
  estables por el DOM es mecánico pero tocar muchos ficheros a la vez aumenta el riesgo de
  fugas de listeners (patrón ya documentado como peligroso en
  `docs/investigacion/WORLDMONITOR_TEARDOWN_VLC_PROPUESTA.md` §3.6). Se evitó reparentar
  nodos: cada panel se monta **una sola vez** al arrancar (como ya hacía antes de esta
  spec) y la vista activa solo decide su `hidden` — nunca se vuelve a llamar a
  `montar*Panel`, así que no hay manera de que se dupliquen listeners. Verificado con 6
  cambios de vista seguidos (§6).
- **Riesgo encontrado en la implementación (no anticipado en el diseño)**: `writeStateToUrl()`
  (spec `000`) reconstruía la URL entera con `history.replaceState` sin conservar
  `location.hash` — cualquier `moveend` del mapa borraba silenciosamente el hash de vista.
  Corregido conservando `window.location.hash` explícitamente. Lección: cualquier código
  que reescriba la URL con `replaceState`/`pushState` en este repo debe preservar el hash
  a partir de ahora, no solo la query string.
- **Riesgo de layout (no anticipado)**: los paneles que se movían a `/inteligencia` (cámaras,
  contexto mediático, tendencia) eran tarjetas flotantes `position: absolute` anclas al
  borde del mapa — sin cambio de posición, en la vista nueva se habrían amontonado unas
  sobre otras. Se resuelve con `<body>` como contenedor flex-wrap, solo bajo
  `:root[data-vista='inteligencia']:not([data-layout='movil'])` (ver §2).
- **Interacción con spec 029 (bottom sheet móvil), no anticipada en el diseño original**:
  `layout-movil.ts` ya reparentaba `#controls`/`#media-panel`/`#tendencia-panel`/
  `#camaras-panel` dentro del sheet en móvil, con destino final hardcodeado a `<body>` al
  volver a escritorio. Si esta spec hubiera reparentado también por vista, los dos
  mecanismos se habrían disputado el mismo padre. Resuelto haciendo la vista puramente de
  visibilidad (§2) — ortogonal al reparentado de spec 029, que sigue sin tocarse salvo
  ampliar su lista de ids reparentables con `agenda-panel`/`actualidad-redes-panel`.
- **Fuera de alcance**: cualquier framework nuevo (React, un router con dependencia), SSR,
  o rutas más allá de las dos vistas descritas. Un tercer nivel de navegación (p. ej. una
  URL propia por entidad de `039`) queda para una spec futura si hace falta. El layout de
  `/inteligencia` en móvil reutiliza el bottom sheet existente tal cual (mapa de fondo,
  sheet arrastrable con el contenido del hub) — no se rediseñó una vista móvil dedicada.
- **Secuencia deliberada**: esta spec se implementa **después** de que el contenido que va
  a mover ya esté cerrado (specs `038`/`039` con su DoD cerrado, ver
  `docs/02_DEFINITION_OF_DONE_V1.md`), para no tener que tocar dos veces el mismo panel.

## 8. Historial

| Versión | Fecha | Cambio |
|---|---|---|
| 1 | 2026-09-16 | Creación (Draft), como parte del DoD de V1 (`docs/02_DEFINITION_OF_DONE_V1.md`). Decisión del usuario de incluirla en V1 en vez de como fast-follow posterior. **Implementada el mismo día**: router por hash (`src/ui/router.ts`), nav en la cabecera (`src/ui/chasis.ts`). Visibilidad por vista sin reparentar nodos (ver §2) — evita pelear con el reparentado móvil de spec 029 (`layout-movil.ts`, ampliada con `agenda-panel`/`actualidad-redes-panel`). "Actualidad institucional" (039) sale del sidebar a un panel propio de `/inteligencia`; "Agenda de eventos" (027) se suma al hub — ninguna de las dos estaba en el §2 original, confirmadas con el usuario antes de implementar. Selector de capas reordenado: Pulso de Distrito pasa a "Prioritarias" (coherente con el propio §2), cámaras/contexto mediático/tendencia pierden su casilla (ya no son capas, son contenido fijo del hub) — sus `montar*Panel` siguen sin tocarse, alimentados por un checkbox desconectado del DOM siempre marcado. Bug real encontrado y corregido: `writeStateToUrl()` borraba el hash de vista en cada movimiento de mapa (no conservaba `location.hash` al hacer `replaceState`). Verificado en navegador (escritorio y móvil): datos reales en las 5 tarjetas del hub, ida y vuelta entre vistas sin duplicar paneles ni perder preferencias, carga directa por URL con `#/inteligencia`. `npm run typecheck`/`test` (357/357)/`build` verdes. Spec pasa a `Implemented`. |
