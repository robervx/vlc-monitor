# 024 — Motor de insights v2: correlación operativa

```yaml
id: 024
titulo: "Motor de insights v2 — correlación tráfico + Fallas + contexto mediático (sin modelo estadístico nuevo)"
estado: Implemented
tipo: indice-compuesto
depende_de: [013, 004, 008, 001, 016, 023]
propietario: ""
version: 2
```

## 0. Decisión de diseño (por qué esto y no la "Fase 1" de línea base/anomalías)

Esta spec es continuación directa de la línea F8 (`docs/investigacion/GEMELO_DIGITAL_SEGURIDAD_PUBLICA_PROPUESTA.md`), pero **no es la Fase 1** de ese documento (motor de línea base estadística con GLM Binomial Negativa sobre conteo continuo). Verificado explícitamente antes de escribir esta spec (asesoría de ciencia de datos, 2026-08-26):

- El único dato de tráfico real en producción (`estado`, spec `004`) es **categórico** (0-9 → 5 bandas), no un conteo continuo — no hay señal de sobredispersión que un GLM pueda modelar.
- No existe histórico de ningún conteo continuo en el repo; la spec `017` guarda snapshots del `estado` categórico, no sirve como set de entrenamiento de una línea base estadística.
- El dataset candidato a conteo continuo (`Intensitat transit trams`, capa `MapServer/188` del Geoportal, verificado con llamada real el 2026-08-26: 394 tramos, campos `lectura`/`imv`, **esquema de `idtramo` alfanumérico distinto del numérico de la capa `192`** ya usada por spec `004` — no conciliable por id directo) no está verificado en profundidad (granularidad temporal, histórico retroactivo disponible, cobertura, estabilidad de id) — sin eso, cualquier spec de línea base tendría un contrato de datos que no se puede congelar. Queda como verificación técnica pendiente, no como spec, en §7.

Lo que sí tiene sentido especificar ya, con datos 100% ya verificados y en producción: **correlación declarativa entre señales que ya existen**, extendiendo el motor de reglas de la spec `013` (v3, `Implemented`) en vez de sustituirlo. Mismo principio de diseño que `013` §0: **reglas independientes, sin score compuesto ponderado** — dos señales débiles nunca se suman para simular una alerta fuerte (ver `docs/investigacion/GEMELO_DIGITAL_SEGURIDAD_PUBLICA_PROPUESTA.md` §8, que avisa explícitamente de evitar esto). Cada regla nueva sigue produciendo un `Insight` con borrador de texto para revisión humana — "avisa, no actúa" (`CLAUDE.md` §4) sin excepción.

## 1. Problema / motivación

Un mando ya tiene tráfico (004), Fallas (008), meteo (001/016) y, cuando la 023 esté lista, contexto mediático geolocalizado — pero tiene que cruzarlos mentalmente para saber si una congestión "normal" en realidad coincide con un evento o una incidencia reportada por prensa en la misma zona. Esta spec responde: "de las señales que ya tengo, ¿cuáles están pasando juntas, en el mismo distrito, ahora mismo?" — sin inventar ninguna fuente ni modelo nuevo.

## 2. Fuente(s) de datos

**No hay fuente externa nueva.** Reutiliza exclusivamente endpoints/cachés ya existentes:

| Fuente | Endpoint interno reutilizado | Rol |
|---|---|---|
| Estado de tráfico (spec 004) | `GET /api/trafico/v1/estado` (misma caché) | Señal de congestión/corte por tramo y distrito |
| Fallas (spec 008) | `GET /api/fallas/v1/actual` (misma caché) | Zonas de movilidad reducida / monumentos / carpas activos |
| Meteo + predicción a corto plazo (specs 001, 016) | ya consumidas por `013` | Refuerzo de la regla `lluvia-intensa-prevista` existente |
| Contexto mediático geolocalizado (spec 023) | `GET /api/mediatico/v1/items` (campo `distritosMencionados`) | Menciones de prensa con palabra clave operativa, por distrito |

**Enriquecimiento necesario, no es una fuente nueva:** las entidades de Fallas (`MonumentoFalla`, `CarpaFalla`, `ZonaMovilidadReducida`, spec `008` §3) no llevan hoy campo `distrito`. Se añade reutilizando `getDistrictAtCoordinates` (`src/services/district-geometry.ts`, ya usada por `trafico.ts`) sobre el punto (monumento) o el centroide (carpa/zona) — mismo patrón que ya aplica `004`, sin geometría nueva ni llamada externa. Esto es una extensión del contrato de la spec `008` (bump de versión ahí cuando se implemente), igual que `023` extendió el campo `barrios` de la spec `000`.

**Dependencia condicionada — regla `trafico-mencionado-en-mediatico` (ver §6):** spec `023` sigue en `Draft`. El resto de esta spec (reglas a/b/d de §6) no depende de ella y puede implementarse ya. La regla que sí depende de `023` queda escrita en el contrato pero **no se activa en código hasta que `023` esté `Approved`/`Implemented`** — no se bloquea el resto del DoD por esto.

## 3. Contrato de datos (normalizado)

Extiende el `Insight` de la spec `013` (no lo sustituye — mismo tipo, más variantes):

```typescript
// Nuevos valores añadidos a TipoInsight (spec 013 §3):
type TipoInsightV2 =
  | 'trafico-concentrado-distrito'
  | 'trafico-en-zona-fallas'
  | 'trafico-mencionado-en-mediatico'   // solo activa con spec 023 Approved/Implemented
  | 'lluvia-mas-trafico-denso';

interface Insight {
  // ...campos existentes de spec 013 sin romper compatibilidad...
  fuenteSpec: ('001' | '002' | '004' | '008' | '010' | '016' | '023')[];
  // se cambia de valor único a array — una alerta de correlación nace de 2+ fuentes;
  // las reglas ya existentes de spec 013 siguen emitiendo un array de un solo elemento.
}
```

Extensión del contrato de la spec `008` (Fallas), necesaria para las reglas de §6:

```typescript
interface MonumentoFalla { /* ...campos existentes... */ distrito: string | null; }
interface CarpaFalla { /* ...campos existentes... */ distrito: string | null; }
interface ZonaMovilidadReducida { /* ...campos existentes... */ distrito: string | null; }
```

## 4. Pipeline (seed → caché → endpoint)

| Parámetro | Valor |
|---|---|
| Frecuencia de refresco (cron) | Ninguna propia — igual que `013`, se recalcula en cada petición combinando las cachés ya existentes (004, 008, 001, 016, 023). |
| TTL en caché | Ninguna caché propia. |
| Comportamiento si la fuente falla | Igual criterio que `013` §4: si falla tráfico o Fallas, esas reglas de correlación simplemente no se evalúan (se degrada, no se rompe el resto del panel) — nunca se genera una alerta de correlación con datos parciales de una de las dos señales. |
| Clave de caché | No aplica (reutiliza las de 004/008/001/016/023). |
| Endpoint interno que sirve el dato | El mismo de `013` — `GET /api/insights/v1/actual`, con las reglas nuevas añadidas al mismo cálculo. |

## 5. Contrato de capa de mapa

Sigue sin ser capa de mapa — mismo panel de `013`. Cada tarjeta de insight de correlación muestra, además del texto habitual, un chip por cada `fuenteSpec` que participó (ej. "004" + "008"), para que el mando vea de un vistazo qué dos señales se cruzaron sin tener que leer la descripción completa.

```typescript
{
  key: 'insights',
  specId: '013',   // sin cambios, misma capa/panel de la spec 013
  renderers: [],
  zoomMinimo: 0,
  agregacion: 'punto',
  icono: '',
}
```

## 6. Reglas v2 (declarativas, sin score compuesto — mismo criterio que spec 013 §0/§8)

| Tipo | Condición | Severidad | Por qué no usa persistencia temporal |
|---|---|---|---|
| `trafico-concentrado-distrito` | ≥3 tramos en `congestionado`/`cortado` (spec 004) dentro del mismo distrito, en la lectura actual | `aviso` con 3-5 tramos, `urgente` con 6+ | Multiplicidad simple en vez de exigir 2 lecturas consecutivas — el motor sigue siendo sin estado (spec 013 §8), igual que hoy `distrito-critico`; mitiga el "parpadeo" del `estado` categórico por volumen de tramos en vez de por tiempo. |
| `trafico-en-zona-fallas` | Algún tramo `congestionado`/`cortado` cuyo `distrito` coincide con el de una `ZonaMovilidadReducida` (spec 008) | `urgente` | Deliberadamente **solo** `ZonaMovilidadReducida`, no `MonumentoFalla`/`CarpaFalla` — esos dos datasets están poblados todo el año (689/462 registros verificados en agosto, fuera de temporada, spec 008 §2), usarlos haría disparar la regla en casi cualquier distrito en cualquier época. `ZonaMovilidadReducida` sí es genuinamente estacional (2 registros fuera de temporada, spec 008 §7) — es la única de las tres que significa "Fallas activa ahora", no "hay un monumento censado en este distrito". No hace falta ventana horaria porque Fallas no trae horas por tramo, solo geografía. |
| `trafico-mencionado-en-mediatico` (**gated tras spec 023 Approved/Implemented**) | Algún tramo `congestionado`/`cortado` cuyo `distrito` coincide con un `distritosMencionados` de un `ItemMediatico` (spec 023) publicado en las últimas 3h, cuyo `titulo`/`resumen` contiene alguna palabra de una lista cerrada: `accidente`, `corte`, `manifestación`, `incendio`, `atropello`, `colapso` | `urgente` | Coincidencia de texto+geografía+tiempo, determinista, sin NER — mismo criterio que el propio matching de spec 023. |
| `lluvia-mas-trafico-denso` | El insight `lluvia-intensa-prevista` (spec 016, ya en `013`) está activo para una franja horaria próxima **y** existe al menos un distrito con tramos en `congestionado`/`cortado` ahora mismo | `urgente` (sube desde `aviso`, refuerza en vez de duplicar) | No es una regla nueva desde cero — añade contexto de tráfico al insight de lluvia ya existente en vez de generar dos tarjetas sueltas que el mando tendría que cruzar mentalmente. |

**Lista cerrada de palabras clave** (`trafico-mencionado-en-mediatico`) vive como constante exportada en el mismo módulo que la regla — ampliable por spec futura si se detectan huecos en producción, nunca por inferencia de modelo.

## 7. Criterios de aceptación (Definition of Done)

- [x] `getDistrictAtCoordinates` aplicado a `MonumentoFalla`/`CarpaFalla`/`ZonaMovilidadReducida` en `src/services/fallas.ts` (`centroidePoligono` para carpas/zonas, coordenadas directas para monumentos), campo `distrito` añadido al contrato (bump versión spec `008`), tests con casos reales — `src/services/fallas.test.ts`.
- [x] Reglas `trafico-concentrado-distrito`, `trafico-en-zona-fallas` y `lluvia-mas-trafico-denso` implementadas en `src/services/insights.ts`, cada una con tests cubriendo condición activa/inactiva y el umbral exacto (borde) — sin red, funciones puras, mismo patrón que las reglas de spec 013. `trafico-en-zona-fallas` corregida en diseño (§6) para usar solo `zonasMovilidadReducida`, no monumentos/carpas (esos están poblados todo el año, hubiera generado ruido constante).
- [x] `fuenteSpec` migrado de valor único a array (`FuenteInsight[]`) en el contrato de `Insight`, sin romper las reglas ya existentes de spec 013 (siguen emitiendo array de un elemento) — `insights.test.ts` en verde tras el cambio (23 tests).
- [ ] Regla `trafico-mencionado-en-mediatico`: **no implementada en esta versión** — spec `023` sigue `Draft`, no `Approved`/`Implemented`, tal como esta misma spec exige en §2/§6 antes de activarla. Queda documentada y pendiente, no bloquea el resto del DoD (mismo criterio que spec 013 §8 con contexto mediático en v1).
- [x] UI: chip(s) de `fuenteSpec` visibles por tarjeta de insight (`.insight-card__fuente-chip`, `src/main.ts` + `index.html`), verificado en navegador — insight real `trafico-concentrado-distrito` (Extramurs, 4/26 tramos) visto en producción local con chip `004`.
- [x] Ninguna llamada de red nueva (reutiliza `trafico:valencia-estado:v1` y `fallas:valencia-actual:v1`, esta última ya existente de spec 008); ninguna alerta generada a partir de un score compuesto ponderado — cada regla evalúa su propia condición de forma independiente.
- [x] `npm run typecheck`, `npm run test` (171/171) y `npm run build` en verde.

## 8. Riesgos y fuera de alcance

- **Sesgo de cobertura de tráfico:** los tramos de spec 004 no cubren toda la red viaria — un distrito sin tramos monitorizados nunca puede disparar `trafico-concentrado-distrito` ni `trafico-en-zona-fallas`, lo que no significa que esté tranquilo, solo que no tiene sensor ahí. La descripción de cada alerta debe indicar "N tramos monitorizados en este distrito", no solo el conteo de afectados.
- **Sesgo de spec 023:** matching de texto determinista, cobertura parcial dependiente de que la prensa use nombre oficial de distrito/barrio o alias conocido. Si `023` expone algún campo de confianza/ambigüedad, `trafico-mencionado-en-mediatico` debe propagarlo en su descripción, no aparentar más certeza de la que tiene el dato de origen.
- **Riesgo de ruido por `estado` categórico:** aceptado en v1 igual que spec 013 §8 ya acepta ruido en umbrales — se ajustan los umbrales de multiplicidad (3/6 tramos) con uso real, no se añade modelo estadístico para resolver esto.
- **Fuera de alcance de esta versión:** cualquier motor de línea base/anomalías estadístico (Fase 1 del documento de propuesta, ver §0 — requiere fuente de conteo continuo verificada, no existe todavía), cualquier ventana temporal con estado persistente en Redis (motor CEP con memoria, ver §0 del documento de propuesta — no hace falta con el volumen de reglas actual), cualquier score compuesto ponderado entre señales, cualquier acción automática.

## 9. Historial

| Versión | Fecha | Cambio |
|---|---|---|
| 1 | 2026-08-26 | Creación (Draft). Alcance decidido tras asesoría de ciencia de datos explícita: se descarta escribir ya la Fase 1 de línea base/anomalías (falta fuente de conteo continuo verificada) y se especifica en su lugar la correlación declarativa entre señales ya `Implemented`, como siguiente paso real de la línea F8 (gemelo digital). Verificación real de la capa `MapServer/188` (candidata a conteo continuo, esquema de id no conciliable con `004`) documentada en §0/§7 como pendiente técnica separada, no como parte de esta spec. |
| 2 | 2026-08-26 | DoD completo salvo la regla gated `trafico-mencionado-en-mediatico` (bloqueada explícitamente hasta que spec `023` esté `Approved`/`Implemented`, no bloquea el resto). Implementadas las 3 reglas restantes + enriquecimiento de `distrito` en Fallas (`src/services/fallas.ts`, bump spec `008`) + migración de `fuenteSpec` a array + chips de fuente en la UI (`src/main.ts`, `index.html`). `trafico-en-zona-fallas` corregida en diseño para depender solo de `zonasMovilidadReducida` (§6/§7). Verificado con `npm run typecheck`, `npm run test` (171/171), `npm run build` y en navegador contra datos reales de producción (insight `trafico-concentrado-distrito` real visto en Extramurs). Spec pasa a `Implemented`.
