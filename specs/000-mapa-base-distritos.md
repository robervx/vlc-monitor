# 000 — Mapa base + geometría de distritos de Valencia

```yaml
id: 000
titulo: "Mapa base + geometría de distritos/barrios de Valencia"
estado: Implemented
tipo: fundacional
depende_de: []
propietario: ""
version: 3
```

## 1. Problema / motivación

Antes de poder pintar ninguna capa (tráfico, meteo, calidad del aire...) necesitamos: (a) un mapa base navegable centrado en Valencia, y (b) la geometría oficial de distritos y barrios para poder agregar cualquier dato futuro "por zona" (choropleth) y para resolver point-in-polygon (a qué distrito pertenece un punto de tráfico, una estación Valenbisi, etc.). Es la dependencia de la que cuelgan todas las demás specs — equivalente al `country-geometry.ts` de World Monitor, pero a escala de ciudad.

## 2. Fuente(s) de datos

| Fuente | URL | Licencia / condiciones | ¿Requiere API key? | Verificada manualmente el ___ |
|---|---|---|---|---|
| Geometría de distritos (19) | ~~Portal OpendataSoft (`valencia.opendatasoft.com`)~~ **descartado — el tenant ya no existe** (404 "This domain could not be found"). Fuente real: Geoportal ArcGIS del Ayuntamiento — `https://geoportal.valencia.es/server/rest/services/OPENDATA/UrbanismoEInfraestructuras/MapServer/225/query?where=1=1&outFields=*&f=geojson` | Datos públicos, CC BY 4.0 (catálogo asociado: `opendata.vlci.valencia.es/en/dataset/districtes-distritos`) | No | **Verificada 2026-08-18** — llamada real hecha con `curl`, HTTP 200, GeoJSON válido, 22 features / **19 códigos de distrito únicos** (el distrito 17, "Poblats del Nord", llega partido en 4 polígonos disjuntos — pedanías separadas — hay que fusionarlos en un `MultiPolygon` por `coddistrit` al normalizar). Campos reales: `objectid`, `nombre` (mayúsculas), `coddistrit` (string "1".."19", sin cero a la izquierda), `gis.gis.DISTRITOS.area`. Geometría en WGS84 (lon/lat), sin necesidad de reproyección. |
| Geometría de barrios (~88) | Localizada y verificada, **pero fuera de alcance de esta spec** (v1 trabaja solo a nivel distrito) — mismo Geoportal ArcGIS, capa `MapServer/224` — `https://geoportal.valencia.es/server/rest/services/OPENDATA/UrbanismoEInfraestructuras/MapServer/224/query?where=1=1&outFields=*&f=geojson` | Pública, CC BY 4.0 | No | **Verificada 2026-08-18** (solo existencia y formato) — HTTP 200, 88 features, campos `codbarrio`, `coddistbar`, `coddistrit`, `nombre`. Cubre los 19 distritos. Se pospone su ingesta a una spec futura (`001b-geometria-barrios`, aún no creada) — ver DoD §6 y decisión en Historial. |
| Mapa base (tiles) | OpenFreeMap (`tiles.openfreemap.org`), estilo `liberty` | Gratuito, sin key | No | **Verificada 2026-08-18** — usada en la implementación (ver `src/main.ts`). |

**Corrección importante sobre la investigación previa (`docs/investigacion/WORLDMONITOR_TEARDOWN_VLC_PROPUESTA.md` §5):** el dataset OpendataSoft que se daba por candidato principal ya no está accesible bajo ese dominio. La fuente real y funcional para geometría administrativa de Valencia es el Geoportal ArcGIS municipal (`geoportal.valencia.es`), catalogado también (con enlaces a los mismos endpoints ArcGIS) en `opendata.vlci.valencia.es` (portal CKAN). Cualquier spec futura que necesite otra capa GIS municipal (aparcamiento, censo, etc.) debería mirar primero ahí, no en OpendataSoft.

## 3. Contrato de datos (normalizado)

```typescript
interface Distrito {
  codigo: string;        // código oficial municipal, "01" a "19" — normalizado con
                          // cero a la izquierda; la fuente lo sirve sin padding ("1".."19")
  nombre: string;        // ej. "Ciutat Vella" — normalizado a Title Case; la fuente lo sirve en mayúsculas
  geometry: GeoJSON.Polygon | GeoJSON.MultiPolygon; // MultiPolygon cuando el distrito
                          // llega partido en polígonos disjuntos en origen (caso real: distrito 17)
  centroide: [number, number]; // [lon, lat]
  bbox: [number, number, number, number]; // [minLon, minLat, maxLon, maxLat]
  barrios: string[];     // vacío en v1 — geometría de barrios verificada pero pospuesta, ver §2
  fetchedAt: string;     // ISO 8601
  source: 'ajuntament-valencia-geoportal';
}
```

## 4. Pipeline (seed → caché → endpoint)

| Parámetro | Valor |
|---|---|
| Frecuencia de refresco (cron) | Baja — geometría administrativa cambia rarísima vez. Diaria o semanal es más que suficiente (a diferencia de las capas de datos en vivo). |
| TTL en caché | 24h en caché rápida; el GeoJSON base también se sirve como asset estático versionado en el propio repo/CDN, igual que World Monitor sirve `countries.geojson` desde su CDN — no depende de que la fuente esté viva en cada carga. |
| Comportamiento si la fuente falla | Servir el último GeoJSON descargado y versionado en el repo (nunca dejar el mapa sin distritos por un fallo puntual de la fuente). |
| Clave de caché | `geo:distritos-valencia:v1` |
| Endpoint interno que sirve el dato | `GET /api/geo/v1/distritos` |

## 5. Contrato de capa de mapa

```typescript
{
  key: 'distritos',
  renderers: ['deck'],        // MapLibre + deck.gl (GeoJsonLayer) — sin globo 3D, ver justificación en 01_VIABILIDAD_VISION_Y_PROCESO.md
  zoomMinimo: 0,                // visible desde vista de ciudad completa
  agregacion: 'choropleth-distrito',
  icono: '',
}
```

Servicio de geometría (equivalente a `country-geometry.ts` de World Monitor, a escala ciudad):

- `preloadDistrictGeometry()` — precarga al arrancar la app.
- `getDistrictAtCoordinates(lat, lon)` — point-in-polygon, usado por todas las capas futuras para etiquetar cada evento con su distrito.
- `getDistrictCentroid(codigo)`, `getDistrictBbox(codigo)` — para navegación ("ir a Benimaclet").
- `nameToDistrictCode(texto)` — resolución de nombre libre a código, para búsqueda.

## 6. Criterios de aceptación (Definition of Done)

- [x] GeoJSON de los 19 distritos descargado, verificado visualmente (contornos correctos, sin huecos) y versionado en el repo (`data/distritos-valencia.json`, generado por `npm run seed:distritos`).
- [x] Geometría de barrios localizada y decisión tomada: posponer a una spec `001b-geometria-barrios` (ver §7).
- [x] Endpoint `GET /api/geo/v1/distritos` sirve el GeoJSON con el contrato de la sección 3 (`api/geo/v1/distritos.ts`, verificado con `curl` contra `npm run dev`).
- [x] Mapa base renderiza con OpenFreeMap y los 19 distritos se pueden resaltar al hacer hover/click (`src/main.ts`, verificado visualmente en navegador).
- [x] `getDistrictAtCoordinates()` probado con al menos 5 coordenadas conocidas (Ciutat de les Arts, Mercado Central, Malvarrosa, Torres de Serranos, Bioparc) y resuelve el distrito correcto — `src/services/district-geometry.test.ts`, `npm run test`.
- [x] Estado del mapa (centro/zoom/distrito seleccionado) codificado en la URL, siguiendo el patrón `?view=&zoom=&distrito=` de World Monitor — verificado round-trip (seleccionar distrito → URL se actualiza → recargar esa URL restaura centro y selección).

## 7. Riesgos y fuera de alcance

- **Riesgo (resuelto):** el portal OpendataSoft (`valencia.opendatasoft.com`) dado por candidato en la investigación previa ya no existe (dominio no encontrado) — sustituido por Geoportal ArcGIS, verificado con llamada real el 2026-08-18 (ver §2).
- **Riesgo:** el Geoportal es un servicio ArcGIS Server municipal sin SLA público documentado; si cae, el mapa sigue funcionando porque el endpoint interno sirve el asset versionado en el repo, no la fuente en caliente (ver §4). El seed debe re-ejecutarse manualmente/por cron para refrescar, no en cada carga.
- **Decisión tomada — barrios:** geometría localizada y verificada (Geoportal, capa `MapServer/224`, 88 barrios), pero se pospone su ingesta y su servicio de resolución a una spec futura (`001b-geometria-barrios`, aún sin crear) para no ampliar el alcance de esta spec fundacional. `Distrito.barrios` queda `[]` en v1.
- **Fuera de alcance de esta spec:** cualquier dato que no sea geometría pura (tráfico, población, etc. van en specs propias que referencian esta); geometría de barrios (ver decisión anterior).

## 8. Historial

| Versión | Fecha | Cambio |
|---|---|---|
| 1 | 2026-08-17 | Creación |
| 2 | 2026-08-18 | Fuente verificada con llamada real: OpendataSoft descartado (dominio caído), sustituido por Geoportal ArcGIS (`geoportal.valencia.es`, capas 225/224). Decisión tomada de posponer barrios a spec futura. Implementación del DoD en curso. |
| 3 | 2026-08-18 | DoD completo: seed (`scripts/seed-distritos.mjs`), endpoint (`api/geo/v1/distritos.ts`), servicio de geometría con point-in-polygon (`src/services/district-geometry.ts` + tests), capa registrada (`src/config/map-layer-definitions.ts`), mapa base con hover/click y estado en URL (`src/main.ts`). Verificado con `npm run typecheck`, `npm run test`, `npm run build` y en navegador. Spec pasa a `Implemented`. |
| 4 | 2026-08-26 | La ingesta de barrios pospuesta en §2/§7 (referida ahí como spec futura `001b-geometria-barrios`, nunca creada con ese id) queda recogida por la spec [023](023-geolocalizacion-contexto-mediatico.md) — usa la misma fuente (`MapServer/224`, re-verificada), pero solo ingiere `nombre`+`coddistrit` (no la geometría de barrio) porque su caso de uso es matching de texto, no point-in-polygon a nivel barrio. `Distrito.barrios` pasa de `string[]` a `BarrioInfo[]` (ver contrato de datos de la spec 023) para poder llevar alias y marca de ambigüedad — cambio de tipo, no de fuente ni de geometría de distrito. Point-in-polygon a nivel barrio sigue sin implementarse; sigue siendo una spec futura si hace falta. |
