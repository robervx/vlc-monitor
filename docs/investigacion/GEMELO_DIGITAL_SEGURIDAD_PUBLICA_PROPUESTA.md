# Gemelo digital urbano orientado a seguridad pública — propuesta de arquitectura

**Fecha:** 2026-08-18
**Estado:** propuesta de diseño, **no aprobada, no iniciada**. Ningún fichero de `specs/` ni de `src/`/`api/` se ha tocado como parte de esta propuesta.
**Por qué existe este documento:** consolida una sesión de diseño técnico en profundidad sobre si/cómo VLC Monitor podría extenderse con una línea de producto orientada a apoyo a la toma de decisiones de la Policía Local, manteniéndose estrictamente dentro de datos agregados y anónimos. El documento existe para que se pueda **decidir con conocimiento completo**, no para saltarse el proceso de decisión.

---

## 0. Encaje con el proyecto y por qué esto no es ya una spec

`CLAUDE.md` §1 fija que VLC Monitor **no es** el antiguo "CISE Command Center" (sala de llamadas policial) — ese pivote ya se cerró y está documentado en `docs/01_VIABILIDAD_VISION_Y_PROCESO.md` §3.6. `CLAUDE.md` §4 fija además un límite ético/legal duro (sin datos de localización individual, sin biometría, "avisa no actúa", ninguna fuente fuera de cauce legal) que no se reabre sin decisión explícita.

Esta propuesta **no contradice esas reglas** — al contrario, todo el diseño de abajo está construido para cumplirlas de forma estricta (agregado por calle, nunca por persona; el sistema notifica, nunca decide ni ejecuta). Pero sí es un **pivote de alcance de producto** (añadir una línea orientada a apoyo policial), y eso, según `CLAUDE.md` §3 y §8, requiere una decisión explícita fuera de una sesión de código antes de que exista ninguna spec real en `specs/`. Este documento es el insumo para tomar esa decisión, no la decisión en sí.

**Recomendación de encaje si se aprueba:** línea de producto separada de VLC Monitor ciudadano, no mezclada en el mismo panel — el propósito de transparencia ciudadana de datos abiertos y el propósito de apoyo operativo policial son públicos distintos, y mezclarlos en una sola interfaz puede erosionar la confianza que sostiene al primero.

---

## 1. El núcleo de la propuesta, en una frase

Un gemelo digital de la red viaria de Valencia (grafo + simulación) combinado con un motor de detección de anomalías sobre **densidad agregada de flujo por calle** (nunca por persona), que correlaciona señales y genera alertas para que las revise una persona — sin biometría, sin identidad, sin automatismo de intervención.

---

## 2. El límite de datos que gobierna todo el diseño

Fijado explícitamente en esta sesión, más estricto en un punto que el propio `CLAUDE.md` §4 (que ya lo prohibía, pero aquí se detalla el cómo):

- **Solo datos agregados por tramo de calle**, en bandas (ej. 1-10 / 11-30 / 31-60 / 60+, o mejor, relativas a la normalidad de esa calle — ver §7), nunca conteo asociado a un dispositivo o persona identificable.
- **Ninguna captación biométrica que salga de un dispositivo**: si hay visión artificial, el conteo se calcula en el propio dispositivo (edge inference) y solo sale un número — nunca una imagen ni un identificador de persona.
- **Fuentes abiertas oficiales primero**, contratos de datos agregados de operadora en paralelo pero como segunda capa, nunca como dependencia inicial.
- **Redes sociales**: solo widgets embebidos de cuentas oficiales (contenido público, ya destinado a difusión pública) — no scraping, no API de pago de X (fuera de alcance ya fijado en `CLAUDE.md` §3), no monitorización de cuentas privadas.

---

## 3. Arquitectura por fases y dependencias

```
Fase 0 (grafo viario + índice espacial H3)
   ├─→ Fase 1 (motor de línea base y anomalías, solo fuentes gratuitas)
   ├─→ Fase 2 (simulador de tráfico: SUMO + surrogate GNN)     [en paralelo a Fase 1]
   └─→ Fase 3 (contrato de datos agregados de operadora)        [arranca en paralelo desde ya, por lead time de procurement/cumplimiento]
Fase 1 + Fase 3 completas → Fase 4 (densificación con cámaras edge, solo donde falta cobertura)
Motor CEP de alertas ← consume Fase 1 (+ Fase 3/4 cuando existan) + feeds oficiales
Auditoría (event sourcing) → transversal, se diseña en Fase 0, no se añade después
```

**Por qué este orden y no otro:**

- El grafo (Fase 0) es prerrequisito estructural de todo lo demás — sin `id_tramo` estable no hay a qué enganchar ningún dato.
- Fase 1 se valida primero solo con fuentes gratuitas para demostrar que la arquitectura de fusión es agnóstica a la fuente, antes de comprometerse a un contrato de pago.
- Fase 3 (contrato de operadora) se **inicia en paralelo desde el día 1** aunque su integración técnica sea tardía, porque el cuello de botella real es el procurement/revisión de cumplimiento (meses), no la ingeniería.
- Fase 4 (cámaras edge) va la última porque es la capa de mayor coste físico de despliegue, y solo tiene sentido priorizarla donde las fases anteriores dejan huecos de cobertura reales.
- La auditoría no es una fase — es un requisito transversal que se diseña en el esquema de datos desde el principio (event sourcing), porque añadirla tarde a un sistema que ya muta estado directamente es un rediseño, no un parche.

---

## 4. Esquema de datos completo

### Nodo

```typescript
interface Nodo {
  id_nodo: string;          // hash determinista de (lat, lng) redondeados a ~1m
  lat: number;
  lng: number;
  tipo_nodo: 'interseccion' | 'rotonda_colapsada' | 'final_via' | 'cruce_peatonal';
  grado: number;
  red: 'rodada' | 'peatonal' | 'ambas';
}
```

### Tramo (`id_tramo`) — entidad central

```typescript
interface Tramo {
  id_tramo: string;              // hash determinista de (nodo_origen_id, nodo_destino_id, red)
  nodo_origen_id: string;
  nodo_destino_id: string;

  geometria: GeoJSON.LineString;
  longitud_m: number;

  red: 'rodada' | 'peatonal';
  tipo_via: 'primaria' | 'secundaria' | 'residencial' | 'peatonal' | 'ciclista';
  sentido: 'unidireccional' | 'bidireccional';
  carriles: number | null;
  capacidad_estimada_veh_h: number | null;

  nombre_calle: string;           // normalizado contra el CDNCV (Generalitat), ver §5
  nombre_calle_raw: string;       // tag `name` original de OSM, solo trazabilidad

  tramo_rodado_asociado_id: string | null;

  version_grafo: string;
  tramo_id_anterior: string | null; // continuidad de histórico entre regeneraciones

  fuente_geometria: string;
  confianza_topologica: 'validado_manual' | 'limpieza_automatica';
}
```

### Índice espacial (tabla de unión, no entidad de negocio)

```typescript
interface TramoH3 {
  id_tramo: string;
  h3_cell: string;        // resolución 9, ~175m
  cobertura: 'completo' | 'parcial';
}
```

### Puntos de extensión ya previstos

```typescript
interface DensidadTramo {
  id_tramo: string; timestamp: string;
  banda: 'baja' | 'media' | 'alta' | 'critica'; // relativa a línea base, no absoluta
  valor_estimado: number; confianza: number; fuente: string;
}

interface EscenarioSimulacion {
  id_escenario: string; tramos_cortados: string[];
  resultado_redistribucion: Record<string, number>;
}

interface Alerta {
  id_alerta: string; tramos_implicados: string[]; severidad: number;
  senales_origen: string[]; timestamp_deteccion: string;
  estado: 'activa' | 'vista_por_humano' | 'escalada' | 'descartada' | 'resuelta';
}
```

---

## 5. Pipeline Fase 0 — extracción y limpieza del grafo

1. **Fuente**: extracto Geofabrik (`europe/spain-latest.osm.pbf`), no Overpass directa — reproducibilidad por fecha fija de snapshot.
2. **Recorte**: `osmium extract` con el polígono municipal (idealmente el mismo GeoJSON de distritos ya usado por otras capas del proyecto, para alineación de bordes).
3. **Dos subgrafos independientes** desde el origen (`network_type='drive'` y filtro custom peatonal con `osmnx`) — no derivar uno del otro, son topológicamente distintos.
4. **Limpieza**: `consolidate_intersections()` con tolerancia calibrada por zona, colapso de rotondas a nodo compuesto, asociación tramo peatonal↔rodado por proximidad + nombre, resolución de nombre contra el **Callejero Digital Normalizado de la Comunitat Valenciana (CDNCV)** — mantenido por el Institut Cartogràfic Valencià y publicado en el portal de datos abiertos de la Generalitat, no un dataset propio del Ayuntamiento como se asumía en la primera versión de este documento (no fiarse del tag `name` crudo de OSM, que mezcla ES/VA de forma inconsistente).
5. **Validación manual** solo en ejes prioritarios (Gran Vía, Avenida del Cid, la ronda) — el resto queda marcado `limpieza_automatica`.
6. **Salida**: GeoJSON de nodos/tramos + índice H3, versionados como artefacto estático en `data/`, siguiendo el patrón seed ya usado en el proyecto — el grafo es casi estático, no vive en la ruta caliente de ninguna función edge.

---

## 6. Vertical slice — YA IMPLEMENTADO (spec `004`, corrección 2026-08-18)

**Corrección importante sobre este propio documento**: la primera pasada de verificación de esta sección (más abajo, versión anterior de §12) se hizo por búsqueda web externa sin mirar antes `specs/INDEX.md`, y dio como "confirmado" el dominio `valencia.opendatasoft.com` — que la propia spec `004`, ya implementada y verificada con una llamada `curl` real, descarta explícitamente por no ser accesible (mismo hallazgo que la spec `000` con distritos). Lección del propio proceso: `specs/` es la fuente de verdad antes que cualquier investigación nueva — así lo fija `CLAUDE.md` §8.1.

**El vertical slice del §6 original no hace falta construirlo: ya existe en producción.**

- Endpoint real verificado: `https://geoportal.valencia.es/server/rest/services/OPENDATA/Trafico/MapServer/192/query?where=1=1&outFields=*&f=geojson` (Geoportal ArcGIS del Ayuntamiento, no el portal OpendataSoft).
- Campos reales: `gid`, `idtramo`, `denominacion`, `estado` (código 0-9), `fiwareid`. Geometría de línea (`LineString`/`MultiLineString`).
- 446 features servidas, 412 tramos útiles tras descartar ~8% con geometría/id nulos (filas vacías del ArcGIS Server).
- Actualización cada 3 minutos, TTL de caché igual, patrón stale-on-error — ya implementado en `src/services/trafico.ts` + `api/trafico/v1/estado.ts`, con tests, y capa visible en el mapa (`src/main.ts`) coloreada por estado con toggle y leyenda.
- Resolución de distrito por tramo ya incluida (406/412 resueltos).

**Lo que esto significa para el resto de la propuesta**: la conciliación segmento-a-segmento contra el grafo OSM de la Fase 0 (§5) sigue teniendo sentido si se construye el grafo completo para el simulador de escenarios (Fase 2), pero el dato de estado de tráfico en sí **no hay que ir a buscarlo ni validarlo** — ya está en `TramoTrafico` (contrato en spec `004` §3), con `idtramo`/`denominacion` propios que se pueden conciliar contra `id_tramo` del grafo por nombre + solape geométrico cuando llegue el momento, no antes.

Dataset hermano pendiente de explorar si hiciera falta intensidad numérica continua (no solo el código categórico `estado`): "Intensitat dels Punts de Mesura de Trànsit (Espires electromagnètiques)", geometría de punto — no verificado todavía, no usado por ninguna spec actual.

**Esto cambia el diseño del vertical slice, corregido aquí:**

- Como el dataset ya trae **tramos propios con id y nombre**, el problema no es *snap* punto→segmento sino **conciliación segmento-a-segmento** entre la segmentación de este dataset y la nuestra derivada de OSM — por nombre normalizado (contra el CDNCV, ver §5) + solape geométrico (ej. distancia de Hausdorff o % de longitud coincidente dentro de un buffer), no por proyección de un punto sobre una línea.
- `Estado` es **categórico**, no un conteo continuo. Para esta fuente concreta, la banda de `DensidadTramo` sale de un mapeo directo del código (`0-1→baja`, `2→alta`, `3→critica`, `4/9→sin_dato`), no de un z-score contra línea base — el modelo de línea base de la Fase 1 (§7) sigue haciendo falta para las fuentes de conteo continuo (aforos de espiras, densidad peatonal), pero no para esta señal categórica en concreto.
- Cobertura parcial frente al grafo OSM completo sigue siendo el resultado esperado — no se interpola donde el dataset no tiene tramo.

**Criterios de éxito**: % de tramos del dataset conciliados con un `id_tramo` propio, inspección visual de una muestra, revisión específica de tramos con nombre ambiguo o duplicado. El objetivo del vertical slice sigue siendo únicamente demostrar que el dato real cae en el tramo correcto — no se activa todavía ni línea base ni alertas.

---

## 7. Fase 1 — motor de línea base y anomalías

- **Cold start**: bandas por percentil simple mientras se acumula histórico (0-4 semanas), z-scores por STL con día×hora (1-3 meses), estacionalidad anual real solo con histórico maduro (meses/años).
- **Eventos singulares conocidos** (Fallas, San Silvestre, partidos) se inyectan como calendario explícito desde el día 1 — no se espera a que el modelo los aprenda solo, porque nunca habrá histórico propio suficiente para eventos anuales en un plazo razonable.
- **Modelo**: GLM Binomial Negativa (maneja sobredispersión de picos de evento mejor que Poisson o regresión lineal), con covariables de día de semana, franja horaria, tipo de día, meteorología y calendario de eventos.
- **Escala a miles de tramos**: pooling jerárquico por `tipo_via` + vecindad H3 — un tramo con poco histórico toma prestada fuerza estadística de tramos similares cercanos, en vez de dar una línea base inestable en solitario.
- **Banda**: umbral heteroscedástico (la varianza esperada varía por tramo y franja horaria, no un σ global) + histéresis temporal (duración mínima sostenida antes de subir o bajar de banda, para evitar parpadeo).
- **Reentrenamiento**: periódico, excluyendo ventanas ya marcadas como anómalas (evita que un evento real contamine la definición futura de "normalidad").
- **Confianza expuesta**: el campo `confianza` de `DensidadTramo` refleja también madurez de histórico, no solo ajuste estadístico — el motor CEP debe poder tratar distinto una banda `critica` de bajo histórico que una de histórico maduro.

---

## 8. Motor CEP de alertas

- **Restricción de infraestructura real**: un CEP clásico (Esper, Flink CEP) asume clúster con estado persistente — incompatible con Vercel edge/serverless ya decidido en `CLAUDE.md` §5. Diseño adaptado: evaluación periódica corta (función edge cada 1-2 min) sobre ventanas de eventos guardadas en Redis sorted sets (`ZADD`/`ZRANGEBYSCORE` por tramo o celda H3).
- **Envelope canónico de evento** para poder correlacionar señales heterogéneas (densidad, keyword de feed oficial, simulación) bajo una forma común.
- **Reglas declarativas** (datos, no código disperso) con relación espacial resuelta vía el índice `TramoH3` de la Fase 0 (mismo tramo / adyacente / radio).
- **Severidad compuesta ponderada por confianza** — nunca suma ni máximo ingenuo de señales coincidentes, para que varias señales débiles no simulen artificialmente una alerta crítica.
- **Idempotencia y cooldown**: clave de deduplicación determinista por tick, y periodo de enfriamiento tras disparo para que una condición sostenida no regenere la misma alerta cada ciclo.
- **Ciclo de vida como máquina de estados** (`activa → vista_por_humano → escalada/descartada → resuelta`), cada transición registrada como evento inmutable — esto es lo que hace verificable el "avisa, no actúa", no solo declarado.
- **Riesgo de coste a escala, detectado en revisión**: evaluar cada tramo en cada tick (miles de tramos × varias llamadas Redis × un tick cada 1-2 min) puede generar del orden de decenas de millones de comandos/día contra Redis — muy por encima de lo que cubre un tier gratuito/hobby de Upstash, que es la caché ya decidida en `CLAUDE.md` §5. Corrección necesaria: evaluación dirigida por eventos, no barrido completo — se mantiene un "conjunto sucio" (los tramos/celdas H3 que han recibido un evento nuevo desde el último tick) y cada ciclo solo evalúa reglas sobre ese subconjunto, no sobre la totalidad del grafo.

---

## 9. Señales de fuentes públicas oficiales

- Widgets oEmbed públicos (`publish.twitter.com`) de cuentas oficiales (Policía Local València, Bomberos, Emergencias 112 CV, DGT, EMT, Aigües de València) para visualización — no requiere API de pago de X, ya fuera de alcance por `CLAUDE.md` §3.
- Detección de palabras clave corre sobre **fuentes estructuradas** (RSS/JSON de 112 CV, avisos AEMET, incidencias DGT, comunicados municipales, canales de Telegram de emergencias), no sobre el DOM del widget embebido — más estable y dentro de ToS.

---

## 10. Lo que queda fuera, siempre, bajo cualquier versión de esta propuesta

Reconocimiento facial o de personas, fusión de identidad con movilidad, cualquier scoring de riesgo sobre personas o colectivos concretos, cualquier automatismo que dispare una intervención sin persona humana en medio, y cualquier fuente de dato fuera de cauce legal explícito. Esto reitera `CLAUDE.md` §4 — no es una relajación de esa regla, es la traducción técnica de cómo se cumple en cada pieza del diseño de arriba.

---

## 11. Siguiente paso

Este documento es el insumo completo para una decisión. Si se aprueba avanzar:

1. Decisión explícita fuera de sesión de código (ADR corto: qué de esto entra en roadmap y con qué prioridad).
2. Reserva de número(s) de spec en `specs/INDEX.md` siguiendo `specs/SPEC_TEMPLATE.md`, separando el grafo/simulador (útil también para VLC Monitor ciudadano: cortes de calle, movilidad) de la parte específicamente orientada a apoyo policial (línea de producto separada, ver §0).
3. Solo entonces arranca el flujo spec-driven habitual de `CLAUDE.md` §2.

---

## 12. Verificación técnica (2026-08-18)

Revisión de contraste contra fuentes reales, hecha a petición explícita antes de dar la propuesta por asentada. No cambia ninguna decisión del ADR-001 — corrige y acota afirmaciones técnicas del propio documento.

| Afirmación | Estado | Nota |
|---|---|---|
| Dato abierto de tráfico en tiempo real de Valencia | ✅ Ya implementado en producción (spec `004`) — corregido tras revisar `specs/` | Mi primera verificación por búsqueda web (`valencia.opendatasoft.com`) resultó ser un dominio ya descartado por la propia spec `004`, verificada con `curl` real contra el Geoportal ArcGIS. Ver §6 para el endpoint y contrato reales. **Lección aplicada**: mirar `specs/INDEX.md` antes de re-verificar por fuera del repo. |
| Motor de alertas "avisa, no actúa" | ✅ Ya implementado en producción (spec `013`) | El motor CEP del §8 de este documento es, en la práctica, una evolución (v2) del motor de insights ya existente (`src/services/insights.ts`, `api/insights/v1/actual.ts`) — reglas por umbral, sin correlación espacial/temporal ni ventanas todavía, "alerta + borrador para copiar, sin envío automático" ya resuelto y probado. No se parte de cero. |
| Densidad de movilidad agregada real y "framing policial" | ✅ Ya anticipado en el roadmap | Spec `011` (Blocked, esperando contrato comercial + revisión de cumplimiento — sin cambios por esta decisión) y spec `012` (Planned, literalmente anotada como "requiere decisión explícita sobre framing 'herramienta policial de campo' antes de pasar a Draft") ya existían para esto — la decisión del ADR-001 es la que spec `012` estaba esperando. |
| "Nomenclátor oficial del Ayuntamiento" | ⚠️ Corregido | La fuente real es el Callejero Digital Normalizado de la Comunitat Valenciana (CDNCV), de la Generalitat/Institut Cartogràfic Valencià, no del Ayuntamiento. Ya corregido en §4 y §5 de este documento. |
| Sintaxis de `osmium extract` por polígono | ⚠️ Precisar antes de codificar | Se hace vía fichero de configuración JSON (`--config=extracts.json`, con un array `extracts` y la región como `polygon`/`bbox`/`multipolygon`), no con un único flag apuntando directo a un GeoJSON como se simplificó en la conversación de diseño previa. No afecta a la viabilidad, sí a la sintaxis exacta a implementar. |
| Tamaño de celda H3 resolución 9 (~175m) | ✅ Confirmado | Tabla oficial h3geo.org: arista media ≈174m, área media ≈0,105 km². La cifra usada en §4 es correcta. |
| Telefónica Smart Steps / Orange Flux Vision como productos activos | ✅ Confirmado | Ambos documentados como activos en 2025, movilidad agregada/anonimizada, encaja con el uso descrito en §2 y Fase 3. |
| "Vodafone Analytics" como producto equivalente | ❓ No confirmado | No se ha encontrado confirmación directa del nombre comercial vigente. Antes de incluirlo en cualquier spec de Fase 3, confirmar el producto y nombre actual de Vodafone para este caso de uso. |

**Pendiente de verificar con una llamada real antes de escribir código** (tal como exige `CLAUDE.md` §8.2, y no antes): disponibilidad de un feed GTFS-RT de EMT si se usa como proxy de afluencia, y los canales RSS/Telegram concretos de 112 CV y AEMET mencionados en §9 — ninguno de estos se ha confirmado con una llamada real todavía, solo con búsqueda de que el portal/organismo existe. El dataset de tráfico (fila anterior) ya está confirmado y detallado en §6.

**El mayor riesgo técnico genuino de toda la propuesta** no es un dato por confirmar, es de naturaleza distinta: el modelo sustituto (surrogate GNN) del simulador de tráfico en la Fase 2. El resto del diseño es ingeniería de datos/software convencional con patrones ya probados; esto es un componente de investigación aplicada — requiere generar un dataset de entrenamiento con miles de corridas de SUMO, validar que el sustituto generaliza a escenarios no vistos, y mantenerlo cuando el grafo cambie. Es viable (el patrón está respaldado en literatura de simulación de tráfico), pero si la Fase 2 se aprueba conviene presupuestarlo como tiempo de I+D, no como desarrollo estándar — es el único punto de todo el diseño donde "viable" no significa "de alcance predecible".

Sources: [Valencia | datos.gob.es](https://datos.gob.es/es/etiquetas/valencia), [València al minut](https://www.valencia.es/es/web/valenciaalminut), [Open Data Valencia](https://opendata.vlci.valencia.es/), [Callejero Digital Normalizado de la Comunitat Valenciana](https://dadesobertes.gva.es/es/dataset/callejero-digital-normalizado-de-la-comunitat-valenciana), [osmium-extract manual](https://docs.osmcode.org/osmium/latest/osmium-extract.html), [Table of Cell Areas for H3 Resolutions](https://h3geo.org/docs/core-library/restable/), [Smart Steps – Telefónica Tech](https://telefonicatech.com/en/news/smart-steps-telefonica-techs-platform-for-crowd-mobility-analysis), [Flux Vision – Orange Business](https://www.orange-business.com/en/solutions/flux-vision)
