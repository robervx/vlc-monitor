# 043 — Cámaras urbanas externas (red viaria que rodea Valencia)

```yaml
id: 043
titulo: "Bloque de cámaras de tráfico externas (red viaria de acceso a Valencia), separado de las cámaras internas de spec 038"
estado: Implemented
tipo: panel
depende_de: [038, 040]
propietario: ""
version: 3
```

> **Estado:** `Implemented` (v3, 2026-09-17) — la investigación real de fuente (§2) encontró
> algo mejor de lo previsto: los datos de la DGT están publicados como **open data oficial
> con licencia Creative Commons Attribution**, no hace falta pasar por `livetrafik.com` (el
> agregador de referencia del usuario) ni por ningún mecanismo "personal" gateado. Ver §2 y
> §6 para el detalle completo y el DoD. **v3**: caja propia (`#camaras-dgt-panel`), ya no
> comparte panel con las internas de spec 038 — primer bloque de `/inteligencia`, pedido
> explícito del usuario ("no se pueden ver en grande" como las de ciudad).

## 1. Problema / motivación

Spec `038` cubre cámaras **dentro** de Valencia ciudad (Xarxa de Webcams de Turisme CV:
Plaça de l'Ajuntament, playa, Jardín del Turia, El Saler). El usuario quiere además un
bloque **separado**, con cámaras de tráfico de las vías que **rodean** la ciudad (accesos,
rondas, autovías) — para ver de un vistazo el estado de las entradas/salidas antes de que
llegue a las calles internas. Referencia que el usuario dio como ejemplo de lo que quiere
lograr: `https://livetrafik.com/es/camaras/comunidad-valenciana` (agregador de cámaras de
tráfico de la Comunitat Valenciana). **Uso previsto originalmente: personal/interno del
usuario** (no necesariamente público por defecto, mismo mecanismo "personal" gateado por
env var de spec `038`/`ADR-003`) — pero la investigación real (§2) encontró una fuente con
licencia explícita de reuso, así que termina siendo **pública por defecto**, sin gating.

## 2. Fuente(s) de datos

**Verificada en vivo el 2026-09-17.** Se descartó `livetrafik.com` (la referencia del
usuario) como fuente a scrapear: es un agregador de terceros detrás de un desafío
anti-bot de Cloudflare (`cdn-cgi/challenge-platform`) y sirve sus imágenes como `blob:`
del lado del cliente — ni el `robots.txt` (permisivo) ni la due-diligence ligera de v1
anticipaban esto, pero intentar scrapearlo cruzaría una protección técnica deliberada, no
un simple "hotlinking sin permiso" como `meteo365.es` en spec 038. Se investigó
directamente la hipótesis de fuente primaria (DGT) — con un resultado mejor de lo
esperado:

| Fuente | Qué es | Verificación |
|---|---|---|
| `etraffic.dgt.es` (mapa interactivo Leaflet de incidencias) | La app web de "tráfico en directo" de la DGT | **Descartada como fuente de datos** — su API (`POST /etrafficWEB/api/cache/getFilteredData`) devuelve el payload **codificado/ofuscado**, no JSON plano. Revertir esa ofuscación cruzaría la misma línea que `livetrafik.com` (medida técnica deliberada contra el consumo automatizado) — no se investiga más. |
| `dgt.es/conoce-el-estado-del-trafico/camaras-de-trafico/` | Página pública oficial de cámaras de la DGT, con filtro por provincia/carretera | **Fuente real usada.** Sirve un JSON plano sin autenticación: `https://www.dgt.es/.content/.assets/json/camaras.json` (1918 cámaras de toda España, `id`/`carretera`/`pk`/`sentido`/`latitud`/`longitud`/`imagen`). Confirmado con `curl` directo — HTTP 200, sin WAF ni ofuscación. |
| Imagen de cámara (`https://etraffic.dgt.es/camarasEtraffic/<id>.jpg`) | JPEG estático que se refresca en origen | Confirmado con `curl`: HTTP 200, `content-type: image/jpeg`, `cache-control: max-age=120` (~2 min), sin protección de hotlinking ni bloqueo de user-agent. Patrón ya documentado por la comunidad (integración de Home Assistant `jonathanathe/camaras-trafico-ha`, URL estable por cámara). |
| Licencia | — | **Creative Commons Attribution**, confirmado en el catálogo oficial de datos abiertos: `nap.dgt.es/dataset/camaras-dgt-datex2-v3-7` ("Cámaras DGT DATEX2 v3.7", "Licencia y gratuito", términos de uso `dgt.es/contenido/aviso-legal/`). El feed JSON consumido aquí es la misma fuente oficial (dgt.es) que alimenta su propia página pública, no un scraping de un tercero. |

**Consecuencia para `ADR-003`:** al existir permiso explícito de reuso (CC BY), esta capa
va como fuente **"pública"**, no "personal" — a diferencia de la hipótesis original de la
spec (que asumía tener que gatear por env var como spec 038). Mejor resultado del previsto.

**Alcance geográfico:** el feed nacional trae 1918 cámaras; filtrado a la provincia de
Valencia (código `46`) da 130, pero la provincia se extiende ~80 km tierra adentro
(Requena/Utiel) — fuera del alcance pedido ("red viaria que rodea Valencia"). Se aplica un
radio de 20 km alrededor del centro de la ciudad (39.4699, -0.3763), quedando **84 cámaras**
en exactamente las vías que pidió el usuario: A-3, A-7, AP-7, V-30, V-21, V-31, V-15, V-23,
CV-30/33/36/365/410/500, N-220 — rondas + autovías/CV de acceso inmediato.

## 3. Contrato de datos (normalizado)

```typescript
interface CamaraExternaDgt {
  id: string;
  carretera: string;   // "A-3", "V-30", "CV-36"...
  pk: string;           // punto kilométrico, tal cual lo sirve la DGT
  sentido: string;       // "+" (creciente) | "-" (decreciente)
  lat: number;
  lon: number;
  imagenUrl: string;      // https://etraffic.dgt.es/camarasEtraffic/<id>.jpg
}
```

`src/services/camaras-dgt.ts` — funciones puras: `normalizarCamarasDgt` (filtra
provincia 46 + radio de 20 km, tolera coordenadas mal formateadas del feed — coma inicial,
coma como separador decimal, encontradas de verdad en los datos reales) y
`agruparPorCarretera` (agrupa + ordena por PK para la UI).

## 4. Pipeline (seed → caché → endpoint)

Igual que spec 038 — **config estática, no endpoint propio**: la lista de cámaras
(ubicación, carretera, URL de imagen) es lo único que cambia con poca frecuencia y se
seedea una vez (`npm run seed:camaras-dgt` → `scripts/seed-camaras-dgt.ts` → escribe
`data/camaras-dgt-valencia.json`, 84 cámaras). La imagen en sí (lo que de verdad es
"tiempo real") la pide el navegador de quien mira **directo a `etraffic.dgt.es`**, nunca a
través de nuestro backend — igual de "sin backend" que los streams DASH de spec 038.
Refresco del lado del cliente cada 2 min (`?t=timestamp` en el `src`), acorde al
`cache-control` real de la fuente.

## 5. Contrato de capa de mapa

No aplica una capa de mapa nueva — vive como **bloque separado** ("Cámaras en vías de
acceso (DGT)") dentro del mismo panel de cámaras de la vista `/inteligencia` (spec `040`),
debajo del bloque de cámaras internas de spec `038`, agrupado por carretera en acordeones
(`<details>`) con aviso de fuente y licencia.

## 6. Criterios de aceptación (Definition of Done)

- [x] Fuente primaria real identificada y verificada con llamada directa: JSON de
      `dgt.es` (curl, HTTP 200) + imagen de `etraffic.dgt.es` (curl, HTTP 200,
      `content-type: image/jpeg`) + licencia confirmada en `nap.dgt.es` (Creative Commons
      Attribution) — `livetrafik.com` descartado explícitamente por sus protecciones
      anti-scraping (`CLAUDE.md` §8.2).
- [x] Clasificación `ADR-003`: **pública** (no "personal"), con evidencia de licencia
      explícita — mejor resultado que la hipótesis de partida.
- [x] Máxima cobertura razonable: 84 cámaras (de 1918 en el feed nacional), radio de 20 km
      alrededor de Valencia — no 2-3 simbólicas.
- [x] Bloque visualmente separado de las cámaras internas (spec 038) dentro de
      `/inteligencia`, agrupado por carretera, con atribución de fuente y licencia visible.
- [x] `src/services/camaras-dgt.ts` (funciones puras) + 5 tests con datos reales
      (`camaras-dgt.test.ts`), incluidos los dos formatos de coordenada rota encontrados de
      verdad en el feed.
- [x] `scripts/seed-camaras-dgt.ts` (`npm run seed:camaras-dgt`) ejecutado contra la fuente
      real — `data/camaras-dgt-valencia.json` con 84 cámaras reales committeado.
- [x] Bug real encontrado y corregido durante la verificación: `#camaras-panel` usaba
      `overflow: hidden` (sin scroll) — con las 84 cámaras nuevas el contenido se recortaba
      en vez de desbordar con scroll (mismo tipo de bug que `#insights-panel` en spec 013
      v8). Corregido a `overflow: hidden auto`.
- [x] Verificado en navegador con datos reales: 15 grupos por carretera, 84 imágenes,
      imagen real de la V-31 confirmada visualmente (tráfico real circulando).
- [x] `npm run typecheck` / `npm run test` (382/382) / `npm run build` verdes.

## 7. Riesgos y fuera de alcance

- **Riesgo — fiabilidad de disponibilidad de cámaras individuales**: la DGT puede dar de
  baja o mover cámaras sin aviso (el propio feed real tenía 3 entradas con coordenadas mal
  formateadas). No hay verificación de "cámara caída" en tiempo real — una imagen rota se
  ve como tal (sin overlay de error dedicado, a diferencia de spec 038); aceptable porque
  el coste de un `<img>` roto es mucho menor que un `<video>` colgado.
- **Riesgo — el feed de `dgt.es` es informal** (no el XML DATEX2 formal del catálogo NAP,
  sino el JSON que la propia web pública usa) — si dgt.es cambia la estructura de su
  página, este JSON podría dejar de publicarse en esa ruta exacta; mitigado porque el seed
  es manual (no un cron que falle en silencio) y el `robots.txt`/licencia siguen siendo el
  respaldo legal aunque cambie la URL concreta.
- **Descartado explícitamente**: `livetrafik.com` como fuente a scrapear (protección
  anti-bot activa) y `etraffic.dgt.es` (payload ofuscado) — ver §2.
- **Fuera de alcance v1**: cualquier cámara fuera del radio de 20 km alrededor de Valencia
  ciudad (esto es sobre los accesos, no una red genérica de toda la provincia/España);
  reetiquetado dinámico de cámaras caídas (fast-follow si se convierte en un problema real).

## 8. Historial

| Versión | Fecha | Cambio |
|---|---|---|
| 1 | 2026-09-17 | Creación (Draft), a petición explícita del usuario — segundo punto de la tanda de trabajo post-V1. Due-diligence ligera de `robots.txt` de `livetrafik.com` (permisivo) y primer intento de localizar la fuente primaria probable (DGT) — sin verificar en profundidad. Pendiente de investigación real antes de implementar. |
| 2 | 2026-09-17 | **Implemented.** Investigación real de fuente: `livetrafik.com` descartado (Cloudflare anti-bot + imágenes `blob:`), `etraffic.dgt.es` descartado (payload ofuscado); fuente real = JSON público de `dgt.es` + imágenes JPEG de `etraffic.dgt.es/camarasEtraffic/<id>.jpg`, licencia Creative Commons Attribution confirmada en `nap.dgt.es` — **pública por defecto**, mejor resultado que la hipótesis "personal" de v1. `src/services/camaras-dgt.ts` (funciones puras, 5 tests), `scripts/seed-camaras-dgt.ts` (seed real, 84 cámaras en `data/camaras-dgt-valencia.json`), bloque nuevo en `src/ui/camaras-panel.ts` agrupado por carretera. Bug real corregido: `#camaras-panel` sin scroll interno (`overflow: hidden` → `overflow: hidden auto`). Verificado en navegador con imagen real de tráfico. 382/382 tests, `typecheck`/`build` verdes. |
| 3 | 2026-09-17 | Reestructuración de UI pedida por el usuario: pasa a tener su propia caja (`#camaras-dgt-panel`, `montarCamarasDgtPanel()`), separada del panel de cámaras internas de spec 038 — antes ambas vivían en el mismo `#camaras-panel`. Primer bloque de `/inteligencia` (`order: 1`), seguido de las cámaras internas. Sin cambio en el contenido (agrupación por carretera, refresco cada 2 min) ni en la fuente. Verificado en navegador (escritorio y móvil, bottom sheet). |
