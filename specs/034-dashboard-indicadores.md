# 034 — Dashboard de indicadores

```yaml
id: 034
titulo: "Fila de indicadores (KPIs) del estado de la ciudad, siempre visible"
estado: Draft
tipo: indice-compuesto
depende_de: [004, 001, 002, 010, 013]
propietario: ""
version: 1
```

## 1. Problema / motivación

Hoy, para saber "cómo está la ciudad de un vistazo" hay que activar capas y leer varios
paneles. Falta un **resumen numérico compacto y permanente**: cuántos tramos están
densos o cortados, la temperatura, el índice de aire, cuántas alertas hay activas. Un
dashboard de KPIs da ese vistazo sin tocar el mapa.

Complementa la spec `013` (que dice *qué* pasa y por qué) con el *cuánto* agregado.

## 2. Fuente(s) de datos

Ninguna fuente externa nueva. Cálculo derivado, mismo patrón que `010` / `013`:
reutiliza endpoints internos ya en producción.

| Indicador | Endpoint interno reutilizado | Cálculo |
|---|---|---|
| Tramos por estado | `GET /api/trafico/v1/estado` (spec `004`) | conteo por `estado`: fluido / denso / congestionado / cortado |
| Temperatura y viento | `GET /api/meteo/v1/actual` (spec `001`) | valor directo |
| Índice de aire | `GET /api/aire/v1/actual` (spec `002`) | European AQI + categoría |
| Distritos por categoría de Pulso | `calcularPulsoDistrito` (spec `010`) | conteo por categoría |
| Alertas activas | `GET /api/insights/v1/actual` (spec `013`) | `insights.length` y desglose por severidad |
| Incidencias de vía pública activas | `GET /api/via-publica/v1/incidencias` (spec `026`) | conteo total *(v2, si aporta)* |

## 3. Contrato de datos (normalizado)

```typescript
interface Indicador {
  clave: string;            // 'trafico-denso' | 'temperatura' | 'aire-aqi' | 'alertas-activas' | ...
  etiqueta: string;         // "Tramos densos"
  valor: number | string;   // 12  |  "31 °C"  |  "Aceptable"
  detalle?: string;         // "de 412 monitorizados"
  tono: 'neutro' | 'ok' | 'aviso' | 'urgente';  // color del KPI, reutiliza el semáforo de 013
  fuenteSpec: '004' | '001' | '002' | '010' | '013' | '026';
}

interface DashboardIndicadores {
  indicadores: Indicador[];
  fetchedAt: string;
  parcial: boolean;         // true si alguna fuente falló y su KPI se omitió
  source: 'vlc-monitor-dashboard';
}
```

## 4. Pipeline (seed → caché → endpoint)

| Parámetro | Valor |
|---|---|
| Frecuencia de refresco (cron) | Ninguno propio — se recalcula por petición desde las cachés existentes (igual que `010`/`013`). El frontend lo repide con el mismo intervalo que ya usa para refrescar paneles. |
| TTL en caché | Sin caché propia — el agregado es barato y sin red si las cachés de origen están calientes. |
| Comportamiento si la fuente falla | **Degradación por indicador**: si una fuente falla, se omite su KPI y `parcial = true` (mejor 4 KPIs que un dashboard roto). Nunca 502 por un solo origen caído. |
| Clave de caché | No aplica. |
| Endpoint interno que sirve el dato | `GET /api/dashboard/v1/indicadores` |

## 5. Contrato de capa de mapa

No es una capa. Es una **fila de KPIs** en el chasis (spec `019`):

- Barra horizontal compacta sobre `#info-panels` (o en la cabecera, se decide en
  implementación por espacio), con una celda por indicador: valor grande + etiqueta
  pequeña + color de `tono`.
- Siempre visible; no depende de ninguna capa activa.
- Click en un KPI = activa/enfoca la capa o panel relacionado (p. ej. "Tramos densos"
  → activa Tráfico). Opcional en v1.
- Móvil (spec `029`): la fila pasa a scroll horizontal o rejilla 2×N dentro del bottom
  sheet; nunca provoca scroll horizontal de la página.
- Atribución: "VLC Monitor (dashboard)" + frescura, mismo patrón que el resto.

## 6. Criterios de aceptación (Definition of Done)

- [ ] Función pura `calcularIndicadores` con fixtures — sin red — cubriendo cada KPI,
      cada `tono`, y el caso "fuente caída → KPI omitido + `parcial`".
- [ ] `GET /api/dashboard/v1/indicadores` responde con el contrato de §3 reutilizando
      las cachés de 004/001/002/010/013 sin llamada de red propia si están calientes.
- [ ] Fila de KPIs visible y legible en escritorio y en el bottom sheet móvil, sin
      scroll horizontal de página.
- [ ] Colores de `tono` consistentes con el semáforo de la spec `013` (sin duplicar
      umbrales: se importan de donde ya viven).
- [ ] Atribución y frescura visibles; `parcial` se indica en la UI ("datos parciales").
- [ ] `npm run typecheck` / `test` / `build` sin regresiones.

## 7. Riesgos y fuera de alcance

- **Fuera de alcance:** históricos/sparklines por KPI (el de tráfico ya lo tiene la
  spec `017`; los demás serían otra spec), KPIs configurables por el usuario,
  exportar el dashboard, cualquier disparador de alerta (eso es `013` v4).
- **Riesgo:** si la fila crece demasiado, satura; se acota a ~5-6 KPIs en v1 y se
  prioriza por utilidad, no por "porque el dato existe".
- **Dependencia de `013` v4:** el KPI "alertas activas" cuenta insights; si `013` v4
  cambia el contrato de `Insight`, este dashboard se ajusta — pero el KPI funciona ya
  con `013` v3.

## 8. Historial

| Versión | Fecha | Cambio |
|---|---|---|
| 1 | 2026-09-04 | Creación (Draft). Sale de la petición del usuario de "un dashboard con indicadores" junto con las alertas emergentes (que van en `013` v4). Todas las fuentes ya `Implemented`. Pendiente de aprobación. |
