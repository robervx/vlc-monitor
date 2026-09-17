# 045 — Panel de síntesis con IA (insights y recomendaciones con guardrails)

```yaml
id: 045
titulo: "Panel que resume todas las señales del producto con un modelo de IA: insights de calidad y recomendaciones fundamentadas, con guardrails"
estado: Implemented
tipo: indice-compuesto
depende_de: [013, 041, 040]
propietario: ""
version: 2
```

> **Estado:** `Implemented` (v2, 2026-09-17) — el usuario resolvió el bloqueante de §0
> aprobando la opción de §0.1 (Vercel AI Gateway + modelo barato + caché con TTL), ver
> `docs/decisiones/ADR-005-panel-sintesis-ia.md`. **Limitación honesta**: este entorno de
> desarrollo no tiene `AI_GATEWAY_API_KEY`/`VERCEL_OIDC_TOKEN` provisionado, así que la
> llamada real al modelo no se ha podido verificar en vivo — el endpoint se comprobó
> devolviendo un error controlado (502, "Unauthenticated request to AI Gateway") en vez de
> romperse o inventar datos, y el panel se verificó en navegador con una respuesta simulada
> con la forma real del contrato. Queda pendiente de su primera llamada real en el primer
> despliegue con credenciales — mismo tipo de hueco que Upstash Redis en spec 001 §4.

## 0. Por qué esta spec es distinta de las demás — decisión pendiente, no solo técnica

Todas las specs de correlación de este repo (`010` Pulso de Distrito, `013` motor de
insights, `024` correlación v2, `041` apoyo a decisión) comparten un principio explícito,
repetido en cada una de ellas: **declarativo, sin modelo estadístico ni de IA nuevo**. Esta
spec propone justo lo contrario — usar un modelo de lenguaje para sintetizar las señales
ya calculadas por esas specs y redactar insights/recomendaciones. Antes de que esto sea
`Approved`, hace falta una decisión explícita del usuario (y probablemente un ADR nuevo en
`docs/decisiones/`, mismo patrón que `ADR-002`/`ADR-003`/`ADR-004`) sobre:

- **Coste**: cada llamada a un modelo de IA tiene coste por token: hay que decidir
  cadencia (¿cada refresco de página? ¿cada N minutos? ¿solo bajo demanda de un botón?) y
  presupuesto — no puede ser "en cada carga de cualquier usuario", igual que ninguna otra
  fuente de este repo se llama sin caché (`CLAUDE.md` §2).
- **Fiabilidad/alucinación**: un modelo de IA puede inventar datos con confianza — en un
  contexto de emergencias, una recomendación fundamentada en un dato inventado es más
  peligrosa que no tener recomendación. Los guardrails (§5) tienen que ser reales, no un
  disclaimer de adorno.
- **Proveedor/coste de infraestructura**: no está decidido si esto se sirve vía la API de
  Anthropic directamente, un gateway (p. ej. Vercel AI Gateway, si el despliegue final usa
  Vercel), u otro proveedor — decisión de producto, no de esta spec en solitario.

### 0.1 Opciones concretas para informar la decisión (investigación, no decisión)

El repo ya despliega en Vercel (`CLAUDE.md` §5) — abarata la parte de infraestructura sin
resolver la parte de producto:

- **Vercel AI Gateway** (GA desde agosto 2025): API unificada con observabilidad, fallback
  entre modelos y "zero data retention" — evitaría gestionar una clave de proveedor propia
  y da métricas de coste por request de forma nativa. Encaja con el patrón de este repo
  (endpoint interno propio, nunca el cliente llamando directo a un proveedor externo).
- **Modelo**: un modelo pequeño/barato (p. ej. Claude Haiku) es probablemente suficiente
  para "resumir 5-6 señales ya calculadas en 2-4 frases" — no hace falta el modelo más
  grande disponible para esta tarea de síntesis acotada, lo que reduce el problema de coste
  de §0 a un orden de magnitud menor de lo que "IA" sugiere de entrada.
- **Cadencia barata por defecto**: cachear la síntesis igual que cualquier otra fuente de
  este repo (`CLAUDE.md` §2) con un TTL generoso (15-30 min, no en cada carga de página) y
  regenerar solo si alguna señal de entrada cambió de verdad (comparar un hash de las
  señales de entrada contra la última síntesis) — evita pagar por una llamada idéntica.
- Ninguna de estas opciones resuelve el ADR por sí sola — siguen siendo decisiones de
  producto (aceptar el gasto recurrente, aceptar depender de un proveedor de IA) que le
  corresponden al usuario, no a esta sesión.

## 1. Problema / motivación

Hoy cada señal (Pulso de Distrito, insights, apoyo a decisión, contexto mediático,
tendencia, avisos oficiales...) vive en su propio panel, con su propio criterio
declarativo de "cuándo saltar". El usuario quiere un panel más que, en vez de aplicar
reglas fijas, **lea todas las señales ya calculadas por el resto del producto y redacte un
resumen de calidad**: qué es lo más importante ahora mismo en toda la ciudad, y qué se
podría valorar hacer al respecto — con el mismo límite de "avisa, no actúa" que el resto
del repo (`CLAUDE.md` §4), pero con la capacidad de síntesis en lenguaje natural que un
catálogo de reglas declarativas no tiene.

## 2. Fuente(s) de datos

No hay fuente externa nueva de **datos** — el modelo de IA consume exclusivamente lo que
ya sirven los endpoints internos existentes (`insights/v1/actual`, `decision/v1/sugerencias`,
`pulso/v1/distrito`, `mediatico/v1/items`, `meteo/v1/avisos`), nunca datos en bruto de
fuentes externas directamente — mismo principio de capas que el resto del repo
(`CLAUDE.md` §3.3). Implementado invocando cada handler existente **como función en el
mismo proceso** (`src/server/sintesis-ia.ts` importa y llama `insightsHandler()`,
`decisionHandler()`, etc. directamente) en vez de HTTP interno — el router reescribe las
peticiones con un origen ficticio (`_router-src.ts`, `BASE = 'http://d.invalid'`), así que
un `fetch` a una URL relativa no resolvería en producción; llamar la función directamente
evita ese problema y de paso reutiliza la caché propia de cada handler sin coste extra.

La fuente nueva es el **modelo de IA en sí**: Vercel AI Gateway, `anthropic/claude-haiku-4.5`
(decisión de producto, `docs/decisiones/ADR-005-panel-sintesis-ia.md`).

## 3. Contrato de datos (normalizado)

```typescript
// src/services/sintesis-ia.ts — SintesisIASchema (zod) valida la respuesta del modelo
interface SintesisIA {
  id: string;
  generadaEn: string;             // ISO 8601
  resumen: string;                 // 2-4 frases, lenguaje llano, "qué es lo más importante ahora"
  insights: {
    texto: string;
    severidad: 'informativo' | 'aviso' | 'urgente';
    fuenteSpec: string[];          // no vacío — igual trazabilidad que Insight de spec 013
  }[];
  recomendaciones: {
    texto: string;                 // siempre condicional, nunca imperativo — mismo criterio que spec 041 §0
    fuenteSpec: string[];          // no vacío
  }[];
  modelo: string;                  // qué modelo generó esto, para trazabilidad/auditoría
  advertencia: string;             // aviso fijo y visible: "generado por IA, puede contener errores — revisar antes de actuar"
}
```

## 4. Pipeline (seed → caché → endpoint)

`GET /api/sintesis/v1/actual` — caché `getOrFetch` con TTL de 20 min (ADR-005, la fuente
más cara del producto, cadencia deliberadamente baja). El `fetcher` recolecta las 5 señales
(en paralelo, degradando a `null` la que falle sin bloquear a las demás), construye el
prompt (`construirPrompt`) y llama a `generateObject` (paquete `ai`) con
`SintesisIASchema` como esquema forzado — si la respuesta no valida el esquema o no supera
`validarTrazabilidad` (toda `fuenteSpec` no vacía), se rechaza entera y el endpoint
devuelve un error controlado (502), nunca una síntesis a medias o inventada.

## 5. Contrato de capa de mapa

No aplica — panel de texto (`src/ui/sintesis-ia-panel.ts`) dentro de `/inteligencia`
(spec `040`), no una capa geoespacial.

## 6. Criterios de aceptación (Definition of Done)

- [x] ADR explícito aceptando el uso de un modelo de IA en este producto, con coste y
      proveedor decididos — `docs/decisiones/ADR-005-panel-sintesis-ia.md`, aprobado
      explícitamente por el usuario.
- [x] **Guardrails verificables, no solo un prompt "pórtate bien"**: `generateObject` con
      `SintesisIASchema` (zod) — el modelo nunca recibe herramientas ni capacidad de
      ejecutar nada (solo genera el objeto tipado); `fuenteSpec` no vacío forzado tanto por
      el esquema (`z.array(z.string()).min(1)`) como por `validarTrazabilidad` (defensa en
      profundidad); aviso fijo "Generado por IA..." siempre visible en amarillo/naranja,
      igual de prominente que el badge `MOCK` de spec `003`.
- [x] Ninguna recomendación es una acción ejecutable desde la UI — el panel solo muestra
      texto, sin botones de acción (a diferencia de spec `041`, que sí tiene "Ver en el
      mapa" pero tampoco ninguna acción ejecutable).
- [x] Comportamiento definido y probado ante una respuesta del modelo mal formada o vacía
      — `SintesisIASchema.safeParse` rechaza severidad fuera de enum y `fuenteSpec` vacío
      (2 tests); sin credenciales reales en este entorno, se verificó con el error real de
      autenticación del gateway: el endpoint devuelve 502 controlado y el panel degrada a
      "Síntesis con IA no disponible ahora mismo" — nunca rompe ni inventa contenido.
      **Pendiente**: verificar el camino feliz (respuesta real del modelo) en el primer
      despliegue con `AI_GATEWAY_API_KEY`/`VERCEL_OIDC_TOKEN` provisionado.
- [x] Diseño visual verificado en navegador con una respuesta simulada de la forma real del
      contrato — advertencia siempre visible, insights con severidad y chips de fuente,
      recomendaciones con chips de fuente.
- [x] 7 tests nuevos (`sintesis-ia.test.ts`) — esquema, guardrail de trazabilidad,
      ensamblado de metadatos, construcción de prompt.
- [x] `npm run typecheck` / `npm run test` (401/401) / `npm run build` verdes. El bundle de
      `api/router.js` pasa de 1,2 MB a 2,4 MB (paquetes `ai` + `zod` + proveedor del
      gateway) — muy por debajo del límite de Vercel, documentado por transparencia.

## 7. Riesgos y fuera de alcance

- **Riesgo principal, el mismo que motivó §0**: alucinación en un contexto de emergencias.
  Mitigación mínima: cada afirmación trazable a una fuente real (§3, `fuenteSpec`), nunca
  presentar el resumen como un dato oficial adicional.
- **Riesgo de coste**: sin una cadencia/caché bien pensada, esto es la fuente más cara de
  todo el producto — a diferencia del resto de specs, que son gratuitas o de coste fijo
  bajo.
- **Fuera de alcance v1**: cualquier capacidad del modelo de ejecutar acciones, llamar
  herramientas externas, o interactuar con sistemas de despacho reales — sigue vetado por
  `CLAUDE.md` §4 igual que en el resto del producto, con o sin IA de por medio.
- **Fuera de alcance v2**: la comparación por hash de señales de entrada mencionada en
  §0.1 (regenerar solo si algo cambió de verdad) — se implementó solo TTL fijo de 20 min
  por simplicidad; fast-follow si el coste real en producción lo justifica.

## 8. Historial

| Versión | Fecha | Cambio |
|---|---|---|
| 1 | 2026-09-17 | Creación (Draft) como documento de **análisis**, a petición explícita del usuario ("analizar tema IA", no implementar) — cuarto y último punto de la tanda de trabajo post-V1. Marcada con un bloqueante explícito de decisión de producto/ADR antes de `Approved` (§0), mismo peso que el bloqueante de revisión de contenido de spec `042`. Boceto de contrato de datos con guardrails (§3/§6), sin due-diligence de proveedor todavía. |
| 1 | 2026-09-17 | Añadido §0.1 con opciones concretas (Vercel AI Gateway, modelo pequeño/barato, cadencia con TTL + hash de señales de entrada) para informar la decisión — sigue sin ser `Approved`, el bloqueante de producto/ADR de §0 sigue en pie, esto no lo resuelve. |
| 2 | 2026-09-17 | **Implemented.** Usuario aprobó explícitamente la opción de §0.1 → `docs/decisiones/ADR-005-panel-sintesis-ia.md` (Vercel AI Gateway, `anthropic/claude-haiku-4.5`, TTL 20 min, guardrails por esquema). `src/services/sintesis-ia.ts` (esquema zod, prompt, guardrail de trazabilidad, 7 tests), `src/server/sintesis-ia.ts` (`GET /api/sintesis/v1/actual`, invoca los handlers existentes como funciones en el mismo proceso — evita el problema del origen ficticio del router), `src/ui/sintesis-ia-panel.ts`. Sin credenciales de proveedor en este entorno — verificado el camino de error controlado (502, panel degrada sin romperse) y el diseño visual con una respuesta simulada; la llamada real al modelo queda pendiente del primer despliegue con credenciales. 401/401 tests, `typecheck`/`build` verdes (bundle de `api/router.js`: 1,2 MB → 2,4 MB). |
