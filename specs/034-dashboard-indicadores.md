# 034 — Dashboard de indicadores

```yaml
id: 034
titulo: "Fila de indicadores (KPIs) del estado de la ciudad, siempre visible"
estado: Implemented
tipo: indice-compuesto
depende_de: [004, 001, 002, 010, 013]
propietario: ""
version: 2
```

## 1. Problema / motivación

Para saber "cómo está la ciudad de un vistazo" hay que leer varios paneles. Falta un
**resumen numérico compacto y permanente**: temperatura, índice de aire, tramos con
carga, alertas activas, distritos tensos. Complementa la spec `013` (qué pasa y por
qué) con el *cuánto* agregado.

## 2. Fuente(s) de datos

Ninguna nueva, y **sin endpoint nuevo** (v2, ver §4). El frontend ya fetchea meteo,
aire, tráfico, Pulso e insights para sus paneles; el dashboard **reutiliza esos mismos
datos ya en memoria** — cada panel, al refrescarse, empuja su cifra clave a un store
(`src/ui/dashboard-kpis.ts`), igual patrón que `estado-frescura.ts` (spec `035`).

| KPI | De dónde | Tono |
|---|---|---|
| Temperatura | panel meteo (`001`) | `urgente` ≥ 38 / `aviso` ≥ 35 / `neutro` |
| Aire (AQI + categoría) | panel aire (`002`) | por categoría EEA (Mala/Muy mala → aviso/urgente) |
| Tráfico | leyenda tráfico (`004`) | nº tramos denso+congestionado+cortado; `aviso` si > 0, `urgente` si hay cortados |
| Pulso | leyenda Pulso (`010`) | nº distritos en `Tenso`/`Crítico`; `urgente` si hay crítico |
| Alertas | panel insights (`013`) | nº insights activos; tono = severidad máxima |

## 3. Contrato de datos (normalizado)

Store en memoria, sin persistencia:

```typescript
type TonoKpi = 'neutro' | 'ok' | 'aviso' | 'urgente';
interface Kpi {
  clave: 'temperatura' | 'aire' | 'trafico' | 'pulso' | 'alertas';
  etiqueta: string;      // "Aire"
  valor: string;         // "42 · Moderada"
  tono: TonoKpi;
  capaRelacionada?: string; // id de toggle a activar al hacer clic (spec 033)
}
registrarKpi(kpi: Kpi): void;   // idempotente por `clave`
onCambioKpis(cb: (kpis: Kpi[]) => void): void;
```

Orden fijo: temperatura, aire, tráfico, pulso, alertas. Un KPI que aún no ha
reportado no se pinta (aparece cuando su panel carga por primera vez).

## 4. Pipeline (seed → caché → endpoint)

**No aplica — no hay endpoint ni caché nuevos.** El agregado vive en el cliente sobre
datos ya fetcheados. Si un panel falla, su `registrarKpi` no se llama y ese KPI
simplemente no aparece (degradación natural, sin flag `parcial`).

Se descarta el `GET /api/dashboard/v1/indicadores` de la v1: añadir una función y una
ruta para reagregar datos que el cliente ya tiene es coste sin valor.

## 5. Contrato de capa de mapa

No es una capa. **Fila de KPIs** (`#dashboard-kpis`), chip por indicador (etiqueta
pequeña + valor + color de tono):

- Escritorio: barra fija abajo a la izquierda, sobre la atribución del mapa, encima de
  `#info-panels`. Siempre visible, no depende de ninguna capa.
- Clic en un chip con `capaRelacionada` → activa esa capa (dispara su toggle, spec
  `033`) y hace scroll a su leyenda.
- Móvil (spec `029`): se integra como primera fila del bottom sheet, scroll horizontal
  propio; nunca provoca scroll horizontal de la página.
- Se oculta mientras el modo cordón / simulador está activo (igual que `#info-panels`).

## 6. Criterios de aceptación (Definition of Done)

- [x] `dashboard-kpis.ts` con el store + suscripción; los 5 paneles (`meteo`, `aire`,
      `trafico`-leyenda, `pulso`-leyenda, `insights`) llaman `registrarKpi` al renderizar.
- [x] `#dashboard-kpis` visible en escritorio, un chip por KPI reportado, color por
      tono. Orden fijo.
- [x] Clic en el chip de tráfico/pulso → activa la capa y hace scroll a su leyenda.
- [x] Tonos consistentes con el semáforo de `013` (umbrales importados, no recopiados).
- [x] Se oculta en modo cordón/simulador; en móvil no provoca scroll horizontal.
- [x] `npm run typecheck` / `test` / `build` sin regresiones.

## 7. Riesgos y fuera de alcance

- **Fuera de alcance:** sparklines por KPI, KPIs configurables, exportar, un endpoint
  servidor (v1, descartado).
- **Riesgo:** si la fila crece, satura — se acota a estos 5.

## 8. Historial

| Versión | Fecha | Cambio |
|---|---|---|
| 1 | 2026-09-04 | Creación (Draft). Diseñada con endpoint servidor `GET /api/dashboard/v1/indicadores`. |
| 2 | 2026-09-09 | Replanteada a **agregación en cliente** sobre datos que los paneles ya fetchean (`dashboard-kpis.ts`, patrón de `estado-frescura.ts`). Se descarta el endpoint. 5 KPIs (temperatura, aire, tráfico, pulso, alertas), chip clicable → activa la capa. Implementado y verificado. Pasa a `Implemented`. |
