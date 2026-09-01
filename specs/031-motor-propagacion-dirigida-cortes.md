# 031 — Motor de propagación dirigida de cortes de calle (compartido 021 / 022)

```yaml
id: 031
titulo: "Motor de propagación dirigida: dado un conjunto de calles cortadas, qué tramos se quedan sin entrada / sin salida de tráfico"
estado: Implemented
tipo: infraestructura
depende_de: [020]
propietario: ""
version: 2
```

## 0. Contexto de la decisión

Paso 2 de la revisión del gemelo digital (2026-09-01). El usuario pidió que **un corte de calle tenga implicaciones dirigidas sobre las vías afectadas**, con este ejemplo textual:

> "Si corto la Avenida del Puerto a la altura de Serrería, quedaría cortada hasta JJ Domine, y todas las que salen de ella. En cambio, aquellas que entran a la Avenida del Puerto están abiertas."

Hoy ninguna de las dos herramientas modela eso:

- **Cordón de incidente (spec `021`)** clasifica tramos por **distancia de red radial** sobre el grafo **no dirigido** — no hay noción de "aguas abajo".
- **Simulador de cortes (spec `022`)** sí usa el grafo dirigido, pero solo calcula **alcanzabilidad booleana a un único nodo de referencia** (el más cercano a Plaza del Ayuntamiento) y solo en un sentido ("¿esta zona puede llegar al centro?"). No dice "a este tramo ya no llega nadie".

Decisión del usuario (2026-09-01): **las dos herramientas comparten un único motor** (esta spec), y el modo cordón gana **cortes de calle a mano** además de su perímetro automático. Esta spec es solo el motor de cálculo (infraestructura, como el grafo de `020`); el pintado y la UI de cada modo son las revisiones de `021` y `022` (paso 3).

## 1. Problema / motivación

Un mando planificando cortes (evento, obra, incendio) quiere ver, antes de aplicarlos, **el efecto en cadena real** de cada corte siguiendo el sentido de circulación:

- Qué tramos se quedan **sin entrada de tráfico** (aguas abajo de un corte: nadie puede llegar hasta que exista una vía alternativa que alimente la calle).
- Qué tramos se quedan **sin salida** (una zona que ya no puede volver a incorporarse al resto de la ciudad — quedaría atrapada).
- Qué vías **desembocan en el corte** y por tanto obligan a un desvío, pero **siguen abiertas** (las que "entran", en el ejemplo del usuario).

El alcance de la propagación lo decide la **topología real**, no una regla fija — puede no coincidir con la intuición a ojo, y ese es justo el valor de la herramienta.

## 2. Fuente(s) de datos

Ninguna nueva. Reutiliza el grafo dirigido de spec `020` (`/data/red-viaria-rodada.json`, asset estático) — en particular su campo `sentido`, corregido en la **v4 de `020`** (rotondas unidireccionales, `oneway=-1` con geometría invertida), que es prerrequisito directo de esta spec: sin el sentido bien puesto, la propagación dirigida da rutas de escape fantasma.

Verificación de la hipótesis central del algoritmo (2026-09-01, script sobre el grafo real): la **mayor componente fuertemente conexa (SCC)** del grafo dirigido cubre **95,4 % de los nodos** (8.780 / 9.201); la siguiente mayor tiene 19 nodos. O sea: "el resto de la ciudad" = esa SCC principal es una referencia sólida y no un nodo elegido a dedo. 421 nodos (4,6 %) quedan fuera (fondos de saco residenciales, pares de sentido único que no cierran ciclo, artefactos de borde municipal) — el diff contra línea base (§3) los excluye de los efectos atribuibles a los cortes.

## 3. Contrato de datos (normalizado)

```typescript
type MotivoAfectacion = 'sinEntrada' | 'sinSalida' | 'aislado';

interface TramoAfectado {
  idTramo: string;
  nombreCalle: string | null;
  sentido: 'unidireccional' | 'bidireccional';
  motivo: MotivoAfectacion;
}

interface TramoDesvioForzado {
  idTramo: string;
  nombreCalle: string | null;
  // El nodo (extremo de un tramo cortado) donde este tramo desemboca y ya
  // no se puede seguir de frente.
  nodoConflicto: string;
  // true si desde `nodoConflicto` no queda ninguna otra salida -> el tramo
  // acaba en un fondo de saco creado por el corte (no solo "hay que girar").
  sinContinuidad: boolean;
}

interface ResultadoPropagacionCorte {
  tramosCortados: string[];              // eco de la entrada, orden de selección
  tramosSinEntrada: TramoAfectado[];     // el resto de la red ya no puede alcanzarlos
  tramosSinSalida: TramoAfectado[];      // ya no pueden alcanzar el resto de la red
  tramosAislados: TramoAfectado[];       // ambos a la vez (no se repiten en las dos listas de arriba)
  tramosDesvioForzado: TramoDesvioForzado[]; // abiertos, pero desembocan en un corte
  nodosSinEntradaCount: number;
  nodosSinSalidaCount: number;
  referencia: 'sccPrincipal';
  generadaEn: string;                    // ISO 8601
}
```

### Algoritmo (`src/services/propagacion-corte.ts`, función pura — sin red, sin DOM)

**Precálculo, una vez por carga del grafo** (lo cachea `grafo-viario-cliente.ts`, compartido por `021` y `022`):

1. **Adyacencia dirigida** respetando `sentido`: `unidireccional` → arista `nodoOrigen → nodoDestino`; `bidireccional` → las dos. (El grafo v4 de `020` ya deja la dirección canónica `origen→destino` en el sentido real de circulación, incluido `oneway=-1`.)
2. **SCC principal**: mayor componente fuertemente conexa, vía Kosaraju o Tarjan **iterativo** (la recursión desbordaría la pila con ~9k nodos de profundidad). Se elige como **ancla** el nodo de mayor grado dentro de esa SCC — nunca queda aislado por un corte razonable.
3. **Línea base (sin cortes)**, dos BFS desde el ancla:
   - `entrantesBase` = nodos alcanzables **desde** el ancla (pueden recibir tráfico del núcleo).
   - `salientesBase` = nodos alcanzables **desde** el ancla sobre el grafo **invertido** (pueden enviar tráfico al núcleo).

**Por cada recálculo** (el usuario añade/quita un corte):

4. Se reconstruye la adyacencia **excluyendo los tramos cortados** y se repiten los dos BFS desde el mismo ancla → `entrantesConCortes`, `salientesConCortes`.
5. Diff contra la línea base:
   - `nodosSinEntrada = entrantesBase \ entrantesConCortes`
   - `nodosSinSalida  = salientesBase \ salientesConCortes`
6. Nodos → tramos (para cada tramo **no cortado**):
   - `sinEntrada` ⟺ `nodoOrigenId ∈ nodosSinEntrada` (no se puede llegar al inicio del tramo, así que no se puede circular por él).
   - `sinSalida` ⟺ `nodoDestinoId ∈ nodosSinSalida` (se puede entrar pero no salir del extremo lejano hacia el núcleo).
   - `aislado` ⟺ ambas.
7. `tramosDesvioForzado`: por cada tramo cortado `C` y cada uno de sus nodos extremo relevantes (`nodoOrigenId` de `C`; ambos si `C` es bidireccional), cualquier tramo **no cortado y no `sinEntrada`** `T` con `nodoDestinoId(T)` = ese nodo → entra en la lista. `sinContinuidad = true` si ese nodo no tiene ninguna arista de salida no cortada.

**Coste**: 1 SCC + 2 BFS de línea base por carga de grafo; 2 BFS por recálculo, sobre ~9,2k nodos / ~13,2k tramos. Igual orden de magnitud que el `calcularAislados` actual de `022` — recalculable en cada clic sin problema de rendimiento.

### Cómo el ejemplo del usuario cae del algoritmo

Cortar un tramo de la calzada de entrada de la Avinguda del Port a la altura de Serrería:

- Los tramos **aguas abajo** de ese punto en esa calzada pierden su única fuente de tráfico → `nodoOrigenId` sale de `entrantesConCortes` → **`sinEntrada`**, hasta el primer nodo donde una lateral del núcleo vuelva a alimentar la avenida (ahí para la propagación sola).
- Las **laterales que nacen de** ese tramo muerto ("las que salen de ella") heredan el `sinEntrada` por el mismo motivo.
- Las **laterales que desembocan en** la avenida antes o en el punto de corte ("las que entran") siguen alcanzables desde el núcleo → **no** aparecen como `sinEntrada`; las que desembocan justo en el nodo del corte entran en `tramosDesvioForzado`.
- La **calzada de sentido contrario** de la avenida no se toca — el motor trabaja por calzada/tramo dirigido, más fino que "la avenida entera".

## 4. Pipeline (seed → caché → endpoint)

Ninguno propio. Función pura en cliente sobre el grafo ya cacheado (`grafo-viario-cliente.ts`, spec `020`/`022`). El precálculo (SCC + línea base) se añade a esa caché en memoria y lo comparten los dos modos. Sin persistencia: los cortes son una herramienta de trabajo puntual (mismo criterio que `021`/`022`).

| Parámetro | Valor |
|---|---|
| Endpoint interno | Ninguno — reutiliza `/data/red-viaria-rodada.json` de spec `020` |
| Persistencia | Ninguna fuera de la sesión del navegador |
| Si el grafo no está disponible | El modo consumidor se deshabilita con aviso explícito (mismo patrón que `021`/`022`), nunca cálculo aproximado en silencio |

## 5. Contrato de capa de mapa

Esta spec **no pinta nada** — es motor. El contrato de capa lo definen las revisiones de `021` y `022` (paso 3). Notas para esas revisiones:

- **Simulador (`022` v5)**: `tramosSinSalida` sustituye al actual `tramosAislados` (mismo significado, "zona que queda sin salida"); se añade la capa `tramosSinEntrada` y el aviso de `tramosDesvioForzado`. Desaparecen `nodoReferenciaId` / `REFERENCIA_COORD` (Plaza del Ayuntamiento) — los reemplaza `sccPrincipal`, lo que además cierra el riesgo documentado en `022` §7.
- **Cordón (`021` v3)**: los `tramosCerrados` que hoy calcula el motor de perímetro se pasan como **cortes** a este motor, junto con los cortes manuales que añada el mando. Ojo: sellar el área de intervención **siempre** deja el bloque del incidente `sinEntrada`/`sinSalida` — eso es lo esperado, no una alarma. La UI del cordón debe destacar solo la **propagación que sale del perímetro de socorro** ("fuera del cordón: N calles afectadas"), no el interior.
- Colores: reutilizar la paleta ya en uso — `sinSalida` violeta (como el `tramosAislados` actual de `022`), `sinEntrada` un tono nuevo (p. ej. cian), `desvioForzado` discontinuo. Sin rojo (reservado a cordón real) ni naranja (reservado a corte hipotético).

## 6. Criterios de aceptación (Definition of Done)

- [x] `src/services/propagacion-corte.ts` como función pura, sin red ni DOM (`propagacion-corte.test.ts`, 9 tests): corte con lateral que realimenta → propagación para en la realimentación; corte aguas arriba → `sinEntrada` de la avenida restante + la lateral que sale de ella, la que entra NO; `desvioForzado` con `sinContinuidad` en fondo de saco; corte que atrapa una zona → `sinSalida`; corte que aísla → `aislado` sin duplicar; sin cortes → vacío; calzada opuesta intacta al cortar una sola (fixture de calzadas dobles).
- [x] SCC principal **iterativa** (Kosaraju con pila explícita) — test explícito con el grafo real: no desborda, `scc.size > 8000` (95,4 % de 9.201 nodos).
- [x] Precálculo (SCC + línea base) en `grafo-viario-cliente.ts` vía `obtenerBasePropagacion()` — memoizado, una sola vez por carga de grafo, reseteado en `_resetCacheGrafoViarioParaTests`. Coste medido contra el grafo real: **~110 ms** el precálculo (una vez), **~35-75 ms** cada `propagarCorte` — recalculable por clic sin problema.
- [x] Verificado contra el grafo real en 3 ubicaciones (ver historial v2): Avinguda del Port (escenario del usuario), calle del Eixample, callejón de Ciutat Vella. Resultados coherentes con el modelo del usuario e inspeccionados manualmente.
- [x] `npm run typecheck` / `npm run test` (247/247) / `npm run build` sin regresiones.

**Fuera del DoD de esta spec** (van en las revisiones de `021`/`022`): cualquier pintado en el mapa, cambios de UI, descarga de resumen.

## 7. Riesgos y fuera de alcance

- **No es un simulador de flujo.** Sigue siendo alcanzabilidad booleana ("¿llega tráfico o no?"), ahora en los dos sentidos y con propagación en cadena. No hay volúmenes, intensidades ni redistribución de tráfico — eso es el paso 4 (animación cualitativa por rutas alternativas) y, más allá, la Fase 2 de `docs/investigacion/GEMELO_DIGITAL_SEGURIDAD_PUBLICA_PROPUESTA.md` (SUMO/GNN, spec propia, I+D).
- **Cobertura del grafo.** Si `020` tiene la topología incompleta en una zona (sentido mal etiquetado en OSM, calle nueva sin mapear), la propagación puede sobre- o infra-estimar el alcance. Mitigación: el diff contra línea base evita falsos positivos por zonas ya mal conectadas de antes; aun así, la UI consumidora debe dejar claro que es una estimación sobre datos de OSM, no un cálculo normativo.
- **Ancla de la SCC.** Se asume que la SCC principal (95,4 %) es estable entre regeneraciones del grafo. Si una futura versión del grafo la fragmentara mucho, habría que revisar esta spec, no parchear en silencio.
- **`desvioForzado` es "best effort" v1**: marca toda vía abierta que desemboca en un nodo de corte; no distingue todavía el peso/importancia de esa vía ni calcula la ruta alternativa concreta (eso es paso 4).
- **Sin histórico ni escenarios guardados** — igual que `021`/`022`.
- **Fidelidad del grafo en avenidas de calzada doble**: en el extracto OSM actual, la Avinguda del Port aparece como un único corredor de sentido único (47 tramos, una sola línea), no como dos calzadas separadas — así que la propiedad "cortar un sentido no toca el opuesto" se demuestra con el fixture de test, no con esa avenida en el dato real. Es una cuestión de fidelidad de spec `020` (consolidación de calzadas), no del motor.
- **La propagación es local en zona de malla**: verificado que cortar 1 solo tramo de una calle del Eixample rara vez deja algo `sinEntrada` (siempre hay alternativa a una manzana) mientras que en Ciutat Vella un solo corte sí aísla un bolsillo — comportamiento correcto y esperado, no un defecto.

## 8. Historial

| Versión | Fecha | Cambio |
|---|---|---|
| 1 | 2026-09-01 | Creación, `Draft`. Diseño del motor compartido de propagación dirigida (paso 2 de la revisión del gemelo digital). Hipótesis de la SCC principal verificada contra el grafo real (95,4 % de nodos). Pendiente de implementación y de verificación en el escenario Avinguda del Port antes de pasar a `Implemented`. |
| 2 | 2026-09-01 | DoD completo. `src/services/propagacion-corte.ts` (`calcularSccPrincipal` Kosaraju iterativo, `calcularBasePropagacion`, `propagarCorte`) + `propagacion-corte.test.ts` (9 tests). Precálculo memoizado en `grafo-viario-cliente.ts` (`obtenerBasePropagacion`). Verificado contra el grafo real (`npx tsx`, script desechado): SCC 8.780/9.201; precálculo ~110 ms, `propagarCorte` ~35-75 ms. Escenarios: **Avinguda del Port** (corte de 1 tramo → 4 `sinEntrada` incluyendo la avenida aguas abajo y 2 calles que salen de ella + 2 `desvioForzado` que entran; 0 `sinSalida`); **Carrer dels Cavallers / Ciutat Vella** (1 corte → 3 `sinEntrada`, bolsillo aislado); calle del Eixample (1 corte → 0 afectados, hay alternativa a una manzana). `typecheck` / `test` (247/247) / `build` verdes. Spec pasa a `Implemented`. **El pintado y la UI siguen pendientes — son las revisiones 021 v3 / 022 v5 (paso 3).** |
