# 020 — Grafo viario base (nodos + tramos)

```yaml
id: 020
titulo: "Grafo viario base de Valencia (nodos + tramos) como infraestructura reutilizable"
estado: Implemented
tipo: fundacional
depende_de: [000]
propietario: ""
version: 4
```

## 0. Contexto

Pieza "Fase 0" descrita en `docs/investigacion/GEMELO_DIGITAL_SEGURIDAD_PUBLICA_PROPUESTA.md` §3-5, ya anticipada por `ADR-001` (Opción B: "grafo viario + simulador... es la de menor sensibilidad, no procesa ningún dato de densidad de personas"). Esta spec reserva **solo** esa infraestructura de grafo — sin simulador de tráfico (SUMO/GNN, que sigue fuera de alcance salvo spec propia futura) y sin motor de anomalías. Es prerrequisito estructural de spec `021` (motor de cordón por incidente), y queda disponible para cualquier futura funcionalidad de movilidad que necesite razonar sobre la red de calles (no solo puntos).

## 1. Problema / motivación

Varias funcionalidades futuras (empezando por spec `021`) necesitan responder "¿qué tramos de calle hay cerca de este punto, y cómo se conectan entre sí?" — una pregunta de grafo, no de lista de puntos. Hoy no existe ningún grafo viario en el proyecto; cada capa (tráfico, Valenbisi, aparcamiento) trata sus features como geometrías sueltas, sin topología entre ellas.

## 2. Fuente(s) de datos

| Fuente | URL | Licencia / condiciones | ¿Requiere API key? | Verificada manualmente el ___ |
|---|---|---|---|---|
| Overpass API (OSM), acotada a bbox de Valencia | `overpass-api.de/api/interpreter`, `way["highway"~"..."](39.40,-0.43,39.51,-0.30)` | ODbL (OpenStreetMap) | No (sí requiere `User-Agent` explícito — Overpass devuelve 406 con el user-agent por defecto de `fetch` en Node, confirmado en vivo) | **Verificada 2026-08-25** — 74.645 elementos OSM recibidos en ~3s |
| Callejero Digital Normalizado de la Comunitat Valenciana (CDNCV) | WFS: `terramapas.icv.gva.es/0901_Viarias`, capa `Callejero.Calles`, `outputformat=application/json; subtype=geojson` | Datos abiertos (Generalitat/Institut Cartogràfic Valencià) | No | **Verificada 2026-08-25** — `GetFeature` real devuelve GeoJSON válido con `nombre`, `id_vial`, `sentido_cas`, geometría en EPSG:4326. **Resolución nombre↔grafo pendiente** (join espacial entre dos segmentaciones distintas, ver §7) — `nombreCalle` en v1 usa el tag `name` de OSM directamente |
| Polígono municipal de Valencia | Reutilizar el mismo GeoJSON de distritos ya usado por spec `000` (`getDistrictAtCoordinates` sobre el punto medio de cada tramo, no un recorte por polígono en la propia consulta) | Interno, ya en el proyecto | No aplica | Ya verificado por spec `000` |

**Cambio de diseño respecto a la primera redacción de esta spec, con motivo explícito**: se descarta Geofabrik + `osmium extract` + `osmnx` (Python) a favor de Overpass API + TypeScript puro. Razón: el proyecto es 100% TypeScript/Node hoy (`CLAUDE.md` §5) — añadir Python solo para un script de generación puntual introduce un segundo toolchain para una tarea que se ejecuta manualmente y de forma infrecuente, además de obligar a descargar el `.pbf` completo de España (cientos de MB) en vez de los ~10MB que trae un bbox acotado a Valencia vía Overpass. Cambiar de lenguaje sí habría necesitado su propio ADR (`CLAUDE.md` §5); quedarse en TypeScript no reabre esa decisión. La contrapartida real (documentada, no ocultada): `osmnx.consolidate_intersections()` hace una fusión de calzadas duales más sofisticada que el "partir en cada nodo compartido por ≥2 ways" implementado aquí — ver §7.

No hay fuente en vivo ni cron en producción: el grafo es un artefacto **casi estático**, regenerado manualmente con `npm run seed:red-viaria` cuando haga falta (cambios de callejero, nuevas fases), no en la ruta caliente de ninguna función.

## 3. Contrato de datos (normalizado)

Implementado en `src/services/red-viaria.ts`, con dos desviaciones deliberadas sobre el diseño inicial de esta sección, ambas explicadas aquí en vez de cambiadas en silencio:

```typescript
interface Nodo {
  idNodo: string;             // determinista: `n:${lat.toFixed(5)}:${lon.toFixed(5)}`
  lat: number;
  lon: number;                // no `lng` — consistente con el resto del proyecto (TramoTrafico, EstacionValenbisi, Aparcamiento ya usan `lon`)
  tipoNodo: 'interseccion' | 'finalVia'; // 'rotondaColapsada' diferido, ver §7 — no se colapsan rotondas en v1
  grado: number;               // nº de tramos que tocan este nodo
}

interface Tramo {
  idTramo: string;             // determinista: `t:rodada:${nodoOrigenId}:${nodoDestinoId}` (+ sufijo si hay colisión)
  nodoOrigenId: string;
  nodoDestinoId: string;
  geometria: GeoJSON.LineString;
  longitudM: number;
  tipoVia: 'primaria' | 'secundaria' | 'residencial' | 'peatonal'; // bucket mapeado desde highway=* de OSM
  sentido: 'unidireccional' | 'bidireccional'; // añadido sobre el diseño inicial — derivado de OSM, ver §3 "Sentido de circulación (v4)"
  nombreCalle: string | null;  // v1: igual a nombreCalleRaw — CDNCV verificado pero resolución nombre↔grafo aún no implementada, ver §2 y §7
  nombreCalleRaw: string | null; // tag `name` original de OSM, solo trazabilidad
  distrito: string | null;     // añadido sobre el diseño inicial — mismo patrón que TramoTrafico (spec 004), útil para filtrar/agregar por distrito
  osmWayId: number;
  versionGrafo: string;
  fuenteGeometria: string;
  confianzaTopologica: 'validadoManual' | 'limpiezaAutomatica'; // v1: siempre 'limpiezaAutomatica', no ha habido pasada de validación manual todavía
}
```

**Sentido de circulación (revisado en v4, 2026-08-31)** — `src/services/red-viaria.ts`. Auditado contra Overpass en vivo (12.591 ways con `highway` en el bbox): `oneway=yes` en 9.336 (74%), ausente en 2.084, `oneway=no` en 1.170, `oneway=-1` en **1**, `junction=roundabout` en 776 (**769 sin `oneway` explícito**), `junction=circular` en 326, `motorway` sin `oneway` 0. Reglas resultantes:

| Condición OSM | `sentido` | Nota |
|---|---|---|
| `oneway` ∈ {`yes`,`1`,`true`} | `unidireccional` | Orden de nodos del way = sentido. Caso mayoritario. |
| `junction=roundabout` (con o sin `oneway`) | `unidireccional` | Convención OSM: el orden de nodos de un way de rotonda ya es el sentido de giro. **Antes de v4 estos ~650 tramos (4,9% del grafo) caían a `bidireccional`** → ruta de escape fantasma para cualquier análisis dirigido (specs 021/022). |
| `oneway=-1` | `unidireccional` | La circulación real es la contraria al orden de nodos → se **invierte** `nodoOrigenId`/`nodoDestinoId` y el array de coordenadas de cada tramo, para que la dirección canónica origen→destino sea siempre la de circulación. |
| `junction=circular` sin `oneway` propio | `bidireccional` | OSM **no** implica sentido único aquí (a diferencia de `roundabout`) — se respeta. |
| resto (`oneway` ausente / `no` / `reversible` / …) | `bidireccional` | `reversible`/`alternating` no aparecen en el bbox; si aparecieran, caen a `bidireccional` (conservador). |

Resultado del re-seed 2026-08-31: 13.233 tramos (9.201 nodos), **83,7% unidireccional** (era 79% en v2 — la diferencia son las rotondas), 663 tramos de rotonda ahora `unidireccional`.

**Índice espacial**: confirmado `rbush` (R-tree sobre bounding boxes), no H3 — H3 estaba pensado para agregar densidad de flujo por celda (Fase 1 de `docs/investigacion/GEMELO_DIGITAL_SEGURIDAD_PUBLICA_PROPUESTA.md`, un problema distinto), mientras que lo que necesita spec `021` es "tramo más cercano a un punto / tramos en un radio", que es exactamente para lo que sirve un R-tree. Implementado en `src/services/red-viaria-indice.ts`, con reintento de radio ampliado si la primera caja de búsqueda no da candidatos.

## 4. Pipeline (seed → caché → endpoint)

| Parámetro | Valor |
|---|---|
| Frecuencia de refresco | Manual — regeneración bajo demanda, no cron |
| TTL en caché | No aplica (artefacto estático versionado, no vive en Redis) |
| Comportamiento si la fuente falla | No aplica en runtime — el fallo posible es en el pipeline offline de generación, no en producción |
| Clave de caché | No aplica |
| Endpoint interno que sirve el dato | `GET /data/red-viaria-rodada.json` — asset estático versionado servido por el CDN (v3, spec `030`/deploy). No es una función: pesa ~9 MB (gzip ~1,1 MB), supera el límite de tamaño y de respuesta de las funciones de Vercel. Sigue siendo mismo-origen y propio (`CLAUDE.md` §2). |

Pasos del pipeline offline real (`npm run seed:red-viaria`, `scripts/seed-red-viaria.ts`):

1. Overpass API, bbox holgado alrededor de Valencia, `highway` en el conjunto rodado (motorway…living_street, excluyendo service/track/driveway).
2. `construirRedViaria()` (`src/services/red-viaria.ts`): parte cada way en tramos en los nodos compartidos por ≥2 ways (intersección real) o extremos del way; calcula longitud (Haversine); recorta al término municipal resolviendo el punto medio de cada tramo contra `getDistrictAtCoordinates` (spec 000) — si cae fuera de los 19 distritos, se descarta.
3. `nombreCalle` = tag `name` de OSM tal cual — resolución contra el CDNCV **no implementada todavía** (fuente ya verificada en §2, queda como trabajo futuro explícito, ver §7).
4. Salida: `public/data/red-viaria-rodada.json` (nodos + tramos), versionado en el repo, `versionGrafo` = fecha de generación. Servido por el CDN como estático (v3).

**Resultado real de la última generación (2026-08-25)**: 74.645 elementos OSM → **9.193 nodos, 13.225 tramos** tras recortar al término municipal, cubriendo los 19 distritos, ~1.068 km de red total. Validado cualitativamente: las calles con más tramos son arterias reales conocidas (Circumval·lació de València, Carrer de Sant Vicent Màrtir, Avinguda del Primat Reig, Avinguda de Blasco Ibáñez).

## 5. Contrato de capa de mapa

No es una capa visible por defecto (como spec `019`, es infraestructura). Capa de depuración opcional, **oculta salvo `?debug=grafo` en la URL** (implementada en v4): pinta una flecha por tramo del viewport a partir de zoom de calle (≥ 15), en el sentido canónico origen→destino — azul `▶` unidireccional, gris `◀▶` bidireccional. No forma parte del DoD de cara al usuario final, solo de verificación de esta spec y base visual para el pintado de sentido de specs `021`/`022`. Geometría pura reutilizable en `src/services/flechas-sentido.ts` (`marcadoresSentido`, `anguloDesdeEste`), con tests.

## 6. Criterios de aceptación (Definition of Done)

- [x] Grafo generado con snapshot de fecha fija (`versionGrafo`), documentado en el historial de esta spec — 2026-08-25, 9.193 nodos / 13.225 tramos.
- [x] Endpoint `GET /api/grafo-viario/v1/tramos` sirve el contrato de la sección 3 — verificado con `curl` real contra el dev server, HTTP 200, 9.023.208 bytes, `tramos.length === 13225`.
- [x] Snap de un punto arbitrario al tramo más cercano, verificado con 5 ubicaciones reales conocidas: Plaza del Ayuntamiento → "Plaça de l'Ajuntament" (33m), Ciudad de las Artes y las Ciencias → "Carrer de Ricardo Muñoz Suay" (3m), Estación del Norte → "Carrer d'Alacant" (31m), Mercado Central → "Carrer de les Carabasses" (5m), Torres de Serranos → "Plaça dels Furs" (62m) — las 5 asignaciones son correctas geográficamente. Test en `src/services/red-viaria-indice.test.ts`.
- [x] Fuente CDNCV verificada en vivo (§2) — **resolución `nombreCalle` contra CDNCV no implementada en esta versión**, reportado explícitamente aquí como 0% (no se ocultó ni se simuló): v1 usa el tag `name` de OSM directo. Es un join espacial entre dos segmentaciones independientes (ver §7), tratado como trabajo futuro, no como bloqueante de esta spec.
- [x] `npm run typecheck` y `npm run test` (137/137) sin regresiones.
- [x] **(v4)** Sentido de circulación auditado contra Overpass en vivo y corregido: `junction=roundabout` → `unidireccional` (663 tramos, antes `bidireccional`), `oneway=-1` → `unidireccional` con geometría invertida, `junction=circular` sin cambio. 3 tests nuevos en `red-viaria.test.ts`. Re-seed verificado: 13.233 tramos, 83,7% unidireccional. Capa `?debug=grafo` de flechas + `flechas-sentido.ts` (4 tests). Uno de los 5 snaps del DoD (Torres de Serranos) se relajó a "cualquiera de las 2 calles que se cruzan en esa esquina" — comparten el vértice más cercano, el desempate no es determinista entre regeneraciones. `npm run typecheck` / `npm run test` (238/238) / `npm run build` verdes; flechas verificadas en navegador (render, rotación por sentido, gating por `?debug=grafo`).

## 7. Riesgos y fuera de alcance

- **Riesgo — mantenimiento**: el callejero real cambia (obras, cortes permanentes, nuevas calles); esta spec no incluye una cadencia de regeneración automática, solo manual (`npm run seed:red-viaria`). Si spec `021` u otra consumidora necesita frescura mayor, es una revisión de esta spec, no un parche silencioso.
- **Riesgo — cobertura peatonal**: esta versión solo cubre red rodada; la red peatonal (útil para desalojos) queda fuera de alcance v1, a añadir en una revisión si `021` lo necesita.
- **Tamaño del asset (resuelto en v3)**: `red-viaria-rodada.json` pesa ~9 MB sin comprimir. El primer deploy a Vercel confirmó que como **función edge** superaba el límite de 1 MB (Hobby), y como respuesta de función habría superado el límite de 4,5 MB de body. Solución aplicada (la que ya anticipaba este riesgo): se movió a `public/data/red-viaria-rodada.json` y se sirve como **estático del CDN** (sin límite de tamaño, gzip automático ~1,1 MB). Se eliminó `api/grafo-viario/v1/tramos.ts`. El cliente (`grafo-viario-cliente.ts`) hace `fetch('/data/red-viaria-rodada.json')`.
- **`oneway=-1` con `junction=roundabout` a la vez**: se ignora el `-1` (la rotonda manda, no se invierte) — combinación no observada en el bbox, decisión conservadora documentada en el código.
- **`sentido` sigue sin resolver contra el CDNCV**: el sentido viene del tag `oneway`/`junction` de OSM, no del callejero oficial. Mismo estado que `nombreCalle` — fuente verificada, reconciliación pendiente (§2).
- **Riesgo — consolidación de intersecciones más simple que `osmnx`**: partir un way en cada nodo compartido por ≥2 ways es más simple que `consolidate_intersections()` de osmnx — calzadas duales (avenidas con mediana) quedan como dos tramos unidireccionales paralelos en vez de fusionarse. No es necesariamente peor para un futuro simulador de tráfico (cada calzada tiene flujo independiente real), pero es una diferencia de diseño consciente frente al plan original, no un descuido.
- **Riesgo — resolución CDNCV pendiente**: la fuente está verificada (§2) pero la reconciliación nombre↔grafo (dos segmentaciones independientes de la misma calle, matching por nombre + solape geométrico) es un trabajo real pendiente, no trivial — no se ha forzado una versión frágil solo por completar el DoD.
- **Fuera de alcance**: simulador de tráfico (SUMO/GNN), índice H3 (sustituido por `rbush`, ver §3), colapso de rotondas a nodo compuesto, cualquier dato de densidad — eso pertenece a fases distintas de `docs/investigacion/GEMELO_DIGITAL_SEGURIDAD_PUBLICA_PROPUESTA.md`, no a esta spec.

## 8. Historial

| Versión | Fecha | Cambio |
|---|---|---|
| 1 | 2026-08-25 | Creación, `Draft`. Reserva de infraestructura de grafo separada del motor de cordón (`021`), siguiendo la recomendación de `ADR-001` de separar la pieza reutilizable de la orientada a apoyo policial. |
| 2 | 2026-08-25 | DoD completo: fuente cambiada de Geofabrik+osmium+osmnx a Overpass API+TypeScript (razón explícita en §2); `src/services/red-viaria.ts` (grafo, 11 tests) + `src/services/red-viaria-indice.ts` (índice `rbush`, 9 tests incluyendo las 5 ubicaciones reales del DoD) + `scripts/seed-red-viaria.ts` + `api/grafo-viario/v1/tramos.ts`. Generado y verificado con datos reales: 9.193 nodos, 13.225 tramos, 19 distritos cubiertos. `npm run typecheck` y `npm run test` (137/137) verificados. Spec pasa a `Implemented`. |
| 3 | 2026-08-31 | El primer deploy a Vercel confirmó el riesgo de §7: el grafo (~9 MB) no cabe en una función edge (límite 1 MB Hobby) ni como body de función (límite 4,5 MB). Movido a `public/data/red-viaria-rodada.json`, servido como estático del CDN; `api/grafo-viario/v1/tramos.ts` eliminado; `grafo-viario-cliente.ts` y `scripts/seed-red-viaria.ts` apuntan a la nueva ruta; matcher del middleware excluye `data/`. Tests (paths de fixture) y specs `021`/`022` actualizados. |
| 4 | 2026-08-31 | Paso 1 de la revisión del gemelo digital (specs 021/022). Auditado el sentido de circulación contra Overpass en vivo: `junction=roundabout` sin `oneway` (769 ways / 663 tramos, 4,9% del grafo) caía a `bidireccional` — corregido a `unidireccional` (convención OSM). `oneway=-1` (1 way) ahora invierte la geometría del tramo. `junction=circular` sin cambio (OSM no implica sentido único). Re-seed: 13.233 tramos, 83,7% unidireccional. Nuevo `src/services/flechas-sentido.ts` (marcadores de sentido, 4 tests) + capa de depuración `?debug=grafo` en `main.ts` (flechas por tramo). 3 tests nuevos en `red-viaria.test.ts`; 1 de los 5 snaps del DoD relajado (esquina con dos calles coincidentes). `npm run typecheck` / `test` (238/238) / `build` verdes; verificado en navegador. |
