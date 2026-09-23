# 048 — Avisos oficiales de movilidad (incidencias y previsiones, valencia.es)

```yaml
id: 048
titulo: "Avisos oficiales de movilidad — incidencias y previsiones (valencia.es)"
estado: Implemented
tipo: capa
depende_de: [000]
propietario: ""
version: 2
```

## 0. Petición del usuario y decisiones de alcance (2026-09-23)

Petición: añadir de forma indispensable la información de
`https://www.valencia.es/cas/movilidad/incidencias-y-previsiones`, actualizada igual que
la fuente. Antes de escribir código se investigó solapamiento con lo ya `Implemented`:

- **"Incidencias" (obras)** de esta página solapa parcialmente con la spec
  [026](026-incidencias-via-publica.md) (capa "Ocupación de vía pública" del Geoportal,
  499 registros, coordenadas exactas), pero **no es redundante al 100%**: esta página
  recoge un puñado de obras estratégicas comunicadas por prensa del área de Movilidad
  (reurbanizaciones grandes, ej. "Calle Colón", "Pérez Galdós-Giorgeta") que no siempre
  coinciden con el listado de permisos del Geoportal — es una fuente curada por el propio
  Ayuntamiento, complementaria, no un duplicado.
- **"Previsiones" (eventos con corte de tráfico)** no está cubierta por ninguna spec.
  La spec [008](008-agenda-aglomeraciones-fallas.md) deja la "agenda general" como
  fast-follow explícito. La spec [027](027-agenda-eventos-scraping.md) v4 ya cubre
  eventos con impacto en vía pública (fútbol, Roig Arena, carreras) pero **infiere** el
  impacto a partir del calendario del evento — esta página da el **detalle oficial del
  corte** (calle exacta, franja horaria, plano adjunto), un nivel de información que 027
  no tiene y no pretende tener (ver spec 027 §7, "ninguna fuente identifica cortes de
  tráfico reales").

**Decisión del usuario (AskUserQuestion, 2026-09-23):** alcance completo — ambas secciones
("Incidencias" + "Previsiones"), con coordenadas además del texto, presentado como panel
de texto en `/inteligencia` (mismo patrón que avisos-meteo, spec 001, o la agenda, spec
027) — sin capa de mapa con puntos ni integración en el motor de insights en esta versión
(ver §7, fuera de alcance).

## 1. Problema / motivación

¿Qué obras grandes y qué eventos van a cortar una calle concreta, con cuándo y por dónde,
según la propia comunicación oficial de Movilidad? Ni 026 (permisos administrativos, sin
curación editorial) ni 027 (agenda cultural/deportiva inferida) dan ese detalle operativo
con la voz oficial del Ayuntamiento.

## 2. Fuente(s) de datos

| Fuente | URL | Licencia / condiciones | ¿Requiere API key? | Verificada manualmente el ___ |
|---|---|---|---|---|
| Incidencias y previsiones de movilidad | `https://www.valencia.es/cas/movilidad/incidencias-y-previsiones` | Contenido institucional público del Ayuntamiento de València | No | **Verificada 2026-09-23** — HTML servido en la respuesta inicial (Liferay, portlet `FrontMovilidadIncidenciasPrevisiones`), **sin JavaScript** (a diferencia de la agenda de spec 027, que sí lo necesita). `curl`/`fetch` reales con el mismo `User-Agent` identificable que ya usa la spec 001 (`vlc-monitor/1.0 (+https://github.com/)`, sin cabeceras adicionales) → HTTP 200, 2 secciones ("Incidencias"/"Previsiones") con 4 ítems cada una en la captura de verificación. Un `curl` con user-agent vacío/por defecto es rechazado por un WAF (`HTTP 503 "Request Rejected"`) — mitigación básica de bots, no un bloqueo real: basta con un UA identificable, igual que ya exige en la práctica la fuente de spec 001. |

**`robots.txt` de `valencia.es`** (mismo dominio que spec 027 §2): `Disallow: /-/` con
excepción `Allow: /-/content/`, más un puñado de rutas de organismos concretos
(`/web/aumsa`, `/web/emt`, etc.) — ninguna regla afecta a `/cas/movilidad/...`. Ruta
permitida.

**Hallazgo real durante la implementación — el campo de fecha varía de formato entre
peticiones:** verificado con dos clientes HTTP distintos contra la misma URL en la misma
ventana de minutos — uno recibió el timestamp sin formatear del HTML crudo (`YYYY-MM-DD
HH:MM:SS.0`, presumible salida directa de base de datos) y el otro el mismo campo ya
formateado como lo ve una persona en pantalla (`DD-MM-YYYY`), probablemente instancias de
aplicación no sincronizadas detrás del balanceador de `valencia.es`. El parser (§6) acepta
explícitamente ambos formatos — no es seguro asumir uno solo en producción, aunque una
captura puntual solo muestre uno.

## 3. Contrato de datos (normalizado)

```typescript
type TipoAvisoMovilidad = 'incidencia' | 'prevision'; // 'incidencia' = sección "Incidencias" (obras), 'prevision' = sección "Previsiones" (eventos)

interface AvisoMovilidad {
  id: string;                  // hash estable de tipo+fechaPublicacion+descripcion (la fuente no da id propio)
  tipo: TipoAvisoMovilidad;
  fechaPublicacion: string;      // ISO 8601 — de la fecha "DD-MM-YYYY" que precede cada ítem en origen
  descripcion: string;            // texto completo del ítem, tal cual lo redacta el Ayuntamiento
  planoUrl: string | null;         // enlace al plano/imagen adjunto (jpg/pdf) cuando el ítem lo incluye — frecuente en "Previsiones", casi nunca en "Incidencias"
  lugar: string | null;             // nombre del lugar/vía resuelto contra el lookup curado de §3.1, null si no hay coincidencia
  lat: number | null;
  lon: number | null;
  fetchedAt: string;
  source: 'ajuntament-valencia-movilidad-incidencias-previsiones';
}

interface SnapshotAvisosMovilidad {
  avisos: AvisoMovilidad[];
  fetchedAt: string;
}
```

### 3.1 Resolución de coordenadas — lookup curado, no geocodificación exhaustiva

El texto de origen no trae coordenadas, solo nombres de calle/instalación en prosa libre.
Se descarta cargar el grafo viario completo (spec 020, `red-viaria-rodada.json`, ~9 MB)
en el endpoint: ese fichero está pensado para consumo **solo desde cliente**
(`grafo-viario-cliente.ts`), no para una función servidor — cargarlo ahí rompería el
límite de tamaño de función ya documentado en `CLAUDE.md` §6 (motivo por el que ese mismo
fichero vive en `public/data/`, no en `data/`).

En su lugar: `data/lugares-movilidad-valencia.json`, lista curada a mano de lugares
recurrentes en esta fuente (grandes vías, instalaciones que acogen eventos), cada uno con
uno o más alias de texto + coordenada, verificada contra Nominatim/OpenStreetMap
(gratis, sin key, mismo proveedor de datos que ya usa el grafo viario de spec 020):

```typescript
interface LugarMovilidad {
  alias: string[];   // fragmentos normalizados (sin acentos, minúsculas) a buscar en la descripción
  lugar: string;       // nombre para mostrar
  lat: number;
  lon: number;
}
```

El primer alias que aparece como coincidencia de palabra completa (no subcadena suelta,
para evitar falsos positivos tipo "colon" dentro de otra palabra) en la descripción
normalizada fija `lugar`/`lat`/`lon` — **el orden del fichero importa**: una calle concreta
(ej. "Enginyer Manuel Soto") va antes que el recinto genérico que la rodea (ej. "Marina de
València") para que gane la referencia más precisa cuando ambas aparecen en el mismo texto.
Cobertura inicial (16 lugares, verificados contra Nominatim/OpenStreetMap el 2026-09-23):
Roig Arena, Estadi de Mestalla, Estadi Ciutat de València, Marina de València/Tinglados,
Ciutat de les Arts i les Ciències, y las avenidas/calles que aparecen en la verificación en
vivo — Enginyer Manuel Soto, Doctor Moliner, Blasco Ibáñez, Colón, Doctor Peset Aleixandre,
Camí de Montcada, Pérez Galdós, Giorgeta, Russafa, Porta de la Mar, Plaça de l'Ajuntament.
**Fichero ampliable sin tocar código** — sin coincidencia, el ítem se sirve igual con
`lugar`/`lat`/`lon` a `null` (nunca se oculta ni se bloquea el resto del pipeline por un
lugar no reconocido, mismo principio de degradación que spec 026).

## 4. Pipeline (seed → caché → endpoint)

| Parámetro | Valor |
|---|---|
| Frecuencia de refresco (cron) | 6h — igual cadencia que specs 008/027 (contenido editorial de baja frecuencia, no en tiempo real). |
| TTL en caché | 6h. |
| Comportamiento si la fuente falla | Stale-on-error vía `getOrFetch()`, mismo patrón que el resto de specs. Sin necesidad del criterio de "estructura sospechosa" de spec 027 (HTML mucho más simple y estable, dos bloques `<h3 class="bloque_subtitulo">`) — si el parser no encuentra ninguna de las dos secciones se trata como fallo de fuente (no se sobrescribe caché con snapshot vacío), igual criterio que 027 aplicado con una detección más simple. |
| Clave de caché | `movilidad:avisos-incidencias-previsiones:v1` |
| Fetch | `fetch()` simple con el mismo `HEADERS` (`User-Agent: vlc-monitor/1.0 (+https://github.com/)`) que ya usa `avisos-meteo.ts` (spec 001) — **sin Playwright**, a diferencia de spec 027: el HTML llega completo en la respuesta inicial (§2). |
| Endpoint interno que sirve el dato | `GET /api/movilidad/v1/avisos-incidencias-previsiones` |

## 5. Contrato de capa de mapa

```typescript
{
  key: 'avisosMovilidad',
  specId: '048',
  grupo: 'contexto',
  renderers: ['panel'],   // panel de texto en /inteligencia — sin puntos en el mapa, ver §0
  zoomMinimo: 0,
  agregacion: 'lista',
}
```

Panel de texto (mismo patrón visual que agenda-panel de spec 027): dos bloques, Previsiones
primero y luego Incidencias, cada uno ordenado descendente por `fechaPublicacion`, con el
`lugar` resuelto si lo hay, enlace "Ver plano" cuando `planoUrl` existe, franja de aviso de
scraping (no API oficial). Toggle siempre activo (patrón `toggleSiempreActivo()`, igual que
cámaras/agenda) — visible siempre que se entra en `/inteligencia`.

## 6. Criterios de aceptación (Definition of Done)

- [x] Parser por regex del HTML (`src/services/movilidad-incidencias-previsiones.ts`) — separa por `<h3 class="bloque_subtitulo">` (no por un cierre de `</div>` genérico: se probó primero y cortaba antes de tiempo, ver historial), trocea por `<span class="bloque_enlace">`, funciones puras testeadas (11 tests), mismo estilo minimalista que `avisos-meteo.ts`/`agenda-eventos.ts`.
- [x] Normalización de fecha a ISO 8601 — **acepta ambos formatos reales observados** (`YYYY-MM-DD HH:MM:SS.0` crudo y `DD-MM-YYYY` ya formateado, ver hallazgo de §2), no solo el de la primera captura.
- [x] Resolución de `lugar`/`lat`/`lon` contra `data/lugares-movilidad-valencia.json` (§3.1), por coincidencia de palabra completa e insensible a acentos — testeada con acierto, no-coincidencia (`null`) y el caso de precisión (calle concreta gana al recinto genérico).
- [x] Endpoint `GET /api/movilidad/v1/avisos-incidencias-previsiones` responde con el contrato de §3, cacheado con TTL de 6h y stale-on-error vía `getOrFetch()` (mismo patrón que el resto de endpoints).
- [x] Panel visible en `/inteligencia` (oculto en `/mapa`, verificado en ambas vistas), dos bloques por tipo, aviso persistente de scraping (franja, no letra pequeña) — verificado en navegador con datos reales (4 previsiones + 4 incidencias).
- [x] Atribución de fuente y frescura visibles (`metaFrescura`, mismo patrón que el resto de paneles).
- [x] Fuente probada con llamadas reales contra el sitio en vivo (`curl` y `fetch()` de Node, no solo fixtures) — verificación repetida encontró la inconsistencia de formato de fecha de §2, incorporada al parser antes de cerrar la spec.
- [x] `npm run typecheck` / `npm run test` (464/464) / `npm run build` verdes.

## 7. Riesgos y fuera de alcance

- **Riesgo — fragilidad de estructura**, igual que cualquier scraping (specs 001/027): un
  rediseño de la página rompe los selectores. Mitigado con el criterio de fallo de §4
  (no se sobrescribe un snapshot bueno con uno vacío), no eliminado.
- **Riesgo — la fuente sirve contenido inconsistente entre peticiones (confirmado, no
  hipotético)**: el campo de fecha llega en dos formatos distintos según qué instancia de
  `valencia.es` responda (§2). Mitigado aceptando ambos formatos explícitamente en el
  parser; si aparece un tercer formato no contemplado, el ítem afectado se descarta (fecha
  no parseable) sin romper el resto del snapshot — no se ha observado ninguna otra
  variación (secciones, selectores) más allá de la fecha.
- **Riesgo — cobertura parcial del lookup de lugares (§3.1) aceptado explícitamente**: no
  es un geocodificador, es una lista curada y ampliable. Un lugar nuevo no reconocido se
  sirve igual, sin coordenadas, sin bloquear el resto — igual principio que spec 026 con
  incidencias sin distrito resuelto.
- **Fuera de alcance de esta versión** (decisión explícita del usuario en §0): capa de
  mapa con puntos geolocalizados (queda como posible fast-follow si el lookup de lugares
  crece lo bastante como para que valga la pena); integración con el motor de insights
  (specs 013/024) o con el panel de apoyo a decisión (spec 041); deduplicación cruzada con
  las incidencias de spec 026 o los eventos de spec 027 (se muestran como fuentes
  independientes, sin intentar fusionar registros de fuentes distintas sin un identificador
  común fiable).

## 8. Historial

| Versión | Fecha | Cambio |
|---|---|---|
| 1 | 2026-09-23 | Creación (Draft) — fuente verificada en vivo (HTML sin JS, `curl` real con UA identificable, 200, 2 secciones/8 ítems en la captura), solapamiento con specs 026/027 analizado y documentado como complementario no redundante, alcance y presentación decididos explícitamente por el usuario (§0). Contrato de datos y de capa listos para implementar. |
| 2 | 2026-09-23 | **DoD completo, pasa a `Implemented`.** `src/services/movilidad-incidencias-previsiones.ts` (parser + resolución de lugar, 11 tests) + `data/lugares-movilidad-valencia.json` (16 lugares curados, verificados contra Nominatim/OpenStreetMap). Endpoint `GET /api/movilidad/v1/avisos-incidencias-previsiones` (`src/server/movilidad-avisos.ts`, registrado en `_router-src.ts`), capa `avisosMovilidad` en `map-layer-definitions.ts` (`grupo: 'contexto'`) + entrada en el glosario (spec 037). Panel en `/inteligencia` (`main.ts`, mismo patrón que agenda-panel de spec 027). **Dos bugs reales corregidos durante la implementación, no anticipados en el Draft:** (1) el troceo de sección por cierre de `</div>` genérico cortaba antes de tiempo (los `</div>` de cierre se repiten dentro de la propia sección) — se cambió a dividir por los propios `<h3 class="bloque_subtitulo">`, verificado contra la respuesta real hasta obtener el recuento exacto (4+4 ítems); (2) **la fuente sirve la fecha en dos formatos distintos según qué instancia de `valencia.es` responda** — descubierto al comparar una verificación por `curl` (timestamp crudo `YYYY-MM-DD HH:MM:SS.0`) con una por `fetch()` de Node (mismo UA, mismos segundos, `DD-MM-YYYY` ya formateado) contra la misma URL; el parser se corrigió para aceptar ambos antes de cerrar la spec, con test de regresión para el formato no visto en la primera captura. 464/464 tests, `typecheck`/`build` verdes, verificado en navegador (`/inteligencia` con 4 previsiones + 4 incidencias reales, lugar resuelto correctamente incl. el caso de precisión calle-concreta-vs-recinto; oculto en `/mapa`). |
