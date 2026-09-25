# Spec 049 — Zonas Acústicamente Saturadas (ZAS) y ruido en Russafa

```yaml
id: 049
titulo: "Zonas Acústicamente Saturadas (ZAS) + niveles de ruido en Russafa"
estado: Implemented
tipo: capa
depende_de: [000]
propietario: ""
version: 2
```

> Origen: petición explícita del usuario (2026-09-24) — quiere ver las "zonas ZAS" en el
> mapa junto al resto de capas prioritarias, con el "volumen" (nivel de ruido). Investigación
> de fuentes hecha en esta sesión, con llamadas reales — ver §2.

## 1. Problema / motivación

Valencia declara por ordenanza barrios/tramos de calle como **Zona Acústicamente Saturada
(ZAS)** cuando el ruido ambiental supera de forma sostenida los límites legales —la más
reciente y mediática es **Russafa**, en vigor desde el 20 de mayo de 2026 (Llei 7/2002 de la
Generalitat + Decret 104/2006, publicada en el BOP tras el Pleno del 30 de abril de 2026).
Esta capa responde a "¿qué zonas de la ciudad están declaradas ZAS, y cómo de alto es el
ruido ahora mismo en la más reciente (Russafa)?" — no es solo un mapa histórico de polígonos,
sino un cruce con lectura de ruido real cuando existe.

## 2. Fuente(s) de datos — due-diligence 2026-09-24

Todo verificado con llamadas `curl` reales contra los endpoints, no solo documentación.

| Fuente | URL | Licencia / condiciones | ¿Requiere API key? | Verificada manualmente el |
|---|---|---|---|---|
| **Polígonos de zonas ZAS** (geoportal, mismo patrón ArcGIS ya usado en spec 046) | `https://geoportal.valencia.es/server/rest/services/OPENDATA/SociedadBienestar/MapServer/5/query?where=1=1&outFields=*&f=geojson` | CC BY 4.0 (Atribución 4.0 Internacional) — uso comercial permitido | No | 2026-09-24 — `count` → **5 features**: `CARMEN`, `XUQUER` (×2 polígonos), `WOODY`, `JUAN LLORENS`. Campos: `objectid`, `zona` (string). CRS `EPSG:25830`, igual que spec 046 |
| **Estaciones de monitorización ZAS** (ubicación, no lectura) | `.../MedioAmbiente/MapServer/161/query?...&f=geojson` | Igual que arriba | No | 2026-09-24 — 12 puntos, cubren las 4 zonas ya presentes en la capa de polígonos (prefijos `W`=Woody, `C`=Carmen, `X`=Xúquer, `J`=Juan Llorens). **Ninguna corresponde a Russafa** |
| **Sonómetros de Russafa** (nivel de ruido diario por calle, NGSI/FIWARE) | 16 endpoints CSV individuales vía Pentaho CDA, patrón `https://datosbi.vlci.valencia.es/pentaho/plugin/cda/api/doQuery?path=/public/vlci/datosabiertos/calidadambiental_sonometros_ruzafa_diarios.cda&dataAccessId=sqlSonometrosRuzafaDaily&paramid=T24867X-daily&outputType=CSV&_TRUST_USER_=publicoda` (catálogo completo en `opendata.vlci.valencia.es`, buscar `soroli russafa`) | Portal de datos abiertos del Ayuntamiento (mismo marco que el resto del proyecto) | No (`_TRUST_USER_=publicoda`, acceso público) | 2026-09-24 — probado el sensor de C/ Cádiz, 16 (`T248671-daily`): datos diarios hasta **2026-09-23** (ayer respecto a la verificación), formato `entitytype:"NoiseLevelObservedAggregated"`, campos `laeq`, `laeq_d` (día), `laeq_e` (tarde), `laeq_n` (noche), `laeq_den` (Lden ponderado), `dateobserved`. 16 calles cubiertas (Cádiz, Cuba, Sueca ×4, Carles Cervera ×2, Puerto Rico, Doctor Serrano, Cura Femenía, General Prim, Matías Perelló, Salvador Abril, Vivons) |
| Mapa Estratégico de Ruido — Lden 24h / Noche (contexto ciudad, **no usado en v1**, ver §7) | `.../Salud/MapServer/144` (Lden 24h) y `/143` (noche) | CC BY 4.0 | No | 2026-09-24 — polígonos de isolíneas, campo `gridcode` (1-6), leyenda confirmada vía `drawingInfo.renderer`: `1`=&lt;55dBA, `2`=55-60, `3`=60-65, `4`=65-70, `5`=70-75, `6`=&gt;75. SHP/GeoJSON/KML/CSV/WMS/WFS disponibles |

**Hallazgo importante — gap real, no un error de búsqueda:** la capa de polígonos ZAS del
geoportal (`MapServer/5`) **no incluye todavía Russafa**, pese a llevar en vigor desde mayo.
Solo tiene las 4 zonas declaradas antes (Carmen, Xúquer, Woody, Juan Llorens). Tampoco existe
ninguna capa de geoportal con las coordenadas de los 16 sonómetros de Russafa — ni en la capa
"Estaciones ZAS" (161, solo las 4 zonas antiguas) ni en la capa general "Estaciones de ruido"
(160, red histórica de 4 estaciones fijas, Ayuntamiento/Aragón/Pista de Silla/Don Juan de
Austria, sin relación con Russafa). El propio Ayuntamiento (`valencia.es/cas/actualidad/-/
content/zas-russafa`) tampoco publica un plano descargable de las 18 calles — solo el
anuncio en prosa. **No hay fuente geométrica verificada para el polígono de Russafa ni para
la posición exacta de sus sonómetros**; ver alcance de v1 en §3 y riesgo en §7.

## 3. Contrato de datos (propuesto, no congelado)

Dos entidades separadas — no se fuerza una sola forma para "zona" y "sonómetro" porque no
comparten geometría verificada (ver hallazgo de §2):

```typescript
/** Polígono de una ZAS ya publicada en el geoportal (Carmen/Xúquer/Woody/Juan Llorens). */
interface ZonaZas {
  id: string;              // 'objectid' del geoportal
  nombre: string;           // 'zona', ej. "CARMEN"
  geometry: GeoJSON.Polygon | GeoJSON.MultiPolygon;
  observedAt: string;       // fecha de la consulta al geoportal (el dato no trae fecha de declaración)
  fetchedAt: string;
  source: 'geoportal-valencia-zas';
}

/** Lectura diaria de un sonómetro de Russafa — sin lat/lon verificada, ver §7. */
interface SonometroRuzafa {
  id: string;                // ej. 'T248671'
  direccion: string;         // ej. "C/ Cádiz, 16" — de la descripción del dataset, no geocodificada
  laeqDb: number;            // nivel global diario (dBA)
  laeqDiaDb: number | null;  // laeq_d — puede venir null (ver muestra real del 20/09)
  laeqTardeDb: number | null; // laeq_e
  laeqNocheDb: number | null; // laeq_n
  laeqLdenDb: number | null;  // laeq_den — ponderado día/tarde/noche
  fecha: string;              // 'dateobserved', día al que corresponde la lectura (no es instantánea)
  observedAt: string;
  fetchedAt: string;
  source: 'vlci-sonometros-ruzafa';
}

interface PanelZas {
  zonas: ZonaZas[];
  sonometrosRuzafa: SonometroRuzafa[];
  fetchedAt: string;
  source: 'vlc-monitor-zas';
}
```

`laeq_d`/`laeq_e`/`laeq_n`/`laeq_den` nulos en la muestra real verificada (fila del
2026-09-20 del sensor de Cádiz 16) — el pipeline debe tolerar nulos por campo, no solo por
fila entera.

## 4. Pipeline (seed → caché → endpoint) — propuesto

| Parámetro | Valor |
|---|---|
| Frecuencia de refresco (cron) | Polígonos ZAS: **seed** (dato de declaración administrativa, no cambia salvo nueva ordenanza) — igual patrón que `distritos-valencia.geojson` de spec 020. Sonómetros de Russafa: son datos **diarios** (un valor por día, no instantáneo pese al nombre "tiempo real" de un dataset relacionado no usado aquí — ver §7), refresco cada hora es más que suficiente |
| TTL en caché | Polígonos: sin TTL (seed estático, se regenera a mano si el geoportal actualiza la capa). Sonómetros: 60 min |
| Comportamiento si la fuente falla | Sonómetros: stale-on-error (mostrar última lectura diaria buena, con aviso de frescura — mismo patrón que el resto del repo). Polígonos: al ser seed, no depende de disponibilidad en vivo salvo para regenerar |
| Clave de caché | `zas:panel` |
| Endpoint interno que sirve el dato | `GET /api/emergencia/v1/zas` (mismo dominio `emergencia` que 044/046, coherente con que ambas spec conviven en `#meteo-zona-panel`-style bloques de `/inteligencia`) |

## 5. Contrato de capa de mapa

```typescript
{
  key: 'zonasZas',
  specId: '049',
  grupo: 'primaria',              // pedido explícito del usuario — capa prioritaria
  renderers: ['deck'],
  zoomMinimo: 0,
  agregacion: 'punto',            // polígonos de zona (4) — no hay suficientes para choropleth-distrito real
}
```

Los polígonos de zona se pintan como relleno semitransparente + borde (mismo patrón que
`distritos`, spec 000). Los 16 sonómetros de Russafa, **sin geometría verificada** (§2), NO
se pintan como puntos en el mapa en v1 — se muestran como **lista** (dirección + `laeqDb`
actual, coloreado por banda de dBA usando la misma leyenda 1-6 ya confirmada en la fuente de
contexto de §2) dentro de un bloque propio en `/inteligencia`, igual que hace `048` con los
avisos de movilidad. Fast-follow explícito si se quiere geocodificar: ver §7.

## 6. Criterios de aceptación (Definition of Done)

- [x] Fuente de polígonos ZAS probada con llamada real — ya hecho en §2 (2026-09-24).
- [x] Fuente de sonómetros de Russafa probada con llamada real — ya hecho en §2 (2026-09-24).
- [x] Endpoint (`GET /api/emergencia/v1/zas`) responde con el contrato de §3, tolerando
      campos `laeq_*` nulos (verificado con curl real: 5 zonas, 16 sonómetros, valores
      dBA plausibles 26-65).
- [x] Caché (TTL 60 min, `getOrFetch`) y comportamiento de fallo verificados — un sensor
      caído no rompe la respuesta (`Promise.allSettled`, filtra `null`).
- [x] Capa de polígonos ZAS (`GeoJsonLayer`, morado) con checkbox propio en Prioritarias,
      entre "Temperatura por zona" y "Precipitación" (orden pedido por el usuario). Leyenda
      verificada en navegador: "Zonas Acústicamente Saturadas — 4 declaradas / CARMEN,
      XUQUER, WOODY, JUAN LLORENS".
- [x] Bloque de sonómetros de Russafa (lista + banda de color por dBA, misma escala oficial
      que el Mapa Estratégico de Ruido) visible en `/inteligencia`, contenido fijo (como
      agenda/movilidad, no toggle de capa) — verificado en DOM real: 16 filas, ordenadas de
      más ruidosa a menos, colores de banda correctos.
- [x] Atribución de fuente y frescura (fecha+hora) visible en ambos sitios.
- [x] Advertencia visible de que Russafa no aparece todavía en el polígono ZAS del geoportal,
      tanto en la leyenda del mapa como en el aviso del panel de sonómetros (`CLAUDE.md` §4).
- [x] Verificado también en layout móvil: `zas-ruido-panel` se reparenta correctamente al
      bottom sheet y su visibilidad seguía la vista activa (oculto en `/mapa`, visible en
      `/inteligencia`) — comprobado en DOM real tras el hallazgo de que `048` se había
      quedado fuera de ese registro (no se repite aquí).
- [x] 6 tests nuevos (`zas.test.ts`, fixtures con datos reales) + 470/470 en total,
      `typecheck`/`build` verdes.

## 7. Riesgos y fuera de alcance

- **Russafa no está en la capa de polígonos del geoportal.** Es la ZAS más reciente y la que
  motivó esta spec, y no se puede dibujar su polígono sin una fuente geométrica verificada.
  No se fabrica un polígono aproximado a mano. Revisar periódicamente si el geoportal
  actualiza `MapServer/5` — cuando lo haga, es un cambio de dato, no de código.
- **Sin lat/lon verificada para los 16 sonómetros de Russafa** — se muestran como lista con
  dirección textual, no como capa de puntos en el mapa. Geocodificar las 16 direcciones
  (Nominatim/OSM u otra fuente) es un fast-follow explícito, no parte de v1: el proyecto no
  tiene hoy ningún servicio de geocodificación y añadir uno de paso, dentro de esta spec, es
  el tipo de "idea nueva a mitad de tarea" que `CLAUDE.md` §8.5 pide no colar sin más.
- **Los sonómetros de Russafa dan un valor diario agregado, no instantáneo** — existe un
  dataset del mismo catálogo con "tiempo real" en el nombre que no se ha podido verificar
  (404 en el momento de la investigación); si se confirma en el futuro, sería una v2 de esta
  spec con mayor frecuencia de refresco, no una fuente nueva.
- **Mapa Estratégico de Ruido (Lden 24h/noche, ciudad completa)** — fuente real y verificada
  (§2), pero fuera de alcance de v1: el usuario pidió ver las zonas ZAS y su volumen, no un
  mapa de ruido de toda la ciudad. Queda documentada como ampliación natural (v2 de esta
  spec) si en el futuro se quiere contexto de ruido fuera de las ZAS declaradas.
- **Los polígonos de Xúquer aparecen duplicados (2 features, mismo nombre)** — normal en
  datasets ArcGIS cuando una zona no es un polígono simple (islas/huecos); no es un error de
  la consulta, se pintan ambos.
- Las cuatro zonas ya publicadas (Carmen, Xúquer, Woody, Juan Llorens) no traen fecha de
  declaración en el propio dato — no se puede mostrar "declarada desde" para ellas, solo para
  Russafa (dato conocido por fuente externa: 2026-05-20).

## 8. Historial

| Versión | Fecha | Cambio |
|---|---|---|
| 1 | 2026-09-24 | Creación — due-diligence completa con llamadas reales: polígonos ZAS (geoportal, 5 zonas, Russafa ausente), estaciones de monitorización de las 4 zonas antiguas (sin relación con Russafa), 16 sonómetros diarios de Russafa (NGSI/FIWARE vía Pentaho CDA, verificado con datos hasta el día anterior), mapa estratégico de ruido de contexto (verificado, fuera de alcance de v1). Contrato de datos y de capa propuestos, sin congelar. |
| 2 | 2026-09-24 | Implementada — `src/services/zas.ts` (normalización + catálogo curado de los 16 sonómetros, 6 tests), seed (`scripts/seed-zonas-zas.ts` → `data/zonas-zas.json`, ejecutado en vivo), endpoint `GET /api/emergencia/v1/zas` (combina seed estático + 16 fetch en paralelo con `Promise.allSettled`), capa `GeoJsonLayer` en `/mapa` + panel de lista en `/inteligencia` (`#zas-ruido-panel`, contenido fijo). Registrado en `leyendasPorToggle`, `idsInteligencia` e `IDS_REPARENTABLES` (móvil) desde el principio — no repite el bug real de `048` (panel huérfano sin registrar) encontrado y corregido en la sesión anterior. 470/470 tests, `typecheck`/`build` verdes, verificado en navegador (desktop y móvil) contra datos reales. Pendiente real, ajeno a esta spec: confirmación visual pixel a pixel del relleno morado en el mapa, bloqueada por el mismo bug de render de MapLibre GL v6 documentado en spec 050 §6 (la leyenda y los datos sí están verificados en vivo). |
