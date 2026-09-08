# 013 — Motor de insights y alertas operativas

```yaml
id: 013
titulo: "Motor de insights y alertas operativas (avisa, no actúa)"
estado: Implemented
tipo: indice-compuesto
depende_de: [001, 002, 010, 016]
propietario: ""
version: 4
```

> **Estado:** v1–v3 `Implemented` y en producción. **v4 está en `Draft`** (ver §10 y
> el historial) — añade disparadores nuevos y el patrón de alerta emergente. No se
> implementa hasta que v4 pase a `Approved`.

## 0. Decisión de diseño (resuelve la tensión documentada en el backlog)

La idea original (ver `docs/investigacion/un backlog archivado` punto 2) era que el sistema detectara un patrón y **enviara correo automáticamente** a las unidades. Eso violaría `CLAUDE.md` §4 ("avisa, no actúa"). **Decisión del usuario (2026-08-18):** el motor genera una **alerta visible + un borrador de comunicación** (asunto + cuerpo de texto ya redactado); una persona lo revisa y lo copia/envía por su cuenta con el botón "Copiar borrador". **La aplicación nunca envía nada — no hay integración de correo, no hay lista de destinatarios propia.** Esto es deliberado: no existe ningún directorio legítimo de emails de "unidades" en este proyecto, e inventarlo sería fabricar datos.

## 1. Problema / motivación

Con varias capas ya en producción (meteo, aire, tráfico, Pulso de Distrito, predicción a corto plazo), nadie va a estar mirando las cinco a la vez todo el rato. Esta spec añade un panel que vigila esas capas por umbrales conocidos y saca a primer plano solo lo que merece atención humana — sin decidir ni actuar por nadie.

## 2. Fuente(s) de datos

**No es una fuente nueva — es un cálculo derivado, mismo patrón que la spec `010`.** No hace ninguna llamada externa propia; reutiliza los endpoints/caché ya existentes de las specs `001`, `002`, `010` y `016` (todas `Implemented`).

| Fuente | Endpoint interno reutilizado | Rol |
|---|---|---|
| Meteorología actual (spec 001) | `GET /api/meteo/v1/actual` (misma caché, mismo fetcher) | Reglas de calor/frío extremo |
| Calidad del aire (spec 002) | `GET /api/aire/v1/actual` (misma caché) | Regla de aire muy malo |
| Pulso de Distrito (spec 010) | recalcula con `calcularPulsoDistrito`, mismas cachés de 001/002/004 | Regla de distrito crítico |
| Predicción a corto plazo (spec 016) | `GET /api/meteo/v1/prediccion-corto-plazo` (misma caché) | Regla de lluvia intensa inminente |

**Fuera de v1, deliberadamente:** contexto mediático (spec `009`, RSS/GDELT) como disparador — detectar "menciones de calor" en texto libre es un problema de NLP con riesgo real de falsos positivos/negativos; se deja como posible fast-follow, no bloquea v1 con reglas numéricas fiables sobre datos ya estructurados.

## 3. Contrato de datos (normalizado)

```typescript
type SeveridadInsight = 'aviso' | 'urgente';

type TipoInsight =
  | 'calor-extremo'
  | 'frio-extremo'
  | 'aire-mala-calidad'
  | 'lluvia-intensa-prevista'
  | 'distrito-critico';

interface Insight {
  id: string;                    // determinístico: `${tipo}:${distritoCodigo ?? 'ciudad'}`
  tipo: TipoInsight;
  severidad: SeveridadInsight;
  titulo: string;                 // ej. "Calor extremo — 39°C en Valencia"
  descripcion: string;            // una frase, lenguaje llano
  protocoloSugerido: {
    asunto: string;
    cuerpo: string;               // texto ya redactado, listo para copiar — SIN destinatarios
  };
  distritoCodigo?: string;        // solo en 'distrito-critico'
  fuenteSpec: '001' | '002' | '010' | '016';
  detectedAt: string;             // observedAt del dato de origen que disparó el insight
  fetchedAt: string;
}

interface PanelInsights {
  insights: Insight[];            // vacío si no hay ninguna regla activa — es el caso normal
  fetchedAt: string;
  source: 'vlc-monitor-insights';
}
```

## 4. Pipeline (seed → caché → endpoint)

| Parámetro | Valor |
|---|---|
| Frecuencia de refresco (cron) | No aplica cron propio — igual que `010`, se recalcula en cada petición a partir de las cachés ya existentes. |
| TTL en caché | Ninguna caché propia — el cálculo de reglas es barato y sin red. |
| Comportamiento si la fuente falla | Si falla la llamada a meteo o aire, se devuelve 502 (igual que `010`) — no se generan insights con datos parciales. Si falla específicamente la predicción a corto plazo (016) o el cálculo de distrito (010), se degrada: se sirven los insights que sí se pudieron calcular con las fuentes disponibles, marcando el resto como no evaluado (mejor avisar de lo que sí se sabe que no avisar de nada). |
| Clave de caché | No aplica. |
| Endpoint interno que sirve el dato | `GET /api/insights/v1/actual` |

## 5. Contrato de capa de mapa

No es una capa de mapa — panel fijo (igual que meteo/aire), con una tarjeta por insight activo (o "Sin alertas activas" si la lista está vacía) y un botón "Copiar borrador" por tarjeta.

```typescript
{
  key: 'insights',
  specId: '013',
  renderers: [],
  zoomMinimo: 0,
  agregacion: 'punto',
  icono: '',
}
```

## 6. Reglas v1 (umbrales — heurística documentada, no estándar externo, igual disclaimer que spec `010` §7)

| Tipo | Condición | Severidad |
|---|---|---|
| `calor-extremo` | `temperatura >= 38` o `sensacionTermica >= 42` (meteo actual) | `urgente` |
| `frio-extremo` | `temperatura <= 0` (meteo actual) | `aviso` |
| `aire-mala-calidad` | `categoria === 'Muy mala'` → `urgente`; `categoria === 'Mala'` → `aviso` | según categoría |
| `lluvia-intensa-prevista` | algún tramo de `prediccion-corto-plazo` con `precipitacion >= 5` mm en esa hora | `aviso` |
| `distrito-critico` | algún distrito de Pulso con `categoria === 'Crítico'` | `urgente` |
| `viento-fuerte` | rachas (`vientoRachas`) `>= 50 km/h` → `aviso`; `>= 70 km/h` → `urgente` (v3, 2026-08-19) | según racha |

## 7. Criterios de aceptación (Definition of Done)

- [x] Función pura `calcularInsights` probada con fixtures — sin red — cubriendo cada regla activa/inactiva, umbral exacto (borde), y el caso "ninguna regla activa" (lista vacía) — `src/services/insights.test.ts`, 9 tests.
- [x] Endpoint `GET /api/insights/v1/actual` responde con el contrato de la sección 3, reutilizando las cachés de 001/002/004/016 sin llamada de red propia si ya están calientes; tráfico/predicción se degradan sin romper si fallan (`api/insights/v1/actual.ts`, 3 tests).
- [x] Panel visible en el mapa con una tarjeta por insight (severidad por color: rojo=urgente, ámbar=aviso) y "✓ Sin alertas activas" cuando la lista está vacía — verificado visualmente en navegador (estado real: sin alertas con 30°C; tarjetas verificadas con datos sintéticos inyectados para confirmar el diseño de severidad alta/media).
- [x] Botón "Copiar borrador" que copia `asunto` + `cuerpo` al portapapeles — verificado en tests que ningún `protocoloSugerido.cuerpo` contiene `@` (sin destinatarios/emails, ver test "sin destinatarios/emails" en `insights.test.ts`); no existe ningún envío automático ni integración de correo en el código (ver §0).
- [x] Atribución ("VLC Monitor (insights)") y frescura visibles, mismo patrón que el resto de paneles.

## 8. Riesgos y fuera de alcance

- **Riesgo (asumido):** los umbrales (38°C, 5mm/h, etc.) son una heurística razonada, no un estándar oficial de protección civil — documentados aquí para que cualquier ajuste futuro cambie esta spec, no un número mágico enterrado en el código. Si en el futuro se dispone de umbrales oficiales (ej. AEMET, Plan de Actuación Municipal), sustituir aquí.
- **Riesgo:** con 5 reglas simples puede haber ruido (falsos positivos en umbrales límite) — aceptado en v1, se ajustan los umbrales con uso real antes de añadir más reglas.
- **Fuera de alcance de esta spec:** cualquier envío automático (§0), integración con contexto mediático como disparador (§2), historial de insights pasados, configuración de umbrales por el usuario, agrupación/deduplicación de insights repetidos entre refrescos (cada refresco recalcula desde cero, sin persistencia).

## 9. v4 — disparadores nuevos + alertas emergentes (Draft, 2026-09-04)

Petición del usuario: que las alertas **salten como popup** cuando aparecen y luego
**se queden en un lateral**, y que haya disparadores nuevos además de los umbrales
meteo/aire actuales. Se implementa "una a una" (cada punto es verificable por
separado). El dashboard de KPIs va en su propia spec (`034`), esta v4 es solo el motor
+ la presentación de alertas.

### 9.1 Disparador nuevo: un tramo de tráfico empeora

| Tipo | Condición | Severidad |
|---|---|---|
| `trafico-empeora` | un tramo (spec `004`) sube de nivel entre dos refrescos consecutivos: `fluido → denso` (`aviso`), `→ congestionado` o `→ cortado` (`urgente`). Se agrupa por distrito si hay varios a la vez: "3 tramos de Extramurs han empeorado". | según destino |

**Esto exige estado.** El motor actual recalcula desde cero sin memoria (§8). Para
detectar un *cambio* hay que guardar el estado anterior:

- Clave de caché nueva `insights:trafico:estado-previo` — mapa `idtramo → estado`,
  TTL 15 min, escrita en cada evaluación con el estado que se acaba de leer.
- Primera evaluación sin estado previo → no dispara nada (no hay "cambio" contra nada).
- El histórico agregado de spec `017` (snapshots cada 60 min) es demasiado grueso para
  esto; se usa la caché viva de spec `004` como "estado ahora" y esta clave nueva como
  "estado hace un ciclo".

### 9.2 Ajuste de umbrales meteo/aire (nueva banda "aviso" más temprana)

Las reglas actuales solo saltan en condiciones ya extremas (38 °C, aire "Muy mala").
El usuario quiere avisos antes:

| Tipo | Cambio |
|---|---|
| `calor-extremo` | añadir banda `aviso` a **`temperatura >= 35`** (se mantiene `urgente` en `>= 38` / sensación `>= 42`). |
| `aire-mala-calidad` | ya cubre `Mala` → `aviso`; añadir `aviso` también en `Moderada` **solo si** algún contaminante puntero (NO₂ / PM2.5 / O₃) supera su umbral OMS de referencia — para no avisar por un AQI 41 sin nada reseñable detrás. Umbral documentado aquí, igual criterio que §8. |
| `lluvia-prevista` | regla nueva, más blanda que `lluvia-intensa-prevista`: `probabilidad de precipitación >= 60 %` en alguno de los tramos de la predicción a 4 h (spec `016`), o `precipitacion > 0` con `weather_code` de lluvia. Severidad `aviso`. La regla intensa (`>= 5 mm`) se mantiene como `urgente`. |

`TipoInsight` gana `'trafico-empeora'` y `'lluvia-prevista'`. `fuenteSpec` pasa a
aceptar `'004'`.

### 9.3 Presentación: el popup ("salta y se queda a un lado")

El panel de insights ya vive "a un lado" (`#info-panels`, esquina). Lo que falta es el
**momento en que salta** una alerta nueva. Alcance de v4, sin blast radius:

- **Toast al aparecer un insight nuevo.** Cada vez que una evaluación devuelve un
  insight cuyo `id` **no estaba** en la anterior, se muestra un toast arriba a la
  derecha (bajo la cabecera): título + descripción, color por severidad
  (`urgente` rojo / `aviso` ámbar), botón ✕ y auto-cierre a los ~10 s. Apilados, máx. 3
  visibles; si hay más, "y N más". Clic en el toast → hace scroll al panel de insights
  y lo resalta un instante.
- **Primera carga en silencio.** En el primer render no hay "anterior" — se puebla el
  panel sin toasts. Los toasts solo saltan para cambios posteriores.
- El panel de `#info-panels` no se mueve ni cambia de contrato: sigue siendo la lista
  persistente "a un lado", con "Copiar borrador" por tarjeta.
- Móvil (spec `029`): el toast respeta `safe-area` y no tapa la cabecera; el resto
  igual.
- Sigue siendo **"avisa, no actúa"** (`CLAUDE.md` §4): el toast informa y se descarta;
  nunca lanza ninguna acción.

**Fuera de v4 (reconsiderado):** un rail lateral dedicado que sustituya al panel de
`#info-panels` + lista "Resueltas". Toca la maqueta móvil (`029`), el modo cordón
(`021`) y Configuración (`019`) — desproporcionado para lo que suele ser 0-1 alerta.
Se retoma si el volumen de alertas lo justifica.

### 9.4 DoD

**v4a — el popup (§9.3), `Implemented` 2026-09-09:**

- [x] Toast al aparecer un insight con `id` nuevo; **nunca en la primera carga**
      (`idsInsightsPrevios === null` → se puebla en silencio) ni si el insight ya
      estaba; apilado máx. 3 + "y N más"; descartable con ✕; auto-cierre 10 s; clic en
      el cuerpo → scroll + resalte (`info-panel--resaltado`) del panel de insights.
      `procesarNuevasAlertas()` en `renderInsightsPanel()`, sin tocar el endpoint.
- [x] Color por severidad (rojo `urgente` / ámbar `aviso`); `#alert-toasts` arriba a la
      derecha bajo la cabecera; `safe-area` en móvil.
- [x] `npm run typecheck` / `test` (276/276) / `build` sin regresiones. Hook de dev
      `__toastAlertaDemo` (solo `import.meta.env.DEV`, ausente del bundle de prod).
      Verificado en navegador: 0 toasts en primera carga, 5 disparados → 3 + "y 2 más",
      ✕ y clic-a-panel OK.

**v4b — disparadores nuevos (§9.1-9.2), después:**

- [ ] `trafico-empeora`: función pura con fixtures del par (estado previo, estado
      actual) cubriendo cada transición y el caso "sin estado previo"; clave de caché
      `insights:trafico:estado-previo` con su TTL; degradación si tráfico falla.
- [ ] Bandas nuevas de `calor-extremo` (35), `aire-mala-calidad` (Moderada + contaminante)
      y regla `lluvia-prevista` con tests de borde.

## 10. Historial

| Versión | Fecha | Cambio |
|---|---|---|
| 1 | 2026-08-18 | Creación. Diseño "alerta + borrador, envío manual" decidido explícitamente por el usuario tras la tensión documentada en el backlog (§0). Dependencias (001, 002, 010, 016) ya `Implemented`. |
| 2 | 2026-08-18 | DoD completo: función pura + tests (`src/services/insights.ts`), endpoint que combina las cachés existentes con degradación si tráfico/predicción fallan (`api/insights/v1/actual.ts`), panel con tarjetas por severidad y botón "Copiar borrador" sin destinatarios (`src/main.ts`, `index.html`). Verificado con `npm run typecheck`, `npm run test` (92/92) y en navegador. Spec pasa a `Implemented`. |
| 3 | 2026-08-19 | Nueva regla `viento-fuerte` (umbral por rachas, heurística documentada igual criterio que el resto de reglas de esta spec — ver §8) — `insightVientoFuerte()` en `insights.ts`, 3 tests nuevos. Los umbrales (`UMBRAL_VIENTO_AVISO_KMH`/`UMBRAL_VIENTO_URGENTE_KMH`) se exportan para que el panel de meteo (spec 001, `main.ts`) pinte el mismo semáforo de color sin duplicar el número en dos sitios. |
| 4 | 2026-09-04 | Alcance v4 (§9). **v4a `Implemented` 2026-09-09**: el "popup" — toast arriba a la derecha cuando aparece un insight con `id` nuevo (nunca en la primera carga), apilado máx. 3, auto-cierre, clic → resalta el panel de insights. `#alert-toasts` + `procesarNuevasAlertas()` en `main.ts`, CSS en `index.html`, sin tocar el endpoint. **v4b pendiente**: disparadores nuevos (`trafico-empeora` con estado en caché, calor a 35 °C, `lluvia-prevista`). El rail lateral dedicado se descarta como desproporcionado (§9.3). El dashboard de KPIs es la spec `034`. |
