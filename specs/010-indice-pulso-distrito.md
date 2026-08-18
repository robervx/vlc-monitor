# 010 — Índice de Pulso de Distrito (compuesto)

```yaml
id: 010
titulo: "Índice compuesto de Pulso de Distrito (tráfico + aire + meteo adversa)"
estado: Implemented
tipo: indice-compuesto
depende_de: [001, 002, 004]
propietario: ""
version: 2
```

## 1. Problema / motivación

De un vistazo, ¿qué distrito está "más tenso" ahora mismo — combinando tráfico denso, mala calidad del aire y tiempo adverso — sin tener que mirar capa por capa? Es la pieza diferencial del producto (ver `docs/01_VIABILIDAD_VISION_Y_PROCESO.md` §2.2), inspirada en el CII (Country Instability Index) de World Monitor pero a escala de distrito.

## 2. Fuente(s) de datos

**No es una fuente nueva — es un cálculo derivado de tres specs ya implementadas.** No hace ninguna llamada externa propia; reutiliza los endpoints/caché ya existentes.

| Fuente | Endpoint interno | Rol en el índice |
|---|---|---|
| Tráfico en tiempo real (spec 004) | `GET /api/trafico/v1/estado` | Único componente **por distrito** — el resto son valores de ciudad aplicados por igual a los 19 distritos. |
| Calidad del aire (spec 002) | `GET /api/aire/v1/actual` | Componente de ciudad (un solo punto, ver spec 002 §7). |
| Meteorología (spec 001) | `GET /api/meteo/v1/actual` | Componente de ciudad, transformado en una puntuación de "adversidad" (calor/frío/viento/lluvia extremos). |

**Fuera de v1, deliberadamente:** "incidencias", el cuarto componente que menciona `ROADMAP.md` (F3), no tiene spec ni fuente propia todavía — no existe ninguna spec de incidencias en `specs/INDEX.md`. Se añadirá como componente cuando exista esa spec, sin tener que reabrir esta.

**Verificado 2026-08-18:** los 19 distritos tienen al menos un tramo de tráfico resuelto (mínimo 2, distrito 19; máximo 48, distrito 10) — confirmado contra `GET /api/trafico/v1/estado` en el dev server. No hace falta fallback por distrito sin dato de tráfico, pero el cálculo lo contempla igualmente (ver §3).

## 3. Contrato de datos (normalizado)

```typescript
interface PulsoDistrito {
  distritoCodigo: string;
  distritoNombre: string;
  indice: number;          // 0-100
  categoria: 'Tranquilo' | 'Moderado' | 'Tenso' | 'Crítico';
  componentes: {
    trafico: number;        // 0-1, por distrito
    aire: number;            // 0-1, valor de ciudad (igual en los 19 distritos)
    meteo: number;           // 0-1, valor de ciudad (igual en los 19 distritos)
  };
  observedAt: string;        // el más antiguo de los tres observedAt de entrada, honesto sobre el dato más "viejo" que entra en la mezcla
  fetchedAt: string;
  source: 'vlc-monitor-compuesto';
}
```

**Fórmula** (pesos elegidos porque tráfico es el único componente que distingue entre distritos — ver §7 sobre por qué no son "ciencia", son una heurística documentada y reproducible):

- `trafico` (0-1): media ponderada del estado de los tramos del distrito — `fluido`=0, `denso`=0.3, `congestionado`=0.6, `cortado`=1.0 (`sin-datos` se excluye del cálculo). Si el distrito no tiene ningún tramo con dato, `trafico = 0` (neutro, no se penaliza por falta de dato).
- `aire` (0-1): `min(1, indiceEuropeo / 100)`.
- `meteo` (0-1): el mayor de estos cuatro sub-scores (el factor más adverso domina, no se promedian):
  - calor: `clamp((temperatura - 35) / 7, 0, 1)`
  - frío: `clamp((5 - temperatura) / 10, 0, 1)`
  - viento: `clamp((vientoRachas - 50) / 40, 0, 1)`
  - lluvia: `clamp((precipitacion - 2) / 8, 0, 1)`
- `indice = round(100 * (0.5 * trafico + 0.3 * aire + 0.2 * meteo))`
- `categoria`: `< 25` Tranquilo, `< 50` Moderado, `< 75` Tenso, resto Crítico.

## 4. Pipeline (seed → caché → endpoint)

| Parámetro | Valor |
|---|---|
| Frecuencia de refresco (cron) | No aplica cron propio — se recalcula en cada petición a partir de las tres cachés ya existentes (TTL 15 min meteo, 60 min aire, 3 min tráfico). |
| TTL en caché | Ninguna caché propia — el cálculo es barato (19 distritos, sin llamada de red) y las tres entradas ya están cacheadas cada una con su TTL. |
| Comportamiento si la fuente falla | Si cualquiera de las tres llamadas internas falla y no tiene stale-on-error propio que ofrecer, el endpoint devuelve 502 — no se inventa un índice con datos parciales. |
| Clave de caché | No aplica (ver arriba). |
| Endpoint interno que sirve el dato | `GET /api/pulso/v1/distrito` |

## 5. Contrato de capa de mapa

```typescript
{
  key: 'pulsoDistrito',
  specId: '010',
  renderers: ['deck'],
  zoomMinimo: 0,
  agregacion: 'choropleth-distrito',
  icono: '',
}
```

Color por `categoria`: verde (Tranquilo) → amarillo (Moderado) → naranja (Tenso) → rojo (Crítico), mismo espíritu que la escala de calidad del aire (spec 002). Capa activable con toggle, igual patrón que las demás.

## 6. Criterios de aceptación (Definition of Done)

- [x] Función pura de cálculo (`calcularPulsoDistrito`) probada con fixtures — sin red — cubriendo: distrito con tráfico fluido/denso/congestionado/cortado, distrito sin tramos, meteo adversa (calor/frío/viento/lluvia, incluyendo que domina el máximo y no la media) y meteo neutra. `src/services/pulso-distrito.test.ts`, 12 tests.
- [x] Endpoint `GET /api/pulso/v1/distrito` responde con el contrato de la sección 3 para los 19 distritos, reutilizando las cachés de las specs 001/002/004 (mismas claves) sin llamada de red propia — `api/pulso/v1/distrito.ts`, verificado contra el dev server real (19 distritos, `Extramurs` con más tráfico).
- [x] Capa choropleth visible y legible en el mapa, coloreada por categoría, activable con un toggle "Pulso de Distrito" — verificado visualmente en navegador.
- [x] Atribución ("VLC Monitor (compuesto)") y frescura visibles en la UI mientras la capa está activa — leyenda con conteo por categoría y el distrito más tenso.
- [x] La spec documenta explícitamente que "incidencias" queda fuera de v1 por no existir esa fuente todavía (§2).

## 7. Riesgos y fuera de alcance

- **Riesgo (asumido conscientemente):** los pesos (0.5/0.3/0.2) y los umbrales de la meteo adversa son una heurística razonada, no un estándar validado — a diferencia del European AQI (spec 002) o los códigos WMO (spec 001), que sí son estándares externos. Documentado aquí para que cualquier ajuste futuro cambie esta spec, no un número mágico enterrado en el código.
- **Riesgo:** con solo tráfico variando por distrito, el índice de dos distritos con tráfico parecido puede salir casi idéntico aunque intuitivamente sean muy distintos — es la consecuencia honesta de que aire/meteo son de ciudad en v1 (ver specs 001 §7 y 002 §7). Mejora cuando existan fuentes de aire/meteo por distrito.
- **Fuera de alcance de esta spec:** componente de incidencias (ver §2), ponderación configurable por el usuario, histórico/tendencia del índice, alertas automáticas basadas en el índice (eso, si se hace, es una spec de "avisa, no actúa" — `CLAUDE.md` §4 — no esta).

## 8. Historial

| Versión | Fecha | Cambio |
|---|---|---|
| 1 | 2026-08-18 | Creación. Dependencias (001, 002, 004) ya `Implemented` — fórmula y pesos documentados, sin fuente externa propia. |
| 2 | 2026-08-18 | DoD completo: función pura + tests (`src/services/pulso-distrito.ts`), endpoint que combina las tres cachés existentes (`api/pulso/v1/distrito.ts`), capa registrada, choropleth + toggle + leyenda en el mapa (`src/main.ts`). Verificado con `npm run typecheck`, `npm run test` y en navegador. Spec pasa a `Implemented`. |
