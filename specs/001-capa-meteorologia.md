# 001 — Capa de meteorología

```yaml
id: 001
titulo: "Capa de meteorología actual (Open-Meteo + avisos AEMET pendientes de key)"
estado: Implemented
tipo: capa
depende_de: [000]
propietario: ""
version: 2
```

## 1. Problema / motivación

¿Qué tiempo hace ahora mismo en Valencia, y hace falta prepararse para algo (calor extremo, lluvia, viento fuerte)? Es la primera de las tres capas del MVP (F1) — sencilla mecánicamente pero establece el patrón de fuente en vivo + caché con TTL que reutilizarán `002` (calidad del aire) y `004` (tráfico).

## 2. Fuente(s) de datos

| Fuente | URL | Licencia / condiciones | ¿Requiere API key? | Verificada manualmente el ___ |
|---|---|---|---|---|
| Open-Meteo (primaria) | `https://api.open-meteo.com/v1/forecast?latitude=39.4699&longitude=-0.3763&current=...&timezone=Europe%2FMadrid` | Gratuita, uso no comercial sin límite estricto documentado | No | **Verificada 2026-08-18** — `curl` real, HTTP 200, JSON con `current.temperature_2m=32.3`, `weather_code=0`, etc. — plausible para Valencia en agosto. |
| AEMET OpenData — avisos por fenómenos adversos (complementaria, **no incluida en v1**) | `https://opendata.aemet.es/opendata/api/avisos_cap/ultimoelaborado/area/valencia` | Pública, pero **toda** petición exige `api_key` (registro gratuito por email — sin excepción, confirmado) | **Sí, sin excepción** | **Verificada 2026-08-18** — `curl` sin `api_key` devuelve HTTP 200 con cuerpo vacío (bloqueo silencioso vía Dynatrace/Akamai, no error explícito). Confirmado por documentación oficial de AEMET que el parámetro es obligatorio en todos los endpoints. |

**Por qué AEMET queda fuera de v1:** obtener la clave requiere que una persona rellene un formulario con su email y resuelva un captcha en `https://opendata.aemet.es/centrodedescargas/altaUsuario` — eso no lo puede hacer una sesión de Claude Code (ver reglas de la sesión: no se crean cuentas ni se resuelven captchas en nombre del usuario). **Acción pendiente del usuario:** registrarse, obtener la key gratuita, y añadirla a `.env.local` como `AEMET_API_KEY`. En cuanto exista esa variable, los avisos AEMET se añaden como fast-follow de esta misma spec (nueva versión, sin abrir spec nueva) — no bloquea el resto del DoD.

## 3. Contrato de datos (normalizado)

```typescript
interface EstadoMeteo {
  id: 'valencia';           // único punto en v1 — el tiempo no varía de forma útil a escala de distrito
  lat: number;
  lon: number;
  temperatura: number;          // °C
  sensacionTermica: number;     // °C
  humedad: number;              // %
  precipitacion: number;        // mm, última hora
  weatherCode: number;          // código WMO (estándar Open-Meteo)
  descripcion: string;          // etiqueta ES derivada de weatherCode, ej. "Cielo despejado"
  vientoVelocidad: number;      // km/h
  vientoDireccion: number;      // grados
  vientoRachas: number;         // km/h
  presion: number;              // hPa
  uvIndex: number;
  observedAt: string;   // ISO 8601 — hora del dato en origen (campo `current.time` de Open-Meteo)
  fetchedAt: string;    // ISO 8601 — momento en que lo cacheamos
  source: 'open-meteo';
}
```

## 4. Pipeline (seed → caché → endpoint)

| Parámetro | Valor |
|---|---|
| Frecuencia de refresco (cron) | Open-Meteo actualiza su dato "actual" cada 15 min (`interval: 900` en la respuesta) — no tiene sentido pedirlo más a menudo. |
| TTL en caché | 15 min. |
| Comportamiento si la fuente falla | Stale-on-error: servir el último valor cacheado (aunque haya caducado) y marcarlo como no fresco; solo si nunca hubo un valor bueno se devuelve error al cliente. Igual que el patrón de World Monitor citado en `docs/01_VIABILIDAD_VISION_Y_PROCESO.md` §3.4. |
| Clave de caché | `meteo:valencia-actual:v1` |
| Endpoint interno que sirve el dato | `GET /api/meteo/v1/actual` |

**Nota de infraestructura:** esta es la primera spec con fuente en vivo — implementa el stub de `api/_shared/cache.ts` (hasta ahora vacío) con una caché en memoria de proceso (`Map` con TTL), no Redis real. Motivo: no hay credenciales de Upstash provisionadas en este entorno y crear esa cuenta tampoco es algo que la sesión pueda hacer por el usuario. Es sustituible por Upstash Redis sin tocar el endpoint (mismo `getOrFetch(key, ttlMs, fetcher)`) en cuanto existan `UPSTASH_REDIS_REST_URL`/`UPSTASH_REDIS_REST_TOKEN` en `.env.local` — hasta entonces, la caché no sobrevive a un cold start de la función edge, solo evita llamadas repetidas dentro del mismo proceso caliente.

## 5. Contrato de capa de mapa

```typescript
{
  key: 'meteo',
  specId: '001',
  renderers: ['deck'],
  zoomMinimo: 0,
  agregacion: 'punto',   // un único punto — no choropleth, el tiempo no varía por distrito a esta escala
  icono: '',             // ver mapeo weatherCode -> icono en la implementación
}
```

Se renderiza como panel/badge fijo (temperatura + icono + descripción), no como capa de mapa tradicional con muchos puntos — coherente con que solo existe una lectura en v1.

## 6. Criterios de aceptación (Definition of Done)

- [x] Fuente probada con al menos una llamada real (Open-Meteo, `curl` — ver §2 — y en producción vía `GET /api/meteo/v1/actual` contra el dev server).
- [x] Endpoint `GET /api/meteo/v1/actual` responde con el contrato de la sección 3 (`api/meteo/v1/actual.ts`).
- [x] Caché con TTL de 15 min y comportamiento stale-on-error verificados — tests en `api/_shared/cache.test.ts` (TTL, stale-on-error, propagación de error sin valor previo) y `api/meteo/v1/actual.test.ts` (el endpoint usa la caché correctamente en ambos extremos).
- [x] Panel de meteo visible y legible en el mapa, con icono acorde a `weatherCode` (`src/main.ts`, verificado visualmente en navegador: ☀️ 32°C "Cielo despejado").
- [x] Atribución de fuente ("Open-Meteo") y frescura ("actualizado hace N min") visibles en la UI — con aviso "⚠ no actualizado" si `fresh: false`.
- [x] AEMET avisos documentado como pendiente de key del usuario — no bloquea el resto (§2).

## 7. Riesgos y fuera de alcance

- **Riesgo:** límites de uso "razonable" de Open-Meteo no documentados con precisión — mitigado por caché de 15 min, nunca se llama a la fuente por cada carga de usuario (CLAUDE.md §2).
- **Riesgo:** sin AEMET, no hay corroboración multi-fuente en v1 (principio de World Monitor) — aceptado conscientemente, ver §2. Cuando el usuario aporte `AEMET_API_KEY`, añadir avisos como segunda fuente en una nueva versión de esta spec.
- **Fuera de alcance de esta spec:** pronóstico horario/diario (solo "ahora mismo" en v1), varias lecturas por distrito, avisos AEMET (ver arriba), cualquier otra fuente meteorológica.

## 8. Historial

| Versión | Fecha | Cambio |
|---|---|---|
| 1 | 2026-08-18 | Creación con fuente verificada (Open-Meteo). AEMET avisos documentado como pendiente de API key del usuario, no bloquea. |
| 2 | 2026-08-18 | DoD completo: caché in-memory con TTL/stale-on-error (`api/_shared/cache.ts`), servicio de normalización (`src/services/estado-meteo.ts`), endpoint (`api/meteo/v1/actual.ts`), capa registrada (`src/config/map-layer-definitions.ts`), panel en el mapa con icono/frescura/atribución (`src/main.ts`). Verificado con `npm run typecheck`, `npm run test` y en navegador. Spec pasa a `Implemented`. |
