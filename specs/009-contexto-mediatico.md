# 009 — Contexto mediático

```yaml
id: 009
titulo: "Contexto mediático — RSS locales + Google News por medio, con filtro Valencia-ciudad estricto sobre todas las fuentes"
estado: Implemented
tipo: panel
depende_de: [000, 023]
propietario: ""
version: 5
```

## 1. Problema / motivación

Al "qué" del mapa (tráfico, aire, meteo...) le falta el "por qué": ¿hay una noticia que explique por qué un distrito está tenso ahora mismo? `ROADMAP.md` (F4) lo define como RSS de medios locales + GDELT filtrado por Valencia + Reddit como señal secundaria.

**Requisito reforzado (v4, petición del usuario 2026-09-01):** el panel debe (a) agregar **cuantos periódicos locales sea viable** y (b) mostrar **solo noticias de la ciudad de València** — nada de Comunitat Valenciana, provincia, otros municipios del área metropolitana ni Valencia (Venezuela). La v3 solo filtraba GDELT porque asumía que "las RSS ya están scoped a medios locales". **Esa premisa es falsa y está verificada como falsa** (ver §3): el feed `lasprovincias.es/rss/2.0/?section=valencia` que ya usamos devuelve de forma habitual titulares de La Pobla de Farnals, Torrent, Gandia o Paiporta. El filtro Valencia-ciudad pasa a aplicarse **a todas las fuentes**.

**Endurecimiento (v5, 2026-09-03):** con v4 en vivo se vio que `Valencia Plaza` (marcado `cityOnly`) colaba política nacional e internacional como noticia **confirmada** de ciudad ("Sánchez comparece en el Congreso", "El Gobierno promete a Ceuta 100 millones", "Casual Hoteles llega a República Dominicana", crónica del Valencia CF). Decisiones del usuario: (1) `Valencia Plaza` deja de auto-confirmarse — se gana el `confirmado` con señal real de ciudad como cualquier medio; solo los dos blogs de ocio siguen `cityOnly` (100% ciudad por naturaleza); (2) se añade una lista **"fuera de la ciudad"** (política estatal, tribunales nacionales, Casa Real, países y capitales extranjeras, Ceuta/Melilla/Marruecos) como señal negativa — estricta: si la noticia solo se explica por eso y no nombra un sitio de València, fuera; (3) se retiran **GDELT** (ruido de la query global `Valencia` + caídas constantes por rate-limit, aporta poco con 5 medios locales) y **À Punt** (la query `site:apuntmedia.es` devolvía ~0 ítems de ciudad — es un medio autonómico).

## 2. Fuente(s) de datos

### 2.1 RSS nativos (primarios)

| Fuente | URL | Licencia / condiciones | API key | Verificada |
|---|---|---|---|---|
| Valencia Plaza | `https://valenciaplaza.com/feed` | RSS público (WordPress) | No | **2026-09-01** — HTTP 200, RSS 2.0. Tiene mesa de política nacional y economía → **v5: NO `cityOnly`**, pasa por el filtro §3 como todos. |
| Las Provincias — sección Valencia | `https://www.lasprovincias.es/rss/2.0/?section=valencia` | RSS público de sindicación | No | **2026-09-01** — HTTP 200. **Es un feed provincial**: primeros titulares reales del día incluían La Pobla de Farnals, Torrent, Gandia, Paiporta. Requiere filtro §3. |
| 20minutos — Valencia | `https://www.20minutos.es/rss/comunidad-valenciana/valencia/` | RSS público | No | **2026-09-01** — HTTP 200 tras seguir el redirect desde `/rss/valencia/`. Mezcla ciudad + provincia. Requiere filtro §3. |

### 2.2 Google News RSS por medio (secundarios — única vía para los medios sin feed propio)

Levante-EMV, Cadena SER Radio València y otros **han retirado sus RSS por sección** (verificado 2026-09-01: 404 en todas las rutas conocidas de Levante-EMV; València Extra y El Periódico de Aquí devuelven 404; el RSS del Ajuntament, `valencia.es/-/rss`, devuelve 503 por WAF — mismo patrón que spec 027).

Google News expone un RSS de búsqueda **gratuito, sin key**, con operadores `site:` y `when:`:

```
https://news.google.com/rss/search?q=<query>&hl=es&gl=ES&ceid=ES:es
```

| Medio | `query` | Verificada |
|---|---|---|
| Levante-EMV | `València site:levante-emv.com when:2d` | **2026-09-03** — HTTP 200, RSS 2.0, ~15-17 ítems de ciudad tras filtro. Buena señal. |
| Cadena SER | `València site:cadenaser.com when:2d` | **2026-09-03** — HTTP 200, ~5 ítems de ciudad tras filtro. |
| ~~À Punt~~ | ~~`València site:apuntmedia.es when:3d`~~ | **Retirado en v5** — devolvía ~0 ítems de ciudad (medio autonómico, poco indexado por `site:` para "València"). |

**Decisión del usuario (2026-09-01): se acepta Google News como intermediario.** Sin él, el panel se queda en 3 medios. Trade-offs que quedan documentados y **no** se resuelven en esta spec:
- El `link` de cada ítem es una URL de redirección de `news.google.com`, no la del artículo. Se sirve tal cual (`target="_blank"`); **no** se añade un paso de resolución de la URL final (más frágil, más coste, sin beneficio para un panel de lectura).
- La atribución real del medio se extrae del sufijo `" - <Medio>"` del `<title>` y/o del tag `<source>`.
- El rate-limit de Google News no está documentado. Mitigación: como máximo ~4 queries `site:` por ciclo de cron (cada 15 min), cada una con su caché independiente.

### 2.3 Temáticos de ciudad (opcionales, `categoria: 'ocio'`)

| Fuente | URL | Verificada |
|---|---|---|
| Valencia Secreta | `https://valenciasecreta.com/feed/` | **2026-09-01** — HTTP 200, RSS 2.0. Ocio/cultura, poca "hard news". |
| Valencia Bonita | `https://www.valenciabonita.es/feed/` | **2026-09-01** — HTTP 200, RSS 2.0. Lifestyle ciudad. |

Se etiquetan `categoria: 'ocio'` y son ocultables con un toggle en la UI (§5).

### 2.4 GDELT (retirado en v5) y Reddit (pendiente)

- **GDELT DOC 2.0** — retirado en v5. La query global `query=Valencia` traía sobre todo ruido (menciones de paso, Valencia de Venezuela) y en la práctica fallaba casi siempre por rate-limit (1 pet./5s, muy fácil de tocar). Con 5 medios locales + filtro estricto ya no compensa el coste de mantenerlo. `fetchGdeltValencia` y sus tests eliminados.
- **Reddit `r/valencia`** (`https://www.reddit.com/r/valencia/new.json`) — HTTP 403 sin auth. **Pendiente de que el usuario registre su app** (`reddit.com/prefs/apps`, tipo "script"). No bloquea el DoD.

### 2.5 Fast-follow (fuera de esta versión)

- **Ajuntament de València** (`valencia.es`, sala de prensa) — la mejor fuente "solo ciudad" que existe, pero su WAF bloquea `curl` (503). Se hará con GitHub Actions + Playwright, siguiendo el precedente de specs 017 y 027, en spec propia.

## 3. Contrato de datos (normalizado)

```typescript
type AmbitoCiudad = 'confirmado' | 'general';   // 'excluido' se descarta en servidor, nunca llega al cliente
type CategoriaMediatica = 'general' | 'ocio' | 'deporte';
type FuenteTipo = 'rss-nativo' | 'google-news';   // v5: se retiró 'gdelt'

interface ItemMediatico {
  id: string;                 // hash estable de la url
  titulo: string;             // entidades HTML decodificadas
  resumen: string | null;
  url: string;                // artículo original, o URL de redirección de Google News (§2.2)
  fuente: string;             // nombre del medio para atribución (era union cerrada en v3)
  fuenteTipo: FuenteTipo;
  imagenUrl: string | null;
  publicadoEn: string;        // ISO 8601
  fetchedAt: string;
  source: 'rss';              // se mantiene por compatibilidad con spec 025; 'google-news' cuenta como 'rss'
  distritosMencionados: DistritoMencion[];   // spec 023
  ambitoCiudad: AmbitoCiudad;
  categoria: CategoriaMediatica;
  motivoAmbito: string;       // p.ej. "barrio: Russafa" | "solo Valencia, sin barrio" — para tests/logs, no UI
}
```

### 3.1 Filtro Valencia-ciudad (determinista, sin IA) — se aplica a TODAS las fuentes

Corre en la normalización de cada fuente (`src/services/mediatico.ts`), **antes** de cachear, sobre `titulo + " " + (resumen ?? "")` normalizado (`normalizeForSearch`, misma función que spec 023). Nuevo servicio puro: `src/services/filtro-ambito-ciudad.ts`.

**Señales positivas fuertes** (→ `confirmado`, gana sobre cualquier negativa):
1. `distritosMencionados` no vacío (spec 023: Russafa, Cabanyal, Benimaclet, Campanar…).
2. Hito de ciudad del gazetteer: "Mestalla", "Ciutat de les Arts", "La Marina", "jardí del Túria" / "río Turia", "Estació del Nord", "Mercat Central", "Malva-rosa", "Nou d'Octubre", "Nuevo Centro"…
3. Marcador de institución ciudad: "Ajuntament de València" / "Ayuntamiento de València", "València capital", "la ciudad de València", cargo de alcalde/alcaldesa en ejercicio.
4. Infraestructura asociada (decisión del usuario "término + infra asociada"): "Port de València" / "Puerto de València", "Fira València" / "Feria València", "aeroport de Manises" / "aeropuerto de València", "Bioparc". Nota: estos anulan la negativa "municipio ajeno: Manises" cuando el match es claramente el aeropuerto.

**Señales negativas** (→ `excluido`, salvo que haya una positiva fuerte):
1. Desambiguación (heredado de v3): "Venezuela", "Carabobo".
2. **Fuera de la ciudad (v5)** — `marcadoresFueraCiudad`: política estatal ("Pedro Sánchez", "Moncloa", "Congreso de los Diputados", "Consejo de Ministros", "Feijóo"), tribunales nacionales ("Audiencia Nacional", "Tribunal Supremo"), Casa Real, Ceuta/Melilla/Marruecos, y países/capitales extranjeras ("Estados Unidos", "Francia", "París", "Ucrania", "República Dominicana"…). Estricto por decisión del usuario: si la noticia solo se explica por esto y no da una señal positiva de ciudad, fuera (una visita de un ministro que no nombre barrio ni sitio concreto de València también cae).
3. Gazetteer `data/municipios-provincia-valencia.json` — otro municipio de la província (~75 curados, alias ES/VA + artículos: "l'Alcúdia", "la Pobla de Farnals", "Sagunt/Sagunto", "Torrent", "Gandia", "Paiporta", "Mislata", "Xàtiva"…).
4. Marcadores regionales/estatales: "Comunitat Valenciana", "Comunidad Valenciana", "Generalitat", "les Corts", "el Consell", "provincia de València", "área metropolitana", "Alacant" / "Alicante", "Castelló" / "Castellón".

**Deporte** (decisión del usuario "solo si es logístico"):
- Si el ítem parece crónica/mercado deportivo (`marcadoresDeporteCronica`: "fichaje", "rueda de prensa", "lesión", "alineación", "goles", "resultado", "vs", "derbi"…) **y no** contiene un marcador logístico (`marcadoresDeporteLogistico`: "dispositivo", "operativo", "tráfico", "cortes", "accesos", "aforo", "partido en Mestalla") → `excluido`.
- Si contiene marcador logístico → `categoria: 'deporte'`, `ambitoCiudad` según las reglas generales (Mestalla es hito de ciudad → `confirmado`).

**Lógica de decisión** (implementada en `clasificarAmbitoCiudad`):
```
positivaFuerte              → confirmado   (gana sobre cualquier negativa)
sino, desambiguación / fuera de la ciudad / municipio ajeno / marcador regional → excluido
sino, deporteCronicaPura    → excluido
sino, fuente city-only      → confirmado   (v5: SOLO los dos blogs de ocio; Valencia Plaza ya no)
sino, menciona "València"   → general      (bucket visible, decisión del usuario)
sino                        → excluido     (sin ninguna señal de ciudad — regla estricta pedida)
```

`general` = "menciona València por su nombre, no nombra ningún barrio/hito pero tampoco ningún municipio ajeno ni marcador regional/nacional". Se muestra en un grupo aparte ("València (general, sin confirmar)"). Un ítem `confirmado` sin barrio concreto (hito, institución, infra o fuente de ocio) va al grupo "València (ciudad)".

El matching se hace sobre el texto normalizado (NFD, sin acentos, minúsculas, separadores a un espacio) por **palabra/frase completa** — no `normalizeForSearch` de spec 023 (que borra los espacios y da falsos positivos de substring: "turia" dentro de "asturias"). El `resumen` se limpia de HTML embebido y de coletillas de WordPress ("The post … appeared first on …") antes de clasificar y de contar términos (spec 025).

### 3.2 Datos nuevos a seedear

- `data/municipios-provincia-valencia.json` — `[{ nombre, alias: string[], comarca?: string, ambiguo?: boolean }]`, ~75 municipios que aparecen en prensa (recorte del nomenclátor INE província 46). `ambiguo: true` (Silla, Oliva, el Puig…) solo cuenta tras preposición locativa.
- `data/lexico-ambito-ciudad.json` — `{ hitosCiudad, marcadoresInstitucionCiudad, infraAsociada, marcadoresRegionales, marcadoresFueraCiudad, desambiguacion, deporteCronica, deporteLogistico, preposicionesLocativas }`, listas de strings.

## 4. Pipeline (seed → caché → endpoint)

| Parámetro | Valor |
|---|---|
| Frecuencia de refresco (cron) | 15 min. Conservador con Google News (2 queries `site:` por ciclo, cada una con su caché). |
| TTL en caché | 15 min (900 000 ms). |
| Comportamiento si la fuente falla | Stale-on-error **por fuente individual** (`Promise.allSettled` sobre las 7 `getOrFetch()`). Un feed caído no rompe el panel. |
| Claves de caché | `mediatico:<slug-fuente>:v3` (v3: cambio de contrato v4 + endurecimiento del filtro v5). |
| Endpoint interno | `GET /api/mediatico/v1/items` (sin cambio de URL). |

El endpoint devuelve `{ items: ItemMediatico[], fresh: boolean, fuentesFallidas: string[] }`, `items` ya sin los `excluido`, deduplicados por URL y por titular normalizado, ordenados por `publicadoEn` desc, cap a 40.

**Fuentes activas (v5, 7):** Las Provincias, Valencia Plaza, 20minutos (RSS nativo); Levante-EMV, Cadena SER (Google News); Valencia Secreta, Valencia Bonita (ocio, `cityOnly`).

## 5. Contrato de "capa" (panel, no geoespacial)

Sin cambios en el registro de capas respecto a v2 (`key: 'contextoMediatico'`, `renderers: ['panel']`, `agregacion: 'lista'`).

Cambios en la UI del panel:
- Grupos: distritos con match (spec 023) → "València (general)" → (colapsado) "Ocio y cultura" y "Deporte" si el toggle los activa.
- Toggle "Mostrar ocio y deporte" (por defecto: off). Persistido en la config del chasis (spec 019), igual que los demás toggles de panel.
- Atribución por ítem = `fuente`. Meta del panel: "N fuentes · actualizado hace M min" + lista de `fuentesFallidas` si las hay.
- El contenido del artículo nunca se reproduce (solo titular + resumen + enlace — límite de copyright).

## 6. Criterios de aceptación (Definition of Done)

Heredados de v1/v2 (ya cumplidos, se mantienen):
- [x] RSS + GDELT probados con llamada real, rate limit de GDELT confirmado.
- [x] Endpoint con resiliencia por fuente individual (`Promise.allSettled`).
- [x] Panel de lista con enlace `target="_blank"`, escapado defensivo de HTML, filtro de esquema `http(s)://`.
- [x] Atribución y frescura visibles.
- [x] Reddit documentado como pendiente de credenciales.

v3 (filtro GDELT de desambiguación) — cerrado dentro del filtro unificado de v4:
- [x] Lista de exclusión "Venezuela / Carabobo / Comunitat Valenciana / Generalitat" aplicada, testeada con un caso sintético por término (`filtro-ambito-ciudad.test.ts`).
- [x] Excepción: ítem con término de exclusión **y** un barrio real de spec 023 → `confirmado`, no se descarta (test "un barrio gana sobre otro municipio / un hito gana sobre un marcador regional").
- [x] `sourcecountry:Spain` en la query de GDELT: sigue en `fetchGdeltValencia`, verificado en la llamada real del endpoint.

v4 (esta versión):
- [x] `data/municipios-provincia-valencia.json` (~75 municipios, alias ES/VA, `ambiguo`) y `data/lexico-ambito-ciudad.json` seedeados; `filtro-ambito-ciudad.ts` (16 tests) recorre los ejemplos reales y comprueba `excluido` con `motivoAmbito` "municipio ajeno: …".
- [x] El filtro corre sobre **todas las fuentes** (no solo GDELT) y descarta los ejemplos reales del 2026-09-01: "La Pobla de Farnals…", "Torrent instala 35 avisadores…", "El alcalde de Gandia…", "Paiporta incorpora 12 funcionarios…" — verificado en vivo (Las Provincias pasó de 7 a 6 ítems, sin ninguno de província).
- [x] Positiva fuerte gana: barrio de spec 023 → `confirmado` aunque el titular nombre otro municipio (test).
- [x] Bucket `general`: "Un herido leve en un accidente en una calle de València" (sin barrio/hito) → `general`, grupo "València (general, sin confirmar)" visible (test + navegador: 10 ítems en ese grupo).
- [x] Feeds Google News (Levante-EMV, Cadena SER verificados en vivo con ítems reales; À Punt responde pero con volumen bajo — es un medio autonómico); links de redirección de `news.google.com` servidos tal cual (§2.2); atribución del medio extraída de `<source>` y del sufijo `" - Medio"` del `<title>`.
- [x] Deporte: crónica/mercado ("El Valencia CF cierra el fichaje…") → `excluido`, `categoria: 'deporte'`; logístico ("Dispositivo de tráfico por el partido en Mestalla") → `confirmado`, `categoria: 'deporte'` (2 tests).
- [x] Toggle "Ocio y deporte" en la cabecera del panel, off por defecto, persistido en `localStorage` (`imc:media-ocio-deporte`); verificado en navegador (grupo "Ocio y cultura" aparece/desaparece, meta muestra "N de ocio/deporte ocultos").
- [x] `npm run typecheck` + `npm run test` (261/261) + `npm run build` (bundle `api/router.js` OK) verdes; verificado en navegador contra datos reales: 40 ítems de 6 medios (Valencia Plaza, Levante-EMV, Cadena SER, Las Provincias, 20minutos, Valencia Bonita), GDELT caído por rate-limit y el panel sirviendo igual (resiliencia por fuente).
- [x] Parser RSS: `extraerTag` tolera espacios/saltos entre `<title>`, el `<![CDATA[` y `</title>` (20minutos los mete) — antes se colaba `<![CDATA[` literal en el titular y en la tendencia de términos.

v5 (endurecimiento, 2026-09-03):
- [x] `Valencia Plaza` → `cityOnly: false`; solo Valencia Secreta / Valencia Bonita siguen `cityOnly`. Verificado en vivo: VP pasa de 16 a 1 ítem, sin política nacional en `confirmado`.
- [x] `marcadoresFueraCiudad` en `data/lexico-ambito-ciudad.json` + check en `clasificarAmbitoCiudad` (paso 2, antes de municipio/regional); tests: 4 ejemplos reales (Sánchez/Feijóo/Ceuta/República Dominicana) → `excluido` con motivo "fuera de la ciudad", y "Sánchez visita el Ayuntamiento de València" → `confirmado` (la positiva gana).
- [x] GDELT retirado: `fetchGdeltValencia`, tipos `Gdelt*`, `normalizarFechaGdelt` y sus 2 tests eliminados; fuera del registro `mediatico-fuentes.ts`. `FuenteTipo` = `'rss-nativo' | 'google-news'`.
- [x] À Punt retirado del registro (`fetchGoogleNewsApunt` eliminado).
- [x] `limpiarHtml` sobre el `resumen`: quita tags y coletillas WordPress; test con `<a href>` y con "The post … appeared first on …". Verificado en vivo: "href"/"https"/"appeared" ya no aparecen en la tendencia de términos.
- [x] `npm run typecheck` + `npm run test` (267/267) + `npm run build` verdes; navegador contra datos reales (7 fuentes, `fresh: true`, panel limpio).

## 7. Riesgos y fuera de alcance

- **Riesgo (mitigado):** feeds "de sección local" que en realidad son provinciales — resuelto aplicando el filtro §3.1 a todas las fuentes, no solo a GDELT.
- **Riesgo (aceptado):** mención de paso a "Valencia" como nombre propio no geográfico (universidad, apellido) sin municipio ajeno ni marcador regional → cae en `general`, no en `excluido`. Coste aceptable: falso positivo ocasional en un panel de lectura humana, no una decisión automática. Construir NLP para esto es sobre-ingeniería a este volumen.
- **Riesgo (aceptado):** Google News como intermediario — links redirigidos, rate-limit no documentado, formato del `<title>` puede cambiar. Mitigación: caché por fuente, 2 queries/ciclo, stale-on-error. Si Google News se vuelve inestable, se caen esos ítems y el panel sigue con los RSS nativos.
- **Riesgo:** el gazetteer de municipios es una lista curada, no exhaustiva (la província tiene 266 municipios). Se cubren los ~75 que aparecen en prensa; un municipio pequeño no listado que salga en una noticia sin marcador regional caería en `general`, no se colaría como `confirmado`.
- **Resuelto en v5:** `Valencia Plaza` ya no es `cityOnly` — colaba política nacional/internacional como `confirmado`. Ahora se gana el `confirmado` con señal real de ciudad; el resto cae a `general` o `excluido`. Solo los dos blogs de ocio (100% ciudad por naturaleza) siguen `cityOnly`.
- **Riesgo (aceptado, v5):** la lista `marcadoresFueraCiudad` es estricta — una visita ministerial a València que solo diga "en Valencia" sin nombrar barrio/sitio se descarta. Decisión explícita del usuario ("sí, estricto"). Si nombra el Ayuntamiento, un barrio o un hito, la señal positiva gana y se mantiene.
- **Riesgo:** clasificar deporte por palabras clave es heurístico. Un ítem deportivo ambiguo cae en `general` o `deporte` (oculto por defecto), nunca se pierde silenciosamente si el usuario activa el toggle. Alguna crónica sin marcador claro ("Ser Deportivos Valencia") se cuela en `general`.
- **Limitación conocida:** Levante-EMV publica cada noticia en valenciano y en castellano; el dedup por titular normalizado no pilla el cambio de idioma, así que a veces salen las dos versiones.
- **Fuera de alcance:** Reddit (pendiente de credenciales), scraping del cuerpo de los artículos, análisis de sentimiento/relevancia por IA, resolución de la URL final de los links de Google News, sala de prensa del Ajuntament (fast-follow con Playwright).

## 8. Historial

| Versión | Fecha | Cambio |
|---|---|---|
| 1 | 2026-08-18 | Creación con 2 RSS + GDELT verificados. Reddit pendiente de credenciales (403 sin auth). |
| 2 | 2026-08-18 | DoD completo: parser RSS + cliente GDELT con filtro de título, endpoint con resiliencia por fuente, nuevos valores `'panel'`/`'lista'` en el registro de capas, panel lateral. Verificado (typecheck/test/navegador). `Implemented`. |
| 3 | 2026-08-26 | Requisito: solo Valencia municipio. Lista de exclusión por desambiguación en el filtro de GDELT, con excepción ligada a `distritosMencionados` (spec 023). Pendiente de implementar; spec sigue `Implemented` para lo ya construido. |
| 4 | 2026-09-01 | Requisito del usuario: (a) agregar cuantos periódicos locales sea viable, (b) el filtro Valencia-ciudad se aplica a **todas** las fuentes, no solo GDELT — verificado que los RSS "locales" son provinciales. Se añaden: RSS de 20minutos, feeds Google News por medio (Levante-EMV, À Punt, SER — única vía tras la retirada de sus RSS), temáticos de ocio (Valencia Secreta, Valencia Bonita) con toggle. Filtro unificado `filtro-ambito-ciudad.ts` con gazetteer `data/municipios-provincia-valencia.json` + `data/lexico-ambito-ciudad.json`, señales positivas/negativas/deporte y bucket `general` visible. Contrato: `fuente` pasa a `string`, nuevos campos `fuenteTipo`/`ambitoCiudad`/`categoria`/`motivoAmbito`. `depende_de` añade `023`. **Implementado y verificado el mismo día**: `src/services/mediatico.ts` (parsers + fetchers + filtro), registro compartido `src/services/mediatico-fuentes.ts` (endpoints `items` y `tendencia` dejan de duplicar la lista, cachés `:v2`), UI con grupos "València (ciudad)" / "…(general, sin confirmar)" / "Ocio y cultura" / "Deporte" y toggle persistido. 261/261 tests (16 nuevos), build y navegador contra datos reales. Fix colateral del parser CDATA. DoD de §6 completo salvo Reddit (credenciales del usuario) y sala de prensa del Ajuntament (fast-follow §2.5). |
| 5 | 2026-09-03 | Perfilado tras ver v4 en vivo. Decisiones del usuario: (1) `Valencia Plaza` deja de ser `cityOnly` — colaba política nacional/internacional como `confirmado`; solo los 2 blogs de ocio siguen `cityOnly`. (2) Nueva lista negativa `marcadoresFueraCiudad` (política estatal, tribunales nacionales, Casa Real, Ceuta/Melilla/Marruecos, países y capitales extranjeras) — estricta. (3) Se retiran **GDELT** (ruido + caídas por rate-limit) y **À Punt** (query `site:` daba ~0 ítems de ciudad). Fixes de parser: `resumen` limpia HTML embebido y coletillas de WordPress ("The post … appeared first on …") — antes se colaba "href"/"https"/"appeared" en la tendencia de términos (spec 025). Extendida la lista de deporte (US Open, MotoGP, Roland Garros…). Cachés `:v2` → `:v3`. `FuenteTipo` pierde `'gdelt'`, `source` queda en `'rss'`. 267/267 tests, build y navegador contra datos reales: Valencia Plaza cae de 16 a 1 ítem (la política nacional desaparece), `confirmado` queda limpio (Ayuntamiento/barrios/hitos/aeropuerto). |
