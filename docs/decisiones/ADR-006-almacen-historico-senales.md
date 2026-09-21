# ADR-006 — Postgres serverless como almacén histórico de señales (junto a Redis, no en su lugar)

**Fecha:** 2026-09-17
**Estado:** Aceptado — decisión del product owner tras plantear alternativas (`CLAUDE.md` §5, reabre parcialmente esa tabla con justificación explícita).

---

## Contexto

`CLAUDE.md` §5 ya decidió el almacén de caché/estado: **Redis-compatible (Upstash free
tier), patrón seed → caché → bootstrap**. Esa decisión sigue vigente para lo que fue
pensada — servir el último valor conocido de cada fuente con un TTL, con degradación
stale-on-error. De hecho, ni siquiera esa pieza está desplegada todavía: `getOrFetch`
(`src/server/_shared/cache.ts`) es hoy un `Map` en memoria de proceso porque crear la
cuenta de Upstash necesita una persona, no una sesión de Claude Code (mismo bloqueante que
ya documentaba la spec `001` §4).

Al plantear la spec `047` (rediseño del panel de síntesis con IA — señales detalladas +
recomendaciones de actuación por zona/barrio), aparece una necesidad distinta: **acumular
histórico correlacionable** de tráfico, incidencias, clima, eventos y cámaras por calle y
por zona a lo largo del tiempo, para que la IA tenga cada vez más contexto real (no solo el
snapshot del momento) y para poder investigar a posteriori qué pasó en un punto concreto.

Un TTL cache (Redis u otro) no es la herramienta correcta para esto:

- Redis puede guardar series temporales razonablemente bien (sorted sets por timestamp),
  pero no correlaciona bien varias dimensiones a la vez (¿qué incidencias hubo a menos de
  200 m de este tramo de tráfico en la última hora, mientras llovía más de X mm en ese
  distrito?) sin reconstruir a mano una capa de índices que ya resuelve gratis una base de
  datos relacional.
- El histórico de tráfico que ya existe (`trafico-historico.ts`, spec `004`/`024`) es un
  **seed estático** (`data/trafico-historico.json`, bundleado en build) — una foto fija,
  no una serie que siga creciendo sola. Vale como precedente de que "guardar historia"
  interesa al proyecto, pero no como mecanismo para lo que pide `047`.

## Decisión

**Se añade un almacén Postgres serverless (Neon, free tier — creado directamente en
neon.tech y enlazado a Vercel con su cadena de conexión como variable de entorno, no vía
Marketplace) como almacén histórico y de correlación de señales — sin sustituir la decisión de
Redis para caché/estado, que sigue en pie tal cual la fija `CLAUDE.md` §5.** Son dos
piezas con propósitos distintos:

| | Redis (Upstash, ya decidido) | Postgres (Neon, esta ADR) |
|---|---|---|
| Para qué | Último valor conocido de cada fuente, TTL corto, stale-on-error | Historial creciente, consultable por calle/zona/tiempo/tipo de señal |
| Patrón de escritura | Sobrescribe (última lectura gana) | Append-only (cada señal queda, con marca de tiempo) |
| Patrón de lectura | Una clave → un valor | Consultas relacionales (filtros, agregados, joins) |
| Estado de despliegue | **Sin aprovisionar todavía** (blocker: cuenta la crea una persona) | **Sin aprovisionar todavía** (mismo blocker) |

Ambos bloqueantes son del mismo tipo y size — crear una cuenta free tier y añadir
credenciales como variable de entorno, siguiendo el mismo patrón ya usado para
`GOOGLE_GENERATIVE_AI_API_KEY` (`vite.config.ts`, allowlist de env vars). No cambia nada
del resto de la arquitectura de `CLAUDE.md` §6 (router único, endpoints por fichero) — el
acceso a Postgres vive detrás de un endpoint interno más, igual que cualquier otra fuente.

## Qué NO cambia

- El patrón seed → caché → endpoint sigue siendo el mismo para todas las specs existentes.
  Postgres no sustituye la caché de ninguna de ellas — es una escritura **adicional**
  (append) que ocurre cuando `047` recalcula la síntesis, no un cambio de cómo funcionan
  `044`/`045`/etc.
- `CLAUDE.md` §4 sigue íntegro: el histórico son señales de infraestructura/eventos
  públicos (tráfico por tramo, incidencias con permiso administrativo, clima por zona,
  eventos programados) — **nunca datos de localización de una persona concreta**. Si en
  el futuro se planteara guardar algo con ambigüedad sobre si identifica a alguien, esa
  pieza necesita su propia revisión bajo §4 antes de escribirse, no una extensión
  silenciosa de esta tabla.
- Sigue haciendo falta spec `Draft`/`Approved` (`047`) con contrato de datos congelado
  antes de escribir el esquema real de la tabla — esta ADR fija la elección de motor, no
  el esquema.

**Actualización (2026-09-17)**: el esquema (entidades, relaciones, identificadores,
dimensión espacial/temporal, procedencia) quedó modelado — desde el dominio, no desde las
tablas existentes — en `docs/04_MODELO_DE_DATOS.md`. Es el "architecture gate" pedido
explícitamente por el usuario antes de escribir la migración SQL real: se revisa/ajusta
antes de tocar la base de datos, no después.

## Consecuencia

- `047` puede diseñar su contrato de datos asumiendo Postgres como destino del histórico,
  sin tener que inventar una solución ad-hoc sobre Redis.
- Se añade una fila a `CLAUDE.md` §5 señalando esta ADR, sin borrar ni contradecir la fila
  de Redis existente.

**Actualización (2026-09-21) — resuelta**: el usuario creó el proyecto Neon (neon.tech,
free tier) y compartió la cadena de conexión, verificada con una consulta real
(`select version()`, Postgres 18.6) antes de tocar nada más. Migraciones aplicadas
(`scripts/migrations/`), y `047` v3 escribe histórico real — ver su historial. Redis
(Upstash) sigue sin aprovisionar, sin relación con esto.
