# 016 — Predicción meteorológica a corto plazo (nowcasting)

```yaml
id: 016
titulo: "Predicción meteorológica a corto plazo (próximas horas)"
estado: Implemented
tipo: capa
depende_de: [001]
propietario: ""
version: 2
```

## 1. Problema / motivación

El estado meteorológico "ahora mismo" (spec `001`) no dice si va a llover o a subir la temperatura en la próxima hora — información clave para anticiparse a una situación (lluvia repentina, calor en aumento durante un evento). Esta spec añade, junto al panel de meteo actual, una previsión de las próximas horas usando la ventana en la que el pronóstico a corto plazo es más fiable.

## 2. Fuente(s) de datos

| Fuente | URL | Licencia / condiciones | ¿Requiere API key? | Verificada manualmente el ___ |
|---|---|---|---|---|
| Open-Meteo — pronóstico horario (`hourly`) (primaria) | `https://api.open-meteo.com/v1/forecast?latitude=39.4699&longitude=-0.3763&hourly=temperature_2m,precipitation_probability,precipitation,weather_code&forecast_hours=4&timezone=UTC` | Gratuita, misma fuente ya usada en `001`, sin API key | No | **Verificada 2026-08-18** — `curl` real, HTTP 200, devuelve `hourly.time` con 6 marcas horarias desde la hora actual y campos `temperature_2m`, `precipitation_probability`, `precipitation`, `weather_code` poblados (ej. `temperature_2m: [32.9, 32.9, 32.5, 32.0, 31.5, 30.9]`). |
| Open-Meteo — pronóstico de alta resolución (`minutely_15`) (considerada, no usada en v1) | mismo endpoint, parámetro `minutely_15=temperature_2m,precipitation,weather_code,wind_speed_10m` | Gratuita, sin key | No | **Verificada 2026-08-18** — responde con datos cada 15 min. Se descarta para v1 por simplicidad (mezclar dos resoluciones distintas en un mismo panel complica la UI sin aportar valor claro al caso de uso pedido); queda anotada como posible mejora futura si se quiere granularidad sub-horaria. |

No hay fuente de "confianza/probabilidad de acierto" explícita en la API — el principio aplicado (ver §7) es meteorológico general: el pronóstico a corto plazo (0-4h) es sustancialmente más fiable que a más de 12h, así que se limita la ventana a 4h en vez de mostrar todo el `hourly` disponible.

## 3. Contrato de datos (normalizado)

```typescript
interface PrediccionHoraria {
  horaObjetivo: string;              // ISO 8601 — hora a la que corresponde este tramo
  temperatura: number;               // °C
  probabilidadPrecipitacion: number; // % 0-100, tal como la da Open-Meteo
  precipitacion: number;             // mm previstos en esa hora
  weatherCode: number;                // código WMO
  descripcion: string;                // misma tabla ES que estado-meteo.ts (spec 001)
}

interface PrediccionCortoPlazo {
  id: 'valencia';
  ventanaHoras: number;               // nº de tramos devueltos, 4 en v1
  predicciones: PrediccionHoraria[];  // longitud = ventanaHoras, orden cronológico, solo tramos >= ahora
  observedAt: string;   // ISO 8601 — hora en que se generó el pronóstico (primer tramo horario >= ahora)
  fetchedAt: string;    // ISO 8601 — momento en que lo cacheamos
  source: 'open-meteo';
}
```

## 4. Pipeline (seed → caché → endpoint)

| Parámetro | Valor |
|---|---|
| Frecuencia de refresco (cron) | Mismo patrón que `001` — el pronóstico horario de Open-Meteo no cambia significativamente más rápido que cada 15 min. |
| TTL en caché | 15 min (igual que `001`, mismo helper `getOrFetch`). |
| Comportamiento si la fuente falla | Stale-on-error, igual que `001` — servir el último valor bueno marcado `fresh: false`; error solo si nunca hubo valor previo. |
| Clave de caché | `meteo:valencia-prediccion-4h:v1` |
| Endpoint interno que sirve el dato | `GET /api/meteo/v1/prediccion-corto-plazo` |

## 5. Contrato de capa de mapa

No es una capa de mapa (igual que `001`) — se renderiza como panel/tira horizontal junto al panel de meteo actual, con un mini-bloque por hora (icono + temperatura + % de lluvia).

```typescript
{
  key: 'meteo-prediccion',
  specId: '016',
  renderers: [],        // no pinta nada sobre el mapa, es un panel HTML fijo
  zoomMinimo: 0,
  agregacion: 'punto',
  icono: '',
}
```

## 6. Criterios de aceptación (Definition of Done)

- [x] Fuente probada con al menos una llamada real (`curl` — ver §2).
- [x] Endpoint `GET /api/meteo/v1/prediccion-corto-plazo` responde con el contrato de la sección 3 (`api/meteo/v1/prediccion-corto-plazo.ts`).
- [x] Caché con TTL de 15 min y stale-on-error verificados (reutiliza `api/_shared/cache.ts`, ya cubierto por sus propios tests).
- [x] Panel visible junto al panel de meteo actual, con las 4 próximas horas (icono, hora, temperatura, % lluvia), legible — verificado visualmente en navegador (15:00-18:00, ☀️ 33°/33°/32°/32°, 💧0%).
- [x] Atribución de fuente y frescura visibles, mismo patrón que `001` ("Open-Meteo · actualizado hace instantes").
- [x] Tests del servicio de normalización y del endpoint (éxito, fuente caída sin caché previa) — `src/services/prediccion-corto-plazo.test.ts`, `api/meteo/v1/prediccion-corto-plazo.test.ts`.

## 7. Riesgos y fuera de alcance

- **Riesgo:** el usuario pidió mostrar "la ventana de mayor probabilidad" — Open-Meteo no expone un score de confianza por tramo horario, así que se traduce como "limitar la ventana a 4h" (el corto plazo es más fiable en general), no como un dato de confianza real devuelto por la fuente. Si en el futuro se quiere un indicador de confianza real, haría falta otra fuente (ej. ensemble forecast de Open-Meteo, fuera de alcance de esta versión).
- **Riesgo:** igual que en `001`, sin corroboración multi-fuente (AEMET queda pendiente de API key del usuario).
- **Fuera de alcance de esta spec:** pronóstico diario/multi-día, resolución sub-horaria (`minutely_15`), indicador de confianza distinto de la ventana fija de 4h, cualquier lógica de "insights/alertas" automáticos sobre este dato (eso es la spec `013`, que sí podría consumir este endpoint como fuente en el futuro).

## 8. Historial

| Versión | Fecha | Cambio |
|---|---|---|
| 1 | 2026-08-18 | Creación, fuente verificada (Open-Meteo `hourly`, ventana 4h). |
| 2 | 2026-08-18 | DoD completo: servicio de normalización (`src/services/prediccion-corto-plazo.ts`), endpoint (`api/meteo/v1/prediccion-corto-plazo.ts`, reutiliza `api/_shared/cache.ts`), panel "Próximas 4h" junto al de meteo actual (`src/main.ts`, `index.html`). Verificado con `npm run typecheck`, tests (66/66 en el worktree) y en navegador. Spec pasa a `Implemented`. |
