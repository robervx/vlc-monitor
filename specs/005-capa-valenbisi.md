# 005 — Capa Valenbisi

```yaml
id: 005
titulo: "Capa de disponibilidad de estaciones Valenbisi en tiempo real"
estado: Implemented
tipo: capa
depende_de: [000]
propietario: ""
version: 2
```

## 1. Problema / motivación

¿Hay bicis disponibles (o huecos libres para dejar una) en la estación Valenbisi más cercana ahora mismo? Primera capa de F2 (movilidad completa).

## 2. Fuente(s) de datos

| Fuente | URL | Licencia / condiciones | ¿Requiere API key? | Verificada manualmente el ___ |
|---|---|---|---|---|
| Geoportal ArcGIS del Ayuntamiento (primaria) | `https://geoportal.valencia.es/server/rest/services/OPENDATA/Trafico/MapServer/228/query?where=1=1&outFields=*&f=geojson` | Pública, CC BY 4.0 (catálogo asociado: `opendata.vlci.valencia.es/en/dataset/valenbisi-disponibilitat-valenbisi-dsiponibilidad`) | No | **Verificada 2026-08-18** — `curl` real, HTTP 200, GeoJSON válido, **273 estaciones** (`Point`). Campos reales: `gid`, `name`, `number`, `address`, `open` ("T"/"F"), `available` (bicis), `free` (huecos), `total`, `ticket`, `updated_at` (string `DD/MM/YYYY HH:mm:ss`), `update_jcd` (epoch ms — dato viene originalmente de JCDecaux, redistribuido por el Ayuntamiento). |

**Nota:** confirma lo anticipado en la investigación previa (`docs/01_VIABILIDAD_VISION_Y_PROCESO.md` §1.2: "Valencia usa la red JCDecaux") — pero el punto de acceso más simple no es el portal de desarrolladores de JCDecaux (que exigiría registro propio), sino el mismo Geoportal ArcGIS ya usado en las specs 000/004, que redistribuye el dato. Mismo proveedor, una integración menos.

## 3. Contrato de datos (normalizado)

```typescript
interface EstacionValenbisi {
  id: string;             // gid
  numero: number;          // number — el que se ve físicamente en la estación
  nombre: string;
  direccion: string;
  lat: number;
  lon: number;
  abierta: boolean;        // open === "T"
  bicisDisponibles: number; // available
  huecosLibres: number;     // free
  capacidadTotal: number;   // total
  distrito: string | null;  // resuelto con getDistrictAtCoordinates (spec 000)
  observedAt: string;       // ISO 8601, parseado de updated_at/update_jcd
  fetchedAt: string;
  source: 'ajuntament-valencia-geoportal';
}
```

## 4. Pipeline (seed → caché → endpoint)

| Parámetro | Valor |
|---|---|
| Frecuencia de refresco (cron) | JCDecaux actualiza cada estación de forma independiente en tiempo real; refrescar cada 2 min es suficiente para una capa de mapa (no es un sistema de reserva). |
| TTL en caché | 2 min (120 000 ms). |
| Comportamiento si la fuente falla | Stale-on-error, mismo patrón que specs 001/002/004 — reutiliza `getOrFetch()` sin cambios. |
| Clave de caché | `valenbisi:valencia-estaciones:v1` |
| Endpoint interno que sirve el dato | `GET /api/valenbisi/v1/estaciones` |

## 5. Contrato de capa de mapa

```typescript
{
  key: 'valenbisi',
  specId: '005',
  renderers: ['deck'],
  zoomMinimo: 0,
  agregacion: 'punto',   // 273 puntos individuales, mismo valor de enum que meteo/aire (una entrada = un punto propio)
  icono: '',
}
```

Color por disponibilidad relativa (`bicisDisponibles / capacidadTotal`): rojo si ~0 bicis, verde si hay bicis de sobra; estación cerrada (`abierta: false`) en gris. Capa activable/desactivable con toggle, igual patrón que tráfico (spec 004).

## 6. Criterios de aceptación (Definition of Done)

- [x] Fuente probada con al menos una llamada real (`curl` — ver §2 — y en producción vía `GET /api/valenbisi/v1/estaciones`: 273 estaciones).
- [x] Endpoint `GET /api/valenbisi/v1/estaciones` responde con el contrato de la sección 3, incluyendo resolución de distrito (`api/valenbisi/v1/estaciones.ts`).
- [x] Caché con TTL de 2 min y comportamiento stale-on-error verificados — reutiliza `getOrFetch()`; normalización probada en `src/services/valenbisi.test.ts` y el endpoint en `api/valenbisi/v1/estaciones.test.ts`.
- [x] Capa visible y legible en el mapa (puntos coloreados por disponibilidad: verde con bicis, rojo casi vacía, gris cerrada), activable con un toggle "Valenbisi" — verificado visualmente en navegador.
- [x] Atribución de fuente ("Ajuntament de València") y frescura visibles en la UI mientras la capa está activa — leyenda con total de bicis disponibles y estaciones cerradas.

## 7. Riesgos y fuera de alcance

- **Riesgo:** el dato original viene de JCDecaux y se redistribuye vía el Geoportal — si el Ayuntamiento deja de sincronizar esa redistribución, se rompe sin previo aviso por nuestra parte; mitigado por stale-on-error (se sigue mostrando el último dato bueno con su frescura).
- **Fuera de alcance de esta spec:** cálculo de ruta a la estación más cercana, reserva/planificación de trayecto, histórico de disponibilidad.

## 8. Historial

| Versión | Fecha | Cambio |
|---|---|---|
| 1 | 2026-08-18 | Creación con fuente verificada (Geoportal ArcGIS, capa Trafico/MapServer/228). |
| 2 | 2026-08-18 | DoD completo: servicio de normalización (`src/services/valenbisi.ts`), endpoint (`api/valenbisi/v1/estaciones.ts`), capa registrada, toggle + `ScatterplotLayer` + leyenda en el mapa (`src/main.ts`). Verificado con `npm run typecheck`, `npm run test` y en navegador. Spec pasa a `Implemented`. |
