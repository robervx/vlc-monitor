# 021 — Motor de propuesta de cordón de seguridad por incidente

```yaml
id: 021
titulo: "Propuesta de perímetro/cordón y calles a cortar según tipo e intensidad de incidente"
estado: Draft
tipo: capa
depende_de: [020, 019, 031]
propietario: ""
version: 3
```

**Nota de estado (v2, 2026-08-25)**: el DoD de software (§6) está completo e implementado — motor de cálculo, UI, tests, badges de confianza, guard de datos personales. **Sigue en `Draft`, deliberadamente no `Approved`**: esta spec fija su propio bloqueante (§7) de que `Approved` requiere contraste real con el Consorcio Provincial de Bombers de València, que es una acción humana fuera de esta sesión — construir el software no sustituye esa validación, y marcar esto como algo más que `Draft` sería exactamente el riesgo que el badge de confianza está diseñado para evitar.

**Nota (2026-09-01) — v3, revisión del gemelo digital**: la propuesta de perímetro por **distancia de red radial** (§3-§4) no cambia. Lo que añade v3:
- **Cortes de calle a mano** en el modo cordón (fase `formulario`): clic en el mapa hace snap al tramo más cercano y lo añade/quita de `cortesManuales` (mismo patrón que el simulador de spec `022`). Segundo handler de clic en `main.ts`, activo solo en fase `formulario`.
- **Efecto en cadena dirigido** (motor de spec `031`) sobre `tramosCerrados` (del perímetro) + `cortesManuales`. En la UI **solo se muestra la propagación que se escapa del área de socorro** (`modo-cordon.ts` → `calcularPropagacionFuera`, filtra por distancia recta al incidente > `radioAreaSocorroM`): el interior del cordón siempre queda sin entrada/salida por diseño, eso no es una alarma (spec `031` §5).
- Flechas de sentido de circulación visibles mientras el modo está activo (capa `flechas-sentido`, compartida con spec `022`).
- Precálculo de `031` (`obtenerBasePropagacion`) compartido con el simulador de spec `022`, memoizado en `grafo-viario-cliente.ts`.

El bloqueante de §7 (contraste con Bombers) es independiente y **sigue vigente** — v3 no cambia el estado `Draft`.

## 0. Contexto de la decisión

Extiende la línea aprobada en `ADR-001` (Opción C). No es el simulador de tráfico (Fase 2 de `docs/investigacion/GEMELO_DIGITAL_SEGURIDAD_PUBLICA_PROPUESTA.md`, que sigue fuera de alcance) — es un problema más simple: dado un incidente puntual, proponer un perímetro y qué tramos cortar, usando el grafo de spec `020` y una tabla de reglas **basada en fuentes reales**, no inventada.

**Encaje de interfaz** (respuesta a "que sea una capa quizás en otra página, reutilizando el mismo mapa"): no se crea una página HTML ni una instancia de mapa nueva. Se añade una entrada nueva a `SIDEBAR_REGISTRY` (`src/ui/chasis.ts`, spec `019`) — p.ej. `cordon-incidente` — que al activarse cambia el panel principal a un **modo** dedicado: oculta temporalmente los paneles de capa habituales (tráfico, meteo, etc., evita el amontonamiento que preocupaba) y muestra el formulario de incidente + el resultado pintado sobre la misma instancia de MapLibre. Volver al modo normal restaura los paneles. Esto no es la sección `gemelo-digital` ya registrada como placeholder — esa es un contenedor más amplio; se decide en implementación si esta spec cuelga de ella o añade su propia entrada.

## 1. Problema / motivación

**Reparto de roles real (aclarado explícitamente por el usuario, 2026-08-25):** en un incendio, Policía Local suele ser la primera en llegar, antes o a la vez que Bombers — y mientras Bombers se dedica por completo a la extinción, es Policía quien gestiona el perímetro, el corte de calles y el desvío de tráfico. Esta herramienta es la guía de **ese** trabajo — el de la policía como primer interviniente gestionando el entorno — no una herramienta para que Bombers decida cómo atacar el fuego. Por eso el destinatario del formulario y de la propuesta es el agente/mando policial en el sitio, no el servicio de extinción.

Hoy esa gestión de perímetro sale solo del criterio y la experiencia de quien está al mando, sin ninguna ayuda visual del entorno viario real. El sistema **propone**, nunca decide ni notifica por sí solo (`CLAUDE.md` §4) — y precisamente porque quien gestiona el perímetro aquí es policía, no bomberos, es todavía más importante que las cifras de esta spec no se lean como si vinieran del criterio técnico de extinción: son un punto de partida de apoyo al corte de calles, siempre editable y pendiente de contraste real (ver §7).

## 2. Fuente(s) — investigación de protocolos reales (2026-08-25)

Esta es la parte que exige más rigor, tal como pidió explícitamente el usuario. Cada fila indica qué tan sólida es la fuente — **ninguna cifra de esta spec se trata como definitiva sin marcarlo**.

| Fuente | Qué aporta | Ámbito real | Estado |
|---|---|---|---|
| [Real Decreto 1196/2003](https://www.boe.es/buscar/act.php?id=BOE-A-2003-18682) (Directriz básica de protección civil, riesgo químico) | Terminología oficial **Zona de Intervención** / **Zona de Alerta** + metodología de cálculo (modelo TNO: reacción estática ~5s + huida a 4 m/s) | Accidentes con sustancias peligrosas | ✅ Oficial, verificado — pero el método de cálculo es específico de riesgo químico, no extrapolable directo a incendio de vivienda |
| Doctrina PEMU (Plan de Emergencia Municipal) — verificado contra varios planes municipales publicados (Torrelavega, Santander, Almería, Miajadas) | Modelo de **tres zonas operativas**: Área de Intervención (donde opera el grupo de intervención), Área de Socorro (coordinación de rescate), Área Base (medios de reserva) | General, cualquier tipo de emergencia | ✅ Doctrina general confirmada en múltiples PEMU reales — es el marco que usa esta spec para nombrar los anillos del cordón |
| [ITC.SP 147:2024](https://interior.gencat.cat) "Condiciones de seguridad en caso de incendio en aparcamientos con IRVE" (Bombers Generalitat de Catalunya) | Cifras concretas: separación ≥ 4,5 m entre vehículo(s) y otros vehículos/combustibles (o barrera EI60); agrupación máx. 10 plazas sin separación; plazas con carga rápida a ≤5 m de extracción de humos | Aparcamientos **interiores** de edificios | ✅ Oficial, verificado con el documento completo — **excluye explícitamente "vía pública"** (texto literal del documento) |
| "Recomendaciones de seguridad contra incendios — aparcamientos VE/híbridos" v02, 2025-09-04 — documento conjunto Bomberos Ayto. Madrid + Comunidad de Madrid + Bombers Barcelona + Bombers de la Generalitat + **Ayto. de Valencia** + Ayto. Zaragoza | Confirma la separación de 4,5 m cada 10 vehículos; recomienda punto de recarga en edificios sanitarios a ≥50 m del edificio; extracción de humos a ≤5 m | Aparcamientos, mismo ámbito que ITC.SP 147 | ✅ Oficial, verificado — **coautoría del Ayuntamiento de Valencia**, es la fuente más directamente relevante para esta ciudad, pero sigue sin cubrir vía pública |
| [ERG 2024, Guía 147](https://cameochemicals.noaa.gov/erg_guides/en/Guide_147.pdf) (US DOT / NOAA CAMEO, baterías de litio) | Aislamiento de fuga/daño de batería: ≥25 m en todas direcciones. Escenario a granel (vagón/remolque): aislar y evacuar 500 m | Transporte de mercancías peligrosas, EE.UU. | ⚠️ Referencia internacional, no normativa española — el escenario de 500 m es para carga a granel, no aplica a un turismo; se usa solo como **valor de partida provisional** para el hueco de "vehículo eléctrico ardiendo en vía pública" |
| Guías UK "National Operational Guidance" (incendio estructural) | Confirma que el tamaño del cordón en incendio de edificio **no tiene tabla fija** — depende de altura, viento, riesgo de desprendimiento, valorado por el mando en el sitio | Incendio estructural general | ⚠️ Confirma la ausencia de cifra única — no aporta un número, aporta la razón por la que no debe inventarse uno |

**Hueco identificado, explícito y no resuelto por esta investigación**: ni la normativa española revisada ni la guía UK dan una cifra oficial para (a) incendio de vehículo eléctrico en plena calle (fuera de aparcamiento) ni (b) perímetro de vivienda/edificio por número de plantas o intensidad. Ambos casos se modelan en la sección 3 como **radio de partida editable, marcado como estimación**, no como dato normativo — y quedan anotados en la sección 7 como pendientes de contraste con el Consorcio Provincial de Bombers de València antes de que esta spec pueda pasar a `Approved`.

## 3. Contrato de datos (normalizado)

```typescript
interface Incidente {
  idIncidente: string;
  tipo: 'incendio';                      // v1 acota a incendio; otros tipos, spec futura con su propia tabla de fuentes
  subtipo:
    | 'vivienda' | 'edificio' | 'bajoLocal'
    | 'garajeAparcamiento'
    | 'vehiculoCombustion' | 'vehiculoElectricoHibrido';
  ubicacion: { lat: number; lon: number }; // `lon`, no `lng` — mismo criterio de consistencia que spec 020
  plantasAfectadas?: number;
  viviendasAfectadas?: number;
  necesidadDesalojo: boolean;
  intensidad: 'conato' | 'incendioControlado' | 'incendioGeneralizado';
  observaciones?: string;
  creadoEn: string;                      // ISO 8601
}

interface ReglaPerimetro {
  subtipo: Incidente['subtipo'];
  intensidad: Incidente['intensidad'];
  radioAreaIntervencionM: number;        // anillo interior — nadie sin EPI de intervención
  radioAreaSocorroM: number;             // anillo exterior — cordón de calles a cortar
  fuenteId: string;                      // referencia a la tabla de la sección 2
  confianza: 'oficialVerificada' | 'referenciaInternacional' | 'estimacionPendienteValidar';
}

interface PropuestaCordon {
  idIncidente: string;
  tramosCerrados: string[];              // idTramo (spec 020) dentro del Área de Intervención
  tramosCorte: string[];                 // idTramo en el borde del Área de Socorro — puntos de control/efectivos
  tramosDesvioSugerido: string[];        // idTramo adyacentes fuera del perímetro
  geometriaAreaIntervencion: GeoJSON.Polygon;
  geometriaAreaSocorro: GeoJSON.Polygon;
  generadaEn: string;
  editadaManualmente: boolean;           // true en cuanto el mando ajusta algo — trazabilidad de que ya no es la propuesta cruda
}
```

`ReglaPerimetro` vive como dato estático versionado en `src/config/reglas-perimetro-incendio.ts` (mismo patrón `def()` que `map-layer-definitions.ts`, `CLAUDE.md` §5) — **no** es contenido inventado a incluir de una vez; se rellena fila a fila con la fuente citada en `fuenteId`, y toda fila con `confianza: 'estimacionPendienteValidar'` lleva su radio como el más conservador (amplio) de las referencias disponibles, nunca el más ajustado.

**Hueco adicional encontrado durante la implementación, no en la investigación de §2**: `vehiculoCombustion` (coche de combustión ardiendo en vía pública) tampoco tiene fuente citada en la investigación original — se trata con el mismo criterio conservador que los dos huecos ya identificados, y queda igualmente sujeto al bloqueante de `Approved`. Documentado en la cabecera de `reglas-perimetro-incendio.ts`, no ocultado.

**Índice espacial reutilizado, no duplicado**: `proponerCordon()` reutiliza `IndiceRedViaria` (`rbush`, spec 020) para el *snap* del incidente al grafo — no se construye un índice espacial nuevo para esta spec.

## 4. Pipeline (seed → caché → endpoint)

No hay fuente externa en vivo. `ReglaPerimetro[]` es config estática (como en `map-layer-definitions.ts`). `Incidente` lo introduce el usuario en el formulario de la sesión — **no se persiste en ningún backend ni en `localStorage` en v1** (evita abrir, de pasada, la pregunta de retención de datos operativos sin decisión explícita, y es más estricto que lo previsto originalmente: ni siquiera sobrevive a un refresco de página, solo dura mientras la pestaña está abierta, en memoria del módulo `src/ui/modo-cordon.ts`). El cálculo de `PropuestaCordon` es síncrono en cliente contra el grafo de spec `020`: `@turf/circle` (no el paquete `turf` completo — solo el submódulo necesario, ver `CLAUDE.md` §5 sobre no arrastrar dependencias de más) para los dos polígonos de visualización, y un Dijkstra acotado por radio máximo (implementado a mano, sin dependencia nueva) sobre la adyacencia del grafo de spec 020 para decidir qué tramos cortar por **distancia de red real**, no por estar dentro del círculo euclídeo — el círculo es solo para pintar, nunca para clasificar tramos (ver comentario de cabecera en `cordon-incidente.ts`).

| Parámetro | Valor |
|---|---|
| Endpoint interno | Ninguno propio — reutiliza `/data/red-viaria-rodada.json` (asset estático) de spec `020` |
| Persistencia de `Incidente` | Ninguna fuera de la sesión del navegador, v1 |
| Comportamiento si spec `020` no está disponible | Modo deshabilitado con aviso explícito, no cálculo aproximado silencioso |

## 5. Contrato de capa de mapa

```typescript
{
  key: 'cordon-incidente',
  renderers: ['deck'],
  zoomMinimo: 12,                 // escala calle/distrito
  agregacion: 'punto',            // el incidente es un punto; el resultado son polígonos derivados
  icono: '🔥',
}
```

Pintado: marcador del incidente (punto rojo), dos polígonos concéntricos (Área de Intervención rojo / Área de Socorro ámbar) con relleno semitransparente, `tramosCerrados` en rojo grueso, `tramosCorte` en ámbar, `tramosDesvioSugerido` en azul.

**Simplificación de v1 sobre el diseño original**: la edición es por formulario (cambiar subtipo/intensidad/plantas recalcula al instante), no arrastre directo de los tramos/polígonos sobre el mapa — arrastrar geometría a mano es una pieza de interacción bastante más grande, y el formulario ya cumple el requisito real del DoD ("editable antes de confirmar", ver §6). `editadaManualmente` se marca en cuanto el usuario toca cualquier campo del formulario tras el primer cálculo. Arrastre directo queda como fast-follow razonable, no bloquea esta versión.

## 6. Criterios de aceptación (Definition of Done)

- [x] Tabla `ReglaPerimetro` completa (6 subtipos × 3 intensidades = 18 filas), con `fuenteId` trazable a `FUENTES_REGLAS` en cada fila — cero filas sin fuente citada, incluyendo el hueco adicional de `vehiculoCombustion` detectado en implementación (ver §3).
- [x] Snap del incidente al grafo de spec `020` y cálculo de `PropuestaCordon` verificado: 2 ubicaciones reales de Valencia (Gran Vía del Marqués del Túria, calle estrecha de Ciutat Vella) más un **fixture sintético controlado** para la propiedad "distancia de red, no euclídea" — no se encontró un cruce real del Turia lo bastante estrecho para ejercitarla de forma determinista con los radios reales de la tabla (máx. ~100m); el fixture prueba exactamente el mismo mecanismo sin depender de encontrar el hueco exacto en el grafo real (documentado en `cordon-incidente.test.ts`, no forzado). 9+9+1 tests (`cordon-incidente.test.ts`).
- [x] Propuesta siempre editable antes de "confirmar" (formulario recalcula en vivo, ver §5); "Confirmar" es únicamente estado local (`confirmada: true`), no dispara ninguna llamada de red — verificado leyendo `src/ui/modo-cordon.ts` (sin `fetch` salvo la carga de solo lectura del propio grafo) y en navegador.
- [x] Badge de confianza visible y persistente por regla aplicada (color + texto + fuente citada) con disclaimer fijo "Punto de partida orientativo, no una cifra normativa cerrada" — verificado en navegador, mismo espíritu que el badge "MOCK" de spec `003`.
- [x] Guard best-effort contra datos identificativos en "Observaciones" (DNI/NIE/teléfono/email) — bloquea "Confirmar" mientras el patrón esté presente. **Limitación documentada explícitamente**: es detección de patrones estructurados, no NLP — no pretende cubrir nombres propios sueltos. Verificado en navegador (con y sin patrón).
- [x] Activar el modo oculta `#controls`/`#info-panels` sin duplicar el mapa (mismo `MapboxOverlay`); salir los restaura. **Bug real encontrado y corregido durante la verificación**: la capa `distritos` seguía siendo `pickable` durante el modo cordón, así que el clic para marcar el incidente también disparaba la selección de distrito de esa capa y la pintaba encima — corregido con un guard explícito en `onClick`/`onHover` que comprueba el estado del modo en vivo, no solo la prop `pickable` (ver historial).
- [x] `npm run typecheck` y `npm run test` (146/146) sin regresiones.

## 7. Riesgos y fuera de alcance

- **Riesgo principal, explícito**: que se use una cifra de perímetro como si fuera normativa cerrada cuando en realidad es una estimación (ver hueco de la sección 2). Mitigación de diseño: badge de confianza por regla + edición obligatoria antes de "confirmar" + nunca ejecución automática.
- **Bloqueante para pasar a `Approved`**: contraste de la tabla completa (en particular vehículo eléctrico en vía pública y perímetro de vivienda/edificio por plantas) con el Consorcio Provincial de Bombers de València o el servicio competente — no se resuelve solo con búsqueda documental, tal como exige `CLAUDE.md` §8.2 para fuentes no verificadas con una llamada/contacto real.
- **Fuera de alcance v1**: cualquier tipo de incidente que no sea incendio (fuga química, explosión, atentado) — cada uno necesita su propia tabla de fuentes, no es extrapolable de la de incendios. Integración con 112CV o cualquier sistema externo. Persistencia/histórico de incidentes entre sesiones.
- **Riesgo de red**: la "distancia de red" por el grafo puede fallar si spec `020` tiene cobertura incompleta en una zona — en ese caso se debe hacer visible la degradación (fallback a buffer euclídeo con aviso), nunca fallar en silencio.
- **Bug real encontrado y corregido en implementación**: clasificar tramos por distancia a sus nodos (extremos) subestimaba la cercanía del propio tramo del incidente cuando este cae a mitad de un tramo largo con un radio pequeño (ej. 'conato', 10m) — el tramo podía salir "fuera" de sus propios cerrados aun con el incidente literalmente encima. Corregido calculando la distancia real a cada extremo recorriendo la geometría del tramo (no la perpendicular a la línea) y usando la distancia de *snap* real para el propio tramo del incidente en vez de la aproximación por nodos. Test de regresión específico en `cordon-incidente.test.ts`.

## 8. Historial

| Versión | Fecha | Cambio |
|---|---|---|
| 1 | 2026-08-25 | Creación, `Draft`. Investigación de fuentes reales (RD 1196/2003, doctrina PEMU, ITC.SP 147:2024, documento conjunto de bomberos con coautoría de Ayto. Valencia, ERG Guía 147, UK NOG) — hueco identificado y dejado explícito para vehículo eléctrico en vía pública y perímetro de vivienda/edificio, pendiente de validación con el Consorcio Provincial de Bombers de València antes de `Approved`. |
| 2 | 2026-08-25 | DoD de software completo (sigue en `Draft`, ver nota de estado arriba): `src/config/reglas-perimetro-incendio.ts` (18 filas trazables), `src/services/cordon-incidente.ts` (motor de cálculo, distancia de red vía Dijkstra acotado, 10 tests), `src/ui/modo-cordon.ts` (orquestador de estado, sin persistencia), sección "Cordón de incidente" en `SIDEBAR_REGISTRY` con formulario + badges + guard PII, capas de mapa en `main.ts`. Dos bugs reales encontrados y corregidos durante la verificación en navegador (ver §6 y §7: capa `distritos` interceptando el clic de colocación; aproximación de distancia al extremo del tramo propio). Verificado con `npm run typecheck`, `npm run test` (146/146) y en navegador (flujo completo, guard PII, ausencia del bug de selección de distrito). |
| 3 | 2026-09-01 | Paso 3 de la revisión del gemelo digital (sigue en `Draft`). Cortes de calle a mano (`toggleCorteManual` en `modo-cordon.ts`, segundo handler de clic en `main.ts` para fase `formulario`) + efecto en cadena de spec `031` sobre cerrados + cortes manuales, filtrado a lo que se escapa del área de socorro (`calcularPropagacionFuera`). Capas nuevas en `main.ts` (`cordon-cortes-manuales` naranja, `cordon-propagacion-sin-entrada/-sin-salida/-desvio`), flechas de sentido, panel en `chasis.ts` (lista de cortes + bloque "efecto en cadena fuera del cordón"). `obtenerBasePropagacion` compartido con spec `022`. `npm run typecheck` / `npm run test` (241/241) verdes. Verificado en navegador: incidente + corte manual de "Carrer de Vicente Beltrán Grimal" → "efecto en cadena fuera del cordón: desvío forzado" con la lista de calles; flechas de sentido visibles; sin errores de consola. |
