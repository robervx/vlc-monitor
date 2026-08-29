# 027 — Agenda general de eventos culturales (scraping resiliente)

```yaml
id: 027
titulo: "Agenda general de eventos culturales — scraping resiliente de valencia.es"
estado: Draft
tipo: capa
depende_de: [000, 023]
propietario: ""
version: 1
```

## 1. Problema / motivación

La spec [008](008-agenda-aglomeraciones-fallas.md) acota v1 a Fallas porque no hay API/JSON/RSS para la agenda cultural general — decisión explícita, no descuido. El usuario ha decidido ahora aceptar el riesgo de scraping para tener agenda real (conciertos, exposiciones, rutas guiadas, festivales...) en vez de esperar a una fuente estructurada que no existe. Esta spec diseña ese scraping para que sea resiliente y honesto sobre su naturaleza, no un script fràgil sin red de seguridad.

## 2. Fuente(s) de datos

| Fuente | URL | Formato | Verificada manualmente el ___ |
|---|---|---|---|
| Agenda de la ciudad | `https://www.valencia.es/cas/agenda-de-la-ciudad` (listado, paginado) + `https://www.valencia.es/cas/agenda-de-la-ciudad/-/content/<slug>` (ficha por evento) | HTML, **requiere navegador con JavaScript** (ver hallazgo abajo) | **Verificada 2026-08-26** |

**Tres hallazgos de la verificación en vivo, que fijan el diseño técnico:**

1. **Hay un WAF delante (Volterra/F5)** que rechaza peticiones HTTP simples: un `curl` normal a la home de agenda o a `robots.txt` devuelve `503 Request Rejected`. Un cliente `fetch`/`requests` sin más no sirve — confirmado con dos intentos reales, no es un fallo puntual de red.
2. **El listado se sirve igual a través de un navegador real** (probado con automatización de navegador: carga completa, ~20 eventos con título/fechas/categoría/enlace, paginación numerada) — la información existe y es accesible, solo que no vía HTTP simple.
3. **`robots.txt` permite explícitamente esta ruta:** `Disallow: /-/` de forma general, pero **`Allow: /-/content/`** justo el patrón de las fichas de evento (`/cas/agenda-de-la-ciudad/-/content/<slug>`). El listado (`/cas/agenda-de-la-ciudad`, sin `/-/`) no tiene restricción. Es decir: el propio Ayuntamiento permite el rastreo de estas páginas — no estamos esquivando una prohibición, estamos dentro de lo que su `robots.txt` autoriza.

**Consecuencia arquitectónica (importante, no encaja en el patrón habitual de este proyecto):** hace falta un navegador headless (Playwright), no un `fetch()` en una función edge de Vercel. Una función serverless de Vercel Hobby no es un sitio razonable para arrancar Chromium (límite de tamaño de despliegue y de tiempo de ejecución, 10s en Hobby). El precedente ya existe en este mismo proyecto: la spec [017](017-historico-trafico.md) corre su cron en **GitHub Actions**, no en Vercel — esta spec sigue el mismo patrón: un job de GitHub Actions con Playwright que escrapea, normaliza y escribe el snapshot ya cacheado; el endpoint interno de Vercel solo lee ese snapshot, nunca lanza el navegador.

## 3. Contrato de datos (normalizado)

```typescript
interface EventoAgenda {
  id: string;                 // slug de la URL de ficha, estable entre refrescos
  titulo: string;
  categoria: string;           // tal cual la sirve la web (ej. "EXPOSICIONES", "CIRCO")
  fechaInicio: string;          // ISO 8601, parseado de "DD/MM/YYYY"
  fechaFin: string;              // ISO 8601
  resumen: string | null;         // primeras ~300 caracteres de la descripción de la ficha, nunca el texto íntegro (ver §7, incluso siendo contenido institucional propio, no de terceros)
  url: string;                     // enlace a la ficha completa, se abre en el Ayuntamiento, no se reproduce el resto del contenido
  distritosMencionados: DistritoMencion[];  // reutiliza el matcher de la spec 023 sobre título+resumen — [] si no hay coincidencia explícita
  fetchedAt: string;
  source: 'ajuntament-valencia-scraping';    // distinto de 'ajuntament-valencia-geoportal' — señala explícitamente que es scraping, no API estructurada
}
```

## 4. Pipeline (seed → caché → endpoint)

| Parámetro | Valor |
|---|---|
| Frecuencia de refresco (cron) | 6h — igual que Fallas (spec 008): la agenda cultural cambia lento, y una frecuencia baja es también la práctica "ética" de scraping que pide CLAUDE.md/el documento de referencia del usuario (menos carga sobre el sitio, menos riesgo de bloqueo). |
| TTL en caché | 6h. |
| Comportamiento si la fuente falla | **Dos modos de fallo, tratados distinto:** (a) el sitio no responde / WAF bloquea → stale-on-error, sirve el último snapshot bueno, igual que cualquier otra spec. (b) el scraping responde pero **la estructura ha cambiado** (0 eventos extraídos cuando el snapshot anterior tenía >0, o los selectores no encuentran título/fecha) → no se sobrescribe el snapshot bueno con uno vacío; se marca el snapshot como `estructuraSospechosa: true` para que quede visible que hace falta revisión humana del scraper, sin romper la UI mientras tanto. |
| Clave de caché | `agenda:eventos-valencia:v1` |
| Job de scraping | GitHub Actions, Playwright headless — navega al listado, sigue la paginación, visita cada ficha nueva/actualizada para el resumen, normaliza y escribe el snapshot en caché (mismo mecanismo que usa spec 017 para sus rollups). |
| Endpoint interno que sirve el dato | `GET /api/agenda/v1/eventos` — solo lee el snapshot ya cacheado, nunca invoca Playwright en tiempo de request. |

## 5. Contrato de capa de mapa

```typescript
{
  key: 'agendaEventos',
  specId: '027',
  renderers: ['panel'],
  zoomMinimo: 0,
  agregacion: 'lista',
  icono: '',
}
```

Panel de lista (mismo patrón visual que contexto mediático, spec 009), agrupado igual que 023 por distrito mencionado + bloque "Valencia (general)". Cada ítem enlaza a la ficha oficial (`target="_blank"`), nunca reproduce la descripción completa.

## 6. Criterios de aceptación (Definition of Done)

- [ ] Job de GitHub Actions con Playwright, user-agent identificable (ej. `vlc-monitor-agenda-bot`), que respeta el `robots.txt` verificado en §2 (no toca las rutas bajo `Disallow: /-/` salvo `/-/content/`).
- [ ] Parser de listado (título, rango de fechas, categoría, enlace) + parser de ficha (resumen recortado) verificados contra la estructura real observada en §2.
- [ ] Normalización de fechas "DD MES AAAA" / "DD/MM/AAAA" (la web usa ambos formatos según vista) a ISO 8601, testeada.
- [ ] Detección de `estructuraSospechosa` implementada y testeada (simular 0 resultados con snapshot previo no vacío → no se sobrescribe, se marca).
- [ ] `distritosMencionados` calculado reutilizando la función de la spec 023, sin duplicar lógica de matching.
- [ ] Endpoint `GET /api/agenda/v1/eventos` responde con el contrato de §3, sirviendo el snapshot cacheado.
- [ ] Panel visible, agrupado por distrito + bloque general, cada ítem enlaza a la ficha oficial — verificado en navegador.
- [ ] **La UI indica de forma visible y persistente que este panel es contenido extraído por scraping de la web municipal, no una API/dataset oficial** (mismo principio de transparencia que el badge "MOCK" de la spec 003, adaptado a "fuente: web institucional, no API") — no en letra pequeña.
- [ ] Si `estructuraSospechosa: true`, la UI lo refleja (ej. "agenda desactualizada, revisar fuente") en vez de mostrar el snapshot antiguo como si fuera reciente sin más.

## 7. Riesgos y fuera de alcance

- **Riesgo — fragilidad de estructura (aceptado explícitamente por el usuario):** cualquier rediseño de `valencia.es` puede romper los selectores. Mitigado con la detección de `estructuraSospechosa` del DoD, pero no eliminado — es la naturaleza de cualquier scraping, documentado en vez de ignorado.
- **Riesgo — el WAF podría endurecerse** (rate limiting más agresivo, bloqueo de IPs de GitHub Actions) — mitigado por la frecuencia baja (6h) y un user-agent identificable; si ocurre, el comportamiento de fallo (a) de §4 ya cubre el caso sin romper el producto.
- **Riesgo legal/ético (evaluado, no ignorado):** WAF y `robots.txt` son señales distintas — el WAF bloquea por tipo de cliente (anti-bot genérico), `robots.txt` es la política explícita del sitio sobre qué se puede rastrear. Esta spec se ciñe a lo que `robots.txt` permite (§2) y usa un navegador real declarándose como tal, no técnicas de evasión dirigidas a un bloqueo específico — es scraping educado de contenido público institucional, no acceso no autorizado.
- **Fuera de alcance de esta versión:** geocodificación por dirección exacta de los eventos (solo se asocia a distrito por texto, vía spec 023, igual que el contexto mediático); notificaciones/alertas sobre eventos próximos (spec 014, si se retoma); cualquier filtro por categoría en la UI más allá de listar (fast-follow).

## 8. Historial

| Versión | Fecha | Cambio |
|---|---|---|
| 1 | 2026-08-26 | Creación (Draft) — verificación en vivo: WAF confirmado (bloquea HTTP simple), navegador real confirmado como necesario y suficiente, `robots.txt` revisado y permite explícitamente las páginas de ficha. Arquitectura fijada en GitHub Actions + Playwright (no Vercel function), siguiendo el precedente de la spec 017. Pendiente de aprobación antes de implementar. |
