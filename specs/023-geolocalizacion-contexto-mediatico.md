# 023 — Geolocalización de contexto mediático por distrito

```yaml
id: 023
titulo: "Geolocalización de contexto mediático por distrito (matching de texto, sin IA)"
estado: Implemented
tipo: capa
depende_de: [000, 009]
propietario: ""
version: 4
```

## 1. Problema / motivación

El panel de contexto mediático (spec [009](009-contexto-mediatico.md)) ya trae titulares de RSS + GDELT, pero no dice **a qué distrito afecta cada uno** — un mando tiene que leer el titular entero para saber si le importa a su zona. La pregunta que responde esta spec: "de estas noticias, ¿cuáles mencionan mi distrito o alguno de sus barrios?".

No es una capa de detección de eventos nueva ni un modelo de NER entrenado: es un **matching de texto determinista** contra una lista ya oficial y cerrada (nombres de los 19 distritos + sus barrios, ya presentes en `data/distritos-valencia.json` vía la spec [000](000-mapa-base-distritos.md)). Cero coste, cero dependencia externa nueva, cero ambigüedad de "qué modelo se usó".

**Límite explícito (CLAUDE.md §4):** esto asocia **texto público de prensa** a una **zona geográfica**, nunca a una persona. Si un titular menciona dos distritos, se listan los dos — nunca se fuerza una única atribución para aparentar más precisión de la que hay.

## 2. Fuente(s) de datos

| Fuente | Origen | Verificada manualmente el ___ |
|---|---|---|
| `ItemMediatico[]` (título + resumen) | Ya cacheado por spec 009, `GET /api/mediatico/v1/items` | Ya verificado en 009 |
| Nombres de distrito | Ya cacheado por spec 000, `data/distritos-valencia.json` | Ya verificado en 000 |
| Listado oficial de los 88 barrios de Valencia y su distrito | Geoportal ArcGIS del Ayuntamiento, `https://geoportal.valencia.es/server/rest/services/OPENDATA/UrbanismoEInfraestructuras/MapServer/224/query?where=1=1&outFields=*&f=geojson` — misma fuente que localizó y verificó (solo existencia/formato) la spec 000 §2, cuya ingesta se pospuso explícitamente a "una spec futura" | **Re-verificada 2026-08-26** — `curl` real, HTTP 200, GeoJSON válido, 88 features. Campos reales: `codbarrio`, `nombre` (mayúsculas), `coddistbar`, `coddistrit` (sin cero a la izquierda, igual que distritos en spec 000). Solo se usan `nombre` + `coddistrit`; no se ingiere la geometría de barrio en esta spec (no hace falta para matching de texto — si algún día se necesita point-in-polygon a nivel barrio, es una spec aparte que reutiliza esta misma fuente) |

**Hallazgo al verificar el estado actual (2026-08-26):** el campo `barrios: string[]` que la spec [000](000-mapa-base-distritos.md) ya declaraba en el tipo `Distrito` está **vacío en los 19 distritos** (comprobado leyendo `data/distritos-valencia.json` directamente, no solo el tipo). Sin barrios reales, el matching solo contra nombre de distrito tiene cobertura muy baja: la prensa casi nunca usa el nombre oficial de distrito ("l'Olivereta", "Quatre Carreres") — usa el nombre del barrio ("Russafa", "el Cabanyal", "Malvarrosa"). Poblar `barrios` con el listado oficial es, por tanto, parte del alcance de esta spec (extiende un dato ya declarado por la 000, no le cambia el contrato) y no una spec aparte — es un dato estático, gratuito y sin pipeline propio.

**Alias de barrio:** el mismo barrio se escribe distinto en prensa castellana y valenciana (ej. "Russafa"/"Ruzafa", "Natzaret"/"Nazaret", "Cabanyal-Canyamelar"/"Cabañal"). Cada barrio necesita, además de su nombre oficial, una lista corta de alias conocidos — a completar manualmente al poblar el dato, no de forma automática.

**Revisión de ambigüedad (hecha sobre los 19 distritos + 88 barrios reales, no como trabajo pendiente):**

| Nombre | Distrito | Por qué es ambiguo |
|---|---|---|
| Jesus | 09 (distrito) | Nombre propio/religioso de altísima frecuencia sin relación geográfica |
| Sant Isidre | 08 Patraix | Colisiona con la Feria de San Isidro (Madrid) y el nombre propio común |
| Sant Antoni | 05 La Saidia | Santoral muy común (fiestas de San Antón en múltiples ciudades) |
| Sant Francesc | 01 Ciutat Vella | Colisiona con la ciudad de San Francisco (EE.UU.) en cobertura de GDELT |
| Sant Pau | 04 Campanar | Colisiona con el Hospital de Sant Pau (Barcelona), muy citado en prensa nacional |
| Sant Llorens | 15 Rascanya | Santoral común, colisiona con El Escorial de San Lorenzo |
| La Seu | 01 Ciutat Vella | "Seu" es palabra genérica en valenciano para "sede" (seu social, seu electoral) |
| El Pilar | 01 Ciutat Vella | Colisiona con la Virgen del Pilar / Zaragoza, festividad nacional (12 de octubre) |
| La Torre | 19 Poblats del Sud | Sustantivo común genérico ("torre" en cualquier sentido) |
| La Llum | 07 l'Olivereta | Sustantivo común genérico ("la luz" en valenciano) |
| Cami Real | 09 Jesus | "Camino real" es expresión genérica frecuente sin relación con Valencia |
| Morvedre | 05 La Saidia | Nombre valenciano alternativo del municipio de Sagunto, con cobertura mediática propia y distinta |
| La Punta | 10 Quatre Carreres | Sustantivo común genérico |
| Exposicio | 06 El Pla del Real | Sustantivo común genérico en valenciano ("exposició" de arte, etc.) |
| La Gran Via | 02 l'Eixample | Patrón de nombre de calle genérico, colisiona con la Gran Vía de Madrid en cobertura nacional |

El resto (92 de 107 nombres) se revisa y queda `ambiguo: false` — nombres suficientemente distintivos (ej. "Russafa", "Benimaclet", "Cabanyal-Canyamelar", "Malilla", "Patraix").

## 3. Contrato de datos (normalizado)

Extiende el tipo `Distrito` de la spec 000 (el campo ya existía declarado, se pasa de `string[]` a una forma más rica porque un nombre de barrio suelto no basta para manejar alias ni ambigüedad):

```typescript
interface Distrito {
  // ...campos existentes de la spec 000 sin cambios (codigo, nombre, geometry, centroide, bbox, fetchedAt, source)...
  barrios: BarrioInfo[];   // antes string[] — ver justificación arriba
}

interface BarrioInfo {
  nombre: string;
  alias: string[];          // variantes conocidas (castellano/valenciano), [] si no aplica
  ambiguo: boolean;          // true si el nombre colisiona con una palabra/nombre propio común (ver §7)
}
```

Y extiende el `ItemMediatico` de la spec 009 (no lo sustituye — es un campo añadido en el mismo objeto):

```typescript
interface ItemMediatico {
  // ...campos existentes de la spec 009 sin cambios...
  distritosMencionados: DistritoMencion[];  // [] si no hay coincidencia — nunca null
}

interface DistritoMencion {
  distritoCodigo: string;   // código oficial, ej. '01'
  distritoNombre: string;
  coincidencia: 'distrito' | 'barrio';  // por qué texto coincidió, para poder auditar falsos positivos
  textoCoincidente: string;              // el nombre o alias exacto que hizo match, para depurar
  bajaConfianza: boolean;                 // true si el match solo pasó gracias a la guarda de contexto de un nombre `ambiguo` (ver §7) — señal para que la UI lo atenúe si hace falta
}
```

**Reglas de matching:**

- Se buscan coincidencias en `titulo + ' ' + (resumen ?? '')`, normalizando acentos/mayúsculas igual que `normalizeForSearch` en `district-geometry.ts` (se exporta esa función en vez de duplicarla).
- Para nombres/alias marcados `ambiguo: true`, no basta la palabra suelta: debe ir precedida de uno de un conjunto fijo de marcadores geográficos ("barrio de", "districte de", "distrito de", "zona de", "vecinos de", "residentes de"). Si pasa solo por esta vía, `bajaConfianza: true`.
- Si el mismo distrito coincide por nombre de distrito y por uno de sus barrios/alias en el mismo ítem, se deduplica dejando la entrada más específica (`barrio`).
- Precomputar una sola vez (al cargar los distritos, no en cada request) una tabla plana de patrones `{patrón normalizado, distritoCodigo, distritoNombre, tipo, ambiguo}` ordenada por longitud de patrón descendente — evita normalizar el listado de distritos/barrios en cada uno de los ~30 ítems que se procesan cada 15 min, y prioriza coincidencias más específicas si un patrón fuera substring de otro.

## 4. Pipeline (seed → caché → endpoint)

No hay pipeline nuevo — es un paso de enriquecimiento **puro y sin estado** aplicado dentro de la normalización ya existente de `src/services/mediatico.ts`, antes de cachear. No añade llamadas de red, no cambia TTL ni frecuencia de refresco de la spec 009.

| Parámetro | Valor |
|---|---|
| Frecuencia de refresco (cron) | La misma de 009 (15 min) — el matching corre en cada refresco, no es una llamada aparte |
| TTL en caché | La misma de 009 — `distritosMencionados` viaja dentro del mismo objeto cacheado |
| Comportamiento si la fuente falla | N/A — no hay fuente propia; si 009 sirve un ítem, este campo siempre se calcula sobre él |
| Clave de caché | La misma de 009 (`mediatico:valencia-items:v1`) |
| Endpoint interno que sirve el dato | El mismo de 009 (`GET /api/mediatico/v1/items`), con el campo nuevo en la respuesta |

## 5. Contrato de capa de mapa

Sigue siendo un panel (no geoespacial en el mapa, v1 — ver §7 fast-follow):

```typescript
{
  key: 'contextoMediatico',   // sin cambios, misma capa de la spec 009
  renderers: ['panel'],
  zoomMinimo: 0,
  agregacion: 'lista',
  icono: '',
}
```

Cada ítem del panel de lista muestra, si aplica, uno o más chips pequeños con el nombre del distrito coincidente (ej. "Ciutat Vella", "Benimaclet"). Los ítems se agrupan en el panel en dos bloques: uno por cada distrito con al menos una mención, y un bloque **"Valencia (general)"** al final con los ítems de `distritosMencionados: []` — no se pierden ni se muestran sueltos sin contexto, pasan a ser la señal de ciudad-completa (ej. anuncios municipales que no citan un barrio concreto).

## 6. Criterios de aceptación (Definition of Done)

- [x] Listado oficial de los 88 barrios verificado con una descarga real (§2, `curl` 2026-08-26) y volcado a `data/distritos-valencia.json` vía `scripts/seed-distritos.mjs` (ahora también descarga `MapServer/224`), con `alias`/`ambiguo` poblados a mano en tablas de override del propio script.
- [x] Revisión manual de los 19 distritos + 88 barrios contra colisiones conocidas trasladada al dato: `AMBIGUOUS_DISTRICT_CODES`/`AMBIGUOUS_BARRIO_NAMES` en `scripts/seed-distritos.mjs`, verificado en el JSON generado (distrito 09 "Jesus" y los 14 barrios de la tabla de §2 con `ambiguo: true`).
- [x] Tabla de patrones precomputada (una vez, memoizada) con `{patrón, distritoCodigo, tipo, ambiguo}`, ordenada por longitud descendente — `construirTablaPatrones`/`getTablaPatrones` en `src/services/geolocalizacion-texto.ts`.
- [x] Función `findDistrictMentions(texto: string): DistritoMencion[]` en módulo nuevo `src/services/geolocalizacion-texto.ts`, determinista, sin llamadas externas.
- [x] `normalizeForSearch` exportado desde `district-geometry.ts` en vez de reimplementado.
- [x] Guarda de contexto para nombres `ambiguo: true` implementada y testeada (8 tests en `geolocalizacion-texto.test.ts`): sin marcador geográfico precedente, no hay match; con él, hay match y `bajaConfianza: true`.
- [x] `mediatico.ts` aplica `enrichWithDistricts` a cada `ItemMediatico` (dentro de `parsearRss`/`fetchGdeltValencia`, antes de cachear) y añade `distritosMencionados` al contrato de §3.
- [x] Tests con casos reales (`geolocalizacion-texto.test.ts`, 8/8): nombre de distrito exacto, nombre/alias de barrio, sin coincidencia, dos distritos distintos sin colapsar, "Jesús" sin marcador (sin match), "barrio de Jesús" (`bajaConfianza: true`).
- [x] Test de deduplicación: mismo distrito citado por nombre de distrito y por barrio en el mismo ítem → una sola entrada `coincidencia: 'barrio'`.
- [x] UI: chip(s) de distrito por ítem en el panel de contexto mediático (`renderItemMediatico`/`renderGrupoMediatico`, `src/main.ts`), estilo atenuado (ámbar) para `bajaConfianza: true` vs azul normal — verificado visualmente en navegador (inyección de prueba con Benimaclet + Jesus).
- [x] Ninguna llamada de red nueva en el pipeline de refresco habitual (barrios se descargan una sola vez, en el seed); `distritosMencionados` viaja dentro del mismo objeto cacheado de la spec 009, sin caché nueva.

## 7. Riesgos y fuera de alcance

- **Riesgo confirmado, no hipotético — "Jesus":** el distrito 09 se llama literalmente "Jesus", una palabra/nombre de altísima frecuencia en español sin relación geográfica en la inmensa mayoría de apariciones. Mitigado con la guarda de contexto de §3/§6. Al poblar los 88 barrios reales aparecerán más casos así (ej. "Sant Isidre" colisiona con la Feria de San Isidro de Madrid) — cada uno se revisa y marca al poblar el dato, no se descubre en producción.
- **Riesgo — cobertura parcial:** muchas noticias no mencionarán ningún distrito/barrio por nombre explícito (ej. "el Ayuntamiento anuncia...") — es esperado, no es un fallo del matching, simplemente esos ítems quedan con `distritosMencionados: []`.
- **Riesgo — variantes no cubiertas:** un alias no incluido en la lista manual (ej. un apodo coloquial poco frecuente de un barrio) simplemente no genera match — se acepta como límite de un enfoque determinista; si se observa en producción un alias común que falta, se añade a la lista (dato, no código).
- **Fuera de alcance de esta versión:** marcadores en el mapa por distrito mencionado (fast-follow, spec futura si esto resulta útil en producción), cualquier NER entrenado o modelo de lenguaje, matching difuso/fuzzy (errores tipográficos), inferencia de coordenadas exactas (solo se resuelve a nivel distrito/barrio, nunca a una dirección o punto), cruzar esto con la posición del usuario de la spec 012 (no se toca esa spec en absoluto).

## 8. Historial

| Versión | Fecha | Cambio |
|---|---|---|
| 1 | 2026-08-26 | Creación (Draft) — contrato de datos y de capa propuestos, pendiente de aprobación antes de implementar. |
| 2 | 2026-08-26 | Revisión de diseño: se descubre que `barrios` (declarado en spec 000) está vacío en los 19 distritos — se incorpora a esta spec poblarlo con alias, en vez de asumirlo disponible. Se descubre colisión real ("Jesus", distrito 09) y se añade guarda de contexto + campo `ambiguo`/`bajaConfianza` al contrato. Se añade arquitectura de tabla de patrones precomputada. |
| 3 | 2026-08-26 | Verificación real de la fuente de barrios (§2, `MapServer/224`, ya localizada por la spec 000 pero con ingesta pospuesta) — HTTP 200, 88 barrios confirmados. Revisión de ambigüedad completa sobre los 107 nombres reales (19 distritos + 88 barrios): 15 marcados `ambiguo: true` con justificación. Contrato de datos considerado congelado — lista para `Approved` si se confirma el enfoque. |
| 4 | 2026-08-26 | DoD completo: `scripts/seed-distritos.mjs` amplía el seed para descargar y fusionar los 88 barrios reales (con tablas de override de display/alias/ambiguo); `Distrito.barrios` pasa a `BarrioInfo[]` y se añade `Distrito.ambiguo` (`district-geometry.ts`); nuevo `src/services/geolocalizacion-texto.ts` con matching determinista + guarda de contexto (8 tests); `mediatico.ts` enriquece cada `ItemMediatico` con `distritosMencionados` antes de cachear; `api/mediatico/v1/items.ts` carga los distritos al inicio del módulo (mismo patrón que `api/trafico/v1/estado.ts`); panel de contexto mediático agrupado por distrito + bloque "Valencia (general)", con chips (normal/baja confianza) en `src/main.ts` + `index.html`. Verificado con `npm run typecheck`, `npm run test` (179/179), `npm run build` y en navegador (grupo "Valencia (general)" con datos reales del día, chips verificados con inyección de prueba). Spec pasa a `Implemented`. |
