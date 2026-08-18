# 008 — Agenda y aglomeraciones previsibles: Fallas

```yaml
id: 008
titulo: "Agenda y aglomeraciones previsibles — v1 acotada a Fallas"
estado: Implemented
tipo: capa
depende_de: [000]
propietario: ""
version: 2
```

## 1. Problema / motivación

¿Dónde va a haber aglomeración previsible en Valencia? `ROADMAP.md` (F3.5) la define como "el mejor predictor legal de aglomeraciones" — eventos culturales, calendario deportivo, ferias. Fallas es, con diferencia, el evento de mayor aglomeración de la ciudad (~15-19 de marzo, más la previa), y es el único con datos públicos estructurados y fiables encontrados en esta sesión — ver §2. El resto de "agenda general" (conciertos, teatro, calendario deportivo de LaLiga) queda fuera de v1, documentado como fast-follow, decisión explícita del usuario 2026-08-18.

## 2. Fuente(s) de datos

**Investigación exhaustiva de "agenda cultural general" sin resultado limpio** (verificado 2026-08-18):
- Catálogo VLCi (`opendata.vlci.valencia.es`): sin dataset de agenda/eventos con ese nombre.
- Página oficial de agenda (`valencia.es/cas/agenda-de-la-ciudad`, `cultural.valencia.es`): HTML renderizado en servidor, sin API/JSON/RSS visible.
- Capas del Geoportal que parecían candidatas (`Festejos`, `Mudances`, `Itineraris Reservats`, bajo `OPENDATA/Trafico`): existen en el esquema pero **0 registros** en vivo — no fiables como fuente.
- Calendario deportivo (LaLiga/Valencia CF/Levante UD): no se encontró API pública documentada; no se inventa una URL sin verificar.

**Decisión del usuario (2026-08-18):** implementar ya la parte de Fallas al completo (monumentos, carpas, cortes de tráfico) como pieza vistosa del producto; el scraping de la agenda general queda como paso siguiente, no en esta versión — ver §7.

| Fuente | URL | Formato | Verificada manualmente el ___ |
|---|---|---|---|
| Monumentos falleros (adultos) | `https://geoportal.valencia.es/server/rest/services/OPENDATA/Turismo/MapServer/215/query?where=1=1&outFields=*&f=geojson` | Point | **2026-08-18** — HTTP 200, **351 monumentos**, campos `id_falla`, `nombre`, `seccion`, `fallera`, `presidente`, `artista`, `lema`, `anyo_fundacion`, `distintivo` (premio), `boceto` (URL de imagen). |
| Monumentos falleros infantiles | `https://geoportal.valencia.es/server/rest/services/OPENDATA/Turismo/MapServer/0/query?where=1=1&outFields=*&f=geojson` | Point | **2026-08-18** — HTTP 200, **351 monumentos**, mismos campos que el anterior. |
| Carpas de Fallas | `https://geoportal.valencia.es/server/rest/services/OPENDATA/Turismo/MapServer/205/query?where=1=1&outFields=*&f=geojson` | Polygon | **2026-08-18** — HTTP 200, **462 carpas**, solo `id_falla` + metadatos de edición (sin nombre propio — se enriquece cruzando con el monumento del mismo `id_falla`, ver §3). |
| Zonas de movilidad reducida (cortes) | `https://geoportal.valencia.es/server/rest/services/OPENDATA/Turismo/MapServer/222/query?where=1=1&outFields=*&f=geojson` | Polygon | **2026-08-18** — HTTP 200, **2 zonas** ahora mismo (ej. "Mascletà"), campo `descripcion`. Crece según se acerca la fecha — ver §7. |

**Nota sobre los enlaces "oficiales" del catálogo CKAN:** el catálogo VLCi enlaza además a ficheros estáticos (`geoportal.valencia.es/apps/OpenData/Turismo/fallas_*.json`) para carpas y zonas de movilidad reducida — **verificados y descartados, devuelven HTTP 404** (el propio catálogo los marca como "información no actualizada"). Las capas ArcGIS de arriba son las que funcionan de verdad; mismo aprendizaje que specs 000/004/006: el catálogo CKAN no es fiable al 100%, hay que verificar contra el Geoportar directamente.

## 3. Contrato de datos (normalizado)

```typescript
interface MonumentoFalla {
  id: string;              // id_falla
  nombre: string;
  seccion: string;
  esInfantil: boolean;
  lat: number;
  lon: number;
  fallera: string | null;
  presidente: string | null;
  artista: string | null;
  lema: string | null;
  anyoFundacion: number | null;
  distintivo: string | null;  // premio/categoría, ej. "Brillants (1991)"
  bocetoUrl: string | null;
  observedAt: string;
  fetchedAt: string;
  source: 'ajuntament-valencia-geoportal';
}

interface CarpaFalla {
  id: string;               // objectid
  idFalla: string | null;
  nombreFalla: string | null; // enriquecido cruzando con MonumentoFalla.id por idFalla, ver §4
  geometry: GeoJSON.Polygon | GeoJSON.MultiPolygon;
  observedAt: string;
  fetchedAt: string;
  source: 'ajuntament-valencia-geoportal';
}

interface ZonaMovilidadReducida {
  id: string;                // gid
  descripcion: string;
  geometry: GeoJSON.Polygon | GeoJSON.MultiPolygon;
  observedAt: string;
  fetchedAt: string;
  source: 'ajuntament-valencia-geoportal';
}
```

## 4. Pipeline (seed → caché → endpoint)

| Parámetro | Valor |
|---|---|
| Frecuencia de refresco (cron) | Dato casi estático fuera de la ventana de Fallas (los comités registran meses antes) — 6h es más que suficiente, a diferencia de tráfico/Valenbisi. |
| TTL en caché | 6h (21 600 000 ms). |
| Comportamiento si la fuente falla | Stale-on-error, mismo patrón que specs anteriores — reutiliza `getOrFetch()` sin cambios. |
| Clave de caché | `fallas:valencia-actual:v1` |
| Endpoint interno que sirve el dato | `GET /api/fallas/v1/actual` — combina las 4 llamadas (monumentos, infantiles, carpas, zonas) en una única respuesta; `nombreFalla` de cada carpa se resuelve en memoria cruzando `idFalla` contra los monumentos ya obtenidos en la misma petición, sin llamada adicional. |

## 5. Contrato de capa de mapa

```typescript
{
  key: 'fallas',
  specId: '008',
  renderers: ['deck'],
  zoomMinimo: 0,
  agregacion: 'punto',   // representación primaria (monumentos); carpas y zonas se renderizan como capas de apoyo bajo el mismo toggle
  icono: '',
}
```

Un único toggle "Fallas" activa las tres sub-capas a la vez (monumentos + infantiles como puntos con icono de falla, carpas y zonas de movilidad reducida como polígonos semitransparentes) — es una pieza temática única, no capas independientes.

## 6. Criterios de aceptación (Definition of Done)

- [x] Fuente probada con al menos una llamada real para cada uno de los 4 recursos (`curl` — ver §2 — y en producción vía `GET /api/fallas/v1/actual`: 689 monumentos, 462 carpas, 2 zonas).
- [x] Endpoint `GET /api/fallas/v1/actual` responde con el contrato de la sección 3, incluyendo el enriquecimiento de `nombreFalla` en las carpas (459/462 resueltas en el snapshot de verificación).
- [x] Caché con TTL de 6h y comportamiento stale-on-error verificados — reutiliza `getOrFetch()`; normalización probada en `src/services/fallas.test.ts` (4 tests, incluye filas vacías y el cruce por `idFalla`) y el endpoint en `api/fallas/v1/actual.test.ts`.
- [x] Capa visible y legible en el mapa (monumentos como puntos dorados, zona de movilidad reducida como superposición), activable con un único toggle "Fallas" — verificado visualmente en navegador, concentración correcta en Ciutat Vella.
- [x] Atribución de fuente ("Ajuntament de València") y frescura visibles en la UI mientras la capa está activa — leyenda con conteo de los 4 recursos.
- [x] La spec documenta explícitamente el fast-follow de "agenda general" (scraping) como pendiente, no bloquea este DoD (§7).

## 7. Riesgos y fuera de alcance

- **Riesgo (aceptado):** las "zonas de movilidad reducida" solo tienen 2 registros fuera de temporada — la capa mostrará poco contenido la mayor parte del año hasta que el Ayuntamiento actualice el dataset cerca de marzo. Es el dato real, no un bug — la UI debe mostrarlo tal cual, sin inventar cortes que no existen todavía.
- **Riesgo:** las carpas no traen nombre propio en origen — el enriquecimiento por `idFalla` asume que ambos datasets usan el mismo identificador de forma consistente; si algún `idFalla` de carpa no tiene monumento correspondiente, `nombreFalla` queda `null` (no se rompe, se degrada).
- **Fuera de alcance de esta spec (fast-follow explícito, decisión del usuario 2026-08-18):** scraping de la agenda oficial (`valencia.es/cas/agenda-de-la-ciudad` / `cultural.valencia.es`) para eventos generales en tiempo real — necesita su propio diseño (resiliencia ante cambios de HTML, límites de frecuencia, aviso claro en la UI de que es un dato scrapeado y no una API oficial). Se abordará en una versión futura de esta misma spec, no como spec nueva.
- **Fuera de alcance:** calendario deportivo (sin fuente pública verificada), cualquier otro evento no-Fallas.

## 8. Historial

| Versión | Fecha | Cambio |
|---|---|---|
| 1 | 2026-08-18 | Creación. Investigación exhaustiva de agenda general sin fuente limpia (ver §2) — decisión explícita del usuario de acotar v1 a Fallas (4 fuentes reales verificadas) y dejar el scraping de agenda general como fast-follow. |
| 2 | 2026-08-18 | DoD completo: servicio de normalización con enriquecimiento cruzado (`src/services/fallas.ts`), endpoint (`api/fallas/v1/actual.ts`), capa registrada, toggle único + 3 sub-capas (monumentos/carpas/zonas) + leyenda en el mapa (`src/main.ts`). Verificado con `npm run typecheck`, `npm run test` y en navegador. Spec pasa a `Implemented`. |
