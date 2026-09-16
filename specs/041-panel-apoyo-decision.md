# 041 — Panel de apoyo a decisión operativa

```yaml
id: 041
titulo: "Página que cruza señales ya existentes (tráfico, lluvia, incidencias) y sugiere zona y acciones a valorar"
estado: Implemented
tipo: indice-compuesto
depende_de: [010, 013, 016, 026, 040]
propietario: ""
version: 1
```

> **Estado:** `Implemented` (2026-09-16). Implementada como traducción a texto de los
> escenarios ya calculados por `pulso-escenarios.ts` (spec 010) — no un agregador nuevo
> desde cero, ver §2. Spec `021` (cordón) queda fuera del cruce automático: su "incidente
> activo" es estado interactivo de sesión del cliente (`modo-cordon.ts`), no una señal
> persistida en caché que un endpoint pueda consultar — ver §7.

## 0. Límite aplicable — mismo que spec 021 y `CLAUDE.md` §4

Esta página **avisa, no actúa**: cruza señales que ya existen en el producto (nunca datos
nuevos ni un modelo estadístico nuevo, mismo principio que spec `024`) y redacta una
sugerencia de texto para que la valore una persona. No envía nada, no despacha ninguna
unidad, no ejecuta ninguna acción. "Valorar enviar una patrulla" es una frase que lee un
humano y decide, exactamente igual que el borrador de spec `013` o la propuesta de cordón
de spec `021` — nunca una llamada a ningún sistema de despacho real.

## 1. Problema / motivación

Hoy cada señal (tráfico denso, lluvia inminente, incidencia de vía pública, escenario de
Pulso de Distrito) vive en su propio panel. Cuando dos o tres coinciden en la misma zona,
a nadie le salta automáticamente "mira aquí, es donde más falta hace decidir algo" — hay
que ir comparando paneles a mano. Esta página junta las señales ya calculadas por specs
`010`/`016`/`026` (a través del evaluador consolidado de `010`) en una sola vista por
zona/calle, con una sugerencia de qué mirar y qué se podría valorar, sin inventar ninguna
señal nueva. Spec `021` (cordón) queda fuera del cruce automático — ver §7.

## 2. Fuente(s) de datos

No hay fuente externa nueva. Reutiliza exclusivamente los datos ya cacheados/calculados
por specs `010` (escenarios de Pulso), `013`/`024` (insights), `016` (nowcasting lluvia),
`021` (motor de cordón, cuando hay un incidente activo) y `026` (incidencias de vía
pública) — todos `Implemented` u objeto de esta misma tanda de trabajo.

| Fuente | URL | Licencia / condiciones | ¿Requiere API key? | Verificada manualmente el ___ |
|---|---|---|---|---|
| Endpoints internos ya existentes de 010/016/026 (vía el evaluador consolidado de 010) | `/api/...` (varios, ver sus specs) | Ya cubierta por cada spec origen | No | **Verificada 2026-09-16** — `GET /api/decision/v1/sugerencias` responde 200 con `{ sugerencias: [], fresh: true }` contra datos reales (sin conjunción activa en el momento de verificar); cruce con datos real comprobado por 7 tests unitarios con fixtures realistas |

## 3. Contrato de datos (normalizado)

```typescript
interface SugerenciaOperativa {
  id: string;
  distrito?: string;
  calle?: string;                  // si el cruce se puede localizar a nivel calle
  señalesCombinadas: string[];     // ids/tipos de las señales que coinciden (p.ej. 'trafico-denso', 'lluvia-inminente', 'incidencia-via-publica')
  resumen: string;                 // frase corta, lenguaje llano: "qué está pasando aquí"
  sugerenciaTexto: string;         // frase de apoyo, nunca una orden: "valorar enviar una patrulla a revisar doble fila"
  severidad: 'seguimiento' | 'prioritario';  // mismo vocabulario que spec 010 v4
  generadaEn: string;               // ISO 8601
  fuenteSpec: string[];             // qué specs origen aportaron cada señal, trazabilidad
  centroide: [number, number];      // [lon, lat] real del escenario de origen — elaboración sobre el mínimo de esta sección, ver historial v1
}
```

**Cómo se calcula (implementación):** `src/services/apoyo-decision.ts` no vuelve a agregar
tráfico/incidencias/lluvia por su cuenta — toma directamente `PulsoDistrito[]` (ya
calculado por `calcularPulsoEscenarios`, spec 010 v4) y traduce cada `EscenarioActivo` con
`modo: 'vivo'` y `confirmado: true` a una `SugerenciaOperativa`. `resumen` reutiliza el
`motivo` factual que ya construye el escenario; `sugerenciaTexto` es el único texto
genuinamente nuevo de esta spec, siempre en condicional. `calle` sale de
`tramosAfectados[0].nombre` si existe — nunca inventada, `undefined` si el escenario no
ancla en ningún tramo concreto (queda solo el distrito).

## 4. Pipeline (seed → caché → endpoint)

| Parámetro | Valor |
|---|---|
| Frecuencia de refresco (cron) | Ninguna propia — se recalcula en cliente/endpoint ligero a partir de las cachés ya existentes de 010/013/016/021/026, mismo principio que spec `024` (correlación declarativa, sin modelo estadístico nuevo) |
| TTL en caché | No aplica (deriva de las cachés origen, cada una con su propio TTL) |
| Comportamiento si una señal falla | Se muestra la sugerencia con las señales disponibles, marcando cuál falta — nunca se oculta la página entera por un fallo parcial |
| Endpoint interno | `GET /api/decision/v1/sugerencias` (agrega, no re-consulta fuentes externas) |

## 5. Contrato de capa de mapa

No hay capa `deck.gl` propia — el mapa está oculto en `/inteligencia` (spec 040), así que
no hay superficie donde pintar puntos mientras se ve esta página. "Reutiliza la misma
instancia de mapa" (no una segunda) se resuelve con un store mínimo,
`src/ui/centrar-mapa.ts` (mismo patrón pub/sub que `foco-distrito.ts`): cada sugerencia
tiene un botón "Ver en el mapa" que pide centrar en su `centroide` real y cambia a
`/mapa` (`irAVista('mapa')`); `main()`, dueño único de la instancia de MapLibre, escucha
la petición y hace `map.flyTo(...)`. Vive dentro de la vista `/inteligencia` de spec `040`,
como panel propio igual que cámaras/contexto mediático/tendencia/agenda/actualidad
institucional — no una sección del sidebar.

## 6. Criterios de aceptación (Definition of Done)

- [x] Reglas de cruce documentadas explícitamente: las 3 conjunciones ya definidas por spec
      010 v4 (`incidencia-sobre-trafico-denso`, `fallas-y-trafico`,
      `lluvia-inminente-sobre-trafico-denso`), cada una con su texto de sugerencia fijo en
      `sugerenciaTextoPara()` (`src/services/apoyo-decision.ts`) — sin modelo estadístico
      nuevo, mismo criterio que spec `024`.
- [x] Ninguna sugerencia es una acción ejecutable desde la UI: el único botón es "Ver en el
      mapa" (navega y centra, no despacha nada); verificado por test que el texto nunca
      contiene "enviar"/"cortar"/"despachar"/"ejecutar" y siempre empieza por "Podría
      convenir valorar".
- [x] Localización lo más concreta posible — `calle` sale de un tramo real
      (`tramosAfectados[0].nombre`) o queda `undefined` (nunca inventada), cayendo al
      distrito; test explícito de que sin tramo no se inventa calle.
- [x] Verificado contra el dev server real: `GET /api/decision/v1/sugerencias` responde
      `{ sugerencias: [], fresh: true }` (sin conjunción activa en el momento de verificar,
      ciudad en calma) — **caso con datos verificado con fixture controlado**, documentado
      como tal (mismo criterio que spec `021` §6): 7 tests unitarios con escenarios
      realistas (incidencia+tráfico, Fallas+tráfico, lluvia+tráfico, orden por severidad,
      sin calle inventada) + verificación visual en navegador de las tarjetas con
      contenido inyectado. El flujo completo de clic en "Ver en el mapa" con datos reales
      de extremo a extremo no se pudo ejercitar en vivo por no coincidir conjunción real
      durante la sesión de verificación — la lógica de centrado (`centrar-mapa.ts`) reusa
      el mismo patrón pub/sub ya probado en producción por `foco-distrito.ts`.
- [x] `npm run typecheck` / `npm run test` (364/364) / `npm run build` sin regresiones.

## 7. Riesgos y fuera de alcance

- **Riesgo principal, explícito**: que el texto de sugerencia se lea como una orden en vez
  de una sugerencia. Mitigación: lenguaje siempre en condicional ("valorar", "podría
  convenir"), nunca imperativo ("enviar", "cortar") — verificado por test.
- **Spec `021` (cordón) fuera del cruce automático**: su "incidente activo" vive como
  estado de sesión en el cliente (`modo-cordon.ts`, activado a mano por quien usa la
  herramienta), no como una señal persistida en ninguna caché de servidor que este
  endpoint pueda consultar — no hay "incidente de cordón" que agregar sin inventar un
  mecanismo de persistencia nuevo, fuera del alcance declarativo de esta spec. Alguien ya
  usando el cordón está, por definición, ya decidiendo sobre esa zona — no necesita
  además una sugerencia. Puede añadirse en una spec futura si el cordón pasa a persistir
  su estado en servidor por otro motivo.
- **Fuera de alcance**: cualquier integración con sistemas de despacho reales (112, policía
  local, protección civil) — eso es fuera de esta aplicación por diseño (`CLAUDE.md` §4).
  Ningún modelo predictivo/estadístico nuevo — solo combinación declarativa de señales que
  ya existen.

## 8. Historial

| Versión | Fecha | Cambio |
|---|---|---|
| 1 | 2026-09-16 | Creación (Draft) y cierre el mismo día, como parte del DoD de V1 (`docs/02_DEFINITION_OF_DONE_V1.md`). Implementada como traducción a texto de los escenarios ya calculados por `pulso-escenarios.ts` (spec 010 v4) — `src/services/apoyo-decision.ts` (7 tests), endpoint `GET /api/decision/v1/sugerencias`, panel `src/ui/apoyo-decision-panel.ts` dentro de `/inteligencia`. "Ver en el mapa" centra la única instancia de MapLibre vía un store nuevo (`src/ui/centrar-mapa.ts`, mismo patrón que `foco-distrito.ts`) y cambia a `/mapa`. Spec `021` queda fuera del cruce automático — su estado de "incidente activo" es de sesión de cliente, no una caché de servidor (§7). Verificado en navegador (escritorio y móvil) contra el dev server real; sin conjunción de señales activa durante la verificación, caso con datos cubierto por fixtures controladas (documentado como tal, §6). `npm run typecheck`/`test` (364/364)/`build` verdes. Spec pasa a `Implemented`. |
