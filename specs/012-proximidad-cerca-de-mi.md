# 012 — Proximidad: geolocalización del usuario + "qué tengo más cerca"

```yaml
id: 012
titulo: "Geolocalización del usuario + ranking de proximidad por capa"
estado: Implemented
tipo: fundacional
depende_de: [000, 004, 005, 006, 019]
propietario: ""
version: 2
```

## 0. Contexto

Idea original en `docs/investigacion/BACKLOG_FUNCIONALIDADES_2026-08-18.md` §1: una persona usando la herramienta en campo necesita poder posicionarse y ver qué es lo más cercano de cada capa activa (incidencia de tráfico, aparcamiento libre, estación Valenbisi). Quedó explícitamente bloqueada hasta decidir el framing "herramienta policial" — resuelto por `docs/decisiones/ADR-001-linea-producto-seguridad-publica.md` (Aceptado, 2026-08-18). Esta spec desbloquea y redacta esa idea.

## 1. Problema / motivación

Un mando o agente que abre la herramienta en calle no quiere buscar en un mapa completo de Valencia — quiere saber, desde donde está parado, cuál es el aparcamiento libre más próximo, la estación Valenbisi más próxima y el tramo con incidencia de tráfico más próximo, en una lista corta y ordenada por distancia.

## 2. Fuente(s) de datos

**No hay fuente externa nueva.** Esta spec no llama a ningún servicio de terceros propio — reutiliza los datos que ya sirven las specs `004` (tráfico), `005` (Valenbisi) y `006` (aparcamiento), ya cacheados y en memoria del cliente mientras esas capas están activas.

| Fuente | Detalle |
|---|---|
| Posición del usuario | **Geolocation API del navegador** (`navigator.geolocation.getCurrentPosition`), solo tras pulsar un botón explícito ("Buscar cerca de mí") — nunca automático, nunca en segundo plano. |
| Tramos de tráfico | Array ya cargado por spec `004` (`TramoTrafico[]`, `src/services/trafico.ts`). |
| Estaciones Valenbisi | Array ya cargado por spec `005` (`EstacionValenbisi[]`, `src/services/valenbisi.ts`). |
| Aparcamientos | Array ya cargado por spec `006` (`Aparcamiento[]`, `src/services/aparcamiento.ts`). |

**Límite ético (`CLAUDE.md` §4), aplicado aquí de forma explícita:** la posición del usuario se calcula y se usa **enteramente en el navegador**. Nunca se envía a ningún endpoint propio, nunca se persiste (ni `localStorage` ni caché), nunca se registra en ningún log. Es la posición del propio dispositivo del operador para su propia conveniencia — no es un dato de localización de terceros, y aun así no se guarda ni un instante más de lo necesario para calcular la lista en el momento.

## 3. Contrato de datos (normalizado)

Sin llamada de red — funciones puras sobre datos ya en memoria (`src/services/proximidad.ts`):

```typescript
type Coordenada = [lon: number, lat: number];

interface ResultadoCercania<T> {
  item: T;
  distanciaMetros: number;
}

interface ResultadoProximidad {
  trafico: ResultadoCercania<TramoTrafico>[];
  valenbisi: ResultadoCercania<EstacionValenbisi>[];
  aparcamiento: ResultadoCercania<Aparcamiento>[];
  posicion: Coordenada;
  calculadoEn: string; // ISO 8601, solo en memoria, nunca persistido
}

function calcularCercania(
  posicion: Coordenada,
  capas: { tramosTrafico: TramoTrafico[]; estacionesValenbisi: EstacionValenbisi[]; aparcamientos: Aparcamiento[] },
  limite?: number, // por defecto 3
): ResultadoProximidad;
```

**Cálculo de distancia**: fórmula de Haversine para puntos (Valenbisi, aparcamiento); distancia punto-a-segmento (mínimo sobre cada segmento de la `LineString`/`MultiLineString`) para tramos de tráfico. Implementado como funciones propias en `src/services/proximidad.ts`, sin añadir turf.js como dependencia — el cálculo necesario es acotado (punto-punto y punto-segmento) y así se mantiene el bundle sin una librería de geometría completa para tres operaciones.

## 4. Pipeline (seed → caché → endpoint)

No aplica — no hay pipeline de datos ni endpoint propio. Todo el cálculo ocurre en el cliente, sobre datos ya servidos por specs `004`/`005`/`006`. Un módulo ligero (`src/services/capas-activas-store.ts`) mantiene en memoria (nunca persistido) la última copia de esos tres arrays, actualizada por `main.ts` cada vez que sus propios `refresh*()` ya existentes traen datos nuevos.

## 5. Contrato de capa de mapa

No es una capa de mapa — es una sección del sidebar (`SIDEBAR_REGISTRY`, ver spec `019`), clave `cerca-de-mi`. Contenido: botón "Buscar cerca de mí" +, tras concederse el permiso, tres listas cortas (tráfico / Valenbisi / aparcamiento) con hasta 3 resultados cada una, ordenados por distancia ascendente, mostrando nombre/identificador y distancia en metros (o km si ≥1000m).

## 6. Criterios de aceptación (Definition of Done)

- [x] `calcularCercania` probada con fixtures — sin red, sin DOM — cubriendo: orden correcto por distancia, límite de resultados, distancia punto-a-tramo con geometría `LineString` y `MultiLineString`, y el caso de capas vacías (no revienta, devuelve listas vacías). 9 tests en `src/services/proximidad.test.ts`.
- [x] Botón "Buscar cerca de mí" no dispara `getCurrentPosition` hasta que el usuario lo pulsa explícitamente — la llamada vive dentro del `addEventListener('click', ...)` del botón, no en el montaje del componente.
- [x] Permiso denegado o `getCurrentPosition` fallido: mensaje claro en el panel (`err.code === err.PERMISSION_DENIED` vs. error genérico), no rompe el resto del sidebar.
- [x] Ninguna llamada de red ni escritura en `localStorage`/caché con la posición del usuario — `calcularCercania` es una función pura sin efectos secundarios; `capas-activas-store.ts` es un objeto en memoria, nunca serializado a `localStorage`.
- [x] Resultados visibles y legibles en el panel, con distancia formateada (m/km) vía `formatoDistancia`.
- [x] `npm run typecheck` y `npm run test` (117/117) sin regresiones; verificado en navegador con geolocalización simulada en Plaza del Ayuntamiento y las 3 capas activas — resultado con sentido geográfico real: "PLAÇA DEL AJUNTAMENT" (tráfico, 77m), "015_RIBERA" (Valenbisi, 107m), "AVINGUDA DE L'OEST" (aparcamiento, 340m).

## 7. Riesgos y fuera de alcance

- **Riesgo:** si ninguna de las tres capas (tráfico/Valenbisi/aparcamiento) está activa/cargada cuando se pulsa el botón, las listas salen vacías — se decide mostrar un aviso ("activa una capa para ver resultados") en vez de disparar una carga oculta de datos que el usuario no pidió ver en el mapa.
- **Riesgo:** precisión del GPS del navegador (especialmente en escritorio, vía IP) puede ser baja — fuera de nuestro control, se muestra la distancia calculada tal cual, sin prometer precisión que no existe.
- **Fuera de alcance de esta versión:** centrar/volar el mapa al hacer clic en un resultado (fast-follow razonable, no bloquea v1), incluir Fallas (`008`) o Pulso de Distrito (`010`) en el ranking (los ejemplos originales del usuario eran tráfico/Valenbisi/aparcamiento — no ampliar sin pedirlo), `watchPosition` en continuo (v1 es una consulta puntual bajo demanda, no seguimiento en vivo).

## 8. Historial

| Versión | Fecha | Cambio |
|---|---|---|
| 1 | 2026-08-19 | Creación, `Draft`. Desbloqueada por ADR-001. Pendiente de implementación y verificación en navegador antes de pasar a `Implemented`. |
| 2 | 2026-08-19 | DoD completo: `src/services/proximidad.ts` (Haversine + punto-a-segmento, sin turf.js) con 9 tests; `src/services/capas-activas-store.ts` (memoria, nunca persistido) conectado desde los `refresh()` ya existentes de tráfico/Valenbisi/aparcamiento; sección "Cerca de mí" en `SIDEBAR_REGISTRY` (`src/ui/chasis.ts`) con botón de permiso explícito y listas de resultado por capa. Verificado con `npm run typecheck`, `npm run test` (117/117) y en navegador. Spec pasa a `Implemented`. |
