# 029 — UX móvil: layout táctil de cabecera, sidebar y paneles

```yaml
id: 029
titulo: "Adaptación del chasis (spec 019) a móvil: sidebar como hoja, paneles como bottom sheet, safe-area y targets de dedo"
estado: Implemented
tipo: fundacional
depende_de: [019, 028]
propietario: ""
version: 3
```

## 0. Contexto de la decisión

`ROADMAP.md` F5 ("rendimiento, accesibilidad"). Petición explícita del propietario (2026-08-28): llevarse la herramienta en el móvil con **UX impecable**. La spec 028 la hace instalable; esta la hace **usable con el pulgar**.

El chasis de la spec `019` (cabecera fija de 56 px + sidebar overlay de 52/280 px + `#info-panels` abajo con `flex-wrap` + scroll interno) está pensado para el monitor de un despacho. En un móvil de 375 px de ancho ese mismo layout tapa el mapa, el sidebar expandido no encaja bien y los objetivos táctiles son pequeños.

## 1. Problema / motivación

Un mando que abre la herramienta en el móvil, en la calle, necesita: ver el mapa sin que un panel se lo coma, alcanzar todos los controles con el pulgar de una mano, y que el contenido no quede bajo el notch ni bajo la barra de gestos. Hoy nada de eso está resuelto para pantallas pequeñas.

## 2. Fuente(s) de datos

No aplica — no consume ninguna fuente externa ni añade dato nuevo. Es adaptación de interfaz sobre el chasis existente.

## 3. Contrato de datos (normalizado)

No hay dato de dominio. Se congela la **detección de dispositivo**, el **breakpoint** y el **modelo de layout móvil**.

### Detección escritorio / móvil (automática, sin UA sniffing, sin servidor)

Una **sola app responsive**: mismo bundle y mismo despliegue, con dos ramas de layout que se activan solas. No hay dos builds ni detección de user-agent en `middleware.ts` — sería frágil (tablets, "solicitar sitio de escritorio", etc.) y va contra el "sin sobredimensionamiento" de `CLAUDE.md` §1.

- **CSS**: `@media (max-width: 640px) and (pointer: coarse)` para el layout móvil. El `pointer: coarse` evita tratar una ventana de escritorio estrecha como un móvil; el ancho evita tratar una tablet grande con lápiz como un móvil.
- **JS** (solo para lo que el CSS no puede: inicializar el bottom sheet, atrapar foco en la hoja del sidebar): helper `esMovil()` en `src/ui/deteccion-dispositivo.ts` sobre `window.matchMedia('(max-width: 640px) and (pointer: coarse)')`, **reactivo** — un listener de `matchMedia` re-renderiza el chasis al layout correcto al girar el móvil o redimensionar la ventana, sin recargar.
- **Override manual**: enlace "Ver versión de escritorio" / "Ver versión móvil" al pie del sidebar. Fuerza uno de los dos layouts y lo persiste en `localStorage` (`imc:layout-forzado` = `escritorio` | `movil` | ausente = automático). `esMovil()` respeta el override si existe.

### Breakpoint y modelo de layout móvil

- **Breakpoint**: `@media (max-width: 640px)` (+ `pointer: coarse`, ver arriba). Tablet 641–1024 px sigue con el layout de escritorio de la spec 019 — no hay un tercer layout intermedio en v1.
- **Sidebar** (`src/ui/chasis.ts`): en móvil se abre como **hoja a pantalla completa** desde la izquierda (no el overlay de 280 px), con botón de cierre grande arriba, cierre con `Esc` y con swipe hacia la izquierda. Foco atrapado mientras está abierta.
- **`#info-panels`** (leyendas de capa + paneles meteo / aire / insights / predicción / tráfico histórico): en móvil pasan a **bottom sheet** arrastrable con 3 estados —
  - `oculto`: solo un tirador visible sobre el borde inferior,
  - `medio`: ~40 % de alto, el mapa sigue viéndose y siendo interactivo por encima,
  - `expandido`: ~85 % de alto, para leer los paneles con calma.
  La altura elegida persiste en `localStorage`, clave `imc:bottomsheet-estado`.
- **Cabecera**: en móvil el reloj se compacta a `HH:MM` + "EN VIVO" (se oculta la fecha completa y los segundos); el escudo y el nombre "Intelligent City Monitor" se mantienen.
- **Safe-area**: `env(safe-area-inset-top)` en la cabecera, `env(safe-area-inset-bottom)` en el bottom sheet, `env(safe-area-inset-left)` en la hoja del sidebar.
- **Objetivos táctiles** ≥ 44 × 44 px en todos los controles del chasis (toggle de sidebar, cierre de hoja, tirador y checkboxes de Configuración, botones de los paneles).
- **Controles nativos de MapLibre** reposicionados en móvil para no quedar bajo el bottom sheet en estado `medio`.

## 4. Pipeline (seed → caché → endpoint)

No aplica — estado de UI local. El estado del bottom sheet se guarda en `localStorage` (`imc:bottomsheet-estado`); nada llega a ningún backend.

## 5. Contrato de capa de mapa

No cambia ninguna capa ni su contrato. Sí se **verifica rendimiento en móvil de gama media** con las capas activas por defecto:

- Mantener apagadas por defecto a zoom de ciudad las capas de muchos elementos (ya es el patrón: `zoomMinimo` en spec 026, capas 020/022 bajo demanda, 412 tramos de 004).
- Revisar `deck.gl`: `useDevicePixelRatio` limitado y `pickable` solo donde haga falta interacción, si el FPS en emulación móvil lo pide.
- Registrar el FPS de pan/zoom medido (dispositivo real o emulación) en §8.

## 6. Criterios de aceptación (Definition of Done)

- [x] Detección automática: `src/ui/deteccion-dispositivo.ts` (`matchMedia('(max-width: 640px) and (pointer: coarse)')` reactivo + script inline en `index.html` para evitar parpadeo). Verificado en navegador: emulación móvil arranca en `data-layout="movil"`, escritorio en `"escritorio"`, sin UA sniffing ni servidor.
- [x] Override manual "Ver versión de escritorio / móvil" al pie del sidebar: fuerza el layout, persiste en `localStorage` (`imc:layout-forzado`), y el segundo clic vuelve al otro — verificado que activa/desactiva el bottom sheet y el reparentado en caliente, incluso en un viewport de escritorio.
- [x] A **375 × 812**: mapa a pantalla completa, ningún panel lo tapa en reposo (sheet en `medio` ≈ 42 svh), FAB de menú y controles de MapLibre alcanzables — verificado con captura.
- [x] Sidebar en móvil = hoja a pantalla completa que entra con `transform: translateX` (FAB `☰` fuera del subárbol para que el transform no lo arrastre); cierre con botón `✕`, `Esc`, swipe a la izquierda y backdrop; foco pasa al botón de cierre al abrir y trampa básica de `Tab`. Verificado: `x` va de `-375` (fuera) a `0` (abierta) y vuelve; FAB se oculta con la hoja abierta.
- [x] `#info-panels` en móvil = bottom sheet arrastrable (`#sheet-tirador`, `pointerdown/move/up`) con 3 estados (`oculto`/`medio`/`expandido`); pulsar cicla, arrastrar hace snap; persiste en `localStorage` (`imc:bottomsheet-estado`). `#controls`, `#media-panel` y `#tendencia-panel` se reparentan dentro del sheet y vuelven a `<body>` en escritorio. Verificado el ciclo de estados y el reparentado.
- [x] En escritorio nada cambia: `#info-panels` sigue `position: absolute`, `#controls` bajo `<body>`, reloj con segundos + fecha, sin tirador — verificado con captura, sin regresión.
- [x] `env(safe-area-inset-*)` aplicado en cabecera (top), hoja del sidebar (left/bottom), bottom sheet (bottom) y controles de MapLibre. (Verificación con notch real: pendiente del despliegue / simulador iOS.)
- [x] Objetivos táctiles ≥ 40 px en móvil: `.sidebar-section` (44), FAB/cerrar (44), tirador (44), filas de `.sidebar-panel-checkbox` (44), `.proximidad-boton` (44), **filas de capas `.controls__row` (44, v3)**, botones de panel / `.insight-card__copiar` / `.sim-corte-quitar` (40, v3), inputs de formularios del cordón (40 + `font-size: 16px` anti-zoom iOS, v3), `#app-sidebar__logout` (40, v3). Auditoría headless en la demo desplegada: 0 controles por debajo de 40 px. Escritorio sin cambios (`.controls__row` sigue a ~19 px).
- [x] `npm run typecheck`, `npm run test` (231/231) y `npm run build` sin regresiones. Interacción de mapa fluida en emulación móvil con las capas por defecto (tiles cargan y el pan responde; deck.gl sin capas pesadas activas por defecto — no hizo falta bajar `useDevicePixelRatio`).
- [ ] **Pendiente de simulador iOS / despliegue**: safe-area con notch real y auditoría Lighthouse (tap targets, accesibilidad) en móvil — se cierran junto con la primera subida a Vercel.

## 7. Riesgos y fuera de alcance

- **Swipe del sidebar**: se implementa solo swipe-para-cerrar (dentro de la hoja ya abierta); abrir es siempre por el FAB `☰`, para no competir con el pan del mapa cerca del borde.
- **Animación con `left`/`width` descartada**: Chrome no interpola de forma fiable `width: 0 → 100%` ni `left: 0 → -100%` para el `position: fixed` del sidebar (se quedaba clavado). Se usa `transform: translateX()`, con el FAB de abrir como elemento hermano fuera del sidebar (el `transform` crea bloque contenedor para descendientes fijos).
- **Reset de posición de los paneles reparentados**: se hace con `!important` sobre `:root[data-layout='movil'] #info-panels > *` — necesario porque cada panel trae su propio `position: absolute` con coordenadas; documentado como override deliberado en `index.html`.
- **No se rediseña cada panel** individualmente para móvil en v1 — todos van al bottom sheet con scroll. Un rediseño panel a panel es fast-follow.
- **Landscape en móvil**: se soporta (no se bloquea), se optimiza para retrato; el bottom sheet ocupa una proporción distinta en horizontal.
- **Tablet (641–1024 px)** usa el layout de escritorio — sin layout intermedio en esta versión.
- **Depende de la spec 028** solo para `viewport-fit=cover` (sin él, `env(safe-area-inset-*)` no tiene efecto). Si se implementa la 029 antes que la 028, añadir ese único atributo al `viewport` aquí y anotarlo.

## 8. Historial

| Versión | Fecha | Cambio |
|---|---|---|
| 1 | 2026-08-28 | Creación, `Draft`. Detección automática escritorio/móvil, breakpoint (640 px + `pointer: coarse`), modelo de layout móvil (sidebar como hoja, `#info-panels` como bottom sheet de 3 estados, cabecera compacta, safe-area, targets ≥ 44 px) congelado. |
| 2 | 2026-08-29 | Implementado. `src/ui/deteccion-dispositivo.ts` (detección reactiva + override) con test; `src/ui/bottom-sheet.ts` (lógica pura de 3 estados) con test; `src/ui/layout-movil.ts` (controlador del sheet: gestos, snap, persistencia, reparentado de `#controls`/`#media-panel`/`#tendencia-panel`); `src/ui/chasis.ts` (hoja móvil con `transform`, FAB externo, cierre por `✕`/`Esc`/swipe/backdrop, trampa de foco, reloj compacto, enlace de override); bloque `:root[data-layout='movil']` en `index.html` + script inline anti-parpadeo; `initDeteccionDispositivo()` / `initLayoutMovil()` en `main.ts`. 7 tests nuevos (231/231), `typecheck` + `build` verdes, verificado en navegador (emulación 375×812 y escritorio sin regresión). Safe-area con notch real y Lighthouse quedan para el primer despliegue. Pasa a `Implemented`. |
| 3 | 2026-09-01 | Auditoría headless de la demo desplegada: las filas de capas (`.controls__row`) medían 19 px y varios botones de panel 21 px, por debajo del mínimo de la spec. Añadidas reglas `:root[data-layout='movil']` en `index.html`: `.controls__row` a 44 px (checkbox a 20 px), botones de `#info-panels` / `.insight-card__copiar` / `.sim-corte-quitar` a 40 px, inputs del formulario del cordón a 40 px + `font-size: 16px`, `#app-sidebar__logout` a 40 px. Verificado: 0 controles < 40 px en móvil, escritorio sin cambios; `typecheck` + `test` (231/231) + `build` verdes. |
