# Roadmap — VLC Monitor

Fuente única de verdad de fases. Cada fase referencia sus specs por id — ver estado real en `specs/INDEX.md`. No dupliques esta lista en otro documento; si algo cambia, cámbialo aquí primero.

| Fase | Nombre | Contenido | Specs |
|---|---|---|---|
| **F0** | Cimientos | Mapa base (MapLibre + deck.gl), geometría de distritos, arquitectura de registro de capas, pipeline seed→caché→endpoint, identidad de marca (Intelligent City Monitor) + chasis de navegación | `000`, `019` |
| — | *Prototipo paralelo* | Capa de movimiento de personas con datos sintéticos (mock), para validar UI de choropleth antes de tener fuente real | `003` |
| **F1** | MVP — 3 capas | Meteorología, calidad del aire, tráfico en tiempo real | `001`, `002`, `004` |
| **F2** | Movilidad completa | Valenbisi, aparcamiento, EMT (si hay fuente viable) | `005`, `006`, `007` |
| **F3** | Índice de Pulso de Distrito | Índice compuesto (tráfico + aire + meteo adversa + incidencias), inspirado en el CII de World Monitor | `010` (depende de `001`, `002`, `004` como mínimo) |
| **F3.5** | Agenda y aglomeraciones previsibles | Eventos culturales (Fallas), calendario deportivo, ferias — el mejor predictor legal de aglomeraciones; incidencias oficiales de vía pública (obras/cortes/festejos, dato real del Geoportal); agenda general de eventos culturales vía scraping resiliente de valencia.es | `008`, `026`, `027` |
| **F3.6** | Motor de insights y alertas operativas | Panel de insights bajo el mapa + sistema de notificaciones sobre alertas de interés (eventos, cortes). Debe cumplir "avisa, no actúa" (`CLAUDE.md` §4) — ver `docs/investigacion/BACKLOG_FUNCIONALIDADES_2026-08-18.md` | `013`, `014` |
| **F4** | Contexto mediático | RSS de medios locales + Google News por medio, con filtro Valencia-**ciudad** estricto (excluye Comunitat, província, política nacional/internacional, Venezuela) + Reddit como señal secundaria; geolocalización de titulares por distrito/barrio mediante matching de texto (sin IA); tendencia de términos más repetidos por hora/día | `009`, `023`, `025` |
| **F4.5** | Analítica temporal | Predicción meteorológica a corto plazo (nowcasting) e histórico de tráfico para detectar patrones | `016`, `017` |
| **F5** | Pulido y publicación | Estado en URL, geolocalización de usuario + "qué tengo más cerca", acceso protegido opcional con usuario+PIN (gate propio en middleware, fail-open), PWA instalable + shell offline, UX móvil (chasis táctil), re-marca genérica + repo público MIT (ADR-002), rendimiento, accesibilidad | `012`, `018`, `028`, `029`, `030` |
| **F6** | Densidad de movilidad agregada real | Sustituye el prototipo mock (`003`) por una fuente real agregada y anonimizada en origen (ej. producto comercial tipo Telefónica LUCA/Smart Steps), **sujeta a contrato y revisión de cumplimiento** | `011` (bloqueada hasta que exista contrato) |
| **F7** | Integraciones externas de navegación | Publicación de cortes/incidencias en formato consumible por Waze/Google Maps — sujeta a investigación de viabilidad y posible convenio con el Ayuntamiento | `015` |
| **F8** | Apoyo a decisión — herramientas de gestión municipal | Grafo viario base (sin simulador de tráfico) + motor de propuesta de perímetro/calles a cortar según tipo e intensidad de incidente, editable por la persona responsable, nunca automático (`CLAUDE.md` §4) + simulador de cortes de calle + motor compartido de propagación dirigida de cortes (efecto en cadena por sentido de circulación) + reconciliación de la capa de tráfico real con el grafo (aplazada) + motor de insights v2 con correlación declarativa entre señales ya existentes (tráfico, Fallas, contexto mediático), sin modelo estadístico nuevo | `020`, `021`, `022`, `024`, `031`, `032` |

## Fuera de alcance (recordatorio — detalle completo en `CLAUDE.md` §3-4)

- Globo 3D, app de escritorio, monetización, X/Twitter.
- Cualquier dato de localización individual, cualquier fuente obtenida fuera de un cauce legal explícito, cualquier capa que actúe en vez de avisar.

## Cómo evoluciona este roadmap

Añadir una fase o mover una spec de fase requiere actualizar esta tabla en el mismo cambio — no se abren fases nuevas "de pasada" dentro de otra tarea.
