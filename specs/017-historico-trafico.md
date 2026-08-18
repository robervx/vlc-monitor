# 017 — Histórico y analítica de tráfico

```yaml
id: 017
titulo: "Histórico de tráfico (snapshots agregados por distrito)"
estado: Implemented
tipo: infraestructura
depende_de: [004]
propietario: ""
version: 2
```

## 0. Decisión de persistencia (resuelve la pregunta pendiente del backlog)

`004` (tráfico en tiempo real) no guarda nada — cada petición recalcula desde la fuente, con caché de proceso que no sobrevive a un cold start (ver `api/_shared/cache.ts`). No hay Upstash Redis provisionado en este entorno (mismo motivo que en `001` §4: requiere que el usuario cree la cuenta). Para tener histórico de verdad hace falta algo que corra en el tiempo sin depender de que alguien visite la web.

**Decisión del usuario (2026-08-18):** GitHub Actions cron, **cada 60 minutos**, que ejecuta un script, calcula un snapshot agregado (no los 412 tramos en crudo) y lo comitea a un fichero versionado del repo. Justificación de la cadencia — el repo es **privado**, así que GitHub Actions consume minutos del plan gratuito (2.000 min/mes):

| Cadencia | Runs/día | Minutos/mes (≈1 min/run) | ¿Cabe en el gratis? |
|---|---|---|---|
| 15 min | 96 | ~2.880 | No |
| 30 min | 48 | ~1.440 | Sí, holgado |
| **60 min (elegido)** | 24 | ~720 | Sí, muy holgado |

Para que el fichero no crezca sin límite con los meses, los snapshots horarios se compactan a agregados diarios pasados 30 días (ver §3-§4) — el propio script hace la compactación en cada ejecución, no hace falta un segundo workflow.

## 1. Problema / motivación

Hoy no hay forma de saber si el tráfico de un distrito un jueves a las 18h es "normal" o ya es una señal de algo — no hay ningún punto de comparación en el tiempo. Esta spec construye esa base: guardar cómo ha estado el tráfico hora a hora para poder, más adelante, comparar fechas de eventos contra el patrón habitual.

## 2. Fuente(s) de datos

**No es una fuente nueva** — reutiliza `fetchEstadoTrafico` de la spec `004` (Geoportal ArcGIS), ejecutado por el script de snapshot en vez de por un endpoint HTTP.

| Fuente | Verificada manualmente el ___ |
|---|---|
| `fetchEstadoTrafico` (spec 004, ya `Implemented`) | Reutilizada tal cual — no hace falta reverificar la fuente externa, ya está verificada en `specs/004-capa-trafico-tiempo-real.md`. Sí se verifica en esta spec que el **script de snapshot** produce un fichero válido con una ejecución real contra el dev server (ver §6). |

## 3. Contrato de datos (normalizado)

```typescript
interface SnapshotDistrito {
  codigo: string;
  congestion: number;   // 0-1, misma fórmula que componenteTrafico (spec 010) — reutilizada, no reinventada
  muestras: number;      // nº de tramos con dato que entraron en el cálculo
}

interface SnapshotHorario {
  timestamp: string;         // ISO 8601, hora del snapshot
  distritos: SnapshotDistrito[];
}

interface RollupDiario {
  fecha: string;              // YYYY-MM-DD
  distritos: Array<{ codigo: string; congestionMedia: number; muestras: number }>; // muestras = nº de snapshots horarios agregados ese día
}

// Contrato de salida del endpoint de lectura:
interface PuntoHistoricoTrafico {
  timestamp: string;                    // hora exacta (snapshot horario) o medianoche (rollup diario)
  congestion: number;                    // 0-1
  resolucion: 'horaria' | 'diaria';
}

interface HistoricoTrafico {
  distritoCodigo: string | 'ciudad';    // 'ciudad' = media de los 19 distritos
  puntos: PuntoHistoricoTrafico[];       // orden cronológico ascendente
  fetchedAt: string;
  source: 'vlc-monitor-historico';
}
```

## 4. Pipeline (seed → caché → endpoint)

| Parámetro | Valor |
|---|---|
| Frecuencia de refresco (cron) | GitHub Actions, cada 60 min (`0 * * * *`) — ver §0. |
| Almacén | Ficheros versionados en el repo: `data/trafico-historico.json` (snapshots horarios, ventana móvil de 30 días) y `data/trafico-historico-diario.json` (rollup diario, sin límite de antigüedad — son ~19 filas/día, crecimiento trivial). Mismo patrón que `data/distritos-valencia.json` (asset estático versionado, spec 000). |
| Compactación | En cada ejecución del script: cualquier snapshot horario con más de 30 días se agrupa por día (`congestionMedia` = media de sus `congestion`), se añade a `trafico-historico-diario.json` si ese día no está ya, y se elimina de `trafico-historico.json`. Idempotente — si el script se ejecuta dos veces seguidas, no duplica. |
| Comportamiento si la fuente falla | El script no escribe nada y termina con código de error — el commit de ese run no se hace (no se inserta un snapshot vacío/falso). El workflow lo reintentará en la siguiente hora. |
| Endpoint interno que sirve el dato | `GET /api/trafico/v1/historico?distrito=<codigo\|omitido>&dias=<n, default 7>` |

**Nota de despliegue:** cada commit del cron dispara un redeploy automático en Vercel (integración Git estándar), así el endpoint sirve siempre los ficheros más recientes bundleados — no hace falta ninguna caché propia en el endpoint de lectura (datos estáticos en el momento del build).

## 5. Contrato de capa de mapa

No es una capa de mapa — panel con un mini-gráfico (sparkline SVG) de la congestión media de ciudad en las últimas 24h, más el histórico accesible por distrito vía el endpoint (sin selector de distrito en la UI en v1 — ver §7).

```typescript
{
  key: 'trafico-historico',
  specId: '017',
  renderers: [],
  zoomMinimo: 0,
  agregacion: 'punto',
  icono: '',
}
```

## 6. Criterios de aceptación (Definition of Done)

- [x] Funciones puras de agregación/compactación probadas con fixtures — `src/services/trafico-historico.ts` (`agregarSnapshotPorDistrito`, `compactarSnapshotsAntiguos`, `construirHistoricoDistrito`, `sparklinePath`), 10 tests.
- [x] Script `scripts/snapshot-trafico-historico.ts` ejecutado dos veces contra la fuente real (Geoportal, vía `npm run snapshot:trafico-historico`) — 19 distritos, ~405 tramos con dato, snapshots reales en `data/trafico-historico.json`.
- [x] Workflow `.github/workflows/trafico-historico-cron.yml` con cadencia horaria (`0 * * * *`), validado sintácticamente con `js-yaml`.
- [x] Endpoint `GET /api/trafico/v1/historico` responde con el contrato de la sección 3, para ciudad (por defecto) y para un distrito concreto (`?distrito=01`) — `api/trafico/v1/historico.ts`, 3 tests.
- [x] Panel con sparkline de las últimas 24h visible en el mapa, con atribución y frescura — verificado en navegador; se detectó y corrigió en esta misma verificación un recorte del trazo en el borde superior del SVG cuando la congestión es muy baja (padding vertical añadido a `sparklinePath`).
- [x] La spec documenta explícitamente que la ejecución real y sostenida del cron en GitHub **no es verificable dentro de esta sesión** (solo se verifica que el script funciona y que el YAML es correcto) — el primer dato histórico de verdad se acumulará con el uso, hora a hora, después de mergear. El panel maneja explícitamente el estado "todavía no hay suficiente histórico" (menos de 2 puntos).

## 7. Riesgos y fuera de alcance

- **Riesgo (honesto):** hasta que pasen unas horas/días tras el merge, `data/trafico-historico.json` estará casi vacío — el panel debe manejar con naturalidad "todavía no hay suficiente histórico" en vez de romperse o mostrar un gráfico vacío confuso.
- **Riesgo:** si Vercel no tiene conectado el auto-deploy en push a `master`, los commits del cron no se reflejan en producción hasta un deploy manual — fuera del control de esta spec (es configuración de la cuenta de Vercel del usuario, no código).
- **Riesgo:** un repo privado con GitHub Actions activo consume minutos incluso si nadie los mira — a 60 min de cadencia se queda muy por debajo del límite gratis (ver §0), pero si en el futuro se añaden más workflows programados hay que revisar la suma total.
- **Fuera de alcance de esta spec:** comparación automática "este jueves vs jueves anterior" o detección de anomalías sobre el histórico (eso, si se hace, sería una regla más del motor de insights, spec `013`), selector de distrito en la UI del sparkline (v1 es solo ciudad, el endpoint sí soporta `distrito` para uso futuro), exportar/descargar el histórico.

## 8. Historial

| Versión | Fecha | Cambio |
|---|---|---|
| 1 | 2026-08-18 | Creación. Persistencia decidida explícitamente por el usuario: GitHub Actions cada 60 min + snapshots agregados versionados en el repo, con compactación a diario pasados 30 días. |
| 2 | 2026-08-18 | DoD completo: funciones puras + tests (`src/services/trafico-historico.ts`), script de snapshot verificado contra la fuente real (`scripts/snapshot-trafico-historico.ts`), workflow de GitHub Actions (`.github/workflows/trafico-historico-cron.yml`), endpoint de lectura (`api/trafico/v1/historico.ts`), panel con sparkline en el mapa (`src/main.ts`, `index.html`). Verificado con `npm run typecheck`, `npm run test` (105/105) y en navegador — se corrigió un recorte visual del sparkline detectado durante la verificación. Spec pasa a `Implemented`. |
