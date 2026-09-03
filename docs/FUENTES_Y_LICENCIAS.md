# Fuentes de datos y licencias

Este documento es el inventario completo de **de dónde sale cada dato**, **bajo qué
licencia** y **qué atribución hay que mostrar**. Se mantiene al día con las specs:
cada capa tiene su fila aquí y su contrato de fuente verificado en `specs/NNN-*.md`
(sección 2 de cada spec, con fecha de la última comprobación real contra la fuente).

**Resumen en una línea:** todo lo que consume este proyecto es gratuito y de acceso
público, sin contratos ni claves de pago. La única clave que existe (AEMET) es
gratuita y opcional. El código es MIT. No se usa ninguna fuente de localización
individual (ver [`CLAUDE.md`](../CLAUDE.md) §4).

---

## 1. Fuentes de datos

| Capa / panel | Spec | Fuente | Qué aporta | Licencia / condiciones | Clave |
|---|---|---|---|---|---|
| Distritos (geometría) | `000` | [Geoportal ArcGIS · Ajuntament de València](https://geoportal.valencia.es) — capa `UrbanismoEInfraestructuras/225` | Los 19 distritos en GeoJSON (WGS84) | **CC BY 4.0** — catálogo [`opendata.vlci.valencia.es`](https://opendata.vlci.valencia.es) | No |
| Barrios (geolocalización de titulares) | `023` | Geoportal ArcGIS — capa `UrbanismoEInfraestructuras/224` | Los 88 barrios oficiales y su distrito | CC BY 4.0 | No |
| Tráfico en tiempo real | `004` | Geoportal ArcGIS — capa `Trafico/192` | Estado (fluido…cortado) de ~412 tramos, refresco ~3 min | CC BY 4.0 | No |
| Histórico de tráfico | `017` | Derivado de `004` — snapshots agregados propios cada 60 min (GitHub Actions) | Serie de 24 h de congestión de ciudad | CC BY 4.0 (dato base) | No |
| Valenbisi | `005` | Geoportal ArcGIS — capa `Trafico/228` (dato originado por JCDecaux, redistribuido por el Ayuntamiento) | 273 estaciones: bicis y anclajes libres | CC BY 4.0 | No |
| Aparcamiento | `006` | Geoportal ArcGIS — capa `Trafico/194` | 23 parkings con ocupación (%) | CC BY 4.0 | No |
| Fallas | `008` | Geoportal ArcGIS — capas `Turismo/215`, `Turismo/0` y afines | Monumentos (adultos e infantiles), carpas, zonas de movilidad reducida | CC BY 4.0 | No |
| Incidencias de vía pública | `026` | Geoportal ArcGIS — capa `Trafico/209` ("Ocupación de vía pública") | ~495 permisos activos: obras, incidencias, festejos, con coordenada exacta | CC BY 4.0 | No |
| Meteorología actual | `001` | [Open-Meteo](https://open-meteo.com) — `/v1/forecast` | Temperatura, viento, código de cielo, refresco 15 min | **CC BY 4.0** — gratuita, uso no comercial, sin registro | No |
| Predicción a corto plazo (4 h) | `016` | Open-Meteo — `/v1/forecast?hourly=…` | Nowcasting horario | CC BY 4.0 | No |
| Calidad del aire | `002` | Open-Meteo Air Quality — `/v1/air-quality` | PM2.5, PM10, NO₂, O₃, European AQI, refresco 1 h | CC BY 4.0 | No |
| Avisos meteorológicos adversos | `001` | [AEMET OpenData](https://opendata.aemet.es) — `avisos_cap` | Avisos oficiales amarillo/naranja/rojo | Nota legal AEMET — **reutilización permitida con atribución** | **Sí, gratuita** (registro por email). Opcional: sin `AEMET_API_KEY` la capa no se activa, el resto funciona |
| Contexto mediático | `009` | RSS públicos: [Valencia Plaza](https://valenciaplaza.com/feed), [Las Provincias](https://www.lasprovincias.es/rss/2.0/), [20minutos València](https://www.20minutos.es/rss/comunidad-valenciana/valencia/), [Valencia Bonita](https://www.valenciabonita.es/feed/), Valencia Secreta | Titulares locales con marca temporal | Sindicación RSS pública de cada medio | No |
| Contexto mediático (medios sin RSS propio) | `009` | [Google News RSS](https://news.google.com/rss/search) con operadores `site:` / `when:` — p. ej. Levante-EMV, Cadena SER València | Titulares de medios que han retirado su RSS por sección | RSS de Google News, gratuito, sin clave | No |
| Contexto mediático global | `009` | [GDELT 2.0 DOC API](https://www.gdeltproject.org) | Picos de cobertura mediática sobre València a escala global | Proyecto de datos abiertos, sin clave | No |
| Términos en tendencia | `025` | Derivado de `009` — conteo de frecuencia determinista, sin llamadas nuevas | Palabras más repetidas por hora/día | — (dato derivado) | No |
| Grafo viario (cordón / simulador de cortes) | `020` `021` `022` `031` | [OpenStreetMap](https://www.openstreetmap.org/copyright) vía [Overpass API](https://overpass-api.de) — bbox de València | ~13.200 tramos / ~9.200 nodos con sentido de circulación | **ODbL** (Open Database License) — requiere atribución y *share-alike* de la base de datos derivada | No (requiere `User-Agent` propio) |
| Densidad de personas | `003` | **Datos 100 % sintéticos (mock)** — generados en el propio proyecto | Prototipo de UI de choropleth mientras no exista fuente real agregada y anonimizada | — (no es un dato real; badge `MOCK` siempre visible, `CLAUDE.md` §4) | No |

### Planeadas, aún no integradas

| Fuente | Spec | Estado |
|---|---|---|
| Reddit API (`r/valencia`) | `009` | Requiere credenciales de la persona que despliega; límites generosos en uso no comercial |
| Agenda cultural de valencia.es (scraping con Playwright) | `027` | `Draft` — `robots.txt` autoriza las rutas de ficha; pendiente de aprobación |
| Densidad de movilidad agregada real | `011` | **Bloqueada** — exige contrato comercial y revisión de cumplimiento antes de nada (`CLAUDE.md` §4) |

---

## 2. Mapa base

| Componente | Proveedor | Licencia | Clave |
|---|---|---|---|
| Tiles vectoriales | [OpenFreeMap](https://openfreemap.org) (estilo *Liberty*) | Gratuito, sin clave, sin límite agresivo publicado | No |
| Esquema de tiles | [OpenMapTiles](https://openmaptiles.org) | BSD / CC BY | No |
| Datos cartográficos | [OpenStreetMap](https://www.openstreetmap.org/copyright) | ODbL | No |
| Render | [MapLibre GL JS](https://maplibre.org) | BSD-3-Clause | No |

Atribución mostrada de forma permanente en el mapa:
`MapLibre | OpenFreeMap © OpenMapTiles Data from OpenStreetMap`.

---

## 3. Infraestructura

| Pieza | Servicio | Plan | Coste |
|---|---|---|---|
| Frontend + funciones | [Vercel](https://vercel.com) | Hobby (no comercial) | 0 € |
| Cron de *seeds* / snapshots | [GitHub Actions](https://github.com/features/actions) | Incluido en repo público | 0 € |
| Caché de estado | Patrón *seed → caché → bootstrap* (compatible Upstash Redis free tier) | Free tier | 0 € |
| Certificado TLS | Incluido en Vercel | — | 0 € |
| Dominio | Opcional — subdominio `*.vercel.app` gratis | — | 0 € (o ~10-15 €/año si se quiere dominio propio) |

Análisis de viabilidad completo en [`docs/01_VIABILIDAD_VISION_Y_PROCESO.md`](01_VIABILIDAD_VISION_Y_PROCESO.md) §1.

---

## 4. Dependencias de software

Todas con licencias permisivas (MIT / BSD / Apache-2.0), compatibles con la licencia
MIT de este proyecto.

| Paquete | Uso | Licencia |
|---|---|---|
| `maplibre-gl` | Motor de mapa 2D | BSD-3-Clause |
| `@deck.gl/core`, `/layers`, `/mapbox` | Capas de datos sobre el mapa | MIT |
| `@turf/circle` | Geometría de cordones | MIT |
| `rbush` | Índice espacial del grafo viario | MIT |
| `vite`, `vite-plugin-pwa` | Bundler y PWA | MIT |
| `typescript` | Lenguaje | Apache-2.0 |
| `vitest` | Tests | MIT |
| `esbuild` | Bundle de la función de API | MIT |
| `tsx` | Ejecución de scripts TS (seeds) | MIT |

---

## 5. Atribución — lo que hay que mostrar

Cualquier despliegue de este proyecto debe conservar, de forma visible:

1. La atribución del mapa base (ya incrustada en el control de MapLibre).
2. La fuente y la frescura de cada capa activa — cada panel muestra
   `Fuente · actualizado hace N min` (requisito del *Definition of Done* de toda spec).
3. En despliegues que modifiquen el grafo viario o redistribuyan datos derivados de
   OpenStreetMap: la atribución **© OpenStreetMap contributors** y el aviso de que la
   base de datos derivada está bajo **ODbL**.
4. Si se reutiliza dato de AEMET: cita a **© AEMET** conforme a su nota legal.

---

## 6. Límite ético/legal

Este inventario existe también para dejar constancia de dónde está la frontera. Ver
[`CLAUDE.md`](../CLAUDE.md) §4 y
[`docs/investigacion/PULSO_HUMANO_FUENTES_OSINT.md`](investigacion/PULSO_HUMANO_FUENTES_OSINT.md):

- **Ningún dato de localización individual.** Toda señal de "actividad de personas"
  es agregada y anonimizada en origen, nunca reconstruida por este proyecto.
- **Ninguna fuente fuera de un cauce legal explícito.** Nada de datos "facilitados por
  alguien": toda fuente sensible o de pago necesitaría contrato identificable y
  revisión de cumplimiento antes de activarse.
- **"Avisa, no actúa."** Las capas de alertas generan un aviso visible para que lo
  revise una persona; el producto nunca decide ni ejecuta una acción sobre nadie.
- **Todo lo simulado, marcado.** La capa `003` lleva un badge `MOCK` permanente.

X / Twitter queda **fuera de alcance**: su API ya no tiene tier gratuito viable para
un monitor continuo (ver `PULSO_HUMANO_FUENTES_OSINT.md` §1).
