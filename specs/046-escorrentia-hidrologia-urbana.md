# Spec 046 — Escorrentía e hidrología urbana de Valencia

```yaml
id: 046
titulo: "Indicador de riesgo de acumulación de agua por distrito (densidad de imbornales + lluvia)"
estado: Draft            # due-diligence de fuentes completada 2026-09-17; contrato de datos sin congelar todavía
tipo: capa
depende_de: [000, 020, 044]
propietario: ""
version: 1
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

## 3. Contrato de datos (propuesto, sin congelar)

Primera versión — cruza densidad de imbornales por distrito con la lluvia ya calculada por
`044`, sin tocar SIRA ni topografía todavía:

```typescript
interface RiesgoEscorrentiaDistrito {
  distritoId: string;        // mismo código oficial que ya usa `020`/`044`
  distritoNombre: string;
  imbornalesCount: number;    // recuento real dentro del polígono del distrito
  areaKm2: number;
  densidadImbornalesPorKm2: number;
  lluviaUltimaHoraMm: number;  // reutiliza el dato ya calculado por `044`
  indiceRelativo: number;      // 0-100, normalizado entre distritos — NO una probabilidad de inundación
  advertencia: string;         // fijo: "Estimación relativa a partir de densidad de sumideros y lluvia registrada — no sustituye avisos oficiales de Protección Civil"
  observedAt: string;
  fetchedAt: string;
  source: 'geoportal-valencia-imbornales' | '044';
}
```

`indiceRelativo` es una normalización simple (percentil entre distritos, no un cálculo
físico de caudal) — se marca así de forma explícita en la UI, coherente con `CLAUDE.md`
§4 (ninguna capa se sirve sin dejar claro qué es una estimación).

## 4. Pipeline (seed → caché → endpoint) — propuesto

| Parámetro | Valor |
|---|---|
| Frecuencia de refresco (cron) | Recuento de imbornales por distrito: **seed único** (offline, `scripts/seed-imbornales-distrito.ts`) — es un dato casi estático (infraestructura, no cambia en tiempo real), igual que `altimetria` en `044` |
| TTL en caché | El cruce con lluvia hereda el TTL ya activo del endpoint de `044` (no se cachea por separado) |
| Comportamiento si la fuente falla | El seed es offline y versionado (`data/imbornales-distrito.json`) — no depende de disponibilidad en vivo del geoportal salvo para regenerar el seed |
| Endpoint interno que sirve el dato | `GET /api/emergencia/v1/riesgo-escorrentia` |

## 5. Contrato de capa de mapa

```typescript
{
  key: 'riesgo-escorrentia',
  renderers: ['deck'],
  zoomMinimo: 'ciudad',
  agregacion: 'choropleth-distrito',
  icono: '',
}
```

## 6. Criterios de aceptación (Definition of Done)

- [x] Fuente probada con al menos una llamada real (no solo documentación) — geoportal
      consultado en vivo el 2026-09-17 (§2).
- [ ] Seed de imbornales por distrito generado y versionado en `data/`.
- [ ] Endpoint responde con el contrato de datos de §3.
- [ ] Capa choropleth visible y legible en `/mapa` a nivel distrito.
- [ ] Bloque textual en `/inteligencia` (o dentro de `#meteo-zona-panel`) con el ranking de
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
  reserva como posible **v2 de esta misma spec**, no una spec nueva, cuando haya
  capacidad de abordar ese pipeline.
- **`densidadImbornalesPorKm2` es un proxy, no una medición de capacidad real de
  evacuación** — un distrito con muchos imbornales pero colectores viejos/infradimensionados
  seguiría subestimado por este indicador. Se documenta como limitación conocida en la UI
  (texto de `advertencia` en §3), no se presenta como si fuera el dato de SIRA.
- El campo `tipo` de imbornales (`RECTANGULAR`, `IMBORNAL VALENCIA`, etc.) no está
  documentado por el proveedor — no se usa para diferenciar capacidad hasta confirmar su
  significado real (evitar inventar una interpretación no verificada).

## 8. Historial

| Versión | Fecha | Cambio |
|---|---|---|
| 1 | 2026-09-17 | Creación — due-diligence de SIRA (descartado) y de la alternativa real encontrada (geoportal ArcGIS `OPENDATA`, capas de imbornales/puntos de cota/hidrografía/orografía, verificadas en vivo). Contrato de datos propuesto para una v1 acotada (densidad de imbornales + lluvia por distrito); contrato aún sin congelar. |
