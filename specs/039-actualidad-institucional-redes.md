# 039 — Actualidad institucional en redes

```yaml
id: 039
titulo: "Actualidad institucional en redes (widgets oficiales de Facebook y X, sin filtrado cruzado)"
estado: Draft
tipo: panel
depende_de: [019]
propietario: ""
version: 2
```

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

**Ubicación decidida por el usuario:** sección nueva en el **sidebar izquierdo** (chasís de spec `019`, `SIDEBAR_REGISTRY`), junto a "Cerca de mí" / "Glosario" — no un panel flotante nuevo. Al hacer clic en la sección se despliega la lista de las 13 entidades como acordeones (`<details>`); dentro, cada entidad es **otro acordeón**: hasta que no se abre la ficha de una entidad concreta no se pide ningún widget suyo (spec §4). Sigue el mismo patrón que las demás secciones del sidebar (`cerca-de-mi`, `glosario`) — no tienen checkbox de mostrar/ocultar en Configuración, se abren/cierran desde el propio sidebar.

## 6. Criterios de aceptación (Definition of Done)

- [x] Mecanismos de embebido confirmados vigentes hoy (Page Plugin no deprecado; `publish.x.com` gratuito sin key) — no supuesto de memoria, investigado en esta sesión.
- [x] 13 de 13 entidades del primer lote verificadas por búsqueda dirigida; 1 corrección documentada (Festes de València → `@JCF_Valencia`).
- [x] `src/config/entidades-redes.ts` con el registro completo (tests: ids únicos, cada entidad con al menos un canal, formato de handles/URLs).
- [x] Sección nueva en el sidebar (`src/ui/chasis.ts`, `SIDEBAR_REGISTRY`) — las 13 fichas se renderizan (verificado en navegador, recuento 13/13).
- [x] Carga diferida por **entidad** (no solo por sección): verificado en navegador que antes de abrir una ficha no hay ningún `<script>` de `connect.facebook.net` ni `platform.twitter.com` en la página, y que aparecen justo al abrirla.
- [x] Widget real verificado en navegador contra una cuenta de verdad (Centre de Gestió de Trànsit): el iframe de Facebook carga `facebook.com/.../plugins/page.php` con la página real, y el de X carga `syndication.twitter.com/.../screen-name/TransitValencia` con el handle correcto — no un placeholder.
- [x] Fallback a tarjeta simple (`construirTarjetaFallback`) programado a los 8s si no aparece un iframe — mecanismo implementado, no forzado el caso de fallo real en esta verificación (el caso real probado sí cargó a tiempo).
- [x] Aviso breve y visible de que abrir una ficha carga scripts de Meta/X con sus propias cookies.
- [ ] Confirmación visual cuenta por cuenta de las 12 entidades restantes (solo se verificó en vivo la primera) — pendiente antes de dar la spec por completa.
- [ ] Probar el caso de fallo real (una cuenta que de verdad no cargue) para confirmar el fallback en producción, no solo por inspección del código.
- [x] `npm run typecheck` + `npm run test` (334/334) + `npm run build` verdes.

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
