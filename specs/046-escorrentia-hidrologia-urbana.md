# Spec 046 — Escorrentía e hidrología urbana de Valencia

```yaml
id: 046
titulo: "Indicador de riesgo de acumulación de agua por distrito (densidad de imbornales + lluvia)"
estado: Implemented      # DoD completo salvo verificación con lluvia real (2026-09-23)
tipo: capa
depende_de: [000, 020, 044]
propietario: ""
version: 3
```

> Origen: investigación del usuario sobre SIRA/escorrentía/hidrología urbana, documentada en
> `docs/investigacion/ESCORRENTIA_HIDROLOGIA_URBANA_VLC.md`. Esta spec acota esa
> investigación a una **primera versión realista** (densidad de imbornales + lluvia por
> distrito), dejando fuera de alcance explícito el modelo completo de saturación hidráulica
> (SIRA + topografía LiDAR + coeficiente de escorrentía normativo) hasta que haya una razón
> concreta para ampliarlo — ver §7.

## 1. Problema / motivación

`044` ya responde "cuánto llueve en cada distrito". Esta spec añade la otra mitad de la
pregunta: "¿esa zona tiene capacidad de evacuar esa lluvia, o es de las que se conocen por
acumular agua?" — un indicador relativo (no una predicción de inundación) que cruce lluvia
reciente con densidad real de sumideros/imbornales por distrito, para dar una lectura de
"qué zona está comparativamente peor preparada para esta lluvia concreta".

## 2. Fuente(s) de datos — due-diligence 2026-09-17

**SIRA (el sistema municipal de gestión de la red de alcantarillado en sí) queda
descartado como fuente para esta spec.** Verificado en dos frentes:

- El propio SIRA es una base de datos de gestión interna del contrato de mantenimiento de
  la red (colectores con cota/pendiente/sección, fichas fotográficas) — sin cara pública,
  sin API, sin dataset descargable.
- El único canal de acceso es un trámite administrativo de la sede electrónica
  (`sede.valencia.es`, procedimiento `SN.OT.30`, "Información de la red de saneamiento
  municipal para un..."): solicitud puntual por escrito, **solo para quien vaya a
  ejecutar una actuación real sobre la red** (obra, acometida), no un canal de datos
  abiertos ni una API. Sin mención a descarga masiva ni reutilización. En 2017 tenía tasas
  explícitas por formato de plano (140,87 € en A-4 hasta 365,24 € en A-0) — no hay
  evidencia de que ahora sea gratuito ni de que admita un uso como el de este proyecto.

**En su lugar, se encontró una fuente real, pública y con licencia de reutilización
explícita** que sí sirve como proxy: el geoportal municipal expone un servicio ArcGIS
Server bajo la carpeta `OPENDATA` (no confundir con la ruta antigua `/arcgis/rest/...`,
que da `Connection reset` — la ruta real y operativa es `/server/rest/services/...`), con
capacidades `Map,Query,Data` (consultable directamente, no solo visualizable):

| Fuente | URL | Licencia / condiciones | ¿Requiere API key? | Verificada manualmente el |
|---|---|---|---|---|
| **Imbornales** (sumideros de pluviales) | `https://geoportal.valencia.es/server/rest/services/OPENDATA/UrbanismoEInfraestructuras/MapServer/221` | Ley 37/2007 de reutilización de la información del sector público (geoportal general, ver `smartcity.valencia.es/vlci/geoportal/`) — libre para consulta y creación de nuevos servicios, incluido uso comercial | No | 2026-09-17 (curl/browser: `count` → 68.152 puntos; campos `objectid`, `shape`, `tipo` — ej. `IMBORNAL VALENCIA`, `RECTANGULAR`; CRS `EPSG:25830`, la misma proyección ETRS89 UTM 30N que ya convierte `src/services/utm.ts` para `044`) |
| **Puntos de cota** (elevación puntual real, con Z) | `.../MapServer/111` | Igual que arriba | No | 2026-09-17 — 29.700 puntos, campos incluyen `x`,`y`,`z` reales |
| **Hidrografia** (cauces/acequias/barrancos) | `.../MapServer/113` | Igual que arriba | No | 2026-09-17 — 10.379 líneas |
| **Orografia** (curvas de nivel) | `.../MapServer/131` | Igual que arriba | No | 2026-09-17 — 198.014 líneas |
| Lluvia/viento por distrito, pluviómetros reales, AVAMET | ya `Implemented` en `044` | — | No | Reutilizado tal cual, sin cambios |
| Distritos (geometría) | `data/distritos-valencia.geojson` (ya en el repo, spec `020`) | — | No | Reutilizado tal cual |

**Consecuencia sobre el alcance:** las capas de "Puntos de cota"/"Orografia" cambian el
diagnóstico del documento de investigación (`docs/investigacion/...md` §4): **no hace
falta descargar el MDT LiDAR de 50 cm del PNOA para tener topografía real de Valencia** —
ya existe, servida y consultable, dentro del mismo servicio que las otras capas. Eso
convierte un futuro modelo HAND completo en algo mucho más abordable de lo que parecía en
la investigación original — pero sigue siendo una ampliación de alcance mayor que esta v1
(ver §7), no algo que se meta de pasada aquí.

## 3. Contrato de datos (congelado 2026-09-23)

Cruza densidad de imbornales por distrito (estático) con la lluvia ya calculada por `044`
(en vivo), sin tocar SIRA ni topografía todavía. Campos y nombres alineados con el resto
del repo (`distritoCodigo`, no `distritoId` — mismo campo que usan `LluviaVientoDistrito`
de `044` y `ResumenAltimetriaDistrito`):

```typescript
interface RiesgoEscorrentiaDistrito {
  distritoCodigo: string;      // mismo código oficial que ya usa `020`/`044`
  distritoNombre: string;
  imbornalesCount: number;      // recuento real dentro del polígono del distrito
  areaKm2: number;
  densidadImbornalesPorKm2: number;
  lluviaUltimaHoraMm: number;    // reutiliza el dato ya calculado por `044` (meteo-zona.ts, Open-Meteo)
  activo: boolean;               // lluviaUltimaHoraMm >= 0.2mm — si false, indiceRelativo es 0 y la UI muestra "sin lluvia registrada", no un número en reposo
  indiceRelativo: number;        // 0-100, entero (sin decimales) — NO una probabilidad de inundación
  advertencia: string;           // fijo: "Estimación relativa a partir de densidad de sumideros y lluvia registrada — no sustituye avisos oficiales de Protección Civil"
  observedAt: string;
  fetchedAt: string;
  source: readonly ['geoportal-valencia-imbornales', '044']; // siempre ambas — el indicador es por definición un cruce
}
```

### Fórmula de `indiceRelativo` (revisión de metodología con `asesor-ciencia-datos-vlc`, 2026-09-23)

`indiceRelativo = round(vulnerabilidadEstructuralPct × factorLluvia)` — **producto**, no
suma ni media ponderada, para que sin lluvia activa el índice sea 0 en los 19 distritos
sin excepción, aunque la densidad de imbornales sea mala (evita el falso positivo de
"riesgo" sin causa presente):

- **`vulnerabilidadEstructuralPct`** — percentil **por rango** (no min-max ni z-score) de
  `densidadImbornalesPorKm2` entre los 19 distritos, invertido (menos imbornales/km² = más
  vulnerable). Estático, se precalcula una sola vez en el seed
  (`scripts/seed-imbornales-distrito.ts` → `vulnerabilidadPercentil` en
  `data/imbornales-distrito.json`). Percentil por rango en vez de min-max/z-score: con
  n=19, un solo distrito atípico de densidad no debe deformar la escala de los otros 18 —
  min-max reescala todo contra el extremo, z-score es inestable con media/desviación de
  solo 19 puntos.
- **`factorLluvia`** — `0` por debajo de `UMBRAL_LLUVIA_ACTIVACION_MM` (0,2 mm/h: por
  debajo de eso, `current.precipitation` de Open-Meteo puede ser una lectura residual del
  modelo interpolado, no lluvia real), satura a `1` en `UMBRAL_LLUVIA_MM` (= 5, el mismo
  umbral de "lluvia intensa" que ya usa el motor de insights, `src/services/insights.ts` —
  no se inventa un segundo criterio de "lluvia intensa" desincronizado del resto del repo).
  Entre ambos umbrales, escala linealmente.

Implementado en `src/services/riesgo-escorrentia.ts` (`calcularRiesgoEscorrentia`,
`percentilPorRangoInvertido`, `factorLluvia`), 13 tests.

`indiceRelativo` sigue siendo una normalización relativa entre distritos, no un cálculo
físico de caudal — se marca así de forma explícita en la UI (campo `advertencia` siempre
visible), coherente con `CLAUDE.md` §4 (ninguna capa se sirve sin dejar claro qué es una
estimación). En UI, `activo: false` se presenta como "sin lluvia registrada ahora" (estado
inactivo/gris), y con `activo: true` el indicador se presenta como **ranking ordinal**
entre distritos ("X está comparativamente peor preparado que Y para esta lluvia
concreta"), nunca con etiquetas fijas tipo "riesgo alto/medio/bajo" — con solo 19
distritos, cortes fijos son arbitrarios y ese lenguaje se confunde fácilmente con los
niveles oficiales de Protección Civil/AEMET.

## 4. Pipeline (seed → caché → endpoint) — propuesto

| Parámetro | Valor |
|---|---|
| Frecuencia de refresco (cron) | Recuento + vulnerabilidad por distrito: **seed único** (offline, `scripts/seed-imbornales-distrito.ts`, `npm run seed:imbornales`) — dato estático (infraestructura, no cambia en tiempo real), igual que `altimetria` en `044`. Ejecutado en vivo el 2026-09-23: 68.152 puntos descargados (paginado, `maxRecordCount=2000`), 267 fuera de término municipal, 67.885 asignados a los 19 distritos |
| TTL en caché | La parte dinámica (lluvia) hereda el TTL ya activo del endpoint de `044` (`emergencia/v1/meteo-zona`, 15 min) — se invoca como handler en el mismo proceso (patrón ya usado por `047`/`sintesis-ia-v2.ts`), no una llamada HTTP interna. El propio endpoint de `046` cachea el resultado combinado con el mismo TTL |
| Comportamiento si la fuente falla | El seed es offline y versionado (`data/imbornales-distrito.json`) — no depende de disponibilidad en vivo del geoportal salvo para regenerar el seed. Si `044` no responde, el endpoint degrada `lluviaUltimaHoraMm` a 0 / `activo: false` para ese distrito, nunca rompe la respuesta entera |
| Endpoint interno que sirve el dato | `GET /api/emergencia/v1/riesgo-escorrentia` |

## 5. Contrato de capa de mapa

```typescript
{
  key: 'riesgoEscorrentia',
  specId: '046',
  grupo: 'contexto',
  renderers: ['deck'],
  zoomMinimo: 0,          // corregido de 'ciudad' (string) — LayerDefinition.zoomMinimo es number, mismo valor que el resto de capas a nivel ciudad
  agregacion: 'choropleth-distrito',
}
```

Implementado en `src/config/map-layer-definitions.ts` (entrada `riesgoEscorrentia`), checkbox propio en
"Contexto e informativas" (`#toggle-riesgo-escorrentia`, `src/main.ts`), choropleth
`GeoJsonLayer` (azul, gris cuando `activo: false`), mini-leyenda (`riesgo-escorrentia-leyenda`)
y metadato en el glosario (`src/ui/glosario.ts`, spec 037).

## 6. Criterios de aceptación (Definition of Done)

- [x] Fuente probada con al menos una llamada real (no solo documentación) — geoportal
      consultado en vivo el 2026-09-17 (§2).
- [x] Seed de imbornales por distrito generado y versionado en `data/` — 67.885 imbornales
      reales asignados a los 19 distritos (`data/imbornales-distrito.json`, 2026-09-23).
- [x] Endpoint responde con el contrato de datos de §3 — verificado con curl contra el dev
      server real.
- [x] Capa choropleth visible y legible en `/mapa` a nivel distrito — verificado en
      navegador (toggle, contador de capas activas, colores por `indiceRelativo`/`activo`).
- [x] Bloque textual en `/inteligencia` (o dentro de `#meteo-zona-panel`) con el ranking de
      distritos, atribución de fuente y la advertencia de estimación relativa siempre
      visible.
- [ ] Verificado con datos reales tras lluvia (no solo con `indiceRelativo` en cero).

## 7. Riesgos y fuera de alcance

- **SIRA descartado explícitamente para esta spec** (§2) — si en el futuro se abre un
  cauce distinto (convenio, solicitud formal con propósito de investigación/gestión
  municipal), sería una spec/ADR nueva, no una reapertura silenciosa de esta.
- **Fuera de alcance de v1**: el modelo completo de saturación hidráulica (`ISH =
  Q_entrada/Q_evacuación`) del documento de investigación, con topografía HAND e
  hidrografía — ahora más abordable gracias a `111`/`113`/`131` (§2), pero sigue siendo
  un cruce de varias capas geométricas con procesamiento GIS no trivial (relleno de
  sumideros, direcciones de flujo), fuera del patrón habitual de spec de este repo. Se
  reserva como posible **v4 de esta misma spec** (v2/v3, ambas del 2026-09-23, son la
  versión acotada de este documento — contrato y luego implementación), no una spec nueva,
  cuando haya capacidad de abordar ese pipeline.
- **`densidadImbornalesPorKm2` es un proxy, no una medición de capacidad real de
  evacuación** — un distrito con muchos imbornales pero colectores viejos/infradimensionados
  seguiría subestimado por este indicador. Se documenta como limitación conocida en la UI
  (texto de `advertencia` en §3), no se presenta como si fuera el dato de SIRA.
- El campo `tipo` de imbornales (`RECTANGULAR`, `IMBORNAL VALENCIA`, etc.) no está
  documentado por el proveedor — no se usa para diferenciar capacidad hasta confirmar su
  significado real (evitar inventar una interpretación no verificada).
- **El percentil por rango es robusto a outliers pero comprime diferencias reales**: dos
  distritos con densidades muy distintas pero rango consecutivo reciben una diferencia de
  solo ~5,3 puntos (100/18) aunque su densidad real difiera mucho más. Trade-off consciente
  por robustez con n=19, no un error.
- **`lluviaUltimaHoraMm` hereda el sesgo de cobertura ya documentado en `044`**: es un
  valor por distrito interpolado por un modelo (Open-Meteo), no una red densa de
  estaciones reales — no se repite el análisis aquí, pero se hereda sin cambios.
- **El score compuesto (vulnerabilidad × lluvia) vive solo en esta capa, no en el motor de
  insights.** `src/services/insights.ts` (specs 013/024) documenta que sus reglas son
  declarativas independientes, nunca un score ponderado entre señales — `indiceRelativo`
  de esta spec es intencionadamente un score compuesto, pero es un indicador de
  mapa/choropleth, no una regla de alerta. Si en el futuro se quiere generar un `Insight`
  cuando `indiceRelativo` supere un umbral, esa sería una regla nueva y declarativa dentro
  de `insights.ts` que *consuma* el campo ya calculado — no meter la ponderación dentro del
  motor de insights.

## 8. Historial

| Versión | Fecha | Cambio |
|---|---|---|
| 1 | 2026-09-17 | Creación — due-diligence de SIRA (descartado) y de la alternativa real encontrada (geoportal ArcGIS `OPENDATA`, capas de imbornales/puntos de cota/hidrografía/orografía, verificadas en vivo). Contrato de datos propuesto para una v1 acotada (densidad de imbornales + lluvia por distrito); contrato aún sin congelar. |
| 2 | 2026-09-23 | Contrato congelado: revisión de metodología con `asesor-ciencia-datos-vlc` para la fórmula de `indiceRelativo` (producto vulnerabilidad-por-rango × factor de lluvia con umbral de activación, en vez de suma/media — evita falsos positivos sin lluvia); campo `activo` añadido; `distritoId` renombrado a `distritoCodigo` (consistencia con el resto del repo); `source` pasa a array de ambas fuentes. Seed ejecutado en vivo (67.885 imbornales asignados a 19 distritos). Servicio (`riesgo-escorrentia.ts`, 13 tests) y endpoint (`GET /api/emergencia/v1/riesgo-escorrentia`) implementados y verificados en vivo contra el dev server real (sin lluvia en el momento de la verificación → `activo: false` en los 19 distritos, comportamiento esperado). Capa de mapa y panel pausados por edición concurrente de `main.ts`/`index.html`/`map-layer-definitions.ts` desde otra sesión (spec `048`). |
| 3 | 2026-09-23 | Completa el DoD, misma sesión, tras liberarse los ficheros compartidos (spec `048` fusionada sin conflictos). Entrada en `LAYER_REGISTRY` (`riesgoEscorrentia`, `grupo: 'contexto'`), checkbox propio en el selector (`#toggle-riesgo-escorrentia`), `GeoJsonLayer` choropleth (azul, gris cuando `activo: false`) + mini-leyenda con ranking, metadato en el glosario. Bloque textual con ranking ordinal (no bandas "alto/medio/bajo" — spec 046 §3) añadido como 4º bloque de `#meteo-zona-panel` en `/inteligencia`, con la advertencia siempre visible. Verificado en navegador: toggle, contador "1/5" de capas de contexto, texto real "Sin lluvia registrada ahora mismo" en ambas ubicaciones (comportamiento correcto para el momento de la verificación, sin lluvia). typecheck/build/464 tests en verde. Único pendiente real: verificar el camino con lluvia activa cuando llueva en Valencia (cubierto por 13 tests unitarios, no por una observación en vivo). |
