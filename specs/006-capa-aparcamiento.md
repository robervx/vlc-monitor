# 006 — Capa de aparcamiento

```yaml
id: 006
titulo: "Capa de ocupación de aparcamientos en tiempo real"
estado: Implemented
tipo: capa
depende_de: [000]
propietario: ""
version: 2
```

## 1. Problema / motivación

¿Hay plazas libres en el parking al que voy, o mejor busco otro? Segunda capa de F2. `specs/INDEX.md` marcaba esta spec como "fuente aún sin confirmar" — queda resuelto en esta versión.

## 2. Fuente(s) de datos

| Fuente | URL | Licencia / condiciones | ¿Requiere API key? | Verificada manualmente el ___ |
|---|---|---|---|---|
| Geoportal ArcGIS del Ayuntamiento (primaria) | `https://geoportal.valencia.es/server/rest/services/OPENDATA/Trafico/MapServer/194/query?where=1=1&outFields=*&f=geojson` | Pública, CC BY 4.0 | No | **Verificada 2026-08-18** — `curl` real, HTTP 200, GeoJSON válido, **23 parkings** (`Point`). Campos reales: `nombre`, `direccion`, `id_aparcamiento`, `tipo`, `plazastota`, `plazaslibr`, `ocupacion` (%, ya calculado en origen), `ultima_mod` (epoch ms), `fiwareid`. |

**Cómo se localizó:** el dataset no aparece indexado con un nombre obvio en el catálogo CKAN (`opendata.vlci.valencia.es`) bajo "aparcamiento"/"parking" — solo un CSV estático de plazas por distrito. La capa real con ocupación en tiempo real se encontró listando directamente el catálogo de capas del Geoportar ArcGIS (`OPENDATA/Trafico/MapServer?f=json`), capa 194 "Parkings". Mismo patrón de aprendizaje que las specs 000/004: el catálogo CKAN no es exhaustivo, el listado directo del MapServer sí.

**Fuera de v1 (no confirmadas / no necesarias):** capa 205 "Aparcaments ORA" (aparcamiento regulado en calle) y capas 254/253/252/4 "Predicción Ocupación Aparcamiento Regulado a 1/6/12/24h" — predicción de ocupación de zona ORA, interesante pero distinto fenómeno (aparcamiento en calle vs. parkings/garajes); posible spec futura `006b` si se decide cubrirlo.

## 3. Contrato de datos (normalizado)

```typescript
interface Aparcamiento {
  id: string;              // id_aparcamiento
  nombre: string;
  direccion: string;
  lat: number;
  lon: number;
  plazasTotales: number;    // plazastota
  plazasLibres: number;     // plazaslibr — crudo, puede ser negativo si sinDatos
  ocupacionPorcentaje: number; // ocupacion — crudo, ídem
  sinDatos: boolean;         // true si plazaslibr/ocupacion vienen en negativo (sensor caído) — ver §7
  distrito: string | null;
  observedAt: string;       // ISO 8601, parseado de ultima_mod
  fetchedAt: string;
  source: 'ajuntament-valencia-geoportal';
}
```

## 4. Pipeline (seed → caché → endpoint)

| Parámetro | Valor |
|---|---|
| Frecuencia de refresco (cron) | Igual criterio que Valenbisi (spec 005) — 2 min es suficiente para una capa de mapa. |
| TTL en caché | 2 min (120 000 ms). |
| Comportamiento si la fuente falla | Stale-on-error, mismo patrón que specs anteriores — reutiliza `getOrFetch()` sin cambios. |
| Clave de caché | `aparcamiento:valencia-parkings:v1` |
| Endpoint interno que sirve el dato | `GET /api/aparcamiento/v1/estado` |

## 5. Contrato de capa de mapa

```typescript
{
  key: 'aparcamiento',
  specId: '006',
  renderers: ['deck'],
  zoomMinimo: 0,
  agregacion: 'punto',
  icono: '',
}
```

Color por `ocupacionPorcentaje`: verde si hay plazas de sobra, rojo si está casi lleno. Capa activable/desactivable con toggle, igual patrón que tráfico y Valenbisi.

## 6. Criterios de aceptación (Definition of Done)

- [x] Fuente probada con al menos una llamada real (`curl` — ver §2 — y en producción vía `GET /api/aparcamiento/v1/estado`: 23 parkings).
- [x] Endpoint `GET /api/aparcamiento/v1/estado` responde con el contrato de la sección 3, incluyendo resolución de distrito (`api/aparcamiento/v1/estado.ts`).
- [x] Caché con TTL de 2 min y comportamiento stale-on-error verificados — reutiliza `getOrFetch()`; normalización probada en `src/services/aparcamiento.test.ts` (incluye el caso `sinDatos`) y el endpoint en `api/aparcamiento/v1/estado.test.ts`.
- [x] Capa visible y legible en el mapa (puntos coloreados por ocupación: verde libre, rojo casi lleno, **gris `sinDatos`** para los 13 parkings con sensor caído — ver §7), activable con un toggle "Aparcamiento" — verificado visualmente en navegador.
- [x] Atribución de fuente ("Ajuntament de València") y frescura visibles en la UI mientras la capa está activa — leyenda distingue plazas libres (solo parkings con dato) de parkings sin dato.

## 7. Riesgos y fuera de alcance

- **Riesgo (confirmado en vivo):** de los 23 parkings, **13 devuelven `plazaslibr`/`ocupacion` en negativo (-1 o -2)** — centinela de "sensor sin dato", no un valor real. Algunos tienen `ultima_mod` de hasta 2016-2017 (sensor caído hace años); otros marcan el centinela con `ultima_mod` actual (el snapshot se regenera pero el sensor sigue sin reportar). **Nunca tratar el centinela como "0% ocupado"** — se normaliza como `sinDatos: true` y se renderiza en gris, no en el extremo "verde/libre" de la escala de color.
- **Riesgo:** solo 23 parkings cubiertos — son los parkings municipales/regulados con telemetría, no todos los aparcamientos privados de la ciudad. Aceptado, es lo que hay disponible como dato público.
- **Fuera de alcance de esta spec:** aparcamiento regulado en calle (zona ORA) y su predicción horaria (ver §2), plazas PMR/motos como capas propias, reserva de plaza.

## 8. Historial

| Versión | Fecha | Cambio |
|---|---|---|
| 1 | 2026-08-18 | Creación con fuente verificada (Geoportal ArcGIS, capa Trafico/MapServer/194) — resuelve el "fuente aún sin confirmar" de `specs/INDEX.md`. |
| 2 | 2026-08-18 | DoD completo: servicio de normalización con manejo de centinelas negativos (`sinDatos`, ver §7), endpoint (`api/aparcamiento/v1/estado.ts`), capa registrada, toggle + `ScatterplotLayer` + leyenda en el mapa (`src/main.ts`). Verificado con `npm run typecheck`, `npm run test` y en navegador. Spec pasa a `Implemented`. |
