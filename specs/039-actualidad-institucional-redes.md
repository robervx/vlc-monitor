# 039 — Actualidad institucional en redes

```yaml
id: 039
titulo: "Actualidad institucional en redes (widgets oficiales de Facebook y X, sin filtrado cruzado)"
estado: Draft
tipo: panel
depende_de: [019]
propietario: ""
version: 1
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

**Ubicación decidida por el usuario:** sección nueva en el **sidebar izquierdo** (chasís de spec `019`), junto a "Cerca de mí" / "Configuración" — no un panel flotante nuevo. Lista vertical con scroll, un bloque por entidad (widget de X y/o de Facebook, según cuáles tenga). Toggle de visibilidad en Configuración, mismo patrón que el resto de secciones del sidebar.

## 6. Criterios de aceptación (Definition of Done)

- [x] Mecanismos de embebido confirmados vigentes hoy (Page Plugin no deprecado; `publish.x.com` gratuito sin key) — no supuesto de memoria, investigado en esta sesión.
- [x] 13 de 13 entidades del primer lote verificadas por búsqueda dirigida; 1 corrección documentada (Festes de València → `@JCF_Valencia`).
- [ ] Confirmación visual en el navegador (perfil correcto, cuenta pública, no protegida) de cada cuenta antes de fijar su widget en el registro — la verificación por búsqueda no sustituye a mirarlo una vez.
- [ ] `src/config/entidades-redes.ts` con el registro completo y verificado.
- [ ] Sección nueva en el sidebar (spec `019`) con scroll vertical y toggle en Configuración.
- [ ] Carga diferida de los SDKs de Facebook/X (solo al abrir la sección) — verificar con `read_network_requests` que no se piden en el arranque.
- [ ] Fallback a tarjeta simple cuando un widget de X no carga — probar el caso real con al menos una cuenta.
- [ ] Aviso breve y visible de que estos widgets cargan scripts de Meta/X con sus propias cookies (coherente con la transparencia de fuentes del glosario, spec `037`).
- [ ] `npm run typecheck` + `npm run test` + `npm run build` verdes, verificado en navegador contra las cuentas reales (no placeholders).

## 7. Riesgos y fuera de alcance

- **Limitación estructural, no un bug:** sin filtrado ni fusión cronológica entre entidades — ver §1. Documentado aquí para que quede explícito y no se reabra como "bug" más adelante.
- **Riesgo (real, encontrado en la investigación):** la calidad de `publish.x.com` es variable en 2026 — mitigado con el fallback de tarjeta simple del §4/§6.
- **Riesgo:** cuentas que cambian de nombre, se privatizan o desaparecen — mismo tratamiento que un widget roto (fallback), sin alerta especial.
- **Fuera de alcance de esta versión:** cualquier lectura del contenido de los posts (búsqueda, alertas por palabra clave, correlación con otras capas) — eso exigiría la API de pago de cada plataforma, explícitamente fuera de alcance (`CLAUDE.md` §3). Instagram/TikTok/Telegram — no se investigan en esta versión, se puede ampliar con la misma mecánica si aparece una entidad relevante que solo publique ahí.

## 8. Historial

| Versión | Fecha | Cambio |
|---|---|---|
| 1 | 2026-09-14 | Creación. Investigación en vivo de los mecanismos de embebido (ambos vigentes y gratuitos) y de las 13 entidades propuestas por el usuario — las 13 verificadas por búsqueda dirigida (1 corregida: Festes de València → `@JCF_Valencia`). Ubicación en el sidebar decidida. Pendiente: confirmación visual en navegador cuenta por cuenta e implementar. |
