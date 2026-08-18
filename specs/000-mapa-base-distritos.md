# 000 — Mapa base + geometría de distritos de Valencia

```yaml
id: 000
titulo: "Mapa base + geometría de distritos/barrios de Valencia"
estado: Draft
tipo: fundacional
depende_de: []
propietario: ""
version: 1
```

## 1. Problema / motivación

Antes de poder pintar ninguna capa (tráfico, meteo, calidad del aire...) necesitamos: (a) un mapa base navegable centrado en Valencia, y (b) la geometría oficial de distritos y barrios para poder agregar cualquier dato futuro "por zona" (choropleth) y para resolver point-in-polygon (a qué distrito pertenece un punto de tráfico, una estación Valenbisi, etc.). Es la dependencia de la que cuelgan todas las demás specs — equivalente al `country-geometry.ts` de World Monitor, pero a escala de ciudad.

## 2. Fuente(s) de datos

| Fuente | URL | Licencia / condiciones | ¿Requiere API key? | Verificada manualmente el ___ |
|---|---|---|---|---|
| Geometría de distritos (19) | Dataset `districtes-distritos`, portal OpendataSoft del Ayuntamiento — https://valencia.opendatasoft.com/explore/dataset/districtes-distritos/ | Datos públicos, reutilización libre | No (API pública OpendataSoft) | **Pendiente** — confirmar formato exacto de respuesta y campos (código de distrito, nombre, geometría) |
| Geometría de barrios (~87) | A localizar — candidatos: mismo portal OpendataSoft, Geoportal ArcGIS (`geoportal.valencia.es`), o Dades Obertes GVA | Pública | Probable que no | **Pendiente** |
| Mapa base (tiles) | OpenFreeMap (`tiles.openfreemap.org`) como primaria; CARTO como alternativa | Gratuito, sin key | No | Pendiente de integración |

**Fuente primaria de distritos confirmada por nombre de dataset; el resto queda marcado como pendiente de verificación manual — no se ha podido completar la llamada real a la API en esta sesión por restricciones de acceso automatizado al portal.**

## 3. Contrato de datos (normalizado)

```typescript
interface Distrito {
  codigo: string;        // código oficial municipal, ej. "01" a "19"
  nombre: string;        // ej. "Ciutat Vella"
  geometry: GeoJSON.Polygon | GeoJSON.MultiPolygon;
  centroide: [number, number]; // [lon, lat]
  bbox: [number, number, number, number]; // [minLon, minLat, maxLon, maxLat]
  barrios: string[];     // códigos de barrio contenidos, si se resuelve en esta spec
  fetchedAt: string;     // ISO 8601
  source: 'ajuntament-valencia-opendatasoft';
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

- [ ] GeoJSON de los 19 distritos descargado, verificado visualmente (contornos correctos, sin huecos) y versionado en el repo.
- [ ] Geometría de barrios localizada y decisión tomada: incluir en v1 o posponer a una spec `001b-geometria-barrios`.
- [ ] Endpoint `GET /api/geo/v1/distritos` sirve el GeoJSON con el contrato de la sección 3.
- [ ] Mapa base renderiza con OpenFreeMap y los 19 distritos se pueden resaltar al hacer hover/click.
- [ ] `getDistrictAtCoordinates()` probado con al menos 5 coordenadas conocidas (ej. Ciutat de les Arts, Mercado Central, Malvarrosa) y resuelve el distrito correcto.
- [ ] Estado del mapa (centro/zoom/distrito seleccionado) codificado en la URL, siguiendo el patrón `?view=&zoom=&distrito=` de World Monitor.

## 7. Riesgos y fuera de alcance

- **Riesgo:** el portal OpendataSoft bloqueó el acceso automatizado durante la investigación previa (403/robots.txt) — hay que confirmar manualmente el endpoint exacto y si requiere cabeceras específicas antes de dar esta spec por implementable.
- **Riesgo:** la geometría de barrios puede no estar tan claramente publicada como la de distritos; si no se localiza una fuente fiable, la v1 del producto trabaja solo a nivel distrito (19 zonas) y se pospone barrio a una fase posterior.
- **Fuera de alcance de esta spec:** cualquier dato que no sea geometría pura (tráfico, población, etc. van en specs propias que referencian esta).

## 8. Historial

| Versión | Fecha | Cambio |
|---|---|---|
| 1 | 2026-08-17 | Creación |
