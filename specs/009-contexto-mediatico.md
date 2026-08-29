# 009 — Contexto mediático

```yaml
id: 009
titulo: "Contexto mediático — v1 RSS locales + GDELT (Reddit pendiente de credenciales del usuario)"
estado: Implemented
tipo: panel
depende_de: [000]
propietario: ""
version: 3
```

## 1. Problema / motivación

Al "qué" del mapa (tráfico, aire, meteo...) le falta el "por qué": ¿hay una noticia que explique por qué un distrito está tenso ahora mismo? `ROADMAP.md` (F4) lo define como RSS de medios locales + GDELT filtrado por Valencia + Reddit como señal secundaria.

## 2. Fuente(s) de datos

| Fuente | URL | Licencia / condiciones | ¿Requiere API key? | Verificada manualmente el ___ |
|---|---|---|---|---|
| Las Provincias — sección Valencia (RSS) | `https://www.lasprovincias.es/rss/2.0/?section=valencia` | RSS público, pensado para sindicación | No | **Verificada 2026-08-18** — `curl` real, HTTP 200, RSS 2.0 válido, ítems de hoy con `title`/`link`/`description`/`pubDate`/`media:content` (imagen). |
| Valencia Plaza (RSS) | `https://valenciaplaza.com/feed` | RSS público (WordPress estándar) | No | **Verificada 2026-08-18** — `curl` real, HTTP 200, RSS 2.0 válido, medio 100% centrado en Valencia (mejor señal que Las Provincias, que cubre toda la provincia). |
| GDELT DOC 2.0 API (contexto ampliado) | `https://api.gdeltproject.org/api/v2/doc/doc?query=Valencia&mode=artlist&format=json&sort=datedesc` | Pública, sin key, **límite documentado de 1 petición cada 5s** (mensaje de error explícito de la propia API) | No | **Verificada 2026-08-18** — HTTP 200 tras respetar el rate limit (dos intentos anteriores más seguidos dieron 429). **Ruido observado:** la query simple `Valencia` devuelve artículos que solo mencionan "Valencia" de pasada (ej. una universidad en un ranking, un jugador de tenis) — se aplica un filtro adicional en cliente (título debe contener "Valencia"/"València") para mejorar precisión, ver §3. |
| Reddit `r/valencia` (señal secundaria, **no incluida en v1**) | `https://www.reddit.com/r/valencia/new.json` | Pública en teoría, pero... | **Sí, de facto** | **Verificada 2026-08-18** — HTTP 403 sin autenticación (Reddit bloquea el endpoint JSON público a peticiones no autenticadas desde 2023). Igual que AEMET en la spec 001: requiere que el usuario registre su propia app gratuita en `reddit.com/prefs/apps` (tipo "script", da `client_id`/`client_secret`) y la añada a `.env.local`. **Acción pendiente del usuario** — no bloquea el resto del DoD, se añade como fast-follow cuando exista esa credencial. |

## 3. Contrato de datos (normalizado)

```typescript
interface ItemMediatico {
  id: string;              // hash estable de la url
  titulo: string;           // entidades HTML decodificadas
  resumen: string | null;
  url: string;
  fuente: 'Las Provincias' | 'Valencia Plaza' | 'GDELT';
  imagenUrl: string | null; // null si el feed no expone una imagen limpia (ver Valencia Plaza en §7)
  publicadoEn: string;      // ISO 8601, parseado de pubDate/seendate
  fetchedAt: string;
  source: 'rss' | 'gdelt';
}
```

**Filtro de precisión GDELT — v2 (Valencia municipio, no Comunitat/país):** el requisito de la plataforma es que solo entren noticias que afecten a Valencia **ciudad**, no a la Comunitat Valenciana, no a Valencia (Venezuela), no menciones de paso ("un jugador de tenis llamado Valencia"). Se aplican, en este orden, solo a `source: 'gdelt'` (las RSS ya están scoped a medios locales, no lo necesitan):

1. **Filtro base (v1, sin cambios):** `titulo` debe contener "valencia"/"valència".
2. **Lista de exclusión por desambiguación** (nueva): se descarta el ítem si `titulo` contiene alguno de `['venezuela', 'carabobo', 'comunitat valenciana', 'comunidad valenciana', 'generalitat valenciana', 'generalitat']`. **No es una dependencia dura de la spec 023** — esta exclusión funciona de forma independiente y puede implementarse antes; si más adelante 023 está `Implemented` y el ítem tiene alguna entrada en `distritosMencionados`, esa mención explícita de un distrito/barrio real prevalece sobre la exclusión (señal positiva más fuerte que la negativa) — mejora incremental, no bloqueante.
3. **A explorar en implementación, no prometido en el contrato:** restringir la propia query de GDELT con `sourcecountry:SP` para reducir cobertura de medios no españoles (mitigaría el caso Venezuela desde el origen, no solo por texto) — pendiente de verificar con una llamada real que el operador se comporta como se espera antes de depender de él.

**Límite honesto (no se resuelve con esto, se documenta en §7):** una mención de paso a "Valencia" como nombre propio no geográfico (universidad, apellido de un tenista) sin ninguno de los términos de exclusión de arriba **no se detecta** — requeriría entender el contenido del artículo, no solo filtrar palabras clave, y eso es sobre-ingeniería para el volumen y el riesgo actual (falso positivo ocasional en un panel que un mando lee, no una decisión automática).

## 4. Pipeline (seed → caché → endpoint)

| Parámetro | Valor |
|---|---|
| Frecuencia de refresco (cron) | 15 min — un panel de contexto no necesita segundo a segundo, y respeta de sobra el rate limit de GDELT (1/5s) al no llamarlo más que cada 15 min desde el propio caché. |
| TTL en caché | 15 min (900 000 ms). |
| Comportamiento si la fuente falla | Stale-on-error por fuente individual — si un RSS falla pero los otros funcionan, se sirven los que sí respondieron (no se rompe el panel entero por un feed caído); reutiliza `getOrFetch()` por cada fuente. |
| Clave de caché | `mediatico:valencia-items:v1` |
| Endpoint interno que sirve el dato | `GET /api/mediatico/v1/items` |

## 5. Contrato de "capa" (panel, no geoespacial)

Esta spec introduce dos valores nuevos en el registro de capas — no encajaba en el modelo existente (todo lo anterior es geoespacial):

```typescript
{
  key: 'contextoMediatico',
  specId: '009',
  renderers: ['panel'],  // nuevo valor de RendererKind — no se dibuja con deck.gl, es un panel de lista en la UI
  zoomMinimo: 0,
  agregacion: 'lista',   // nuevo valor del enum — ítems ordenados por fecha, no puntos/líneas/choropleth
  icono: '',
}
```

Panel lateral con lista de titulares (fuente + tiempo relativo), cada uno enlaza al artículo original (`target="_blank"`, nunca se muestra el contenido scrapeado). Activable con un toggle.

## 6. Criterios de aceptación (Definition of Done)

- [x] Los 2 RSS y GDELT probados con al menos una llamada real cada uno, respetando el rate limit documentado de GDELT (dos intentos seguidos dieron 429, confirmando el límite real).
- [x] Endpoint `GET /api/mediatico/v1/items` responde con el contrato de la sección 3, combinando las 3 fuentes ordenadas por fecha, con el filtro de precisión de GDELT aplicado (`src/services/mediatico.ts`, 5 tests) — verificado en producción contra el dev server: 30 ítems reales del día, incluida una alerta roja de la AEMET.
- [x] Caché con TTL de 15 min y stale-on-error **por fuente individual** verificados — `api/mediatico/v1/items.ts` usa `Promise.allSettled` sobre 3 `getOrFetch()` independientes (3 tests en `api/mediatico/v1/items.test.ts`, incluido el caso real: GDELT cae por rate-limit, las 2 fuentes RSS siguen sirviendo 30 titulares).
- [x] Panel de lista visible y legible, activable con un toggle, cada ítem enlaza al artículo original (`target="_blank"`) — verificado visualmente en navegador. Se añadió escapado defensivo de HTML y filtro de esquema de URL (`http(s)://` únicamente) al insertar contenido de fuentes externas en el DOM.
- [x] Atribución (fuente por ítem) y frescura del panel visibles en la UI — meta muestra "RSS + GDELT · actualizado hace N min" y, si aplica, "sin GDELT" (visto en vivo durante la verificación).
- [x] Reddit documentado como pendiente de credenciales del usuario (§2) — no bloquea el resto del DoD.
- [ ] Lista de exclusión por desambiguación (§3 v2) aplicada solo a `source: 'gdelt'`, testeada con casos sintéticos de cada término (Venezuela, Comunitat Valenciana, Generalitat).
- [ ] Test de la excepción: ítem que contiene un término de exclusión pero también un distrito/barrio real (si spec 023 ya está implementada) → no se descarta.
- [ ] Verificación real (pendiente) de si `sourcecountry:SP` en la query de GDELT es fiable antes de depender de él — si no lo es, se documenta como descartado, no se deja a medias en el código.

## 7. Riesgos y fuera de alcance

- **Riesgo (mitigado en v2):** ruido en resultados de GDELT con query simple — ver filtro de título en §3, ahora con lista de exclusión Comunitat/Venezuela.
- **Riesgo (aceptado, no resuelto):** menciones de paso a "Valencia" como nombre propio no geográfico (universidad, apellido de tenista) no se filtran — requeriría entender contenido, no solo palabras clave (ver §3). Es un falso positivo ocasional en un panel de lectura humana, no una decisión automática — coste aceptable frente a construir NLP para este volumen.
- **Riesgo:** el RSS de Valencia Plaza no expone una imagen en un tag limpio (`<enclosure>`/`<media:content>`) sino embebida dentro de `<content:encoded>` — se deja `imagenUrl: null` para esa fuente en vez de hacer un parseo frágil de HTML anidado dentro de CDATA.
- **Fuera de alcance de esta spec:** Reddit (ver §2, pendiente de credenciales), scraping de contenido completo de artículos (solo titular + resumen + enlace, nunca se reproduce el cuerpo del artículo — ver límite de copyright), cualquier análisis de sentimiento/relevancia por IA sobre los ítems.

## 8. Historial

| Versión | Fecha | Cambio |
|---|---|---|
| 1 | 2026-08-18 | Creación con 2 RSS + GDELT verificados. Reddit documentado como pendiente de credenciales del usuario (bloqueado 403 sin auth). |
| 2 | 2026-08-18 | DoD completo: parser RSS + cliente GDELT con filtro de título (`src/services/mediatico.ts`), endpoint con resiliencia por fuente individual (`api/mediatico/v1/items.ts`), nuevos valores `'panel'`/`'lista'` en el registro de capas, panel lateral con lista de titulares + escapado defensivo de contenido externo (`src/main.ts`). Verificado con `npm run typecheck`, `npm run test` y en navegador (incluido el caso real de GDELT caído por rate-limit sirviendo igualmente 30 titulares de RSS). Spec pasa a `Implemented`. |
| 3 | 2026-08-26 | Requisito del usuario: la plataforma solo debe mostrar noticias de Valencia **municipio**, no Comunitat Valenciana ni Valencia (Venezuela). Se añade lista de exclusión por desambiguación al filtro de GDELT (§3), con excepción no bloqueante ligada a `distritosMencionados` de la spec 023 cuando esté disponible. Pendiente de implementar (DoD ampliado) — spec sigue `Implemented` para lo ya construido, los nuevos ítems de DoD quedan sin marcar hasta implementarse. |
