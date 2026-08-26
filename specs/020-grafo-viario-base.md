# 020 — Grafo viario base (nodos + tramos)

```yaml
id: 020
titulo: "Grafo viario base de Valencia (nodos + tramos) como infraestructura reutilizable"
estado: Implemented
tipo: fundacional
depende_de: [000]
propietario: ""
version: 2
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
  sentido: 'unidireccional' | 'bidireccional'; // añadido sobre el diseño inicial — ya disponible en el tag `oneway` de OSM sin coste extra, útil para cualquier consumidor futuro (routing, simulación)
  nombreCalle: string | null;  // v1: igual a nombreCalleRaw — CDNCV verificado pero resolución nombre↔grafo aún no implementada, ver §2 y §7
  nombreCalleRaw: string | null; // tag `name` original de OSM, solo trazabilidad
  distrito: string | null;     // añadido sobre el diseño inicial — mismo patrón que TramoTrafico (spec 004), útil para filtrar/agregar por distrito
  osmWayId: number;
  versionGrafo: string;
  fuenteGeometria: string;
  confianzaTopologica: 'validadoManual' | 'limpiezaAutomatica'; // v1: siempre 'limpiezaAutomatica', no ha habido pasada de validación manual todavía
}
```

**Índice espacial**: confirmado `rbush` (R-tree sobre bounding boxes), no H3 — H3 estaba pensado para agregar densidad de flujo por celda (Fase 1 de `docs/investigacion/GEMELO_DIGITAL_SEGURIDAD_PUBLICA_PROPUESTA.md`, un problema distinto), mientras que lo que necesita spec `021` es "tramo más cercano a un punto / tramos en un radio", que es exactamente para lo que sirve un R-tree. Implementado en `src/services/red-viaria-indice.ts`, con reintento de radio ampliado si la primera caja de búsqueda no da candidatos.

## 4. Pipeline (seed → caché → endpoint)

| Parámetro | Valor |
|---|---|
| Frecuencia de refresco | Manual — regeneración bajo demanda, no cron |
| TTL en caché | No aplica (artefacto estático versionado, no vive en Redis) |
| Comportamiento si la fuente falla | No aplica en runtime — el fallo posible es en el pipeline offline de generación, no en producción |
| Clave de caché | No aplica |
| Endpoint interno que sirve el dato | `GET /api/grafo-viario/v1/tramos` sirviendo el GeoJSON estático desde `data/grafo-viario/` |

Pasos del pipeline offline real (`npm run seed:red-viaria`, `scripts/seed-red-viaria.ts`):

1. Overpass API, bbox holgado alrededor de Valencia, `highway` en el conjunto rodado (motorway…living_street, excluyendo service/track/driveway).
2. `construirRedViaria()` (`src/services/red-viaria.ts`): parte cada way en tramos en los nodos compartidos por ≥2 ways (intersección real) o extremos del way; calcula longitud (Haversine); recorta al término municipal resolviendo el punto medio de cada tramo contra `getDistrictAtCoordinates` (spec 000) — si cae fuera de los 19 distritos, se descarta.
3. `nombreCalle` = tag `name` de OSM tal cual — resolución contra el CDNCV **no implementada todavía** (fuente ya verificada en §2, queda como trabajo futuro explícito, ver §7).
4. Salida: `data/red-viaria-rodada.json` (nodos + tramos), versionado en el repo, `versionGrafo` = fecha de generación.

**Resultado real de la última generación (2026-08-25)**: 74.645 elementos OSM → **9.193 nodos, 13.225 tramos** tras recortar al término municipal, cubriendo los 19 distritos, ~1.068 km de red total. Validado cualitativamente: las calles con más tramos son arterias reales conocidas (Circumval·lació de València, Carrer de Sant Vicent Màrtir, Avinguda del Primat Reig, Avinguda de Blasco Ibáñez).

## 5. Contrato de capa de mapa

No es una capa visible por defecto (como spec `019`, es infraestructura). Sí conviene una capa de depuración opcional (`grafo-viario-debug`, oculta salvo activación manual) que pinte los tramos para verificar visualmente la limpieza — no forma parte del DoD de cara al usuario final, solo de verificación de esta spec.

## 6. Criterios de aceptación (Definition of Done)

- [x] Grafo generado con snapshot de fecha fija (`versionGrafo`), documentado en el historial de esta spec — 2026-08-25, 9.193 nodos / 13.225 tramos.
- [x] Endpoint `GET /api/grafo-viario/v1/tramos` sirve el contrato de la sección 3 — verificado con `curl` real contra el dev server, HTTP 200, 9.023.208 bytes, `tramos.length === 13225`.
- [x] Snap de un punto arbitrario al tramo más cercano, verificado con 5 ubicaciones reales conocidas: Plaza del Ayuntamiento → "Plaça de l'Ajuntament" (33m), Ciudad de las Artes y las Ciencias → "Carrer de Ricardo Muñoz Suay" (3m), Estación del Norte → "Carrer d'Alacant" (31m), Mercado Central → "Carrer de les Carabasses" (5m), Torres de Serranos → "Plaça dels Furs" (62m) — las 5 asignaciones son correctas geográficamente. Test en `src/services/red-viaria-indice.test.ts`.
- [x] Fuente CDNCV verificada en vivo (§2) — **resolución `nombreCalle` contra CDNCV no implementada en esta versión**, reportado explícitamente aquí como 0% (no se ocultó ni se simuló): v1 usa el tag `name` de OSM directo. Es un join espacial entre dos segmentaciones independientes (ver §7), tratado como trabajo futuro, no como bloqueante de esta spec.
- [x] `npm run typecheck` y `npm run test` (137/137) sin regresiones.

## 7. Riesgos y fuera de alcance

- **Riesgo — mantenimiento**: el callejero real cambia (obras, cortes permanentes, nuevas calles); esta spec no incluye una cadencia de regeneración automática, solo manual (`npm run seed:red-viaria`). Si spec `021` u otra consumidora necesita frescura mayor, es una revisión de esta spec, no un parche silencioso.
- **Riesgo — cobertura peatonal**: esta versión solo cubre red rodada; la red peatonal (útil para desalojos) queda fuera de alcance v1, a añadir en una revisión si `021` lo necesita.
- **Riesgo — tamaño del endpoint**: `data/red-viaria-rodada.json` pesa ~7.7MB sin comprimir, muy por encima de cualquier otro asset estático del proyecto (distritos-valencia.json ~600KB). Funciona en local; **no verificado contra el límite real de tamaño de función edge de Vercel en producción** — si falla ahí, la salida es mover el endpoint a una función Node serverless (límite mayor) o paginar por distrito, no forzar el edge runtime a toda costa. Documentado también como comentario en `api/grafo-viario/v1/tramos.ts`.
- **Riesgo — consolidación de intersecciones más simple que `osmnx`**: partir un way en cada nodo compartido por ≥2 ways es más simple que `consolidate_intersections()` de osmnx — calzadas duales (avenidas con mediana) quedan como dos tramos unidireccionales paralelos en vez de fusionarse. No es necesariamente peor para un futuro simulador de tráfico (cada calzada tiene flujo independiente real), pero es una diferencia de diseño consciente frente al plan original, no un descuido.
- **Riesgo — resolución CDNCV pendiente**: la fuente está verificada (§2) pero la reconciliación nombre↔grafo (dos segmentaciones independientes de la misma calle, matching por nombre + solape geométrico) es un trabajo real pendiente, no trivial — no se ha forzado una versión frágil solo por completar el DoD.
- **Fuera de alcance**: simulador de tráfico (SUMO/GNN), índice H3 (sustituido por `rbush`, ver §3), colapso de rotondas a nodo compuesto, cualquier dato de densidad — eso pertenece a fases distintas de `docs/investigacion/GEMELO_DIGITAL_SEGURIDAD_PUBLICA_PROPUESTA.md`, no a esta spec.

## 8. Historial

| Versión | Fecha | Cambio |
|---|---|---|
| 1 | 2026-08-25 | Creación, `Draft`. Reserva de infraestructura de grafo separada del motor de cordón (`021`), siguiendo la recomendación de `ADR-001` de separar la pieza reutilizable de la orientada a apoyo policial. |
| 2 | 2026-08-25 | DoD completo: fuente cambiada de Geofabrik+osmium+osmnx a Overpass API+TypeScript (razón explícita en §2); `src/services/red-viaria.ts` (grafo, 11 tests) + `src/services/red-viaria-indice.ts` (índice `rbush`, 9 tests incluyendo las 5 ubicaciones reales del DoD) + `scripts/seed-red-viaria.ts` + `api/grafo-viario/v1/tramos.ts`. Generado y verificado con datos reales: 9.193 nodos, 13.225 tramos, 19 distritos cubiertos. `npm run typecheck` y `npm run test` (137/137) verificados. Spec pasa a `Implemented`. |
