# 002 — Capa de calidad del aire

```yaml
id: 002
titulo: "Capa de calidad del aire actual (Open-Meteo Air Quality)"
estado: Implemented
tipo: capa
depende_de: [000]
propietario: ""
version: 2
```

## 1. Problema / motivación

¿Se puede respirar tranquilo ahora mismo en Valencia, o hay contaminación alta (NO₂, PM2.5, ozono)? Segunda capa del MVP (F1) — reutiliza el mismo patrón de fuente en vivo + caché con TTL que `001` (meteorología), esta vez sobre la API de calidad del aire de Open-Meteo.

## 2. Fuente(s) de datos

| Fuente | URL | Licencia / condiciones | ¿Requiere API key? | Verificada manualmente el ___ |
|---|---|---|---|---|
| Open-Meteo Air Quality (primaria) | `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=39.4699&longitude=-0.3763&current=pm10,pm2_5,carbon_monoxide,nitrogen_dioxide,sulphur_dioxide,ozone,us_aqi,european_aqi&timezone=UTC` | Gratuita, mismo servicio/condiciones que Open-Meteo forecast (spec 001) | No | **Verificada 2026-08-18** — `curl` real, HTTP 200, `current.european_aqi=40`, `pm2_5=13.9 µg/m³`, valores plausibles. |
| GVA / Ajuntament (complementaria, **no incluida en v1**) | Dades Obertes GVA (`dadesobertes.gva.es`) — estaciones oficiales de la Generalitat | Pública | Desconocido, sin verificar | No verificada esta sesión — Open-Meteo ya cubre el MVP sin fricción; añadir como segunda fuente de corroboración en una versión futura de esta spec, no bloquea v1. |

## 3. Contrato de datos (normalizado)

```typescript
interface CalidadAire {
  id: 'valencia';        // único punto en v1, mismo criterio que spec 001
  lat: number;
  lon: number;
  pm10: number;           // µg/m³
  pm25: number;           // µg/m³
  monoxidoCarbono: number; // µg/m³
  dioxidoNitrogeno: number; // µg/m³
  dioxidoAzufre: number;    // µg/m³
  ozono: number;             // µg/m³
  indiceEuropeo: number;     // European AQI (0-100+, EAQI)
  indiceUS: number;          // US AQI, informativo
  categoria: string;         // etiqueta ES derivada de indiceEuropeo, ej. "Buena"
  observedAt: string;
  fetchedAt: string;
  source: 'open-meteo';
}
```

Bandas del European AQI usadas para `categoria` (estándar EEA, igual que muestra Open-Meteo): 0-20 Buena, 20-40 Aceptable, 40-60 Moderada, 60-80 Mala, 80-100 Muy mala, 100+ Extremadamente mala.

## 4. Pipeline (seed → caché → endpoint)

| Parámetro | Valor |
|---|---|
| Frecuencia de refresco (cron) | Open-Meteo Air Quality actualiza cada hora (`interval: 3600` en la respuesta). |
| TTL en caché | 60 min. |
| Comportamiento si la fuente falla | Stale-on-error, igual patrón que spec 001 §4 — reutiliza `getOrFetch()` de `api/_shared/cache.ts`, sin cambios en esa pieza compartida. |
| Clave de caché | `aire:valencia-actual:v1` |
| Endpoint interno que sirve el dato | `GET /api/aire/v1/actual` |

## 5. Contrato de capa de mapa

```typescript
{
  key: 'calidadAire',
  specId: '002',
  renderers: ['deck'],
  zoomMinimo: 0,
  agregacion: 'punto',   // un único punto ciudad, mismo criterio que spec 001 — sin estaciones por distrito verificadas en v1
  icono: '',
}
```

Panel fijo (índice + categoría + contaminante principal), mismo patrón visual que el panel de meteo de la spec 001.

## 6. Criterios de aceptación (Definition of Done)

- [x] Fuente probada con al menos una llamada real (`curl` — ver §2 — y en producción vía `GET /api/aire/v1/actual` contra el dev server).
- [x] Endpoint `GET /api/aire/v1/actual` responde con el contrato de la sección 3 (`api/aire/v1/actual.ts`).
- [x] Caché con TTL de 60 min y comportamiento stale-on-error — reutiliza `getOrFetch()` (ya probado en `api/_shared/cache.test.ts`); normalización probada en `src/services/calidad-aire.test.ts` y el endpoint en `api/aire/v1/actual.test.ts`.
- [x] Panel de calidad del aire visible y legible en el mapa, con categoría (badge "40 Moderada", verificado visualmente en navegador junto al panel de meteo).
- [x] Atribución de fuente ("Open-Meteo") y frescura visibles en la UI, con aviso "⚠ no actualizado" si `fresh: false`.

## 7. Riesgos y fuera de alcance

- **Riesgo:** un único punto para toda la ciudad no captura variación real entre, por ejemplo, una avenida con tráfico denso y un parque — aceptado conscientemente en v1, igual que en meteorología (spec 001 §7). Si se necesita granularidad por distrito, requeriría localizar estaciones oficiales (GVA/Ajuntament) con geometría propia — spec futura.
- **Fuera de alcance de esta spec:** pronóstico de calidad del aire (solo "ahora mismo"), estaciones oficiales GVA/Ajuntament como fuente (ver §2), cualquier índice compuesto (eso es la spec `010`).

## 8. Historial

| Versión | Fecha | Cambio |
|---|---|---|
| 1 | 2026-08-18 | Creación con fuente verificada (Open-Meteo Air Quality). |
| 2 | 2026-08-18 | DoD completo: servicio de normalización (`src/services/calidad-aire.ts`), endpoint (`api/aire/v1/actual.ts`, reutiliza `api/_shared/cache.ts` de la spec 001 sin cambios), capa registrada (`src/config/map-layer-definitions.ts`), panel en el mapa junto al de meteo (`src/main.ts`, refactorizado a contenedor `#info-panels` compartido). Verificado con `npm run typecheck`, `npm run test` y en navegador. Spec pasa a `Implemented`. |
