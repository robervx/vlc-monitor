# Spec 052 — Altimetría como capa de mapa (choropleth por distrito)

```yaml
id: 052
titulo: "Altimetría de Valencia como capa activable en /mapa (choropleth por distrito)"
estado: Implemented
tipo: capa
depende_de: [000, 044]
propietario: ""
version: 1
```

> Origen: petición explícita del usuario (2026-09-25) — pide "un mapa de calor por altimetría
> de la ciudad como layer superpuesta", igual criterio que temperatura/ZAS/precipitación
> (specs 049/050/051): capas ya `Implemented` en otro sitio (aquí, un panel de texto en
> `/inteligencia`) que faltaban como capa visual en `/mapa`.

## 1. Problema / motivación

La altimetría de Valencia (spec 044) ya se calcula y se muestra como ranking de texto
("más alto → más bajo" por distrito) en `#altimetria-panel` de `/inteligencia`, pero no existe
como capa visual en `/mapa`. Responde a "¿qué zonas de la ciudad están más elevadas / más
expuestas por cota baja?" — relevante junto a riesgo de acumulación de agua (spec 046): un
distrito bajo y con lluvia activa es justo el cruce de señales que la misión del proyecto
("comprender qué está ocurriendo") pide poder ver de un vistazo en el mapa, no solo en una
lista aparte.

## 2. Fuente(s) de datos

Ninguna fuente nueva. Reutiliza tal cual el endpoint ya `Implemented` en spec 044:

| Fuente | URL | Licencia / condiciones | ¿Requiere API key? | Verificada manualmente el |
|---|---|---|---|---|
| IGN — Modelo Digital del Terreno, ya agregado por distrito (spec 044) | `GET /api/emergencia/v1/altimetria` (interno; fuente original `servicios.idee.es/wms-inspire/mdt`, capa `EL.ElevationGridCoverage`) | Datos geográficos oficiales de libre reutilización (verificado en spec 044) | No | Reutilizada — verificado en esta sesión (2026-09-25) que el endpoint devuelve las 19 filas de `data/altimetria-valencia.json` (`elevacionMinM`/`MaxM`/`MediaM` por distrito, rango real 2.5 m — Poblats Marítims — a 40.9 m — Poblats de l'Oest) |

## 3. Contrato de datos (normalizado)

Ninguno nuevo — reutiliza `ResumenAltimetriaDistrito` (`src/services/altimetria.ts`, spec 044)
tal cual: `distritoCodigo`, `distritoNombre`, `elevacionMinM`, `elevacionMaxM`,
`elevacionMediaM`, `muestras`. Esta spec no toca ese contrato.

## 4. Pipeline (seed → caché → endpoint)

| Parámetro | Valor |
|---|---|
| Frecuencia de refresco (cron) | Ninguna — dato estático (la altimetría no cambia), seedeado una única vez (spec 044, `npm run seed:altimetria`) |
| TTL en caché | El que ya tiene el endpoint (`cache-control: public, max-age=86400`) — sin cambios |
| Comportamiento si la fuente falla | El mismo que ya tiene ese endpoint — sin cambios (no hay llamada de red en cada petición, sirve el JSON versionado) |
| Endpoint interno que sirve el dato | `GET /api/emergencia/v1/altimetria` (ya existe, sin cambios) |

## 5. Contrato de capa de mapa

```typescript
{
  key: 'altimetria',
  specId: '052',
  grupo: 'primaria',       // junto al resto de capas de emergencia/meteo por zona (046/050/051)
  renderers: ['deck'],
  zoomMinimo: 0,
  agregacion: 'choropleth-distrito',
}
```

### Elección de diseño: choropleth de 19 distritos, no un heatmap suave (`HeatmapLayer`)

El dato real disponible (`data/altimetria-valencia.json`) **solo tiene el resumen agregado por
distrito** (19 filas: min/max/media) — el script de seed (`scripts/seed-altimetria.ts`) sí
consulta una rejilla de puntos individuales al IGN para calcular esa media, pero **los
descarta tras agregar**, no los persiste. Dos opciones evaluadas:

- **Opción A — elegida.** `GeoJsonLayer` choropleth por distrito sobre `elevacionMediaM`,
  reutilizando el geojson de distritos ya cargado en memoria (`featureCollection`, la misma
  variable que usan ya `riesgo-escorrentia` y `pulso-distrito` en `renderLayers()`) y el JSON
  de altimetría ya existente. Coste de red nuevo: cero. Es un choropleth de 19 zonas, no un
  degradado continuo — pero es **honesto con el dato real que hay**: no simula una precisión
  de rejilla que no se ha conservado. Mismo nivel de detalle que las otras capas choropleth ya
  `Implemented` del proyecto (`riesgo-escorrentia`, `pulso-distrito`), que no han generado
  objeción del usuario por "falta de resolución".
- **Opción B — descartada por ahora.** Modificar `scripts/seed-altimetria.ts` para persistir
  también los puntos individuales de la rejilla (ya calculados, solo hace falta no
  descartarlos) en un fichero nuevo, e instalar `@deck.gl/aggregation-layers` (no está en
  `package.json` del proyecto) para un `HeatmapLayer` de verdad. Es más fiel a "mapa de calor"
  en sentido literal, pero añade una dependencia nueva y un fichero de datos nuevo para una
  ganancia visual marginal en una ciudad prácticamente plana (0-41 m de rango total) donde el
  choropleth por distrito ya comunica con claridad qué zona está más alta/baja. Si en el
  futuro se necesita más resolución (p. ej. para un cálculo real de pendiente/riesgo de
  inundación por parcela), esa es una spec propia con su propio contrato — no se cuela de
  pasada aquí.

Paleta: gradiente de dos colores sobre `elevacionMediaM` (0-45 m, saturando en los extremos,
mismo patrón de acotado que `colorTemperaturaZona` en spec 050) — verde para cota baja
(litoral, coherente con la asociación visual "bajo = cerca del mar/agua") a marrón/tierra para
cota alta (interior), convención habitual de mapas topográficos. Alpha moderado (~140-190)
para no tapar el mapa base ni competir visualmente con `riesgo-escorrentia` cuando ambas capas
están activas a la vez (casos de uso distintos: nunca se espera que compartan exactamente el
mismo relleno de distrito al mismo tiempo salvo que el usuario active ambas a propósito).

## 6. Criterios de aceptación (Definition of Done)

- [x] Entrada nueva en `LAYER_REGISTRY` (`altimetria`, `grupo: 'primaria'`).
- [x] Checkbox propio en el selector de Prioritarias.
- [x] `GeoJsonLayer` choropleth en el mapa, color por `elevacionMediaM`, con mini-leyenda
      (distrito más alto / más bajo reales).
- [x] Atribución "IGN" visible en la leyenda — sin `metaFrescura`/timestamp de "actualizado
      hace...": el dato es estático (nunca cambia), así que mostrar una fecha de refresco
      sería engañoso (mismo criterio que ya usa el panel de `/inteligencia` de spec 044, que
      tampoco la muestra para esta misma fuente).
- [x] `META_CAPAS` del glosario.
- [x] Verificado con datos reales end-to-end: el endpoint `GET /api/emergencia/v1/altimetria`
      devuelve las 19 filas reales; la leyenda calcula correctamente el distrito más alto
      (Poblats de l'Oest, ~40.9 m) y más bajo (Poblats Marítims, ~2.5 m).
- [x] `typecheck`/`test`/`build` verdes.
- [ ] **Pendiente real, no de esta spec**: confirmación visual pixel a pixel del choropleth
      pintado en el mapa — mismo bug de renderizado intermitente de MapLibre GL v6 ya
      documentado (condición de carrera no determinista, solo en `npm run dev`, ajena a esta
      capa — ver spec 050 §6). El código sigue el patrón exacto de `GeoJsonLayer` choropleth
      ya verificado en `riesgo-escorrentia`/`pulso-distrito`.

## 7. Riesgos y fuera de alcance

- **Resolución de 19 distritos, no una rejilla continua** — ver razonamiento de la Opción A en
  §5. Documentado también en el glosario para que no se lea como más preciso de lo que es.
- **Redundancia aparente con el panel de `/inteligencia`** (`#altimetria-panel`, spec 044) —
  ese panel sigue existiendo tal cual (ranking de texto, útil para comparar valores exactos);
  esta capa es la versión espacial/visual del mismo dato, no lo sustituye.
- Sin cambios de pipeline/backend — todo el riesgo de esta spec es de UI, reutiliza un
  endpoint y un contrato de datos ya `Implemented` sin tocarlos.
- No se instala `@deck.gl/aggregation-layers` ni ninguna dependencia nueva (Opción A no la
  necesita) — si una spec futura decide de verdad un `HeatmapLayer` con rejilla real, esa
  decisión y su coste de dependencia se evalúan en esa spec, no aquí.

## 8. Historial

| Versión | Fecha | Cambio |
|---|---|---|
| 1 | 2026-09-25 | Creación e implementación en el mismo cambio (spec ligera, reutiliza sin cambios la fuente y el endpoint ya `Implemented` en spec 044) — entrada en `LAYER_REGISTRY`, checkbox en Prioritarias, `GeoJsonLayer` choropleth por `elevacionMediaM`, leyenda, `META_CAPAS` (glosario). `typecheck`/`test`/`build` verdes. Verificación visual pixel a pixel pendiente por el mismo bug de render de MapLibre documentado en spec 050 §6. |
