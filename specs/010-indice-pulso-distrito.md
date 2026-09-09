# 010 — Índice de Pulso de Distrito (compuesto)

```yaml
id: 010
titulo: "Índice compuesto de Pulso de Distrito (tráfico + incidencias + aire + meteo)"
estado: Implemented
tipo: indice-compuesto
depende_de: [001, 002, 004, 026]
propietario: ""
version: 3
```

> **v3 (2026-09-09):** recalibración — ver §9. La v2 dejaba los 19 distritos en
> "Tranquilo" siempre (la media del estado de cientos de tramos entierra unos pocos
> cortes, y la meteo solo sumaba > 35 °C). v3 amplifica la componente de tráfico ×2.5
> en la fórmula, añade **incidencias de vía pública** como 4º componente (spec `026`,
> el que la v1 dejó pendiente), baja el arranque de la meteo y usa la sensación
> térmica, y recalibra pesos y umbrales de categoría.

## 1. Problema / motivación

De un vistazo, ¿qué distrito está "más tenso" ahora mismo — combinando tráfico denso, mala calidad del aire y tiempo adverso — sin tener que mirar capa por capa? Es la pieza diferencial del producto (ver `docs/01_VIABILIDAD_VISION_Y_PROCESO.md` §2.2), inspirada en el CII (Country Instability Index) de World Monitor pero a escala de distrito.

## 2. Fuente(s) de datos

**No es una fuente nueva — es un cálculo derivado de specs ya implementadas.** No hace ninguna llamada externa propia; reutiliza los endpoints/caché ya existentes.

| Fuente | Endpoint interno | Rol en el índice |
|---|---|---|
| Tráfico en tiempo real (spec 004) | `GET /api/trafico/v1/estado` | Componente **por distrito**. |
| Incidencias de vía pública (spec 026) | `GET /api/via-publica/v1/incidencias` | Componente **por distrito** (v3). Degrada a 0 si la fuente falla. |
| Calidad del aire (spec 002) | `GET /api/aire/v1/actual` | Componente de ciudad (un solo punto, ver spec 002 §7). |
| Meteorología (spec 001) | `GET /api/meteo/v1/actual` | Componente de ciudad, transformado en una puntuación de "adversidad". |

**v3 (2026-09-09):** se incorpora el 4º componente de incidencias que la v1 había dejado pendiente "hasta que exista esa spec" — la spec `026` existe desde 2026-08-26.

**Verificado 2026-08-18:** los 19 distritos tienen al menos un tramo de tráfico resuelto (mínimo 2, distrito 19; máximo 48, distrito 10) — confirmado contra `GET /api/trafico/v1/estado` en el dev server. No hace falta fallback por distrito sin dato de tráfico, pero el cálculo lo contempla igualmente (ver §3).

## 3. Contrato de datos (normalizado)

```typescript
interface PulsoDistrito {
  distritoCodigo: string;
  distritoNombre: string;
  indice: number;          // 0-100
  categoria: 'Tranquilo' | 'Moderado' | 'Tenso' | 'Crítico';
  componentes: {
    trafico: number;         // 0-1, por distrito (media ponderada ya amplificada ×2.5)
    incidencias: number;     // 0-1, por distrito (v3)
    aire: number;            // 0-1, valor de ciudad (igual en los 19 distritos)
    meteo: number;           // 0-1, valor de ciudad (igual en los 19 distritos)
  };
  observedAt: string;        // el más antiguo de los observedAt de entrada
  fetchedAt: string;
  source: 'vlc-monitor-compuesto';
}
```

**Fórmula (v3)** — heurística documentada y reproducible (§7). Tráfico e incidencias distinguen entre distritos; aire y meteo son valores de ciudad aplicados por igual a los 19. Pesos y umbrales viven en constantes exportadas (`PESOS_PULSO`, `UMBRALES_CATEGORIA_PULSO`) que lee el glosario (spec 037).

- `trafico` (0-1): media ponderada del estado de los tramos del distrito (`fluido`=0,
  `denso`=0.3, `congestionado`=0.6, `cortado`=1; `sin-datos` excluido), **amplificada
  ×2.5** en la fórmula. `componenteTrafico()` en sí no cambia (la spec 017 lo reutiliza
  sin amplificar); la ×2.5 vive en `calcularPulsoDistrito`. Distrito sin ningún tramo
  con dato → `trafico = 0`.
- `incidencias` (0-1, **nuevo en v3**, por distrito, spec `026`): `obras` pesan 0.1,
  `incidencias`/`festejos` 0.4 (un permiso de obra vigente ≠ calle cortada ahora).
  `clamp01( suma_pesos / 12 )`. Solo con `vigenciaHasta >= ahora`. Si la fuente de
  `026` falla, `incidencias = 0` y el resto del índice se calcula igual.
- `aire` (0-1): `clamp01( (indiceEuropeo - 15) / 65 )` — "Buena" (< 20) ≈ 0,
  "Moderada" (40) ≈ 0.38, "Mala" (60) ≈ 0.69.
- `meteo` (0-1): el mayor de estos sub-scores (el factor más adverso domina):
  - calor: `clamp01( (max(temperatura, sensacionTermica) - 28) / 12 )`
  - frío: `clamp01( (6 - temperatura) / 8 )`
  - viento: `clamp01( (vientoRachas - 40) / 45 )`
  - lluvia: `clamp01( (precipitacion - 0.5) / 6 )`
- `indice = round(100 · (0.45·trafico + 0.15·incidencias + 0.25·aire + 0.15·meteo))`
- `categoria`: `< 18` Tranquilo, `< 38` Moderado, `< 62` Tenso, resto Crítico.

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

- [x] Función pura de cálculo (`calcularPulsoDistrito`) probada con fixtures — sin red — cubriendo cada componente (tráfico media/amplificación, incidencias obras vs incidencias, aire, meteo con calor/frío/viento/lluvia y que domina el máximo), umbrales de categoría y degradación sin incidencias. `src/services/pulso-distrito.test.ts`, 20 tests.
- [x] Endpoint `GET /api/pulso/v1/distrito` responde con el contrato de §3 para los 19 distritos, reutilizando las cachés de 001/002/004/**026** (v3, degrada si `026` falla) sin llamada de red propia — `api/pulso/v1/distrito.ts`.
- [x] Capa choropleth visible y legible en el mapa, coloreada por categoría, activable con un toggle "Pulso de Distrito" — verificado visualmente en navegador.
- [x] Atribución ("VLC Monitor (compuesto)") y frescura visibles en la UI mientras la capa está activa — leyenda con conteo por categoría y el distrito más tenso.
- [x] La spec documenta explícitamente que "incidencias" queda fuera de v1 por no existir esa fuente todavía (§2).

## 7. Riesgos y fuera de alcance

- **Riesgo (asumido conscientemente):** los pesos (0.5/0.3/0.2) y los umbrales de la meteo adversa son una heurística razonada, no un estándar validado — a diferencia del European AQI (spec 002) o los códigos WMO (spec 001), que sí son estándares externos. Documentado aquí para que cualquier ajuste futuro cambie esta spec, no un número mágico enterrado en el código.
- **Riesgo:** con solo tráfico variando por distrito, el índice de dos distritos con tráfico parecido puede salir casi idéntico aunque intuitivamente sean muy distintos — es la consecuencia honesta de que aire/meteo son de ciudad en v1 (ver specs 001 §7 y 002 §7). Mejora cuando existan fuentes de aire/meteo por distrito.
- **Fuera de alcance de esta spec:** componente de incidencias (ver §2), ponderación configurable por el usuario, histórico/tendencia del índice, alertas automáticas basadas en el índice (eso, si se hace, es una spec de "avisa, no actúa" — `CLAUDE.md` §4 — no esta).

## 9. v3 — recalibración (2026-09-09)

**Motivación:** con la fórmula v2 los 19 distritos salían siempre "Tranquilo" (índice
8-14 en vivo), incluso con distritos que el motor de insights marcaba con 3-5 tramos
congestionados o cortados. Tres causas:

1. **Tráfico como media, sin amplificar.** `media(pesos)` sobre los ~15-48 tramos de un
   distrito entierra 5 cortes entre decenas de fluidos (→ ~0.02). v3 **amplifica ×2.5**
   esa media en la fórmula (sin cambiar `componenteTrafico`, que la spec 017 reutiliza).
2. **Meteo casi siempre 0.** El calor solo sumaba > 35 °C. v3 arranca a 28 °C y usa
   `max(temperatura, sensacionTermica)`; viento desde 40 km/h, lluvia desde 0,5 mm.
3. **Solo 3 componentes.** La v1 dejó "incidencias" fuera "hasta que exista esa spec".
   La spec `026` existe desde 2026-08-26 con `distritoCodigo` por incidencia — v3 la
   incorpora (peso 0.15), dando más señal por distrito.

**Umbrales de categoría** bajados (25/50/75 → **18/38/62**) para que el rango real que
produce la fórmula use las cuatro categorías.

**Sigue siendo una heurística** (§7): todo está aquí y en constantes exportadas, nada
enterrado. El `distrito-critico` de insights (spec 013) usa el Pulso **sin** el
componente de incidencias (no fetchea `026`) — menos sensible, aceptable.

## 8. Historial

| Versión | Fecha | Cambio |
|---|---|---|
| 1 | 2026-08-18 | Creación. Dependencias (001, 002, 004) ya `Implemented` — fórmula y pesos documentados, sin fuente externa propia. |
| 2 | 2026-08-18 | DoD completo: función pura + tests (`src/services/pulso-distrito.ts`), endpoint que combina las tres cachés existentes (`api/pulso/v1/distrito.ts`), capa registrada, choropleth + toggle + leyenda en el mapa (`src/main.ts`). Verificado con `npm run typecheck`, `npm run test` y en navegador. Spec pasa a `Implemented`. |
| 3 | 2026-09-09 | Recalibración (§9): tráfico ×2.5 en la fórmula, 4º componente de **incidencias de vía pública** (spec `026`, peso 0.15, degrada si falla), meteo con arranque a 28 °C + sensación térmica, pesos `0.45/0.15/0.25/0.15`, umbrales de categoría `18/38/62`. `componentes.incidencias` nuevo. `PESOS_PULSO` / `UMBRALES_CATEGORIA_PULSO` exportados. `pulso-distrito.test.ts` 20 tests. |
