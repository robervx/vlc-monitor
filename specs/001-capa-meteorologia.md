# 001 — Capa de meteorología

```yaml
id: 001
titulo: "Capa de meteorología actual (Open-Meteo) + avisos oficiales (GVA Emergencias, scraping)"
estado: Implemented
tipo: capa
depende_de: [000]
propietario: ""
version: 4
```

> **Estado:** v4 `Implemented` (2026-09-16) — sustituye el plan de avisos AEMET vía API
> key (nunca activado) por scraping de la sala de prensa de Emergencias e Interior de la
> Generalitat Valenciana. Ver §2 (fuente verificada con llamadas reales) y §6 (DoD).

## 1. Problema / motivación

¿Qué tiempo hace ahora mismo en Valencia, y hace falta prepararse para algo (calor extremo, lluvia, viento fuerte)? Es la primera de las tres capas del MVP (F1) — sencilla mecánicamente pero establece el patrón de fuente en vivo + caché con TTL que reutilizarán `002` (calidad del aire) y `004` (tráfico).

## 2. Fuente(s) de datos

| Fuente | URL | Licencia / condiciones | ¿Requiere API key? | Verificada manualmente el ___ |
|---|---|---|---|---|
| Open-Meteo (primaria) | `https://api.open-meteo.com/v1/forecast?latitude=39.4699&longitude=-0.3763&current=...&timezone=Europe%2FMadrid` | Gratuita, uso no comercial sin límite estricto documentado | No | **Verificada 2026-08-18** — `curl` real, HTTP 200, JSON con `current.temperature_2m=32.3`, `weather_code=0`, etc. — plausible para Valencia en agosto. |
| AEMET OpenData — avisos por fenómenos adversos (descartada) | `https://opendata.aemet.es/opendata/api/avisos_cap/ultimoelaborado/area/valencia` | Pública, pero **toda** petición exige `api_key` (registro gratuito por email — sin excepción, confirmado) | **Sí, sin excepción** | **Verificada 2026-08-18** — `curl` sin `api_key` devuelve HTTP 200 con cuerpo vacío (bloqueo silencioso vía Dynatrace/Akamai, no error explícito). Confirmado por documentación oficial de AEMET que el parámetro es obligatorio en todos los endpoints. |
| AEMET web pública de avisos (descartada) | `https://www.aemet.es/es/eltiempo/prediccion/avisos?w=0&p=46250` (código 46250 = provincia de Valencia) | Pública, sin key para ver la página — pero no es una API | No para ver la página, pero **inservible para scraping** | **Verificada 2026-09-16** (`curl` real) — HTTP **500** con cabeceras de Dynatrace (`ruxitagentjs`, mismo bloqueador que ya afectaba a OpenData); el HTML estático no contiene el contenido de avisos (color/nivel por provincia) en absoluto — se pinta por JavaScript del lado cliente tras la carga. No hay forma de leerlo con una petición simple ni de confiar en el HTTP 200. |
| **GVA Emergencias e Interior — sala de prensa (fuente v4, usada)** | `https://comunica.gva.es/es/emergencies-i-interior` | Pública, institucional (Generalitat Valenciana), sin key | No | **Verificada 2026-09-16** (`curl` real, sin navegador) — HTTP 200, HTML servido ya renderizado (sin JavaScript, a diferencia de AEMET y de `valencia.es/agenda`, spec 027). `robots.txt` de `comunica.gva.es` y de `emergencias.gva.es` (el dominio que redirige) permiten explícitamente cualquier bot, con una lista nominal de bots de IA autorizados (`anthropic-ai`, `ClaudeBot`, `Claude-User`, entre ~80 más). El fetch del mismo día devolvió una nota real: "Emergencias activa la alerta naranja ante la previsión de fuertes lluvias y tormentas en toda la provincia de Valencia para este miércoles" (16/09/2026) — dato genuino, no de prueba. |

**Por qué AEMET queda fuera definitivamente (no solo "pendiente de key"):** más allá de que `opendata.aemet.es` exige `api_key` sin excepción (una persona tendría que registrarse y resolver un captcha — fuera del alcance de una sesión de Claude Code), la propia web pública de avisos **tampoco es scrapeable**: responde HTTP 500 y el contenido real se renderiza por JavaScript, no está en el HTML servido. Se descarta como fuente, no solo se aplaza.

**Fuente elegida — GVA Emergencias e Interior (scraping):** notas de prensa de activación de avisos ("Emergencias activa la alerta/el aviso [nivel]…"), no una tabla de "estado actual". Limitación documentada: no hay nota de "se desactiva el aviso", así que la vigencia se infiere con una ventana fija de 48h desde la publicación (`VENTANA_VIGENCIA_HORAS` en `src/services/avisos-meteo.ts`) — igual de espíritu que la caducidad por ítem de spec 009 v6. El filtro de relevancia a Valencia es deliberadamente amplio (substring "valencia" en título+resumen, sin distinguir litoral/interior ni ciudad/provincia): un falso positivo solo hace que una persona revise una alerta que no le afecta (el texto original se muestra igual); un falso negativo sería no avisar de una alerta real — mucho peor dado el límite "avisa, no actúa" de `CLAUDE.md` §4.

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

Avisos oficiales (v4, `src/services/avisos-meteo.ts`):

```typescript
type NivelAviso = 'amarillo' | 'naranja' | 'rojo';

interface AvisoMeteo {
  id: string;            // URL de la nota de prensa — estable entre scrapes
  nivel: NivelAviso;
  titulo: string;
  resumen: string | null;
  url: string;
  publicadoEn: string;   // ISO 8601 — medianoche del día de publicación (la fuente solo da DD/MM/YYYY)
  fetchedAt: string;
  source: 'gva-emergencias-scraping';
}
```

No se modifica `EstadoMeteo` — los avisos son un tipo de dato aparte, propio y minoritario (0-2 activos casi siempre), que se sirve por su propio endpoint (§4) y se integra en el motor de insights de spec 013 en vez de en el panel de meteo (§5).

## 4. Pipeline (seed → caché → endpoint)

| Parámetro | Valor |
|---|---|
| Frecuencia de refresco (cron) | Open-Meteo actualiza su dato "actual" cada 15 min (`interval: 900` en la respuesta) — no tiene sentido pedirlo más a menudo. |
| TTL en caché | 15 min. |
| Comportamiento si la fuente falla | Stale-on-error: servir el último valor cacheado (aunque haya caducado) y marcarlo como no fresco; solo si nunca hubo un valor bueno se devuelve error al cliente. Igual que el patrón de World Monitor citado en `docs/01_VIABILIDAD_VISION_Y_PROCESO.md` §3.4. |
| Clave de caché | `meteo:valencia-actual:v1` |
| Endpoint interno que sirve el dato | `GET /api/meteo/v1/actual` |

**Avisos oficiales (v4):**

| Parámetro | Valor |
|---|---|
| Frecuencia de refresco | 15 min — la sala de prensa no publica con más frecuencia que eso en la práctica; mismo TTL que el resto de la spec por simplicidad, no por límite de la fuente. |
| TTL en caché | 15 min. |
| Comportamiento si la fuente falla | Stale-on-error, igual que el resto de la spec — y además el motor de insights (spec 013) degrada sirviendo el resto de reglas si esta fuente concreta falla (`Promise.allSettled`, igual patrón que tráfico/Fallas/incidencias). |
| Clave de caché | `meteo:valencia-avisos:v1` |
| Endpoint interno que sirve el dato | `GET /api/meteo/v1/avisos` — `{ avisos: AvisoMeteo[], fetchedAt, fresh }`, ya filtrado a vigentes (§3) |
| Vigencia asumida sin señal de cierre | 48h desde `publicadoEn` (`VENTANA_VIGENCIA_HORAS`) |

**Cómo llega a ser visible sin UI nueva:** `src/server/insights-actual.ts` pide `GET`-equivalente a `fetchAvisosVigentes()` junto al resto de fuentes y se lo pasa a `calcularInsights()` (spec 013), que genera un `Insight` por aviso vigente (`tipo: 'aviso-oficial-meteo'`, severidad `urgente` si nivel naranja/rojo, `aviso` si amarillo). El panel de insights y el modal bloqueante de spec 013 v5 son genéricos por `titulo`/`descripcion` — no hace falta tocar ninguna UI para que la alerta aparezca, con su propio borrador de protocolo listo para copiar (`protocoloSugerido`).

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
- [x] Panel de meteo visible y legible en el mapa, con icono acorde a `weatherCode` (`src/ui/meteo-panel.ts` desde v3, antes `src/main.ts` — ver historial; verificado visualmente en navegador: ☀️ 32°C "Cielo despejado").
- [x] Atribución de fuente ("Open-Meteo") y frescura ("actualizado hace N min") visibles en la UI — con aviso "⚠ no actualizado" si `fresh: false`.
- [x] **v4:** fuente real de avisos oficiales verificada con llamada directa antes de escribir código (`curl` a `comunica.gva.es`, `robots.txt` de ambos dominios — §2), AEMET descartada con evidencia (no solo "pendiente de key").
- [x] **v4:** parser puro (`src/services/avisos-meteo.ts`) con 9 tests contra un fragmento HTML real capturado el 2026-09-16 (`src/services/avisos-meteo.test.ts`) — activación real, nota no-aviso descartada, caso límite de filtro amplio, vigencia por ventana.
- [x] **v4:** endpoint `GET /api/meteo/v1/avisos` (`src/server/avisos-meteo.ts`, registrado en `api/_router-src.ts`) — verificado contra el dev server real: devuelve la alerta naranja real del 15/09/2026 para la provincia de Valencia.
- [x] **v4:** alerta decretada visible en la app sin depender de ninguna key — integrada en el motor de insights (`insightsAvisoOficial` en `src/services/insights.ts`, severidad por nivel) y verificado en navegador: aparece en el panel de alertas con su borrador de protocolo, sin cambios de UI.

## 7. Riesgos y fuera de alcance

- **Riesgo:** límites de uso "razonable" de Open-Meteo no documentados con precisión — mitigado por caché de 15 min, nunca se llama a la fuente por cada carga de usuario (CLAUDE.md §2).
- **Riesgo (v4):** la fuente de avisos es un listado de notas de prensa, no un estado "activo/inactivo" — no hay nota de desactivación. Mitigado con una ventana de vigencia fija de 48h (documentada, no oculta) en vez de asumir vigencia indefinida.
- **Riesgo (v4):** el filtro de relevancia a Valencia es deliberadamente amplio (substring, sin distinguir litoral/interior) — puede mostrar alguna alerta que en realidad es solo de Alicante/Castellón con una mención de paso a Valencia. Aceptado: el texto original se muestra íntegro para que la persona lo valore (CLAUDE.md §4, "avisa no actúa"); es preferible a un falso negativo.
- **Riesgo (v4):** el patrón de detección de activación (`"activa" + "alerta"/"aviso"`) es el fraseo observado y consistente de esta fuente en las notas revisadas — si la Generalitat cambia la redacción, se dejarían de detectar avisos nuevos sin error visible (fuente cae en `Promise.allSettled` como "opcional", el resto de insights sigue funcionando). Sin monitorización de "0 avisos inesperado" en v1, a diferencia de `estructuraSospechosa` de spec 027 — puede añadirse en fast-follow si da problemas reales.
- **Fuera de alcance de esta spec:** pronóstico horario/diario (solo "ahora mismo" en v1), varias lecturas por distrito, cualquier otra fuente meteorológica, capa de mapa dedicada para avisos (se sirven como insight, no como capa — no hay geometría de zona en la fuente).

## 8. Historial

| Versión | Fecha | Cambio |
|---|---|---|
| 1 | 2026-08-18 | Creación con fuente verificada (Open-Meteo). AEMET avisos documentado como pendiente de API key del usuario, no bloquea. |
| 2 | 2026-08-18 | DoD completo: caché in-memory con TTL/stale-on-error (`api/_shared/cache.ts`), servicio de normalización (`src/services/estado-meteo.ts`), endpoint (`api/meteo/v1/actual.ts`), capa registrada (`src/config/map-layer-definitions.ts`), panel en el mapa con icono/frescura/atribución (`src/main.ts`). Verificado con `npm run typecheck`, `npm run test` y en navegador. Spec pasa a `Implemented`. |
| 3 | 2026-09-14 | **Refactor puro, sin cambio de comportamiento** — segundo panel movido de `main.ts` a `src/ui/` en la revisión de estructura pedida por el usuario ("más fácil de trabajar como World Monitor", ver spec 038 v6 para el primero, cámaras). El panel de meteo actual (`renderMeteoPanel`/`fetchEstadoMeteoActual`) pasa a `src/ui/meteo-panel.ts` (`montarMeteoActualPanel()`); los helpers compartidos con todos los paneles (`escapeHtml`, `metaFrescura`, `buildInfoPanel`, `startPolling`) se extraen aparte a `src/ui/panel-utils.ts`, porque los siguen usando los paneles que aún no se han movido. Verificado en navegador: mismo dato real, misma cadencia de refresco, KPI de temperatura del dashboard (spec 034) sigue actualizándose. `npm run typecheck`/`test` (335/335)/`build` verdes. |
| 4 | 2026-09-16 | **`Implemented`** — DoD de V1: avisos oficiales por scraping en vez de API key de AEMET. Due-diligence real: AEMET descartada (web pública HTTP 500 + contenido por JS, además de la key obligatoria ya conocida); fuente elegida y verificada, `comunica.gva.es/es/emergencies-i-interior` (GVA Emergencias e Interior), HTML sin JS, `robots.txt` permite bots de IA explícitamente. Parser puro `src/services/avisos-meteo.ts` (9 tests con fragmento HTML real), endpoint `GET /api/meteo/v1/avisos`, integrado en el motor de insights de spec 013 (`aviso-oficial-meteo`) sin tocar UI. `npm run typecheck`/`test` (357/357)/`build` verdes; verificado contra el dev server real y en navegador — la alerta naranja real del 15/09/2026 aparece en el panel de alertas. |
