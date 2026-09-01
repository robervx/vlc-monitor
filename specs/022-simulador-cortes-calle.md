# 022 — Simulador de cortes de calle (gemelo digital: "¿qué pasa si cortamos estas calles?")

```yaml
id: 022
titulo: "Simulador de cortes de calle: selección interactiva + aviso de zonas sin salida"
estado: Implemented
tipo: capa
depende_de: [020, 019, 031]
propietario: ""
version: 7
```

**Nota (2026-09-01) — v5, revisión del gemelo digital**: el cálculo propio de alcanzabilidad a un **único nodo de referencia** (Plaza del Ayuntamiento) se ha sustituido por el motor compartido de la spec `031` (propagación dirigida, referencia = SCC principal del grafo). `src/services/simulacion-cortes.ts` y su test se han **borrado**. Cambios de esta versión:
- El resultado (`ResultadoPropagacionCorte` de `031`) ahora tiene tres categorías en vez de una: `tramosSinEntrada` (aguas abajo de un corte, cian), `tramosSinSalida` + `tramosAislados` (zona atrapada, violeta), `tramosDesvioForzado` (vías abiertas que desembocan en el corte, azul fino).
- El precálculo (SCC + línea base) vive en `grafo-viario-cliente.ts` (`obtenerBasePropagacion`), memoizado y **compartido con el modo cordón** de spec `021`.
- Flechas de sentido de circulación (`src/services/flechas-sentido.ts`, capa `flechas-sentido` de `main.ts`) sobre los tramos implicados en el análisis mientras el modo está activo, a partir de zoom 15 (v7: icono SVG, no glifo de fuente; solo tramos del análisis, no todo el viewport — ver historial).
- El resumen `.txt` descargable lista las tres categorías.
- Desaparece el riesgo del §7 sobre el nodo de referencia único.

**v6 (2026-09-01) — paso 4, animación cualitativa del desvío**: vuelve el flujo animado al simulador, pero de forma distinta a lo que se retiró en la v4. La v4 retiró animar "flujo" sobre la propia calle cortada (poco intuitivo). La v6 anima **el rodeo**: `src/services/reruta-corte.ts` (`calcularRutasAlternativas`, 4 tests) calcula, por cada corte, el camino dirigido más corto que va del nodo origen al nodo destino del tramo cortado **sin pasar por ningún corte** — "por dónde tendría que dar la vuelta el tráfico". Se pinta esa ruta en verde y se animan puntos que la recorren (`flujo-animado.ts`, reutilizado; bucle con throttle ~120ms sólo mientras el modo está activo y hay rutas). La calle cortada sigue sin animación. Tope de rodeo: `min(1500, max(400, longitudTramo·12))` m — si no hay alternativa dentro de ese radio, no se anima nada (y el tramo aguas abajo ya sale en cian). NO es reparto de tráfico con volúmenes: una ruta representativa (la más corta) por corte.

## 0. Contexto

Primer contenido real de la sección "Gemelo digital" del sidebar (hasta ahora `placeholder`, spec `019`). Responde a la pregunta que quedó explícitamente fuera de alcance en spec `020` §7 ("simulador de tráfico, SUMO/GNN") — pero el problema que el usuario pidió resolver no es simulación de flujo con volúmenes/velocidades, es más simple y igual de útil: **dado un conjunto de calles cortadas a mano por el usuario (ej. para una carrera o un evento), ¿queda alguna zona sin salida?** Eso es un problema de alcanzabilidad sobre un grafo dirigido, no de simulación de tráfico — se resuelve con el grafo de spec `020` y un par de recorridos en anchura (BFS), sin SUMO ni ninguna dependencia nueva pesada.

## 1. Problema / motivación

Un mando planificando el corte de calles para un evento (carrera, procesión, obra) quiere probar combinaciones de cortes y ver, antes de aplicarlos de verdad, si alguna combinación deja una zona de la ciudad sin ninguna salida posible — algo fácil de pasar por alto a ojo, sobre todo porque el sentido de circulación de cada calle importa (cortar la salida de una calle de sentido único no es lo mismo que cortar una bidireccional).

## 2. Fuente(s) de datos

Ninguna nueva. Reutiliza el grafo de spec `020` (`/data/red-viaria-rodada.json` (asset estático)) y su índice espacial (`rbush`, spec `020`/`012`). Los cortes los elige el usuario haciendo clic en el mapa — no hay persistencia entre sesiones (mismo criterio que spec `021`: es una herramienta de trabajo puntual, no un dato a guardar).

## 3. Contrato de datos (normalizado)

```typescript
interface TramoAislado {
  idTramo: string;
  nombreCalle: string | null;
}

interface ResultadoSimulacionCortes {
  tramosCortados: string[];       // idTramo[], elegidos por el usuario, orden de selección
  tramosAislados: TramoAislado[]; // tramos que tocan una zona que deja de poder alcanzar el nodo de referencia
  nodosAisladosCount: number;
  nodoReferenciaId: string;       // nodo estable usado como "resto de la red" — el más cercano a Plaza del Ayuntamiento
  generadaEn: string;
}
```

**Algoritmo (`src/services/simulacion-cortes.ts`, función pura)**:

1. Se construye la adyacencia **dirigida** del grafo completo (sin cortes) respetando `tramo.sentido`: un tramo `bidireccional` añade arista en los dos sentidos, `unidireccional` solo en el sentido `nodoOrigen → nodoDestino`. Esto es intencionadamente distinto del grafo no-dirigido que usa spec `021` (ahí importaba conectividad física para un cordón; aquí importa si un vehículo puede **circular** de verdad, que es justo lo que pidió el usuario: "debe tener en cuenta la dirección de cada calle").
2. Se calcula, una vez por carga del grafo, el conjunto de nodos que pueden **alcanzar** un nodo de referencia estable (el más cercano a Plaza del Ayuntamiento) — vía BFS sobre el grafo con las aristas invertidas (alcanzabilidad-a-X = BFS-desde-X sobre el grafo invertido). Esto es la línea base, sin ningún corte.
3. Cada vez que el usuario añade/quita un corte, se repite el mismo cálculo pero excluyendo del grafo los tramos cortados, y se compara contra la línea base: los nodos que antes podían llegar al nodo de referencia y ahora no, son "aislados por esta combinación de cortes". Los tramos que tocan esos nodos son `tramosAislados`.
4. Coste: dos BFS sobre ~9.200 nodos / ~13.200 tramos — trivial, recalculable en cada clic sin percance de rendimiento.

**Reutilización interna**: se extrae `src/services/grafo-viario-cliente.ts` (carga + caché del grafo completo vía `fetch`, antes duplicado dentro de `modo-cordon.ts` de spec `021`) para que este módulo y el de spec `021` compartan la misma caché en memoria del grafo, sin duplicar la llamada de red ni el índice `rbush`.

## 4. Pipeline (seed → caché → endpoint)

Ninguno propio — reutiliza `/data/red-viaria-rodada.json` (asset estático) de spec `020`, ya cacheado en el cliente vía `grafo-viario-cliente.ts`.

## 5. Contrato de capa de mapa

Sección `gemelo-digital` en `SIDEBAR_REGISTRY` (spec `019`), que pasa de `placeholder` a `disponible`. Activa un **modo** (mismo patrón que spec `021`: oculta paneles habituales, pinta sobre la misma instancia de MapLibre) — mutuamente excluyente con el modo cordón de spec `021` (activar uno sale automáticamente del otro, nunca los dos pintando/interceptando clics a la vez).

Interacción: clic en una calle del mapa la añade a `tramosCortados` (se pinta en **naranja** grueso — no rojo, ver §6 v3); clic de nuevo sobre una calle ya cortada la quita (toggle). Lista lateral de calles cortadas con nombre y sentido, cada una con botón de quitar. `tramosAislados` se pinta en violeta y genera un banner "⚠️ N calles quedan sin salida con esta combinación de cortes", con la lista de nombres — nunca en silencio.

**Efecto de flujo animado — añadido en v3, retirado de aquí en v4**: se probó pintar puntos animados sobre `tramosCortados`/`tramosAislados` (`src/services/flujo-animado.ts`). A petición del usuario tras probarlo, se trasladó a spec `004` (capa de tráfico real): el razonamiento fue que aquí "ya vemos los flujos que lleva cada calle en estado normal" (en la capa de tráfico), así que el simulador puede quedarse con el resultado final estático de cada corte — más simple, más rápido, y evita animar algo tan poco intuitivo como "flujo" sobre una calle que precisamente se acaba de cortar. `flujo-animado.ts` se conserva como módulo compartido, ahora usado por spec `004`.

**Descarga (v3)**: botón "⬇️ Descargar resumen", visible en cuanto hay al menos una calle cortada. Genera un `.txt` en el cliente (Blob + enlace temporal, sin backend) con las calles cortadas, su sentido, y el resultado de zonas sin salida — pensado para llevárselo a un briefing o compartirlo, no como formato de intercambio de datos.

## 6. Criterios de aceptación (Definition of Done)

- [x] `calcularAislados` probado con fixtures — sin red, sin DOM — 6 tests en `simulacion-cortes.test.ts`: corte que aísla una zona bidireccional, corte con ruta alternativa (no aísla), calle unidireccional cuya única salida se corta (aísla) vs. cortar solo la entrada (no aísla), combinación de dos cortes que aísla donde uno solo no lo hacía, y caso sin cortes (0 aislados).
- [x] Snap de clic en el mapa a tramo más cercano (reutiliza `IndiceRedViaria` de spec `020`) — toggle añade/quita correctamente. Verificado en navegador con un clic real sobre Carrer de Xàtiva (detectado correctamente como sentido único) y su posterior retirada.
- [x] Recalcula en vivo con cada añadido/quitado de corte, sin botón "calcular" — verificado en navegador (aviso "✓ Ninguna zona se queda sin salida" aparece al instante tras el corte).
- [x] Activar este modo desactiva el modo cordón de spec `021` si estaba activo, y viceversa — verificado en navegador en ambos sentidos.
- [x] Aviso de zonas sin salida visible de forma persistente (no un toast) mientras exista al menos un tramo aislado, con lista de nombres de calle.
- [x] `npm run typecheck` y `npm run test` (152/152) sin regresiones; verificado en navegador.

**Extra, no en el DoD original**: durante la implementación se replicó preventivamente el guard de `onClick`/`onHover` de la capa `distritos` que tuvo que corregirse en spec `021` (comprobar el estado del modo en vivo, no solo la prop `pickable`) — esta vez cubierto desde el principio, sin tener que descubrirlo por el mismo bug dos veces.

**v3, a petición del usuario tras probar v2**:
- [x] Color de `tramosCortados` cambiado de rojo a **naranja** — el rojo queda reservado para el cordón de incidente real (spec 021); naranja transmite "cambio hipotético/propuesto", coherente con que esto es una simulación, no una emergencia. Verificado visualmente en navegador.
- [x] ~~Efecto de flujo animado~~ — retirado en v4, trasladado a spec `004` (ver §5). El simulador ahora pinta el resultado estático (naranja/violeta), sin animación.
- [x] Botón de descarga de un resumen de texto de la simulación — verificado interceptando el `Blob` generado en navegador, contenido correcto (calles cortadas + sentido + resultado de aislamiento).
- [x] Bucle de animación con throttling (~120ms, no 60fps) para no recomputar todas las capas del mapa más veces de las necesarias; solo activo mientras el modo simulador está en curso, se detiene al salir.

## 7. Riesgos y fuera de alcance

- **No es un simulador de flujo de tráfico** (no hay volúmenes, velocidades, ni redistribución de intensidad) — es un análisis de alcanzabilidad booleana ("¿hay ruta o no?"), que es lo que se pidió explícitamente. Si más adelante hace falta intensidad/congestión real, es la Fase 2 completa de `docs/investigacion/GEMELO_DIGITAL_SEGURIDAD_PUBLICA_PROPUESTA.md`, spec nueva.
- **Nodo de referencia único**: usar un solo nodo (Plaza del Ayuntamiento) como proxy de "resto de la red" es una simplificación — si algún día se cortan calles muy lejos del centro y el grafo tuviera zonas ya débilmente conectadas al centro por otros motivos (no por los cortes del usuario), podría generar una falsa alarma. Mitigación de v1: solo se cuenta como "aislado por esta simulación" lo que cambia respecto a la línea base sin cortes (paso 3 del algoritmo), no la alcanzabilidad absoluta.
- **Fuera de alcance v1**: deshacer/rehacer historial de combinaciones probadas, guardar escenarios con nombre, exportar el resultado.

## 8. Historial

| Versión | Fecha | Cambio |
|---|---|---|
| 1 | 2026-08-26 | Creación, `Draft`. Pendiente de implementación y verificación en navegador antes de pasar a `Implemented`. |
| 2 | 2026-08-26 | DoD completo: `src/services/simulacion-cortes.ts` (alcanzabilidad dirigida, 6 tests), `src/services/grafo-viario-cliente.ts` (caché de grafo extraída de `modo-cordon.ts` para compartir con este módulo), `src/ui/modo-simulacion-cortes.ts` (orquestador, exclusión mutua con spec 021), sección "Gemelo digital" del sidebar convertida de `placeholder` a contenido real. Verificado con `npm run typecheck`, `npm run test` (152/152) y en navegador (corte real sobre Carrer de Xàtiva, toggle, exclusión mutua en ambos sentidos). Spec pasa a `Implemented`. |
| 3 | 2026-08-26 | A petición del usuario tras probar v2: color naranja (no rojo) para `tramosCortados`; efecto de flujo animado respetando sentido (`src/services/flujo-animado.ts`, 7 tests) — se evaluó y descartó `TripsLayer`/`@deck.gl/geo-layers` por su cadena de dependencias vulnerable, se optó por interpolación manual + `ScatterplotLayer`; botón de descarga de resumen en `.txt` (Blob local, sin backend). Verificado con `npm run typecheck`, `npm run test` (159/159) y en navegador (color, animación con dos capturas mostrando movimiento, contenido del `.txt` descargado). |
| 4 | 2026-08-26 | A petición del usuario, valorado desde UX: el efecto de flujo se retira del simulador y se traslada a spec `004` (capa de tráfico real) — aquí el resultado de un corte queda estático (naranja/violeta), sin animación; `flujo-animado.ts` pasa a ser un módulo compartido. Color naranja y botón de descarga se mantienen sin cambios. `npm run typecheck` y `npm run test` (159/159) sin regresiones. |
| 5 | 2026-09-01 | Paso 3 de la revisión del gemelo digital. Adopta el motor de spec `031`: `simulacion-cortes.ts` (+test) borrado; `modo-simulacion-cortes.ts` usa `obtenerBasePropagacion` + `propagarCorte`. Nuevas capas en `main.ts`: `simulacion-tramos-sin-entrada` (cian), `simulacion-tramos-sin-salida` (violeta, antes `-aislados`), `simulacion-tramos-desvio` (azul fino), `flechas-sentido` (activa en modo cordón/simulador, no solo `?debug=grafo`). `chasis.ts`: intro, panel de resultado con tres bloques y `.txt` con tres categorías. `typecheck` / `test` (241/241) verdes. Verificado en navegador: corte de 1 tramo de la Avinguda del Port → cian aguas abajo + "Carrer de Muñiz y Hernández de Alba" / "Carrer de Berenguer Mallol" sin entrada, "Carrer de Peris Brell" desvío forzado; toggle limpia el resultado; flechas de sentido visibles. |
| 6 | 2026-09-01 | Paso 4. Animación cualitativa del desvío: `src/services/reruta-corte.ts` (`calcularRutasAlternativas`, Dijkstra dirigido acotado, 4 tests); `modo-simulacion-cortes.ts` guarda `rutasAlternativas` en el estado; `main.ts` pinta `simulacion-rutas-alternativas` (verde) + `simulacion-flujo-reruta` (puntos animados, bucle `tickAnimacionReruta` ligado al modo) reutilizando `flujo-animado.ts`; `chasis.ts` muestra nº de rutas y longitud media + línea en el `.txt`. `typecheck` / `test` (245/245) verdes. Verificado el pipeline contra el grafo real (`npx tsx`, script desechado): Carrer de Xàtiva → rodeo de 537 m/13 tramos, Gran Via → 324 m/5 tramos, puntos animados dentro del bbox de la ruta; Avinguda del Port y Ciutat Vella → sin ruta cercana (coherente: aguas abajo ya está sin entrada). En navegador: ruta verde visible + panel "1 ruta(s) alternativa(s), 358 m de media"; el movimiento de los puntos no se pudo reconfirmar visualmente por `document.hidden=true` del navegador de la sesión (mismo límite que spec `004` §6). |
| 7 | 2026-09-01 | Fix reportado en móvil: las flechas de sentido se veían "como líneas de error". Dos causas: (1) `TextLayer` con los glifos `▶`/`◀` — atlas de fuente sin ese carácter en algunos móviles → marcas sueltas; sustituido por `IconLayer` con un icono SVG (`ICONO_FLECHA_SENTIDO`, data-URI, `mask` para tintar). (2) Se pintaba una flecha por cada calle del viewport → ruido visual, sobre todo en pantalla pequeña; ahora en los modos cordón/simulador las flechas solo se pintan sobre los **tramos implicados en el análisis** (cortes + propagación + rutas alternativas), no en todo el viewport. `?debug=grafo` mantiene el pintado de todo el viewport como ayuda de verificación. Tamaño 15px, azul unidireccional / gris bidireccional. `typecheck` / `test` (261/261) / `build` verdes; verificado en navegador con viewport móvil (375×812): flechas limpias solo sobre la ruta y el corte, sin warnings de consola. |
