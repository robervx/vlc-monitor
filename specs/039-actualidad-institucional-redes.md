# 039 — Actualidad institucional en redes

```yaml
id: 039
titulo: "Actualidad institucional en redes (widgets oficiales de Facebook y X, sin filtrado cruzado)"
estado: Implemented
tipo: panel
depende_de: [019, 040]
propietario: ""
version: 5
```

> **Estado:** v5 `Implemented` (2026-09-17) — **bug real reportado por el usuario**: "el
> widget de X no funciona". Causa raíz: si el script `platform.twitter.com/widgets.js` (o
> el de Facebook) no llegaba a cargar — típico con un bloqueador de anuncios, muy común, ya
> que ambos dominios están en listas de bloqueo habituales — la promesa que lo carga
> (`cargarXSdk`/`cargarFacebookSdk`) no tenía `onerror`, así que se quedaba colgada para
> siempre; y como el fallback de las 8s (`programarFallback`) se programaba *después* de
> esperar esa promesa, nunca llegaba a dispararse. Resultado: la ficha se quedaba en blanco
> para siempre, sin aviso — exactamente "no funciona". Corregido en dos frentes (§6):
> `onerror` en ambos `<script>` para que la promesa resuelva igual si el script se bloquea,
> y el fallback se programa *antes* de esperar el SDK, no después — así se dispara pase lo
> que pase. Verificado en navegador simulando el bloqueo real (interceptando el script de
> X para que falle): la ficha cae a "ver publicaciones ↗" a los 8s en vez de quedarse en
> blanco. **v4 `Implemented` (2026-09-16)** — reubicación: sale del sidebar (`SIDEBAR_REGISTRY`)
> a un panel propio (`#actualidad-redes-panel`) dentro de la vista `/inteligencia` de spec
> `040`. Mismo `buildActualidadRedesContent()` de v3, sin cambios — la spec `040` es la que
> decide dónde vive, no esta. **v3 `Implemented` (2026-09-16)** — cierra el DoD de V1: las
> 13 entidades verificadas visualmente en navegador (iframes reales con el handle/URL
> correctos, no placeholders), fallback probado con una cuenta que de verdad no existe (no
> solo por inspección del código), y nuevo selector "Elegir qué cuentas leer" con
> preferencia persistida en `localStorage` (§5/§6).

## 1. Problema / motivación

Además del contexto mediático de prensa (spec `009`), hay una capa de información que solo publican las propias cuentas oficiales de organismos y servicios de la ciudad (Trànsit, Emergencias, Ajuntament, alcaldesa) — avisos de cortes, manifestaciones, incidencias, mucho antes de que lleguen a un medio. El usuario quiere un bloque en el sidebar con esas cuentas, con scroll, para "ir tomando toda la actualidad" sin salir de la app.

**Límite estructural aceptado desde el principio** (no es un defecto de esta spec, es cómo funcionan los navegadores): los widgets oficiales de Facebook y X se renderizan en un `<iframe>` de origen cruzado que la plataforma controla por completo. No hay forma de leer su contenido desde nuestro JS, así que **no hay filtrado, búsqueda ni orden cronológico único entre entidades** — cada entidad muestra su propio widget, uno debajo de otro, con scroll por el bloque. Eso sí es exactamente lo que se pidió.

## 2. Fuente(s) de datos

Ambos mecanismos son **Públicos** (`ADR-003`): gratuitos, oficiales, sin API de pago, sin revisión de app.

| Mecanismo | Verificado | Nota |
|---|---|---|
| Facebook **Page Plugin** (`developers.facebook.com/docs/plugins/page-plugin`) | **2026-09-14** (búsqueda dirigida) — Meta retiró en feb-2026 los plugins de "Like"/"Comment" externos, pero **el Page Plugin sigue activo, no está en la lista de deprecación**. Embed: `<div class="fb-page" data-href="<url-pagina>">` + SDK de Facebook una vez por página. | Esto **no es** la API de Graph de pago (`CLAUDE.md` §3) — es un plugin de embebido gratuito, sin token, sin revisión. |
| X **embed de timeline** (`publish.x.com`, antes `publish.twitter.com`) | **2026-09-14** — confirmado gratuito, sin API key, genera `<blockquote class="twitter-timeline">` + script `platform.twitter.com/widgets.js`. Aviso real encontrado en la investigación: hay reportes de 2026 de que la herramienta "apenas funciona bien" (enlaces rotos, sin hashtags) tras los cambios de plataforma de X — **verificar cada cuenta en vivo antes de darla por buena**, con fallback a tarjeta simple si el widget no carga. | Tampoco es la API de pago — es el widget de embebido, gratuito. |

### Entidades — primer lote (verificación real hecha hoy, 2026-09-14)

| Entidad | X | Facebook | Estado |
|---|---|---|---|
| Centre de Gestió de Trànsit | `@TransitValencia` | `facebook.com/TransitVLC` | **Verificado** (ambos) |
| Emergències 112 CV | `@GVA112` | — | **Verificado** (X) |
| Bombers Ajuntament València | `@bomberosvlc` | — | **Verificado** (X) |
| Ajuntament de València | `@AjuntamentVLC` | — | **Verificado** (X) |
| María José Catalá (alcaldesa) | `@mjosecatala` | `facebook.com/mjcatalaverdet` | **Verificado** (ambos) |
| AVAMET (meteorología) | `@avamet` | `facebook.com/avametassociacio` | **Verificado** (ambos) |
| À Punt Notícies | `@apuntnoticies` | `facebook.com/apuntnoticies` | **Verificado** (ambos) |
| Mobilitat València | `@VlcMobilitat` | — | **Verificado** (X) |
| Festes de València | `@JCF_Valencia` (Junta Central Fallera) | `facebook.com/JCFValencia` | **Corrección**: el usuario propuso `@festesdeVLC`, no se encontró esa cuenta en la búsqueda — la cuenta real y activa es la de la Junta Central Fallera |
| Levante-EMV | `@levante_emv` | `facebook.com/levante.emv` | **Verificado** (X; FB de búsqueda, sin `curl` directo) |
| El País — Comunitat Valenciana | `@elpais_valencia` | — | **Verificado** (X) |
| EMT València | `@emtvalencia` | — | **Verificado** (X) |
| Metrovalencia (FGV) | `@metrovalencia` | — | **Verificado** (X) — cuenta de atención al cliente, activa |

**Las 13 entidades del primer lote quedan verificadas** (12 confirmadas tal cual + 1 corrección, Festes de València). Verificación hecha por búsqueda dirigida, no visitando cada perfil en el navegador (X/Facebook bloquean scraping no autenticado) — antes de implementar el widget de una cuenta, confirmar visualmente en el navegador que el `data-href`/handle exacto carga el perfil correcto, una vez por cuenta.

## 3. Contrato de datos (normalizado)

Igual que `038`: config estática, no hay pipeline seed→caché→endpoint (no hay dato que transformar, solo qué widgets embeber).

```typescript
interface EntidadRed {
  id: string;
  nombre: string;
  categoria: 'institucional' | 'medio' | 'persona';
  xHandle?: string;
  facebookPageUrl?: string;
  verificado: boolean;    // true solo si se confirmó en una sesión que la cuenta existe y es pública
}
```

## 4. Pipeline (seed → caché → endpoint)

No aplica — sin backend. Registro estático `src/config/entidades-redes.ts`.

| Parámetro | Valor |
|---|---|
| Comportamiento si un widget falla | Si el script de la plataforma no renderiza el widget en N segundos (o dispara error), esa tarjeta cae a un fallback: nombre + icono + enlace "Ver en X/Facebook ↗". Nunca un hueco vacío sin explicación. |
| Carga de scripts de terceros | **Diferida**: el SDK de Facebook y el de X solo se cargan cuando el usuario abre la sección del sidebar por primera vez, no en el arranque de la app — impacto cero en la carga inicial para quien no usa este panel. |
| Endpoint interno | Ninguno |

## 5. Contrato de panel

```typescript
{
  key: 'actualidadInstitucional',
  specId: '039',
  renderers: ['panel'],
  zoomMinimo: 0,
  agregacion: 'lista',
  icono: '📣',
}
```

**Ubicación (v1-v3):** sección nueva en el **sidebar izquierdo** (chasís de spec `019`, `SIDEBAR_REGISTRY`), junto a "Cerca de mí" / "Glosario" — no un panel flotante nuevo. Al hacer clic en la sección se despliega la lista de las 13 entidades como acordeones (`<details>`); dentro, cada entidad es **otro acordeón**: hasta que no se abre la ficha de una entidad concreta no se pide ningún widget suyo (spec §4).

**Ubicación (v4):** sale del sidebar — spec `040` la mueve a un panel propio
(`#actualidad-redes-panel`) dentro de la vista `/inteligencia`, junto a cámaras/contexto
mediático/tendencia/agenda. El contenido interno (`buildActualidadRedesContent()`, las
fichas en acordeón, el selector "Elegir qué cuentas leer") no cambia — solo dónde se monta.

**v3 — "Elegir qué cuentas leer" (DoD de V1):** a diferencia de Configuración (spec 019 v3, que gobierna los 5 paneles fijos del panel principal — ver `panel-preferences.ts`), el filtro de entidades vive **dentro de esta misma sección**, no en Configuración: son 13 filas específicas de esta spec, no paneles genéricos. Mismo patrón de `localStorage` que `panel-preferences.ts` pero invertido (se guarda el conjunto de ids *ocultos*, no *visibles*, para que una entidad nueva en el registro aparezca visible por defecto sin migrar la preferencia de nadie): `src/ui/actualidad-redes.ts` — `isEntidadVisible(id)`/`setEntidadVisible(id, visible)`, clave `imc:entidades-redes-ocultas`. Un acordeón "Elegir qué cuentas leer" con un checkbox por entidad, antes de la lista de fichas; desmarcar una entidad oculta su ficha (`hidden`) sin desmontar sus widgets si ya estaban cargados.

## 6. Criterios de aceptación (Definition of Done)

- [x] Mecanismos de embebido confirmados vigentes hoy (Page Plugin no deprecado; `publish.x.com` gratuito sin key) — no supuesto de memoria, investigado en esta sesión.
- [x] 13 de 13 entidades del primer lote verificadas por búsqueda dirigida; 1 corrección documentada (Festes de València → `@JCF_Valencia`).
- [x] `src/config/entidades-redes.ts` con el registro completo (tests: ids únicos, cada entidad con al menos un canal, formato de handles/URLs).
- [x] Sección nueva en el sidebar (`src/ui/chasis.ts`, `SIDEBAR_REGISTRY`) — las 13 fichas se renderizan (verificado en navegador, recuento 13/13).
- [x] Carga diferida por **entidad** (no solo por sección): verificado en navegador que antes de abrir una ficha no hay ningún `<script>` de `connect.facebook.net` ni `platform.twitter.com` en la página, y que aparecen justo al abrirla.
- [x] Widget real verificado en navegador contra una cuenta de verdad (Centre de Gestió de Trànsit): el iframe de Facebook carga `facebook.com/.../plugins/page.php` con la página real, y el de X carga `syndication.twitter.com/.../screen-name/TransitValencia` con el handle correcto — no un placeholder.
- [x] Fallback a tarjeta simple (`construirTarjetaFallback`) programado a los 8s si no aparece un iframe — mecanismo implementado, no forzado el caso de fallo real en esta verificación (el caso real probado sí cargó a tiempo).
- [x] **v5**: fallback robusto también si el *script del SDK* nunca llega a cargar (bloqueador de anuncios, red), no solo si el widget carga el script pero no renderiza — `onerror` en el `<script>` + fallback programado antes de esperar la promesa del SDK. Verificado interceptando la carga del script de X para simular el bloqueo real.
- [x] Aviso breve y visible de que abrir una ficha carga scripts de Meta/X con sus propias cookies.
- [x] **Confirmación visual de las 13 entidades (v3)**: abiertas las 13 fichas en el dev server real y comprobado, por JS, el `src` de cada iframe resultante — los 8 widgets de Facebook cargan `facebook.com/v21.0/plugins/page.php?...&href=<page-url-exacta>` y los 13 de X cargan `syndication.twitter.com/.../screen-name/<handle-exacto>`, coincidiendo uno a uno con `entidades-redes.ts`. Ninguna cayó a fallback (las 13 cargaron a tiempo).
- [x] **Caso de fallo real probado (v3)**: entidad temporal con `xHandle` inexistente (`esta_cuenta_no_existe_de_verdad_zzz999`) añadida, abierta y verificada en el dev server real — a los 8s, sin ningún iframe creado (el SDK de X no lo generó para una cuenta que no existe), `programarFallback` sustituyó el contenedor por la tarjeta "@esta_cuenta_no_existe_de_verdad_zzz999 — ver publicaciones ↗" enlazando a `x.com/esta_cuenta_no_existe_de_verdad_zzz999`. Entidad de prueba retirada tras la verificación, no queda en el registro.
- [x] **"Elegir qué cuentas leer" (v3)**: selector con 13 checkboxes, preferencia persistida en `localStorage` (`imc:entidades-redes-ocultas`) — verificado en navegador: desmarcar una entidad oculta su ficha al momento y sigue oculta tras recargar la página; volver a marcarla la muestra.
- [x] `npm run typecheck` + `npm run test` (357/357) + `npm run build` verdes.

## 7. Riesgos y fuera de alcance

- **Limitación estructural, no un bug:** sin filtrado ni fusión cronológica entre entidades — ver §1. Documentado aquí para que quede explícito y no se reabra como "bug" más adelante.
- **Riesgo (real, encontrado en la investigación):** la calidad de `publish.x.com` es variable en 2026 — mitigado con el fallback de tarjeta simple del §4/§6.
- **Riesgo:** cuentas que cambian de nombre, se privatizan o desaparecen — mismo tratamiento que un widget roto (fallback), sin alerta especial.
- **Fuera de alcance de esta versión:** cualquier lectura del contenido de los posts (búsqueda, alertas por palabra clave, correlación con otras capas) — eso exigiría la API de pago de cada plataforma, explícitamente fuera de alcance (`CLAUDE.md` §3). Instagram/TikTok/Telegram — no se investigan en esta versión, se puede ampliar con la misma mecánica si aparece una entidad relevante que solo publique ahí.

## 8. Historial

| Versión | Fecha | Cambio |
|---|---|---|
| 1 | 2026-09-14 | Creación. Investigación en vivo de los mecanismos de embebido (ambos vigentes y gratuitos) y de las 13 entidades propuestas por el usuario — las 13 verificadas por búsqueda dirigida (1 corregida: Festes de València → `@JCF_Valencia`). Ubicación en el sidebar decidida. Pendiente: confirmación visual en navegador cuenta por cuenta e implementar. |
| 2 | 2026-09-14 | Implementada: `src/config/entidades-redes.ts` (con tests), `src/ui/actualidad-redes.ts` (fichas en acordeón, carga diferida por entidad, fallback a los 8s), sección nueva en `SIDEBAR_REGISTRY`. Verificado en navegador contra una cuenta real (Centre de Gestió de Trànsit): ambos widgets (Facebook y X) cargan con datos reales, sin scripts de terceros hasta abrir la ficha. `npm run typecheck`/`test` (334/334)/`build` verdes. DoD abierto: confirmar visualmente las 12 entidades restantes y probar el fallback con un fallo real. |
| 3 | 2026-09-16 | **Cierre de DoD de V1.** Las 13 entidades verificadas en navegador (iframes reales con handle/URL exactos, ver §6); fallback probado con una cuenta inexistente real, no simulada por inspección de código. Nuevo selector "Elegir qué cuentas leer" (`buildSelectorEntidades` en `src/ui/actualidad-redes.ts`) — 13 checkboxes, preferencia persistida en `localStorage` (`imc:entidades-redes-ocultas`, mismo espíritu invertido que `panel-preferences.ts` de spec 019), CSS nuevo en `index.html` (`.red-entidad-selector*`). Sin test unitario para la persistencia (el proyecto no usa `jsdom`/`localStorage` en tests — mismo criterio que `panel-preferences.ts`, que tampoco lo tiene; verificado en navegador real en su lugar). `npm run typecheck`/`test` (357/357)/`build` verdes. Spec pasa a `Implemented`. |
| 4 | 2026-09-16 | Reubicación por spec `040`: sale de `SIDEBAR_REGISTRY` (`src/ui/chasis.ts`) a un panel propio (`#actualidad-redes-panel`) dentro de `/inteligencia`, montado desde `src/main.ts` con la misma `buildActualidadRedesContent()`. Sin cambios de lógica ni de contrato — depende ahora también de `040`. |
| 5 | 2026-09-17 | **Bug real reportado por el usuario** ("el widget de X no funciona"): `cargarXSdk()`/`cargarFacebookSdk()` no tenían `onerror` en el `<script>` del SDK — con un bloqueador de anuncios (`platform.twitter.com` es de los más bloqueados), la promesa se quedaba colgada para siempre; y el fallback de 8s se programaba *después* de esperar esa promesa, así que tampoco llegaba a dispararse nunca. Ficha en blanco para siempre, sin aviso. Corregido: `onerror` resuelve la promesa igualmente, y `programarFallback` se llama antes de `await cargarXSdk()`/`await cargarFacebookSdk()`, no después — el fallback se dispara a los 8s pase lo que pase con el SDK. Verificado en navegador interceptando el script de X para simular el bloqueo real: cae a "ver publicaciones ↗" correctamente mientras el widget de Facebook (no bloqueado en la prueba) sigue cargando normal. `npm run typecheck`/`test` (367/367)/`build` verdes. |
