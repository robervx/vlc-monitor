# 013 — Motor de insights y alertas operativas

```yaml
id: 013
titulo: "Motor de insights y alertas operativas (avisa, no actúa)"
estado: Implemented
tipo: indice-compuesto
depende_de: [001, 002, 010, 016]
propietario: ""
version: 3
```

## 0. Decisión de diseño (resuelve la tensión documentada en el backlog)

La idea original (ver `docs/investigacion/BACKLOG_FUNCIONALIDADES_2026-08-18.md` punto 2) era que el sistema detectara un patrón y **enviara correo automáticamente** a las unidades. Eso violaría `CLAUDE.md` §4 ("avisa, no actúa"). **Decisión del usuario (2026-08-18):** el motor genera una **alerta visible + un borrador de comunicación** (asunto + cuerpo de texto ya redactado); una persona lo revisa y lo copia/envía por su cuenta con el botón "Copiar borrador". **La aplicación nunca envía nada — no hay integración de correo, no hay lista de destinatarios propia.** Esto es deliberado: no existe ningún directorio legítimo de emails de "unidades" en este proyecto, e inventarlo sería fabricar datos.

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

## 9. Historial

| Versión | Fecha | Cambio |
|---|---|---|
| 1 | 2026-08-18 | Creación. Diseño "alerta + borrador, envío manual" decidido explícitamente por el usuario tras la tensión documentada en el backlog (§0). Dependencias (001, 002, 010, 016) ya `Implemented`. |
| 2 | 2026-08-18 | DoD completo: función pura + tests (`src/services/insights.ts`), endpoint que combina las cachés existentes con degradación si tráfico/predicción fallan (`api/insights/v1/actual.ts`), panel con tarjetas por severidad y botón "Copiar borrador" sin destinatarios (`src/main.ts`, `index.html`). Verificado con `npm run typecheck`, `npm run test` (92/92) y en navegador. Spec pasa a `Implemented`. |
| 3 | 2026-08-19 | Nueva regla `viento-fuerte` (umbral por rachas, heurística documentada igual criterio que el resto de reglas de esta spec — ver §8) — `insightVientoFuerte()` en `insights.ts`, 3 tests nuevos. Los umbrales (`UMBRAL_VIENTO_AVISO_KMH`/`UMBRAL_VIENTO_URGENTE_KMH`) se exportan para que el panel de meteo (spec 001, `main.ts`) pinte el mismo semáforo de color sin duplicar el número en dos sitios. |
