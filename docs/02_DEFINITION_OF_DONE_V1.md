# Definition of Done — V1

**Fecha:** 2026-09-16
Define cuándo se puede decir que **Mirall** (ver `docs/decisiones/ADR-004-rebranding-mirall.md`;
el proyecto se llamaba "Intelligent City Monitor" antes de esa fecha, y las specs anteriores
citan ese nombre sin reescribir) tiene su **V1** completa. Este documento no sustituye a
`specs/INDEX.md` (que sigue siendo la fuente de verdad del estado real de cada spec) — es la
lista cerrada de qué specs tienen que llegar a `Implemented`, con qué criterio de cierre
concreto, para poder dar V1 por hecha.

## 0. Dos despliegues, un mismo código

V1 tiene una única base de código con dos formas de desplegarla:

| | **Interna** (completa e ideal) | **Pública** |
|---|---|---|
| Capas y paneles | Todos, incluidas las cámaras en vivo (spec `038`) | Todos **salvo cámaras en vivo** |
| Mecanismo | — | Sin la variable de entorno `VITE_PERSONAL_CAMARA_TURISME_CV` (fuente "personal" por ADR-003) — el selector **oculta** la entrada de cámaras, no la deja vacía (verificado, spec `038` v7) |
| Resto de comportamiento | Idéntico | Idéntico |

No hace falta una rama ni una spec nueva para esto — es el mismo mecanismo de "fuente personal"
que ya introdujo ADR-003 para las cámaras, aplicado tal cual. Verificado (2026-09-16): arrancando
el dev server sin `.env.local`, `#toggle-camaras-row` queda `hidden`; con la variable, vuelve a
mostrarse.

## 1. Specs que tienen que estar `Implemented` para V1

| Spec | Qué falta | Criterio de cierre |
|---|---|---|
| [`000` v4](../specs/000-mapa-base-distritos.md) | ~~Quitar iluminado de distrito al pasar el ratón/clic~~ — **hecho (2026-09-16)** | El polígono no cambia de color ni en hover ni en clic; `setFocoDistrito` (spec `036`) sigue funcionando, el único indicador visual es el chip "Foco: X" |
| [`001` v4](../specs/001-capa-meteorologia.md) | ~~Avisos oficiales por scraping en vez de API key de AEMET~~ — **hecho (2026-09-16)** | Fuente real verificada (llamada directa, no solo documentación) antes de escribir código — AEMET descartada con evidencia (HTTP 500 + contenido por JS), `comunica.gva.es` verificada y usada; alerta decretada visible en la app sin depender de ninguna key — integrada en spec 013 v7, verificado con la alerta naranja real del 15/09/2026 |
| [`003` v3](../specs/003-capa-movimiento-personas-mock.md) | ~~Densidad mock concentrada por hotspots (Fallas)~~ — **hecho (2026-09-16)** | Nueva función pura `generarHotspotsDensidadMock`, monumentos falleros reales como hotspots, `ScatterplotLayer` nuevo encima del choropleth. Sigue marcada `MOCK` de forma visible (no negociable, `CLAUDE.md` §4) |
| [`004` v4](../specs/004-capa-trafico-tiempo-real.md) | ~~Los estados no-verdes deben resaltar~~ — **hecho (2026-09-16)** | Ancho por severidad + orden de dibujo de forma que denso/congestionado/cortado no queden enterrados bajo fluido |
| [`009` v6](../specs/009-contexto-mediatico.md) | ~~Quitar bucket ocio/deporte salvo fútbol; freshness por ítem~~ — **hecho (2026-09-16)** | Solo fútbol sobrevive del bucket deporte (gana incluso sobre señal de ciudad); ocio se funde en "general"; cada ítem se marca caducado a partir de 24h; panel muestra próxima actualización |
| [`010` v4](../specs/010-indice-pulso-distrito.md) | ~~Retomar el rediseño ya en Draft (escenarios de conjunción)~~ — **hecho (2026-09-16)** | Evaluador consolidado `pulso-escenarios.ts`, endpoint + insights + capa + snapshot en sombra; consumidores 013/034/036/037 actualizados |
| [`013` v5](../specs/013-motor-insights-alertas.md) | ~~Alertas como modal bloqueante; insight de tráfico nombra la calle~~ — **hecho (2026-09-16)** | Modal nuevo con cola (no existía ningún `<dialog>` en el repo) que exige cierre explícito; título de `trafico-empeora` incluye la calle más severa |
| [`019` v6](../specs/019-identidad-chasis-navegacion.md) | ~~Bug: el sidebar no cierra bien~~ — **hecho (2026-09-16)** | `onCambioLayout` no reconciliaba el listener de `keydown` (Esc) al pasar a layout móvil con la hoja ya abierta desde escritorio — corregido en `src/ui/chasis.ts` |
| [`021` v4](../specs/021-motor-cordon-incidentes.md) | ~~Bloqueante de bomberos~~ — **ya resuelto** | Retirado por decisión de producto (2026-09-16): primera aproximación editable para cuando llega la policía primero. Software ya completo. Spec ya en `Implemented` |
| [`027`](../specs/027-agenda-eventos-scraping.md) | ~~Implementar tal cual redactada~~ — **hecho (2026-09-16)**, con una verificación pendiente | Agenda general de eventos culturales vía GH Actions + Playwright. Job de CI aún sin su primera ejecución real (Playwright no corre en este host) |
| [`030` v4](../specs/030-remarca-generica-repo-publico.md) | ~~Rebranding a Mirall~~ — **hecho (2026-09-16)** | `src/config/marca.ts`, `index.html`, `vite.config.ts` (manifest PWA), README, `CLAUDE.md` §1, `src/ui/chasis.ts` y demás sitios de `docs/decisiones/ADR-004-rebranding-mirall.md` actualizados; cabecera con descriptor "Urban Intelligence Platform" en tipografía propia |
| [`032`](../specs/032-reconciliacion-trafico-grafo.md) | ~~Implementar tal cual redactada~~ — **hecho (2026-09-16)** | Reconciliación tráfico real ↔ grafo viario — 99,5 % de cobertura geométrica verificada contra datos reales |
| [`033` v3](../specs/033-jerarquia-capas-selector.md) | ~~Reordenar selector + registrar cámaras~~ — **hecho (2026-09-16)** | Tráfico/contexto mediático/cámaras arriba, incidencias 4ª, Pulso última; "cámaras" entra en `map-layer-definitions.ts` |
| [`034` v3](../specs/034-dashboard-indicadores.md) | ~~Quitar KPI de temperatura duplicado~~ — **hecho (2026-09-16)** | El chip de temperatura del KPI se retira (el panel de meteo de abajo ya cubre esa información con más detalle) |
| [`035` v2](../specs/035-frescura-global-mini-leyendas.md) | ~~Quitar auto-expandir-con-hover en las 6 leyendas~~ — **hecho (2026-09-16)** | Tráfico/Valenbisi/aparcamiento/Pulso/Fallas/vía pública se expanden solo con clic/tap, en escritorio y móvil |
| [`038` v7](../specs/038-camaras-urbanas-en-vivo.md) | ~~Cerrar DoD abierto (autoplay) + confirmar gating público~~ — **hecho (2026-09-16)** | Gating verificado (arrancando el dev server con y sin la env var); autoplay cerrado como riesgo aceptado con mitigación — sin navegador real fuera de sandbox disponible en esta sesión (Claude in Chrome no conectado), acción de seguimiento no bloqueante para quien despliegue |
| [`039` v3](../specs/039-actualidad-institucional-redes.md) | ~~Cerrar DoD abierto (12 entidades + fallback real) + filtro de entidades~~ — **hecho (2026-09-16)** | Las 13 entidades verificadas visualmente (iframes reales, handle/URL exactos); fallback probado con una cuenta inexistente real; checkboxes "elegir cuáles leer" con preferencia persistida en `localStorage`, verificado que sobrevive a un reload |
| [`040`](../specs/040-reestructuracion-dos-vistas.md) | ~~Reestructuración en dos vistas~~ — **hecho (2026-09-16)** | Mapa operativo (`/`) y hub de inteligencia (`/inteligencia`) navegables por hash, sin pérdida de estado ni fugas de listener — verificado en navegador (escritorio y móvil), bug real de pérdida de hash encontrado y corregido |
| [`041`](../specs/041-panel-apoyo-decision.md) | ~~Página de apoyo a decisión operativa~~ — **hecho (2026-09-16)** | Cruce declarativo de señales ya existentes (010/016/026), sugerencias siempre en condicional, nunca una acción ejecutable — límite de `CLAUDE.md` §4. `021` queda fuera del cruce automático, ver spec §7 |
| [`042`](../specs/042-protocolos-actuacion.md) | ~~Página de protocolos de actuación~~ — **hecho (2026-09-17)** | Contenido revisado explícitamente por el usuario antes de publicarse — "Lluvias intensas" confirmado tal cual, sin cambios (`CLAUDE.md` §4, spec §2/§7) |
| [`037` v3](../specs/037-glosario.md) | ~~Actualizar glosario~~ — **hecho (2026-09-16)** para Pulso/Alertas | Se adelantó junto con `010` v4, en vez de esperar al final — no tenía sentido separar el cambio del código que describe. Necesitará una v4 cuando `040`/`041`/`042` estén implementadas |

## 2. Plan de ejecución

Ver la sección "Plan de ejecución" del plan de esta sesión — se resume aquí para referencia
rápida, una spec detrás de otra (`CLAUDE.md` §3.4), no todas a la vez:

1. ~~`030` v4 + ADR-004 (rebranding)~~ — **hecho (2026-09-16)**, el resto del trabajo ya usa el nombre nuevo.
2. ~~Arreglos de bajo riesgo: `019` v6, `000` v4, `035` v2, `034` v3, `033` v3~~ — **hechos (2026-09-16)**.
3. ~~`004` v4 → `009` v6 → `003` v3~~ — **hechos (2026-09-16)**.
4. ~~`013` v5 (modal de alertas + insight con calle)~~ — **hecho (2026-09-16)**.
5. ~~`010` v4 (Pulso de Distrito)~~ — **hecho (2026-09-16)**, junto con el glosario (`037`).
6. ~~`021` v4~~ — **hecho (2026-09-16)**, ya cerrada.
7. ~~`027` y `032`~~ — **hechos (2026-09-16)**, tracks independientes.
8. ~~`001` v4~~ — **hecho (2026-09-16)**. Fuente verificada con llamadas reales: AEMET descartada
   (web pública HTTP 500 + contenido renderizado por JS, además de la `api_key` obligatoria ya
   conocida); elegida `comunica.gva.es/es/emergencies-i-interior` (GVA Emergencias e Interior),
   `robots.txt` permite bots de IA explícitamente. Implementado como consumidor del motor de
   insights (spec 013 v7, regla `aviso-oficial-meteo`) en vez de UI propia — el panel/modal ya
   eran genéricos.
9. ~~`039` v3 y `038` v7~~ — **hechos (2026-09-16)**. `038`: gating del selector sin la env var
   verificado; autoplay del `<video>` DASH cerrado como riesgo aceptado con mitigación (sin
   navegador real fuera de sandbox en esta sesión). `039`: 13 entidades verificadas en
   navegador, fallback probado con una cuenta real inexistente, selector nuevo "Elegir qué
   cuentas leer" con preferencia persistida.
10. ~~`040` (router + dos vistas)~~ — **hecho (2026-09-16)**. "Actualidad institucional"
    (039) y "Agenda de eventos" (027) se suman al hub de `/inteligencia` — no estaban en
    el alcance original de la spec, decisión confirmada con el usuario al implementar.
    Selector de capas de `/` reordenado (`033` v4): cámaras/contexto mediático/tendencia
    pierden su casilla, Pulso de Distrito vuelve a "Prioritarias".
11. ~~`041` y `042`~~ — **hechos (2026-09-16/17)**, dentro de la vista `/inteligencia`.
    `042`: contenido de "lluvias intensas" redactado como borrador y **confirmado por el
    usuario el 2026-09-17, sin cambios** — bloqueante de revisión resuelto.
12. ~~`037` (glosario)~~ — adelantado al paso 5, junto con `010` v4. Pendiente solo una v4 futura cuando existan `040`/`041`/`042`.

**Plan de ejecución completo (2026-09-17)** — los 12 pasos están hechos. El DoD de V1 (§1)
queda cerrado salvo revisar la tabla de arriba fila por fila antes de dar la V1 por
completa formalmente. Trabajo posterior a esta fecha (arreglos reportados por el usuario,
features nuevas) no forma parte de este plan cerrado — ver historial de cada spec para lo
que venga después.

### Notas operativas para la siguiente sesión

- **Playwright no funciona en este host** (macOS 12 — `ERROR: Playwright does not support
  chromium on mac12`). Cualquier verificación que necesite ejecutar un script Playwright
  localmente (p. ej. relanzar `npm run scrape:agenda-eventos`) no se puede correr aquí; solo se
  puede verificar selectores a mano con el navegador y/o confiar en la ejecución real en GitHub
  Actions (`ubuntu-latest`, sí soportado).
- **`preview_start`/`name: "dev"` puede fallar con `EPERM: process.cwd failed`** (cwd corrupto del
  proceso lanzador) — si pasa, arrancar el dev server directo por Bash
  (`npm run dev > /tmp/vite-dev.log 2>&1 &` seguido de `disown`) y luego navegar el Browser pane a
  `http://localhost:3000` en vez de usar `preview_start`.
- El job de GitHub Actions de spec `027` (`agenda-eventos-cron.yml`) todavía no se ha disparado en
  CI real — pendiente de su primera ejecución (push/merge o `workflow_dispatch` manual).

## 3. Qué NO entra en V1

Todo lo que sigue fuera de alcance según `CLAUDE.md` §3 sigue fuera: globo 3D, app de
escritorio, multi-idioma más allá de ES/VA/EN, monetización/cuentas de usuario, servidor MCP
público, SDKs, la API de pago de X/Twitter. Cualquier spec no listada arriba que hoy esté
`Planned`/`Blocked` (`007` EMT, `011` densidad real, `014` notificaciones, `015` integración
Waze/Maps) sigue igual de bloqueada — nada de esto se ha reabierto por este documento.
