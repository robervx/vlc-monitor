# Índice de Specs — VLC Monitor

Antes de escribir código, mira aquí. No se implementa nada sin fila `Draft`/`Approved` con dependencias en `Implemented`. No reutilices un id ni lo borres al deprecarlo — márcalo `Deprecated` y enlaza la sucesora.

| id | Título | Fase | Estado | Depende de |
|---|---|---|---|---|
| `000` | Mapa base + geometría de distritos | F0 | **Implemented** — DoD completo (mapa, endpoint, servicio de geometría, tests) | — |
| `001` | Capa de meteorología (Open-Meteo + avisos AEMET) | F1 | **Implemented** — Open-Meteo en producción; avisos AEMET pendientes de API key del usuario (ver spec §2) | `000` |
| `002` | Capa de calidad del aire | F1 | **Implemented** — Open-Meteo Air Quality en producción | `000` |
| `003` | Capa de movimiento de personas (mock) | Prototipo | **Implemented** — DoD completo, datos 100% sintéticos, badge "MOCK" siempre visible | `000` |
| `004` | Capa de tráfico en tiempo real | F1 | **Implemented** — Geoportal ArcGIS en producción, 412 tramos | `000` |
| `005` | Capa Valenbisi | F2 | **Implemented** — Geoportal ArcGIS en producción, 273 estaciones | `000` |
| `006` | Capa de aparcamiento | F2 | **Implemented** — Geoportal ArcGIS en producción, 23 parkings (13 sin dato de sensor, ver spec §7) | `000` |
| `007` | Capa EMT (bus) | F2 | Planned — fuente investigada 2026-08-18: paradas confirmadas (Geoportal, capa Trafico/MapServer/226), pero **llegadas en tiempo real sin API limpia** — el enlace `proximas_llegadas` de cada parada apunta a una página HTML (`emtvalencia.es/QR.php`) sin datos ni endpoint AJAX visible, no una API estructurada. No se implementa por no forzar scraping frágil de un endpoint no documentado (ver `CLAUDE.md` — fuentes deben tener cauce legal/técnico explícito). Reabrir si aparece una fuente confirmada (API oficial EMT, GTFS-RT). | `000` |
| `008` | Agenda y aglomeraciones previsibles (v1: Fallas) | F3.5 | **Implemented** — v1 acotada a Fallas en producción (689 monumentos, 462 carpas, zonas de movilidad reducida); agenda general queda como fast-follow (scraping, decisión pendiente de diseño) | `000` |
| `009` | Contexto mediático (RSS + GDELT + Reddit) | F4 | **Implemented** — RSS (Las Provincias + Valencia Plaza) + GDELT en producción, resiliencia por fuente individual; Reddit pendiente de credenciales del usuario (ver spec §2) | `000` |
| `010` | Índice de Pulso de Distrito (compuesto) | F3 | **Implemented** — DoD completo, sin fuente externa propia (combina 001+002+004) | `001`, `002`, `004` |
| `011` | Densidad de movilidad agregada real | F6 | **Blocked** — requiere contrato comercial con proveedor de datos agregados y revisión de cumplimiento antes de poder pasar a Draft (ver `CLAUDE.md` §4) | `003` (sustituye al prototipo) |
| `012` | Geolocalización de usuario + "qué tengo más cerca" | F5 | Planned — no redactada aún. Requiere decisión explícita sobre framing "herramienta policial de campo" antes de pasar a Draft (ver `docs/investigacion/BACKLOG_FUNCIONALIDADES_2026-08-18.md`) | `000` |
| `013` | Motor de insights y alertas operativas | F3.6 | **Implemented** — 5 reglas v1 (calor/frío extremo, aire malo, lluvia intensa, distrito crítico), panel con alerta + borrador para copiar, sin envío automático ni destinatarios (diseño "avisa, no actúa" resuelto explícitamente, ver spec §0) | `001`, `002`, `010`, `016` |
| `014` | Sistema de notificaciones (push/email) sobre alertas | F3.6 | Planned — no redactada aún. Evaluar si se fusiona en el DoD de `008` en vez de ir como spec separada | `008` |
| `015` | Integración de rutas externas (Waze/Google Maps) por cortes | F7 | Planned — necesita investigación de viabilidad (programa Waze for Cities / convenio con el Ayuntamiento) antes de poder pasar a Draft, igual que `011` | `004`, `008` |
| `016` | Predicción meteorológica a corto plazo (nowcasting) | F4.5 | **Implemented** — Open-Meteo `hourly` en producción, panel "Próximas 4h" junto al de meteo actual | `001` |
| `017` | Histórico y analítica de tráfico | F4.5 | **Implemented** — GitHub Actions cron cada 60 min, snapshots agregados versionados en el repo con compactación a diario pasados 30 días, panel con sparkline de las últimas 24h | `004` |
| `018` | Publicación con contraseña en dominio propio | F5 | Planned — no redactada aún. Compra de dominio la hace el usuario; verificar password-protection real de Vercel antes de prometer nada | — |

## Leyenda de estados

`Planned` (idea situada en el roadmap, sin spec redactada) → `Draft` (spec redactada, contrato de datos aún sin verificar/implementar) → `Approved` (contrato verificado, lista para implementar) → `Implemented` (en producción, cumple su Definition of Done) → `Deprecated` (sustituida, se conserva por trazabilidad).

`Blocked` es un estado especial: no puede avanzar a `Draft` hasta que se cumpla la condición indicada explícitamente en la fila.
