# 004 — Capa de tráfico en tiempo real

```yaml
id: 004
titulo: "Capa de estado del tráfico en tiempo real"
estado: Implemented
tipo: capa
depende_de: [000]
propietario: ""
version: 2
```

## 1. Problema / motivación

¿Por dónde está el tráfico fluido y por dónde cortado o congestionado ahora mismo en Valencia? Tercera y última capa del MVP (F1) — primera capa "por tramo de calle" del producto (a diferencia de meteo/aire, que son un único punto ciudad, y de distritos, que es choropleth).

## 2. Fuente(s) de datos

| Fuente | URL | Licencia / condiciones | ¿Requiere API key? | Verificada manualmente el ___ |
|---|---|---|---|---|
| Geoportal ArcGIS del Ayuntamiento (primaria) | `https://geoportal.valencia.es/server/rest/services/OPENDATA/Trafico/MapServer/192/query?where=1=1&outFields=*&f=geojson` | Pública, CC BY 4.0 (catálogo asociado: `opendata.vlci.valencia.es/en/dataset/estat-transit-temps-real-estado-trafico-tiempo-real`) | No | **Verificada 2026-08-18** — `curl` real, HTTP 200, GeoJSON válido, 446 features. Campos reales: `gid`, `idtramo`, `denominacion`, `estado` (0-9), `fiwareid`. **~8% de las filas (34/446) llegan con `geometry`/`idtramo`/`denominacion` a `null`** (filas vacías del ArcGIS Server) — se descartan al normalizar, quedan **412 tramos útiles**. El propio catálogo documenta que se actualiza cada 3 minutos. |

**Nota:** el dataset equivalente en el portal OpendataSoft (`estat-transit-temps-real`, citado en la investigación previa `docs/investigacion/WORLDMONITOR_TEARDOWN_VLC_PROPUESTA.md` §5) no es accesible — ese dominio está descartado desde la spec 000. Mismo patrón que distritos: la fuente real es el Geoportal ArcGIS, no OpendataSoft.

**Códigos de `estado`** (documentados por el catálogo VLCi): `0` fluido, `1` denso, `2` congestionado, `3` cortado, `4` sin datos, `5-9` mismos estados pero en paso inferior/túnel (`5`=fluido, `6`=denso, `7`=congestionado, `8`=cortado, `9`=sin datos). En el snapshot de verificación solo se observaron `0` (404 tramos), `3` (7 tramos) y `null` (35 tramos, tratado como "sin datos" igual que `4`).

## 3. Contrato de datos (normalizado)

```typescript
interface TramoTrafico {
  id: string;                 // idtramo
  nombre: string;              // denominacion
  geometry: GeoJSON.LineString | GeoJSON.MultiLineString;
  estadoCodigo: number | null; // código crudo de origen (0-9 o null)
  estado: 'fluido' | 'denso' | 'congestionado' | 'cortado' | 'sin-datos';
  esPasoInferior: boolean;     // true si estadoCodigo >= 5
  distrito: string | null;     // resuelto con getDistrictAtCoordinates (spec 000) sobre el punto medio del tramo
  observedAt: string;
  fetchedAt: string;
  source: 'ajuntament-valencia-geoportal';
}
```

## 4. Pipeline (seed → caché → endpoint)

| Parámetro | Valor |
|---|---|
| Frecuencia de refresco (cron) | La fuente se actualiza cada 3 min — no tiene sentido pedirla más a menudo. |
| TTL en caché | 3 min (180 000 ms), igual que la cadencia real de la fuente. |
| Comportamiento si la fuente falla | Stale-on-error, mismo patrón que specs 001/002 — reutiliza `getOrFetch()` de `api/_shared/cache.ts` sin cambios. |
| Clave de caché | `trafico:valencia-estado:v1` |
| Endpoint interno que sirve el dato | `GET /api/trafico/v1/estado` |

## 5. Contrato de capa de mapa

```typescript
{
  key: 'trafico',
  specId: '004',
  renderers: ['deck'],
  zoomMinimo: 0,
  agregacion: 'linea',   // nuevo valor del enum — 446 tramos de calle, no encaja en punto/choropleth/cluster; ver LayerDefinition en map-layer-definitions.ts
  icono: '',
}
```

Color por `estado`: fluido verde, denso amarillo, congestionado naranja, cortado rojo oscuro, sin-datos gris. Capa activable/desactivable (no siempre visible, a diferencia de distritos) — igual patrón de toggle que la capa mock de la spec 003, pero sin badge "MOCK" porque el dato es real.

## 6. Criterios de aceptación (Definition of Done)

- [x] Fuente probada con al menos una llamada real (`curl` — ver §2 — y en producción vía `GET /api/trafico/v1/estado` contra el dev server: 412 tramos, 404 fluido / 7 cortado / 1 sin-datos en el snapshot de verificación).
- [x] Endpoint `GET /api/trafico/v1/estado` responde con el contrato de la sección 3, incluyendo resolución de distrito por tramo (406/412 resueltos en el snapshot — el resto cae fuera de todos los polígonos de distrito, aceptable, campo es `string | null`).
- [x] Caché con TTL de 3 min y comportamiento stale-on-error verificados — reutiliza `getOrFetch()` (ya probado en `api/_shared/cache.test.ts`); normalización probada en `src/services/trafico.test.ts` (incluye el caso de filas con `geometry: null`) y el endpoint en `api/trafico/v1/estado.test.ts`.
- [x] Capa visible y legible en el mapa (tramos coloreados por estado: verde fluido, rojo cortado), activable con un toggle "Tráfico en tiempo real" — verificado visualmente en navegador.
- [x] Atribución de fuente ("Ajuntament de València") y frescura visibles en la UI mientras la capa está activa — leyenda con conteos por estado + "actualizado hace N min".

## 7. Riesgos y fuera de alcance

- **Riesgo:** significado exacto de los códigos `5-9` (variantes de paso inferior) inferido de la descripción del catálogo, no de documentación oficial exhaustiva — si en producción aparecen códigos con un patrón distinto al esperado, revisar `estadoCodigo % 5` en la normalización.
- **Riesgo:** 446 tramos por petición es manejable pero hay que vigilar que renderizarlos con deck.gl no degrade el rendimiento en dispositivos modestos — si ocurre, considerar simplificar geometría o filtrar por zoom mínimo más alto en una iteración futura.
- **Fuera de alcance de esta spec:** incidencias/obras (dataset distinto), cámaras de tráfico, intensidad histórica, predicción — todos ellos datasets ya localizados en el mismo catálogo VLCi pero no cubiertos aquí.

## 8. Historial

| Versión | Fecha | Cambio |
|---|---|---|
| 1 | 2026-08-18 | Creación con fuente verificada (Geoportal ArcGIS, capa Trafico/MapServer/192). |
| 2 | 2026-08-18 | DoD completo: servicio de normalización con filtrado de filas vacías (`src/services/trafico.ts`), endpoint con resolución de distrito server-side (`api/trafico/v1/estado.ts`), nuevo valor `'linea'` en `LayerDefinition.agregacion`, capa registrada, toggle + leyenda + capa deck.gl en el mapa (`src/main.ts`). Extraído `distritosFromGeoJSON()` a `district-geometry.ts` para reutilizar la carga de distritos sin `fetch` relativo en endpoints edge. Verificado con `npm run typecheck`, `npm run test` y en navegador. Spec pasa a `Implemented`. |
