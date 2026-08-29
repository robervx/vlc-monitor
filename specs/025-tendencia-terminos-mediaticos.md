# 025 — Tendencia de términos del contexto mediático

```yaml
id: 025
titulo: "Términos en tendencia sobre el contexto mediático (frecuencia por ventana horaria/diaria)"
estado: Implemented
tipo: indice-compuesto
depende_de: [009]
propietario: ""
version: 2
```

## 1. Problema / motivación

El panel de contexto mediático (spec [009](009-contexto-mediatico.md)) muestra titulares sueltos; no dice **de qué se habla más ahora mismo** en conjunto. La pregunta que responde esta spec: "de todo lo publicado en la última hora/día sobre Valencia, ¿qué palabras se repiten más?" — una señal de tendencia agregada, sin inferir sentimiento ni intención, solo frecuencia de términos sobre texto ya público.

No es un modelo de lenguaje ni topic modeling entrenado (ver CLAUDE.md — evitar sobre-ingeniería para el volumen actual, ~30 ítems/15 min): es conteo de frecuencia de palabras con una lista de stopwords, calculado sobre el mismo `ItemMediatico[]` que ya sirve la spec 009.

## 2. Fuente(s) de datos

Ninguna fuente externa nueva — reutiliza `ItemMediatico[]` (título + resumen) ya cacheado por la spec 009.

## 3. Contrato de datos (normalizado)

```typescript
interface TerminoTendencia {
  termino: string;         // normalizado (minúsculas, sin acentos), forma original más frecuente se guarda en `formaOriginal`
  formaOriginal: string;
  frecuencia: number;        // nº de ítems distintos que lo contienen (no nº de apariciones — un ítem cuenta 1 vez aunque repita la palabra)
  distritosAsociados: string[]; // códigos de distrito de los ítems que lo mencionan, vía spec 023 — [] si ninguno tiene distrito
}

interface VentanaTendencia {
  ventana: 'hora' | 'dia';
  desde: string;    // ISO 8601
  hasta: string;    // ISO 8601
  terminos: TerminoTendencia[];  // top 20, orden descendente por frecuencia
  totalItems: number;             // nº de ítems considerados en la ventana, para poder relativizar (ej. "3 de 12 ítems")
  fetchedAt: string;
}
```

**Regla de cálculo:** tokenizar `titulo + ' ' + (resumen ?? '')` de cada ítem cuya `publicadoEn` cae dentro de la ventana, quitar stopwords (lista fija ES/VA — artículos, preposiciones, conectores, y términos estructurales del propio dominio como "valencia"/"valència" que aparecerían en el 100% de los ítems y no aportan señal), contar en cuántos ítems distintos aparece cada palabra restante (no ocurrencias totales, para que un titular repetitivo no domine el ranking él solo), quedarse con el top 20. Palabras de menos de 4 caracteres se descartan (ruido, siglas ambiguas).

## 4. Pipeline (seed → caché → endpoint)

Sigue el patrón de rollup de la spec [017](017-historico-trafico.md) (snapshot horario + vista diaria), no un pipeline nuevo:

| Parámetro | Valor |
|---|---|
| Frecuencia de refresco (cron) | Se recalcula en cada refresco de 009 (15 min) — la ventana "hora" es una agregación sobre los ítems ya cacheados con `publicadoEn` en la última hora, no una llamada nueva. |
| TTL en caché | 15 min para la ventana "hora" (igual que 009); la ventana "día" se recalcula igual pero cambia poco intra-día. |
| Comportamiento si la fuente falla | Si 009 sirve ítems parciales (alguna fuente caída), la tendencia se calcula igualmente sobre los que haya — nunca bloquea por fuente incompleta. |
| Clave de caché | `mediatico:tendencia-terminos:v1` |
| Endpoint interno que sirve el dato | `GET /api/mediatico/v1/tendencia?ventana=hora\|dia` |

## 5. Contrato de capa de mapa

```typescript
{
  key: 'tendenciaTerminos',
  specId: '025',
  renderers: ['panel'],
  zoomMinimo: 0,
  agregacion: 'lista',
  icono: '',
}
```

Panel pequeño junto al de contexto mediático (spec 009): lista de hasta 20 términos con su frecuencia (ej. "tráfico · 4 ítems"), selector hora/día. Sin gráfico de evolución en v1 (fast-follow si se acumula histórico).

## 6. Criterios de aceptación (Definition of Done)

- [x] Lista de stopwords ES/VA definida y versionada como dato (`src/data/stopwords-mediatico.ts`, no hardcodeada dispersa en el código) — incluye términos estructurales del dominio ("valencia", "valència", "ayuntamiento", "ajuntament").
- [x] Función de tokenización + conteo determinista (`src/services/tendencia-terminos.ts`), testeada con 9 casos (dedup por ítem, stopwords, longitud mínima, orden, forma original) — verificado también con datos reales en producción (términos como "Generalitat", "Tomatina", "dana" extraídos correctamente de noticias reales del día).
- [x] Ventanas "hora" y "día" calculadas correctamente sobre `publicadoEn`, con test de límite exacto (ítem justo en `desdeMs` se incluye, un milisegundo antes se excluye) — verificado también en vivo: 5 ítems en "hora" vs 65 en "día" sobre el mismo feed real.
- [x] `distritosAsociados` por término poblado reutilizando `distritosMencionados` de la spec 023 (ya `Implemented`) — verificado en navegador con un caso real ("Sanidad" asociado a Benicalap).
- [x] Endpoint `GET /api/mediatico/v1/tendencia?ventana=hora|dia` responde con el contrato de §3 — reutiliza las mismas claves de caché que `items.ts` (mismo patrón que `api/pulso/v1/distrito.ts`), trabajando sobre el conjunto completo de ítems, no el top-30 recortado del panel de titulares.
- [x] Panel visible junto al de contexto mediático, selector hora/día funcional — verificado en navegador, incluyendo el cambio real de ranking al conmutar ventana.
- [x] Con menos de 5 ítems en la ventana, el panel indica explícitamente "muestra insuficiente" en vez de un ranking poco representativo (no se ha observado ese caso en vivo hoy — el mínimo se cruzó justo en 5 ítems reales — pero queda cubierto por la lógica y su condición `< 5`, no por un test unitario específico de ese umbral).

## 7. Riesgos y fuera de alcance

- **Riesgo — volumen bajo:** con ~30 ítems/15 min, una ventana de 1 hora puede tener muy pocos ítems fuera de horas de mucha publicación — mitigado con el aviso de "muestra insuficiente" del DoD, no se oculta el panel ni se rellena con datos inventados.
- **Riesgo — ruido de palabras genéricas del propio dominio periodístico** (ej. "según", "informó", "declaró") — se añaden a la lista de stopwords según se observen en producción, es una lista de datos, no un modelo.
- **Dependencia blanda con spec 023:** `distritosAsociados` es mejor con 023 implementada, pero esta spec no depende de que 023 esté `Implemented` para poder implementarse — el campo simplemente queda vacío hasta entonces.
- **Fuera de alcance:** análisis de sentimiento, cualquier modelo de lenguaje, comparación estadística "tendencia al alza/baja" (fast-follow cuando haya histórico acumulado suficiente, no en v1), n-gramas (solo palabras sueltas, no combinaciones de dos o más).

## 8. Historial

| Versión | Fecha | Cambio |
|---|---|---|
| 1 | 2026-08-26 | Creación (Draft) — contrato de datos y de capa propuestos, pendiente de aprobación antes de implementar. |
| 2 | 2026-08-27 | DoD completo: stopwords como dato (`src/data/stopwords-mediatico.ts`), cálculo determinista (`src/services/tendencia-terminos.ts`, 9 tests), endpoint `api/mediatico/v1/tendencia.ts` (3 tests) reutilizando las cachés de la spec 009 sin duplicar llamadas de red, panel con selector hora/día + chips de distrito (nombre, no código) en `src/main.ts`/`index.html`. Verificado con `npm run typecheck`, `npm run test` (198/198), `npm run build` y en navegador contra datos reales del día (5 ítems en ventana "hora", 65 en "día", ranking distinto en cada una). Spec pasa a `Implemented`. |
