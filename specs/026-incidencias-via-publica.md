# 026 — Incidencias oficiales de vía pública (obras, cortes, festejos)

```yaml
id: 026
titulo: "Incidencias oficiales de vía pública — obras, cortes puntuales y festejos"
estado: Implemented
tipo: capa
depende_de: [000]
propietario: ""
version: 2
```

## 1. Problema / motivación

¿Por qué está una calle concreta afectada ahora mismo? La spec [008](008-agenda-aglomeraciones-fallas.md) solo cubre Fallas; para el resto del año no había ninguna capa de "por qué está cortada/ocupada esta calle". Investigando la petición del usuario de cubrir "cortes de calle" del Ayuntamiento se localizó una fuente oficial no explorada antes por ninguna spec: la capa de "Ocupación de vía pública" del Geoportal, con permisos activos de obras, incidencias y festejos, geolocalizados con coordenada exacta (no solo nombre de calle).

## 2. Fuente(s) de datos

| Fuente | URL | Licencia / condiciones | ¿Requiere API key? | Verificada manualmente el ___ |
|---|---|---|---|---|
| Ocupación de vía pública | `https://geoportal.valencia.es/server/rest/services/OPENDATA/Trafico/MapServer/209/query?where=1=1&outFields=*&f=geojson` | Datos públicos del Geoportal municipal, mismo proveedor que specs 000/004/006/008 | No | **Verificada 2026-08-26** — `curl` real, HTTP 200, **499 registros activos**, geometría `Point` con coordenadas reales (WGS84). Campos: `id_incidencia`, `desc_incidencia`, `tipo_incidencia` (3 valores confirmados: `OBRAS`, `INCIDENCIAS`, `FESTEJOS`), `desc_calle`, `tipo_afectacion`, `fecha_inicio`/`fecha_fin` (epoch ms). |

**Nota de alcance descartada:** la capa "Obras" (`MapServer/235`, 226 registros) se evaluó como fuente alternativa/complementaria — se descarta por ser redundante con esta (mismo tipo de dato, menos campos útiles: sin `desc_calle` ni categoría).

**Sobre las fechas:** `fecha_inicio`/`fecha_fin` son la **vigencia del permiso administrativo**, no necesariamente la duración real de la obra/corte en la calle — algunos permisos tienen vigencias de hasta 2 años. Esto se comunica explícitamente en la UI (ver §6), no se presenta como "corte activo ahora mismo" sin matizar.

## 3. Contrato de datos (normalizado)

```typescript
interface IncidenciaViaPublica {
  id: string;                  // id_incidencia
  descripcion: string;          // desc_incidencia
  tipo: 'obras' | 'incidencias' | 'festejos';
  calle: string;                 // desc_calle
  afectacion: string;             // tipo_afectacion, ej. "ACERA Y ZONA ESTACIONAMIENTO"
  lat: number;
  lon: number;
  distritoCodigo: string | null;   // resuelto con point-in-polygon (spec 000), null si cae fuera de los 19 distritos (pedanías límite)
  vigenciaDesde: string;            // ISO 8601
  vigenciaHasta: string;             // ISO 8601 — vigencia del permiso, no duración real de la obra (ver §2)
  fetchedAt: string;
  source: 'ajuntament-valencia-geoportal';
}
```

## 4. Pipeline (seed → caché → endpoint)

| Parámetro | Valor |
|---|---|
| Frecuencia de refresco (cron) | 1h — cambia con la frecuencia de un trámite administrativo, no en tiempo real; más frecuente que Fallas (spec 008, 6h) porque el volumen (499) y la rotación de altas/bajas es mayor. |
| TTL en caché | 1h (3 600 000 ms). |
| Comportamiento si la fuente falla | Stale-on-error — reutiliza `getOrFetch()`, mismo patrón que specs anteriores. |
| Clave de caché | `via-publica:incidencias-valencia:v1` |
| Endpoint interno que sirve el dato | `GET /api/via-publica/v1/incidencias` — filtra en servidor las que ya expiraron (`vigenciaHasta < ahora`), solo sirve activas. |

## 5. Contrato de capa de mapa

```typescript
{
  key: 'incidenciasViaPublica',
  specId: '026',
  renderers: ['deck'],
  zoomMinimo: 12,     // solo relevante a nivel calle, no ciudad completa — evita saturar el mapa con 499 puntos a zoom de ciudad
  agregacion: 'punto',
  icono: '',
}
```

Color/icono distinto por `tipo` (obras / incidencias / festejos), popup con calle + afectación + vigencia. Toggle propio, independiente del de Fallas (spec 008).

## 6. Criterios de aceptación (Definition of Done)

- [x] Servicio de normalización (`src/services/via-publica.ts`) que mapea los 3 valores de `tipo_incidencia` al enum de §3 y calcula `distritoCodigo` con `getDistrictAtCoordinates` (spec 000, ya existente — sin duplicar lógica de point-in-polygon). Descarta valores de `tipo_incidencia` no documentados en vez de inventar una categoría.
- [x] Endpoint `GET /api/via-publica/v1/incidencias` responde con el contrato de §3, filtrando expiradas en el servidor (el servicio devuelve todas, el endpoint filtra por `vigenciaHasta >= ahora`, spec §4).
- [x] Caché con TTL de 1h y stale-on-error verificados (mismo patrón `getOrFetch` que el resto de specs).
- [x] Capa visible en el mapa a partir de zoom de calle (≥12) — verificado en navegador en ambas direcciones: los 495 puntos desaparecen al alejar por debajo del umbral y reaparecen al superarlo. Color por tipo (mostaza/morado/verde azulado, evitando rojo/naranja/dorado ya reservados por specs 021/022/008). Tooltip mínimo específico de esta capa (`#via-publica-tooltip`, `onHover`) con calle/afectación/vigencia — implementado con el mismo patrón `PickingInfo` ya probado en la capa de distritos; el elemento y su wiring se verificaron en navegador (presente, oculto por defecto, sin errores de consola), pero la confirmación pixel a pixel del hover sobre un punto concreto no se completó en esta sesión por limitaciones de precisión del navegador remoto sobre un canvas WebGL — pendiente de un vistazo humano rápido, no bloquea el resto del DoD.
- [x] La UI indica explícitamente, en rojo y negrita (no en letra pequeña), que las fechas son la vigencia del permiso administrativo, no la duración real confirmada del corte — verificado en navegador.
- [x] Atribución de fuente ("Ajuntament de València — Geoportal") y frescura visibles mientras la capa está activa — verificado en navegador con datos reales (495 activas: 279 obras, 216 incidencias, 0 festejos).
- [x] Tests reales (`via-publica.test.ts`, 5; `incidencias.test.ts`, 2): los 3 tipos, fila sin geometría/con campos ausentes, tipo no documentado descartado, filtrado de vigencia en el endpoint (no en el servicio).

## 7. Riesgos y fuera de alcance

- **Riesgo (mitigado con aviso en UI):** vigencia de permiso ≠ corte real activo — un mando podría interpretar la fecha de fin como "hasta cuándo está cortada la calle" cuando en realidad es solo hasta cuándo es válido el permiso. Mitigado con el DoD de aviso explícito.
- **Riesgo — volumen y saturación visual:** 499 puntos activos es mucho para un mapa de ciudad — mitigado con `zoomMinimo: 12` (solo aparecen al acercarse) y colores diferenciados por tipo.
- **Fuera de alcance de esta versión:** cruzar esto con el grafo viario de la spec [020](020-grafo-viario-base.md) para calcular alcanzabilidad real (sería una spec de correlación aparte, no esta); cualquier alerta automática del motor de insights (spec 013) sobre estas incidencias — fast-follow si se ve útil, no bloquea esta spec.

## 8. Historial

| Versión | Fecha | Cambio |
|---|---|---|
| 1 | 2026-08-26 | Creación (Draft) — fuente localizada y verificada en vivo (499 registros reales), contrato de datos y de capa propuestos, pendiente de aprobación antes de implementar. |
| 2 | 2026-08-26 | DoD completo: `src/services/via-publica.ts` (normalización + resolución de distrito, 5 tests), `api/via-publica/v1/incidencias.ts` (filtrado de vigencia, 2 tests), capa registrada en `map-layer-definitions.ts` con `zoomMinimo: 12` (primer uso real de ese campo — se añadió el listener `map.on('zoomend', ...)` necesario para que funcione, no existía antes), colores por tipo + tooltip mínimo + leyenda con aviso de vigencia en `src/main.ts`/`index.html`. Verificado con `npm run typecheck`, `npm run test` (186/186), `npm run build` y en navegador contra datos reales (495 incidencias activas, filtro de zoom confirmado en ambas direcciones). Spec pasa a `Implemented` — pendiente un vistazo humano al tooltip de hover (ver DoD). |
