# Spec 047 — Síntesis con IA v2: señales correlacionadas + recomendaciones de actuación

```yaml
id: 047
titulo: "Panel de síntesis IA dividido en dos cajas: señales detalladas correlacionadas y recomendaciones de actuación por zona"
estado: Implemented   # v2 — correlación en caliente + recomendaciones IA verificadas en vivo; histórico en Postgres (ADR-006) sigue pendiente de aprovisionar
tipo: capa
depende_de: [004, 013, 024, 026, 027, 044, 045]
propietario: ""
version: 2
```

> **v2 (2026-09-17)**: implementada y verificada en vivo la correlación en caliente
> (`src/services/correlacion-senales.ts`) y las recomendaciones de actuación
> (`src/services/sintesis-ia-v2.ts`, `src/server/sintesis-ia-v2.ts`), endpoint
> `GET /api/sintesis/v2/actual`, dos cajas en `/inteligencia`
> (`senales-ia-panel.ts`/`recomendaciones-actuacion-panel.ts`). **Pendiente
> explícitamente**: la escritura en `senales_historico` (Postgres, `ADR-006`) — bloqueada
> en crear el proyecto Neon/Supabase, paso que necesita al usuario. Sin esa pieza, todo lo
> demás de esta spec (correlación, endpoint, dos cajas, guardrails) funciona igual — es
> aditivo, no bloqueante (§7).

> Sustituye/amplía `045` (no lo deprecamos: sigue `Implemented` como base — esta es la
> siguiente versión de su mismo panel, prioridad explícita del usuario: "esa tarjeta la
> vamos a poner la primera arriba"). Depende de `docs/decisiones/ADR-006-almacen-historico-senales.md`
> (Postgres serverless) para la pieza de histórico — la correlación en caliente (§3-§4) no
> depende de esa pieza y puede construirse antes.

## 1. Problema / motivación

`045` da un resumen redactado de lo que ya calculan otros paneles. No basta para dos usos
concretos que ha pedido el usuario:

1. **Señales detalladas de interés policial** — no un resumen en prosa, sino hechos
   concretos y trazables (qué calle, qué distrito, qué hora, qué fuente) útiles tanto para
   **anticipar** (antes de que pase) como para **investigar a posteriori** (qué había
   pasado en esa zona cuando ocurrió tal cosa).
2. **Recomendaciones de actuación desarrolladas para la zona/situación concreta** — no un
   resumen genérico de ciudad, sino algo ubicado: "en el barrio X, con esta combinación de
   señales, esto es lo que podría valorarse".

Esto exige un salto de calidad en el **contexto** que recibe el modelo: hoy solo ve 5
resúmenes ya agregados por ciudad (`insights`, `sugerencias`, `pulso`, `mediatico`,
`avisos`) — nunca la señal individual con su calle y su hora exactas. El "tejido de datos"
para dar ese salto ya existe en gran parte (ver §2); lo que falta es un paso de
**correlación estructurada**, no una fuente nueva.

**Límite ético/legal — no negociable, `CLAUDE.md` §4, reafirmado explícitamente para esta
spec por el tono "policial" del encargo:**
- Ninguna señal identifica a una persona ni a un vehículo/matrícula concreto. Todo lo que
  entra aquí es infraestructura pública (tramo de vía, incidencia con permiso
  administrativo, evento programado, estación meteorológica) — nunca movimiento
  individual.
- Toda recomendación es **advisoria y condicional** ("podría valorarse", "conviene
  monitorizar") — igual que ya hace `041` — **nunca una instrucción ejecutable ni una
  decisión sobre una persona o grupo concreto**. El producto avisa, no actúa.
- El banner "generado por IA, puede contener errores" de `045` se mantiene, y se añade una
  segunda línea fija en el bloque de recomendaciones: *"no sustituye al criterio
  profesional ni autoriza ninguna actuación por sí sola"*.

## 2. Fuente(s) de datos

**Ninguna fuente externa nueva** — esta spec correlaciona fuentes ya `Implemented`,
todas con endpoint interno propio (`CLAUDE.md` §3.3: nunca se llama a una fuente externa
desde aquí, solo a los endpoints internos que ya cachean cada una):

| Fuente (ya Implemented) | Qué aporta a la correlación | Granularidad |
|---|---|---|
| `004`/`024` tráfico (`trafico-estado`) | Tramo con nombre de calle + geometría + distrito | Por tramo (calle) |
| `026` incidencias vía pública (`via-publica-incidencias`) | Calle, lat/lon exacto, tipo (obras/incidencias/festejos), distrito | Por punto |
| `043` cámaras DGT (`camaras-dgt`) | Carretera + lat/lon | Por cámara |
| `044` clima por zona, altimetría, AVAMET | Lluvia/viento/temperatura real por distrito y por estación | Por distrito / por estación |
| `027` agenda de eventos con impacto vial | Evento + distritos mencionados + ventana horaria | Por distrito |
| `013`/`024` insights, `041` sugerencias, `010` pulso de distrito | Correlación ya calculada a nivel ciudad/distrito (se reutiliza como contexto adicional, no se descarta) | Por distrito |

**Pieza de infraestructura ya existente y reutilizable**: `src/services/district-geometry.ts`
ya resuelve point-in-polygon (lat/lon → distrito) — es el mismo mecanismo que usan hoy
`via-publica.ts` y `avamet-estaciones.ts` (indirectamente, vía distrito). No hace falta
escribir un motor de correlación espacial desde cero, solo aplicarlo de forma sistemática a
todas las señales con coordenadas antes de dárselas al modelo.

**Se descarta explícitamente leer la imagen renderizada del mapa (captura/screenshot) como
fuente de contexto para el modelo.** Ya tenemos lat/lon y nombre de calle exactos como
datos estructurados para tráfico, incidencias y cámaras — pedirle a un modelo de visión que
re-derive eso a partir de píxeles sería estrictamente peor: con pérdida, no determinista,
más caro, y rompe la trazabilidad de `fuenteSpec` que ya exige `045`/`013` (cada afirmación
debe señalar a un campo de dato real, no a algo inferido de una imagen).

## 3. Contrato de datos (normalizado)

```typescript
export type TipoSenal = 'trafico' | 'incidencia' | 'clima' | 'evento' | 'camara';
export type Severidad = 'informativo' | 'aviso' | 'urgente';

/** Unidad atómica de la caja "señales" — y lo que se persiste en el histórico (ADR-006). */
export interface SenalCorrelacionada {
  id: string;
  tipo: TipoSenal;
  distritoCodigo: string | null;
  calle: string | null;          // nombre de vía, si la fuente lo trae (tráfico/incidencia/cámara)
  lat: number | null;
  lon: number | null;
  descripcion: string;            // factual, sin valoración añadida por el modelo
  severidad: Severidad;
  /** ids de otras SenalCorrelacionada del mismo lote unidas por proximidad espacial
   *  (mismo distrito o radio corto entre lat/lon) y temporal (misma ventana horaria) —
   *  calculado en servidor de forma determinista, el modelo nunca decide qué se
   *  correlaciona, solo redacta a partir de lo ya unido. */
  relacionadas: string[];
  observedAt: string;
  fetchedAt: string;
  fuenteSpec: string[];            // specs de origen, mismo patrón que insights (013/024) y sintesis-ia (045)
}

/** Unidad atómica de la caja "recomendaciones". */
export interface RecomendacionActuacion {
  id: string;
  distritoCodigo: string | null;
  zona: string;                    // nombre legible del distrito/barrio
  situacionAsociada: string[];     // ids de SenalCorrelacionada que motivan esta recomendación
  texto: string;                   // SIEMPRE en condicional — ver §1
  tipoActuacionSugerida: 'informativa' | 'coordinacion-protocolo' | 'revision-tecnica' | 'refuerzo-preventivo';
  fuenteSpec: string[];
  advertencia: string;             // fijo, ver §1
}

export interface SintesisIAv2 {
  generadaEn: string;
  modelo: string;
  senales: SenalCorrelacionada[];
  recomendaciones: RecomendacionActuacion[];
  advertencia: string;             // banner general heredado de 045
}
```

Esquema de la tabla histórica en Postgres (append-only, ver ADR-006 — se congela junto con
este contrato, no antes):

```sql
create table senales_historico (
  id           text primary key,
  tipo         text not null,
  distrito_codigo text,
  calle        text,
  lat          double precision,
  lon          double precision,
  descripcion  text not null,
  severidad    text not null,
  relacionadas text[] not null default '{}',
  observed_at  timestamptz not null,
  fetched_at   timestamptz not null,
  fuente_spec  text[] not null,
  creado_en    timestamptz not null default now()
);
create index on senales_historico (distrito_codigo, observed_at);
create index on senales_historico (calle, observed_at);
```

## 4. Pipeline (seed → caché → endpoint)

| Parámetro | Valor |
|---|---|
| Paso nuevo | `src/services/correlacion-senales.ts` — junta tráfico/incidencias/cámaras (con coordenadas) + clima/eventos (por distrito) usando `district-geometry.ts`; determinista, sin llamada a IA en este paso |
| Frecuencia de refresco (cron) | Hereda el TTL ya activo de `045` (90 min) — no se añade una cadencia nueva |
| TTL en caché | 90 min, igual que `045` |
| Comportamiento si la fuente falla | Igual que `045`: stale-on-error, degrada sin romper el panel; si Postgres no responde, la caja "señales"/"recomendaciones" en caliente se sirve igual — la escritura histórica es best-effort, nunca bloqueante |
| Escritura histórica (nueva, depende de ADR-006) | Cada recálculo inserta las `SenalCorrelacionada` del lote en `senales_historico` (append-only, `on conflict (id) do nothing` — la correlación es determinista, mismo id en dos lotes = mismo hecho) |
| Endpoint interno que sirve el dato | `GET /api/sintesis/v2/actual` (nuevo — `045` (`v1/actual`) se mantiene intacto mientras `047` se verifica; se retira `v1` en una versión posterior de esta misma spec, no de golpe) |

## 5. Contrato de capa de mapa

No aplica — sigue siendo un panel de `/inteligencia`, no una capa de `/mapa` (igual que
`045`). Posible ampliación futura: resaltar en el mapa el distrito con una recomendación
`urgente` activa — fuera de alcance de v1.

## 6. Criterios de aceptación (Definition of Done)

- [x] `correlacion-senales.ts` probado con datos reales de 3+ fuentes (tráfico, incidencias,
      cámaras DGT — clima/eventos también cableados, sin señal activa en el momento de
      verificar) correlacionadas por distrito/proximidad — 11 tests, y en vivo contra el
      endpoint real (255 señales, tipos `trafico`/`incidencia`/`camara` presentes).
- [x] Endpoint `v2/actual` responde con el contrato de §3, con `relacionadas` no vacío en
      casos reales (verificado: un tramo cortado enlazado con decenas de incidencias reales
      del mismo distrito).
- [x] Las dos cajas se muestran separadas con orden fijo en `/inteligencia` (señales junto a
      cámaras, recomendaciones justo debajo) — verificado en navegador, escritorio y móvil
      (bottom sheet).
- [x] Cada recomendación pasa una verificación automática (`esTextoCondicional`) de que su
      `texto` contiene una fórmula condicional — mismo principio de guardrail por código que
      ya usa `041`. Verificado con datos reales: 8/8 recomendaciones generadas en una
      llamada real pasaron el filtro sin necesitar descartar ninguna.
- [x] Ninguna `SenalCorrelacionada`/`RecomendacionActuacion` contiene un identificador de
      persona o vehículo — sin campo para ello por diseño, más `contieneIdentificadorPersonal`
      (test con matrícula/DNI-like simulados).
- [ ] Escritura en `senales_historico` verificada con al menos una inserción y lectura
      reales contra la instancia Postgres del usuario — **pendiente**, bloqueado en crear el
      proyecto Neon/Supabase (§7).
- [x] Advertencias visibles (banner general + línea de "no autoriza ninguna actuación")
      verificadas en navegador.
- [x] `v1/actual` (`045`) sigue respondiendo sin cambios mientras `v2` se verifica — no se
      tocó `sintesis-ia.ts`.

## 7. Riesgos y fuera de alcance

- **Bloqueante de despliegue**: crear el proyecto Neon/Supabase (Vercel Marketplace, free
  tier) y añadir su cadena de conexión como variable de entorno — paso que necesita al
  usuario (`ADR-006`), igual que ya pasó con Upstash (sin aprovisionar todavía) y con la
  clave de Gemini de `045`. Sin esa pieza, la correlación en caliente (§3-§4 sin la
  escritura histórica) sigue siendo implementable y útil por sí sola — no bloquea todo lo
  demás.
- **Crecimiento de la tabla histórica**: sin política de retención, `senales_historico`
  crece sin límite. Mitigación prevista (igual que ya hace `trafico-historico` con
  rollups diarios): agregar/podar registros más allá de N días a un rollup por
  distrito/día, no borrar sin más.
- **El modelo no debe inventar correlaciones**: `relacionadas` se calcula en servidor de
  forma determinista (distrito/proximidad/ventana horaria) antes de llamar al modelo — el
  modelo redacta a partir de eso, nunca decide qué está relacionado con qué. Si el
  `generateObject` devolviera una relación no presente en `relacionadas`, se descarta esa
  recomendación (guardrail de esquema, mismo principio que `fuenteSpec` obligatorio en
  `045`).
- **Fuera de alcance de v2**: usar el histórico para mejorar la calidad de las
  recomendaciones (few-shot con contexto pasado, detección de patrones recurrentes por
  calle) — eso es exactamente lo que pide el usuario a medio plazo ("mejorar
  exponencialmente"), pero necesita que el histórico lleve tiempo acumulando datos reales
  antes de que tenga sentido diseñarlo. Se deja anotado como v3 de esta misma spec.
- **Calibrar severidad por `afectacion`, no por `tipo`** (hallazgo real, 2026-09-17): la
  primera versión mapeaba `tipo === 'incidencias' → aviso`, pero los datos reales de vía
  pública muestran que la inmensa mayoría de incidencias activas (de 498 totales) son
  ocupaciones administrativas rutinarias de acera/zona de estacionamiento — irrelevantes
  para una recomendación — independientemente de su `tipo`. Se cambió a analizar el texto
  de `afectacion` (`100% CALZADA` → urgente, `CALZADA`/`CARRIL` → aviso, resto →
  informativo), que sí distingue impacto real en calzada.
- **Prompt/salida acotados por volumen real de Valencia** (hallazgo real, 2026-09-17): sin
  límite, un solo distrito con obra larga fragmentada en muchos permisos generó un prompt
  de 60 KB (con `gemini-3-flash-preview` respondiendo 503 "high demand" de forma
  persistente); y con 12+ distritos activos a la vez, una respuesta completa superaba
  `maxOutputTokens: 1024` y salía cortada (`finishReason: 'length'`). Se acotó a los 8
  distritos más severos y a las 8 señales más severas por distrito (resumiendo el resto
  como recuento, nunca omitiéndolo en silencio), y se subió `maxOutputTokens` a 4096. Con
  ambos cambios, la llamada real generó 8/8 recomendaciones válidas sin cortes.
- **Riesgo de deriva de uso**: el framing "interés policial"/"actuación policial" de esta
  spec no cambia ni relaja `CLAUDE.md` §4 en ningún despliegue — cualquier intervención real
  sigue el cauce legal normal (policía, protocolo, autorización judicial si aplica), fuera
  de esta aplicación. Si una futura petición pidiera identificar personas/vehículos
  concretos o ejecutar una acción automática, esta spec no lo cubre y esa petición debe
  rechazarse igual que fija `CLAUDE.md` §4.

## 8. Historial

| Versión | Fecha | Cambio |
|---|---|---|
| 1 | 2026-09-17 | Creación — inventario de fuentes ya `Implemented` con granularidad calle/punto (confirmado: no hace falta fuente nueva ni lectura de imagen del mapa), contrato de datos propuesto para dos cajas (señales/recomendaciones), esquema de histórico ligado a `ADR-006`. Sin implementar todavía. |
| 2 | 2026-09-17 | **Implementado** — correlación en caliente (`correlacion-senales.ts`, 11 tests) y recomendaciones de actuación (`sintesis-ia-v2.ts`, 11 tests) sin esperar a Postgres, a petición explícita del usuario. Endpoint `GET /api/sintesis/v2/actual` registrado junto a `v1`. Dos cajas nuevas en `/inteligencia` (`senales-ia-panel.ts`, `recomendaciones-actuacion-panel.ts`), sustituyen la UI de `045` v1 (el endpoint `v1` se mantiene intacto). 3 bugs reales encontrados y corregidos en la verificación en vivo: duplicados de incidencias con el mismo id (una obra partida en varias features), severidad mal calibrada por `tipo` en vez de `afectacion`, y prompt/salida sin acotar que producía 503 por tamaño y respuestas cortadas por `maxOutputTokens`. Verificado con 8/8 recomendaciones reales válidas en una llamada, señales reales renderizadas en navegador (escritorio y móvil). 428/428 tests, `typecheck`/`build` verdes. Pendiente: escritura en `senales_historico` (bloqueada en crear el proyecto Postgres, `ADR-006`). |
