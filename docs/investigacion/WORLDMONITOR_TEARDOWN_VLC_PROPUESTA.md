# Radiografía técnica de World Monitor + propuesta para VLC Monitor (monitor de Valencia en tiempo real)

**Fecha:** 2026-08-17
**Fuente primaria:** código fuente real de [`github.com/koala73/worldmonitor`](https://github.com/koala73/worldmonitor) (AGPL-3.0-only, v2.10.0), clonado y auditado directamente — no solo la web pública. Complementado con [`docs.worldmonitor.app`](https://www.worldmonitor.app/docs/documentation) y con investigación del panorama de datos abiertos de Valencia.
**Objetivo del documento:** extraer el máximo conocimiento reutilizable de cómo está construido World Monitor, y traducirlo a una propuesta concreta para el nuevo objetivo del proyecto — antes conocido como "CISE Command Center" (sala de llamadas policial) y ahora reorientado a un **monitor en tiempo real de la ciudad de Valencia**, a escala distrito/barrio/calle.

---

## 1. Qué es World Monitor, en una frase técnica

Una SPA en **TypeScript vanilla** (sin framework — ni React, ni Vue) que renderiza un **mapa como elemento central** (no un dashboard de tarjetas), alimentado por ~40 dominios de datos externos agregados vía **funciones edge + cron jobs + caché Redis en 3 niveles**, con un **catálogo de capas de mapa unificado** que un solo archivo gobierna para dos motores de render distintos (globo 3D y mapa plano WebGL).

No es un proyecto pequeño: 5.800+ ficheros, contratos API generados desde Protocol Buffers, 6 variantes de producto desde un único código base, app de escritorio (Tauri), SDKs en 4 lenguajes, servidor MCP para agentes IA. **Gran parte de esa envergadura no aplica a un monitor de ciudad** — lo señalo en la sección 4 para no arrastrar complejidad innecesaria.

---

## 2. Stack técnico real (verificado en `package.json` / `ARCHITECTURE.md`)

| Categoría | Tecnología |
|---|---|
| Frontend | TypeScript vanilla + Vite (sin React/Vue/Angular, decisión deliberada) |
| Mapa 3D | `globe.gl` + Three.js |
| Mapa 2D | `deck.gl` + MapLibre GL JS |
| Tiles del mapa base | OpenFreeMap (gratis, sin API key) / CARTO (gratis) / PMTiles autoalojado (opcional) |
| Clustering de marcadores | Supercluster |
| Grid espacial (zonas de interferencia GPS) | H3 hexagonal, resolución 4 (~22 km de lado) |
| Escritorio | Tauri 2 (Rust) + sidecar Node.js |
| IA/ML | Ollama local / Groq / OpenRouter + Transformers.js en navegador (embeddings, sentimiento, resumen) |
| Contratos API | Protocol Buffers + anotaciones HTTP `sebuf` → genera cliente TS, servidor y OpenAPI 3.1 desde una sola fuente |
| Despliegue | Vercel Edge Functions (SPA + API) + Railway (relay AIS/WebSocket + crons) + Tauri + PWA |
| Caché | Redis (Upstash), 3 niveles (memoria → Redis → upstream), CDN, service worker |
| Backend de usuarios/billing | Convex (auth, entitlements, broadcast) |
| Docs | Mintlify, servido en `/docs` |

**Verificación clave:** el "modelo dual de globo 3D + mapa plano" no es cosmético — comparten un único catálogo de capas (`map-layer-definitions.ts`) pero cada capa declara explícitamente en qué renderer(es) pinta (`'svg' | 'deck' | 'globe'`). Esto es un patrón de diseño trasladable directamente: **una capa = una definición, N renderers**.

---

## 3. Los seis pilares reutilizables (el "cómo" de verdad)

### 3.1 Catálogo de capas como registro único

Archivo real (`src/config/map-layer-definitions.ts`, 736 líneas): cada capa se declara con una función factoría `def()`:

```typescript
export interface LayerDefinition {
  key: keyof MapLayers;
  icon: string;
  i18nSuffix: string;
  fallbackLabel: string;
  renderers: RendererKind[];   // 'svg' | 'deck' | 'globe' — qué motor la pinta
  premium?: 'locked' | 'enhanced';
}

export const LAYER_REGISTRY: Record<keyof MapLayers, LayerDefinition> = {
  conflicts: def('conflicts', '⚔️', 'conflictZones', 'Conflict Zones'),
  ais:       def('ais', '🚢', 'shipTraffic', 'Ship Traffic'),
  ciiChoropleth: def('ciiChoropleth', '🌎', 'ciiChoropleth', 'CII Instability', ['deck','globe'], 'enhanced'),
  canadaAlerts:  def('canadaAlerts', '⚠️', 'canadaAlerts', 'Canada Alerts', ['deck']),
  // ...54 capas en total
};
```

Añadir una capa nueva es **una entrada en un array**, no tocar N sitios. Esto es exactamente el patrón que necesita un monitor de Valencia con capas tipo *tráfico*, *aparcamiento*, *Valenbisi*, *calidad del aire*, *incidencias*, *obras en vía pública*, *eventos*, *ruido*.

### 3.2 Doble renderer, pero con reglas de zoom progresivo

- **Vista lejana (país/ciudad completa):** símbolos agregados / choropleth (color por zona).
- **Vista media:** clusters (Supercluster) que se abren al hacer zoom.
- **Vista calle:** capas de detalle solo aparecen a partir de cierto nivel de zoom (`bases`, `nuclear`, `datacenters` en WM), con opacidad que sube de 0.2 (vista mundo) a 1.0 (vista calle).

Esto es **directamente el patrón que necesitáis**: distrito → barrio → calle, con densidad de información creciente según zoom, en vez de intentar mostrar cada farola desde el zoom de ciudad completa.

### 3.3 Choropleth como índice compuesto — el equivalente a vuestro futuro "índice de barrio"

La capa `ciiChoropleth` (justo una de las que activaste en tu URL) no es un dato en bruto: es el resultado de un **índice compuesto server-side**, el *Country Instability Index*. Merece desglose porque es el patrón más trasladable a un "Pulso de Barrio / Distrito" para Valencia:

```
eventScore = Unrest * 0.25 + Conflict * 0.30 + Security * 0.20 + Information * 0.25
combinedScore = baselineRisk * 0.40 + eventScore * 0.60 + boosts_suplementarios
```

Características clave del diseño (todas trasladables):

- **Baseline editorial + señal en vivo**, no solo señal en vivo — evita que un dato ruidoso dispare falsos positivos.
- **Múltiples fuentes corroborándose** antes de mover el score (ACLED + GDELT para protestas, USGS + GDACS + NASA EONET para desastres) — nunca una sola fuente decide.
- **Escalado logarítmico vs. lineal según contexto** (protestas en democracias vs. autocracias) — el equivalente en Valencia sería, por ejemplo, no tratar igual una incidencia de tráfico en una calle con aforo bajo constante que en una arteria principal.
- **Suelos y techos (floors/boosts):** ciertos eventos fuerzan un mínimo de score (ej. conflicto activo = mínimo 70/100) para que el índice nunca "parezca tranquilo" durante una crisis real por falta de datos frescos.
- **Niveles con nombre, no solo número:** Crítico (81-100) / Alto (66-80) / Elevado (51-65) / Normal (31-50) / Bajo (0-30) — igual que un semáforo de mando, que es exactamente el lenguaje que ya usáis en `PRODUCT_CONTEXT.md` ("cabecera operativa... semáforo").
- **Detección de tendencia:** publican un `dynamicScore` (-100..100) comparado contra el snapshot de ~24h antes, con bandas de histéresis (>±1 punto para no generar ruido de "sube/baja" con cambios de redondeo).

**Aplicación directa a Valencia:** un "Índice de Actividad/Tensión de Distrito" combinando, por ejemplo, saturación de tráfico + incidencias abiertas + ocupación de aparcamiento + alertas de calidad del aire + eventos programados, con la misma filosofía de baseline + señal en vivo + corroboración multi-fuente, publicado por distrito/barrio en vez de por país.

### 3.4 Pipeline de datos: cron seeds → Redis → hidratación en bloque

Nada se consulta "en caliente" contra la fuente original en el momento en que un usuario abre el dashboard:

```
Fuente externa (API pública, scraping, feed)
   → Script "seed" (cron, cada 2min–6h según volatilidad del dato)
   → Escribe en Redis (clave versionada, ej. seismology:earthquakes:v1)
   → GET /api/bootstrap lee ~38 claves en UNA sola llamada pipeline a Redis
   → Cliente hidrata todos los paneles de golpe en la primera carga
```

Esto resuelve exactamente el problema que ya identificasteis en `PRODUCT_CONTEXT.md` ("sin dependencia de consultas manuales... toda lectura vía API sobre capas de reporting") — es el mismo principio de capas (`origen → normalización → negocio → agregados → serving`) que ya definisteis para SQL Server, aplicado aquí a APIs externas + Redis en vez de SQL Server. **Es el mismo patrón arquitectónico, ejecutado con otra tecnología de persistencia.**

Detalles de resiliencia que vale la pena copiar tal cual:

- **Caché negativa:** si una fuente falla, se cachea el estado de fallo 5 minutos en vez de reintentar sin parar — evita tormentas de peticiones a una API caída.
- **Stale-on-error:** si la fuente está caída, se sirve el último dato bueno cacheado en vez de romper el panel.
- **Circuit breaker por fuente** con cooldown de 5 min.
- **Cada respuesta indica su frescura** (`X-Cache` header) — el "gap tracker" muestra explícitamente qué fuente está caída en vez de ocultarlo silenciosamente. Esto es literalmente lo que pedís en `PRODUCT_CONTEXT.md`: *"la UI debe mostrar honestamente retraso/lag"*.

### 3.5 Contratos API "primero la especificación" (Protocol Buffers + sebuf)

Todo el API de dominio se define primero como `.proto` con validación de campos (`buf.validate`, ej. latitud ∈ [-90,90]), y de ahí se **genera automáticamente**: cliente TypeScript tipado, stubs de servidor, y documentación OpenAPI 3.1. Los cambios incompatibles se detectan en CI (`buf breaking`) antes de mergear.

Esto es, casi literalmente, la misma filosofía **spec-driven** que mencionáis querer adoptar — solo que World Monitor usa Protocol Buffers como fuente de verdad en vez de (u además de) OpenAPI a mano. Es un patrón maduro y os ahorraría el problema de "schema drift" entre frontend/backend que ya identificasteis como riesgo en `ARCHITECTURE_NORTHSTAR.md`.

### 3.6 Sistema de componentes sin framework (Panel pattern)

109 clases `Panel` con:
- `setContent(html)` debounced (150ms) para no repintar en cada micro-evento.
- **Delegación de eventos** sobre el contenedor estable (nunca sobre elementos internos que se destruyen al repintar) — patrón anti-bug documentado explícitamente porque genera fugas de listeners si no se respeta.
- `SmartPollLoop`: refresco adaptativo — backoff exponencial en fallos, ralentiza 5× cuando la pestaña está en background, se pausa si el panel no es visible (Intersection Observer).
- Estado de mapa/capas/zoom **codificado en la URL** (`?view=&zoom=&layers=&timeRange=`) — exactamente la URL que me pasaste al principio. Esto da vistas compartibles sin backend de sesiones.

No es necesario copiar "cero framework" si vuestro equipo ya trabaja cómodo en Next.js/React (vuestros docs actuales ya asumen Next.js) — pero sí merece la pena copiar los **patrones**: debounce de render, refresco adaptativo consciente de visibilidad, y estado en URL.

---

## 4. Qué NO os hace falta copiar (right-sizing para un monitor de ciudad)

World Monitor está dimensionado para un producto SaaS global con miles de usuarios, monetización y multi-tenant editorial. Trasladar todo esto a un monitor municipal sería sobre-ingeniería:

| Elemento de World Monitor | Por qué no aplica (o no aún) a VLC Monitor |
|---|---|
| Globo 3D (`globe.gl` + Three.js) | A escala calle/distrito un globo 3D no aporta nada — un mapa plano tipo MapLibre es superior para lectura urbana precisa. |
| 6 variantes de producto (tech/finance/commodity/...) desde un mismo repo | No hay múltiples verticales de negocio; un único producto. |
| App de escritorio Tauri + sidecar | Innecesario para un panel operativo interno/consulta ciudadana web. |
| Billing/entitlements (Convex + Dodo), planes Pro | No es un SaaS con monetización por niveles (salvo que se decida lo contrario). |
| SDKs en 4 lenguajes + servidor MCP público | Prematuro; valorable *más adelante* si se quiere exponer datos a terceros/agentes. |
| PMTiles autoalojado 80GB | Solo justificable a escala planeta; para Valencia, tiles públicos (OpenFreeMap/CARTO) o un extracto local pesan órdenes de magnitud menos. |

---

## 5. Panorama de datos abiertos de Valencia (para las capas del mapa)

Investigado en paralelo. Es un ecosistema fragmentado en varios portales — normal en administraciones españolas — que conviene mapear antes de picar código:

| Fuente | Qué ofrece | Notas |
|---|---|---|
| **[València al Minut](https://www.valencia.es/es/web/valenciaalminut)** | Agregador oficial en tiempo real: estado de tráfico, presencia de vehículos en accesos a la ciudad, contaminación (NO₂, SO₂, O₃, PM10, PM2.5 por hora), ruido, previsión meteo, frecuencia de bus EMT, ocupación Valenbisi, aparcamientos (con predicción horaria, plazas PMR y carga/descarga), inyección de agua en red, recogida de residuos, temperatura por zonas | Es el **"World Monitor de Valencia" ya existente a nivel institucional** — el mejor punto de partida conceptual. Datos "pendientes de validación" según el propio portal, no 100% tiempo real garantizado. |
| **[Geoportal de Valencia](https://www.valencia.es/cas/inicio/-/content/geoportal)** (ArcGIS Server) | Capas GIS oficiales: urbanismo, infraestructuras, tráfico (`OPENDATA/Trafico`), catastro, callejero | Servido como ArcGIS `MapServer`/`FeatureServer` — permite consumir capas directamente en formato GeoJSON/Esri JSON, ideal para un frontend tipo MapLibre/deck.gl. |
| **[Portal de datos abiertos del Ayuntamiento (OpendataSoft)](https://valencia.opendatasoft.com/)** | Incluye el dataset `districtes-distritos` (geometría oficial de los 19 distritos) y `estat-transit-temps-real` (estado de tráfico en tiempo real por punto de medida) | OpendataSoft expone API REST estándar (`/api/records/1.0/search/` o `/api/explore/v2.1/...`) — consumible sin scraping. Confirmar formato exacto de campos al integrar. |
| **[VLCi — Valencia Smart City](https://opendata.vlci.valencia.es/)** | Catálogo de datos abiertos de la plataforma Smart City municipal (urbanismo e infraestructuras, formatos SHP/GeoJSON) | No se pudo verificar API en detalle en esta sesión (acceso bloqueado a scraping); requiere revisión manual del portal. |
| **[Gobierno Abierto València (transparencia)](https://gobiernoabierto.valencia.es/en/data/)** | Catálogo general de transparencia y datos abiertos municipales | Punto adicional de descubrimiento de datasets. |
| **[Dades Obertes GVA](https://dadesobertes.gva.es/)** (Generalitat Valenciana) | Datos regionales: sanidad (distritos censales/sanitarios), calidad del aire, medio ambiente | Útil quando el dato no lo publica el ayuntamiento sino la Generalitat (p. ej. calidad del aire suele venir de aquí o de Valencia al Minut). |
| **[AEMET OpenData](https://www.aemet.es/es/datos_abiertos)** | Meteorología nacional | Fuente que ya usa "Valencia al Minuto" oficialmente. |
| **[DGT — NAP (Punto de Acceso Nacional de Tráfico)](https://nap.dgt.es/dataset)** | Datos de tráfico e incidencias a nivel nacional/autonómico | Complementario al tráfico municipal para accesos/rondas. |
| **EMT València** / **Valenbisi** | Transporte público (bus) y bicicleta compartida | Existen apps oficiales y datasets de "tiempo real" (patrón habitual en ciudades españolas: GTFS-RT para bus, JCDecaux/Smoove API para bici compartida); confirmar endpoint exacto — no se pudo verificar API pública documentada en esta sesión. |

**Granularidad disponible:** confirmado a nivel **distrito** (19 distritos, geometría oficial en OpendataSoft) y a nivel **punto de medida de tráfico** (prácticamente calle/tramo). Nivel **barrio** (~87 barrios) probablemente disponible vía Geoportal/GVA pero no verificado con certeza en esta sesión. Recomiendo como primer paso técnico del equipo: acceder manualmente a `valencia.opendatasoft.com` y `geoportal.valencia.es` para confirmar campos exactos, límites de tasa y necesidad de API key — algunos de estos portales bloquearon el acceso automatizado durante esta investigación (403/robots.txt), lo cual es habitual y no indica que la API no exista, solo que requiere navegación manual o una llamada directa `curl`/`fetch` fuera de las restricciones de scraping de este entorno.

---

## 6. Propuesta de traducción: de World Monitor a VLC Monitor

| Concepto en World Monitor | Escala | Equivalente propuesto en VLC Monitor | Escala |
|---|---|---|---|
| Globo/mapa mundial, capas por país | Planeta | Mapa de Valencia, capas por distrito/barrio/calle | Ciudad |
| `countries.geojson` + overrides | 195 países | `distritos-valencia.geojson` (19) + `barrios-valencia.geojson` (~87), desde OpendataSoft/Geoportal | Ciudad |
| `ciiChoropleth` (Country Instability Index) | País | **Índice de Pulso/Tensión de Distrito** (tráfico + incidencias + aforo + calidad aire + eventos) | Distrito/barrio |
| Capas: conflicts, ais, military, sanctions... | Geopolítica | Capas: tráfico en tiempo real, Valenbisi, aparcamiento, calidad del aire, ruido, obras, incidencias, eventos, EMT | Urbano |
| Seeds cron (21 jobs) → Redis → bootstrap | Fuentes globales | Seeds cron adaptados a APIs valencianas (tráfico, Valenbisi, AEMET, calidad aire) → caché → bootstrap | Ciudad |
| Proto-first API (`sebuf`) | — | Mismo patrón spec-first, aplicable con Protocol Buffers u OpenAPI (ya es lo que exige `ARCHITECTURE_NORTHSTAR.md`) | — |
| `map-layer-definitions.ts` (registro único) | — | Registro único de capas urbanas, mismo patrón `def()` | — |
| Zoom progresivo (ciudad → cluster → detalle) | Mundo → país → ciudad | Ciudad → distrito → barrio → calle | Urbano |
| `SmartPollLoop` con backoff/visibilidad | — | Igual, aplicado a paneles de sala/consulta operativa | — |

---

## 7. Próximos pasos sugeridos (sin ejecutar nada todavía)

1. **Decidir el alcance real del pivote**: ¿el monitor de Valencia sustituye por completo al CISE (sala policial), o convive como un nuevo módulo/producto? Esto determina si `PRODUCT_CONTEXT.md`, `MODULES_AND_ROUTING.md`, etc. se reescriben desde cero o se bifurcan.
2. **Verificar manualmente las 3-4 APIs candidatas clave** (tráfico tiempo real OpendataSoft, capas Geoportal, Valenbisi, calidad del aire) — algunas bloquearon el acceso automatizado en esta sesión y requieren confirmación directa (campos, rate limits, necesidad de key).
3. **Definir el índice compuesto de distrito/barrio** (equivalente al CII) como primer artefacto "spec" — igual que hicisteis con `GOVERNANCE_TEMPLATE.yaml` para KPIs, esto encaja perfectamente en ese mismo patrón de gobernanza que ya teníais.
4. **Elegir motor de mapa**: recomendación — MapLibre GL + deck.gl (2D), sin globo 3D, dado que la escala calle no lo necesita.
5. **Especificar el catálogo de capas v1** (probablemente: tráfico, Valenbisi, aparcamiento, calidad del aire, incidencias) siguiendo el patrón `LayerDefinition` de World Monitor.
6. Solo entonces — spec-driven development: contratos primero (OpenAPI o Protobuf), luego capa de datos, luego UI — reescribir los documentos del proyecto.

---

## Fuentes

- [github.com/koala73/worldmonitor](https://github.com/koala73/worldmonitor) — código fuente completo (clonado y auditado para este informe)
- [worldmonitor.app/docs/documentation](https://www.worldmonitor.app/docs/documentation)
- [worldmonitor.app/docs/map-engine](https://www.worldmonitor.app/docs/map-engine)
- [worldmonitor.app/docs/maps-and-geocoding](https://www.worldmonitor.app/docs/maps-and-geocoding)
- [worldmonitor.app/docs/country-instability-index](https://www.worldmonitor.app/docs/country-instability-index)
- [worldmonitor.app/docs/architecture](https://www.worldmonitor.app/docs/architecture) y `ARCHITECTURE.md` del repo
- [València al Minut](https://www.valencia.es/es/web/valenciaalminut)
- [Geoportal de l'Ajuntament de València](https://www.valencia.es/cas/inicio/-/content/geoportal)
- [Portal de dades obertes OpendataSoft (Ajuntament de València)](https://valencia.opendatasoft.com/)
- [Dataset: Districtes/Distritos](https://valencia.opendatasoft.com/explore/dataset/districtes-distritos/export/)
- [Dataset: Estado tráfico tiempo real](https://valencia.opendatasoft.com/explore/dataset/estat-transit-temps-real-estado-trafico-tiempo-real/information/)
- [Open Data Valencia (VLCi)](https://opendata.vlci.valencia.es/)
- [Gobierno Abierto València — Catálogo de datos](https://gobiernoabierto.valencia.es/en/data/)
- [Dades Obertes GVA](https://dadesobertes.gva.es/)
- [Valencia al Minuto — datos.gob.es](https://datos.gob.es/es/aplicaciones/valencia-al-minuto)
- [AEMET Open Data](https://www.aemet.es/es/datos_abiertos)
- [DGT — NAP](https://nap.dgt.es/dataset)
- [Geoportal ArcGIS — Urbanismo e Infraestructuras](https://geoportal.valencia.es/arcgis/rest/services/Opendata/UrbanismoEInfraestructuras/MapServer)
