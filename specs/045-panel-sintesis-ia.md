# 045 — Panel de síntesis con IA (insights y recomendaciones con guardrails)

```yaml
id: 045
titulo: "Panel que resume todas las señales del producto con un modelo de IA: insights de calidad y recomendaciones fundamentadas, con guardrails"
estado: Draft
tipo: indice-compuesto
depende_de: [013, 041, 040]
propietario: ""
version: 1
```

> **Estado:** `Draft` — **cuarto y último punto** de la tanda de trabajo post-V1 (ver
> `docs/03_PLAN_POST_V1.md`), y el usuario pidió explícitamente empezar por **analizar**,
> no implementar. Este documento es ese análisis inicial, no un contrato congelado.
> **Requiere una decisión de producto/ADR explícita antes de pasar a `Approved`** — ver §0.

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
`pulso/v1/distrito`, `mediatico/v1/items`, `meteo/v1/avisos`, etc.), nunca datos en bruto
de fuentes externas directamente — mismo principio de capas que el resto del repo
(`CLAUDE.md` §3.3). La fuente nueva es el **modelo de IA en sí** (proveedor a decidir, §0),
que no es una fuente de datos sino una capa de síntesis sobre datos ya obtenidos.

## 3. Contrato de datos (normalizado)

Boceto, no congelado (pendiente de §0):

```typescript
interface SintesisIA {
  id: string;
  generadaEn: string;             // ISO 8601
  resumen: string;                 // 2-4 frases, lenguaje llano, "qué es lo más importante ahora"
  insights: {
    texto: string;
    severidad: 'informativo' | 'aviso' | 'urgente';
    fuenteSpec: string[];          // igual trazabilidad que Insight de spec 013 — de qué señales sale cada afirmación
  }[];
  recomendaciones: {
    texto: string;                 // siempre condicional, nunca imperativo — mismo criterio que spec 041 §0
    fuenteSpec: string[];
  }[];
  modelo: string;                  // qué modelo generó esto, para trazabilidad/auditoría
  advertencia: string;             // aviso fijo y visible: "generado por IA, puede contener errores — revisar antes de actuar"
}
```

## 4. Pipeline (seed → caché → endpoint)

A definir tras la decisión de producto (§0) — como mínimo, caché agresiva (la llamada al
modelo de IA es la más cara de todo el pipeline) y **nunca** una llamada por cada carga de
usuario.

## 5. Contrato de capa de mapa

No aplica — panel de texto dentro de `/inteligencia` (spec `040`), no una capa geoespacial.

## 6. Criterios de aceptación (Definition of Done) — provisional, sujeto a §0

- [ ] ADR explícito aceptando el uso de un modelo de IA en este producto, con coste y
      proveedor decididos — bloqueante para `Approved`, igual de duro que el bloqueante de
      contenido real de spec `042`.
- [ ] **Guardrails verificables, no solo un prompt "pórtate bien"**: el modelo nunca
      recibe herramientas ni capacidad de ejecutar nada (solo genera texto), cada
      afirmación del resumen es trazable a una `fuenteSpec` real (no una cifra inventada
      sin origen), aviso fijo de "generado por IA" siempre visible (mismo principio que el
      badge `MOCK` de spec `003`, nunca en letra pequeña — `CLAUDE.md` §4).
- [ ] Ninguna recomendación es una acción ejecutable desde la UI — mismo criterio que spec
      `041` §0/§6 (condicional, nunca imperativo, verificable por test si el patrón de
      spec 041 se reutiliza).
- [ ] Comportamiento definido y probado ante una respuesta del modelo mal formada o vacía
      — nunca romper el panel, degradar a "sin síntesis disponible ahora mismo".
- [ ] `npm run typecheck` / `npm run test` / `npm run build` sin regresiones.

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

## 8. Historial

| Versión | Fecha | Cambio |
|---|---|---|
| 1 | 2026-09-17 | Creación (Draft) como documento de **análisis**, a petición explícita del usuario ("analizar tema IA", no implementar) — cuarto y último punto de la tanda de trabajo post-V1. Marcada con un bloqueante explícito de decisión de producto/ADR antes de `Approved` (§0), mismo peso que el bloqueante de revisión de contenido de spec `042`. Boceto de contrato de datos con guardrails (§3/§6), sin due-diligence de proveedor todavía. |
| 1 | 2026-09-17 | Añadido §0.1 con opciones concretas (Vercel AI Gateway, modelo pequeño/barato, cadencia con TTL + hash de señales de entrada) para informar la decisión — sigue sin ser `Approved`, el bloqueante de producto/ADR de §0 sigue en pie, esto no lo resuelve. |
