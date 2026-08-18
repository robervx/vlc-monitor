# Índice de Specs — VLC Monitor

Antes de escribir código, mira aquí. No se implementa nada sin fila `Draft`/`Approved` con dependencias en `Implemented`. No reutilices un id ni lo borres al deprecarlo — márcalo `Deprecated` y enlaza la sucesora.

| id | Título | Fase | Estado | Depende de |
|---|---|---|---|---|
| `000` | Mapa base + geometría de distritos | F0 | **Draft** — pendiente verificar manualmente el endpoint OpendataSoft (ver spec §2) | — |
| `001` | Capa de meteorología (Open-Meteo + avisos AEMET) | F1 | Planned — no redactada aún | `000` |
| `002` | Capa de calidad del aire | F1 | Planned — no redactada aún | `000` |
| `003` | Capa de movimiento de personas (mock) | Prototipo | **Draft** — datos 100% sintéticos, badge "MOCK" obligatorio | `000` |
| `004` | Capa de tráfico en tiempo real | F1 | Planned — no redactada aún | `000` |
| `005` | Capa Valenbisi | F2 | Planned — no redactada aún | `000` |
| `006` | Capa de aparcamiento | F2 | Planned — fuente aún sin confirmar | `000` |
| `007` | Capa EMT (bus) | F2 | Planned — fuente aún sin confirmar | `000` |
| `008` | Agenda y aglomeraciones previsibles | F3.5 | Planned — no redactada aún | `000` |
| `009` | Contexto mediático (RSS + GDELT + Reddit) | F4 | Planned — no redactada aún | `000` |
| `010` | Índice de Pulso de Distrito (compuesto) | F3 | Planned — no redactada aún | `001`, `002`, `004` |
| `011` | Densidad de movilidad agregada real | F6 | **Blocked** — requiere contrato comercial con proveedor de datos agregados y revisión de cumplimiento antes de poder pasar a Draft (ver `CLAUDE.md` §4) | `003` (sustituye al prototipo) |

## Leyenda de estados

`Planned` (idea situada en el roadmap, sin spec redactada) → `Draft` (spec redactada, contrato de datos aún sin verificar/implementar) → `Approved` (contrato verificado, lista para implementar) → `Implemented` (en producción, cumple su Definition of Done) → `Deprecated` (sustituida, se conserva por trazabilidad).

`Blocked` es un estado especial: no puede avanzar a `Draft` hasta que se cumpla la condición indicada explícitamente en la fila.
