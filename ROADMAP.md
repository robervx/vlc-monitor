# Roadmap — VLC Monitor

Fuente única de verdad de fases. Cada fase referencia sus specs por id — ver estado real en `specs/INDEX.md`. No dupliques esta lista en otro documento; si algo cambia, cámbialo aquí primero.

| Fase | Nombre | Contenido | Specs |
|---|---|---|---|
| **F0** | Cimientos | Mapa base (MapLibre + deck.gl), geometría de distritos, arquitectura de registro de capas, pipeline seed→caché→endpoint | `000` |
| — | *Prototipo paralelo* | Capa de movimiento de personas con datos sintéticos (mock), para validar UI de choropleth antes de tener fuente real | `003` |
| **F1** | MVP — 3 capas | Meteorología, calidad del aire, tráfico en tiempo real | `001`, `002`, `004` |
| **F2** | Movilidad completa | Valenbisi, aparcamiento, EMT (si hay fuente viable) | `005`, `006`, `007` |
| **F3** | Índice de Pulso de Distrito | Índice compuesto (tráfico + aire + meteo adversa + incidencias), inspirado en el CII de World Monitor | `010` (depende de `001`, `002`, `004` como mínimo) |
| **F3.5** | Agenda y aglomeraciones previsibles | Eventos culturales, calendario deportivo, ferias — el mejor predictor legal de aglomeraciones | `008` |
| **F3.6** | Motor de insights y alertas operativas | Panel de insights bajo el mapa + sistema de notificaciones sobre alertas de interés (eventos, cortes). Debe cumplir "avisa, no actúa" (`CLAUDE.md` §4) — ver `docs/investigacion/BACKLOG_FUNCIONALIDADES_2026-08-18.md` | `013`, `014` |
| **F4** | Contexto mediático | RSS de medios locales + GDELT filtrado por Valencia + Reddit como señal secundaria | `009` |
| **F4.5** | Analítica temporal | Predicción meteorológica a corto plazo (nowcasting) e histórico de tráfico para detectar patrones | `016`, `017` |
| **F5** | Pulido y compartición | Estado en URL, PWA instalable, rendimiento, accesibilidad, geolocalización de usuario + "qué tengo más cerca" (pendiente de decisión de framing, ver backlog) | `012` |
| **F6** | Densidad de movilidad agregada real | Sustituye el prototipo mock (`003`) por una fuente real agregada y anonimizada en origen (ej. producto comercial tipo Telefónica LUCA/Smart Steps), **sujeta a contrato y revisión de cumplimiento** | `011` (bloqueada hasta que exista contrato) |
| **F7** | Integraciones externas de navegación | Publicación de cortes/incidencias en formato consumible por Waze/Google Maps — sujeta a investigación de viabilidad y posible convenio con el Ayuntamiento | `015` |

## Fuera de alcance (recordatorio — detalle completo en `CLAUDE.md` §3-4)

- Globo 3D, app de escritorio, monetización, X/Twitter.
- Cualquier dato de localización individual, cualquier fuente obtenida fuera de un cauce legal explícito, cualquier capa que actúe en vez de avisar.

## Cómo evoluciona este roadmap

Añadir una fase o mover una spec de fase requiere actualizar esta tabla en el mismo cambio — no se abren fases nuevas "de pasada" dentro de otra tarea.
