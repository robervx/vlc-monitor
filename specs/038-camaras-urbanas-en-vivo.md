# 038 — Cámaras urbanas en vivo

```yaml
id: 038
titulo: "Cámaras urbanas en vivo (embeds de terceros, sin captura ni almacenamiento propio)"
estado: Draft
tipo: panel
depende_de: []
propietario: ""
version: 4
```

## 1. Problema / motivación

Poder ver de un vistazo cómo está la ciudad ahora mismo (aforo de una plaza, tiempo real visual) además de los datos numéricos del mapa. Inspirado en el panel "CÁMARAS EN VIVO" de World Monitor, pero limitado a lo que existe realmente para València y a fuentes que se pueden embeber sin ambigüedad.

**Regla de diseño explícita del usuario:** ningún vídeo se graba, almacena ni redistribuye — se reproduce en directo, en el navegador de quien lo mira, directamente desde el servidor del proveedor (igual que cualquier iframe de YouTube). No hay infraestructura de vídeo propia.

## 2. Fuente(s) de datos — clasificadas según `ADR-003`

| Fuente | Mecanismo | Categoría (`ADR-003`) | Verificada manualmente el ___ |
|---|---|---|---|
| ~~YouTube — canal Wolkam IT~~ | ~~Embed de canal en directo~~ | **Retirada en v4** | El canal amateur no estaba emitiendo cuando el usuario lo probó ("no disponible") y no hay garantía contractual de que emita nunca — colaboraba con `grupo-adhoc.com`, sin ningún compromiso de servicio. A petición explícita del usuario ("quitar la cámara que no se ve nada"), se retira del registro. No se sustituye por otro canal de YouTube en esta versión — no se encontró ninguna cámara 24/7 institucional de Valencia en YouTube (se comprobó el canal oficial de "Ciudad de las Artes y las Ciencias": solo tiene grabaciones de conferencias puntuales, `isLiveNow:false` en todas, no un directo permanente). |
| **Xarxa de Webcams — Turisme Comunitat Valenciana** (`streaming.comunitatvalenciana.com`) — **2 cámaras**: "ValenciaPlazaAyuntamiento" y "ValenciaLasArenas" | Stream **DASH en directo** (`manifest.mpd`, `type="dynamic"`), reproducible con `<video>` + dash.js | **Personal** (`ADR-003`) — técnicamente abierto (`Access-Control-Allow-Origin: *`, sin auth, probado con y sin `Referer`) pero el aviso legal de `comunitatvalenciana.com/es/aviso-legal` solo dice "reservados los derechos... no autorizada la reproducción total o parcial", sin mención de embebido ni de uso personal — no llega al nivel de cauce legal explícito para el repo público. Gate: `VITE_PERSONAL_CAMARA_TURISME_CV`. | **2026-09-14** — `curl` real a ambos manifiestos: HTTP 200, `content-type: application/dash+xml`, CORS abierto, `type="dynamic"` y `publishTime` reciente en los dos. **Corrección v4:** el usuario, viendo la v3 en directo, señaló que la segunda cámara "no es ni Valencia" — investigado a fondo: **sí es Valencia**, pero estaba mal etiquetada. Se llamaba "Les Arenes / Ciutat de les Arts" porque su manifest (`ValenciaLasArenas`) aparecía embebido también en la página de Turisme CV de "Ciutat de les Arts i les Ciències" (`#featured-webcam-visor` del HTML real) — pero esa cámara **no enseña el complejo Calatrava**, enseña la Platja de Les Arenes / El Cabanyal, junto al Hostal Miramar. Hay una página propia y dedicada que lo confirma (`.../webcams/valencia-las-arenas`, título "Valencia, Las Arenas Beach (Hostal Miramar)"), y la nota de prensa oficial de Turisme CV la describe igual ("la animada zona portuaria desde la playa de Las Arenas en València"). Conclusión: el vídeo era correcto, la **etiqueta prometía un sitio que la cámara no enseña** — corregida a "Platja de Les Arenes / El Cabanyal", que es lo que de verdad se ve. Titular de ambas: Turisme Comunitat Valenciana (Generalitat), CIF Q9655770G. Se buscó una tercera cámara distinta de Valencia ciudad en la misma red y no se encontró ninguna más (solo estas 2 páginas dedicadas a la ciudad; el resto de la red son otros municipios de la Comunitat) — ver §7. |
| Panel oficial de cámaras de tráfico del Ajuntament de València ("València al minut") | — | **Descartada** | **2026-09-14** — sus propios términos publicados prohíben explícitamente "grabación, reproducción, distribución o cesión" de esas imágenes en otros sitios web; son "solo para gestión de tráfico". No es una fuente candidata bajo ninguna categoría, ni siquiera personal — es una prohibición expresa, no una ambigüedad. |

## 3. Contrato de datos (normalizado)

No hay pipeline de datos que normalizar (no hay JSON que transformar) — es una **lista de configuración estática**, mismo espíritu que `src/config/marca.ts`, no un endpoint con caché:

```typescript
type ProveedorCamara = 'youtube' | 'turisme-cv-dash';

interface CamaraUrbana {
  id: string;
  nombre: string;              // "Plaza del Ayuntamiento (24h)"
  proveedor: ProveedorCamara;
  categoria: 'publica' | 'personal';
  envFlag?: string;             // solo si categoria === 'personal', p.ej. "VITE_PERSONAL_CAMARA_TURISME_CV"
  youtubeChannelId?: string;    // id de CANAL (no de vídeo) — ver nota v3 en §2
  manifestUrl?: string;         // URL del manifest DASH
  atribucion: string;           // "Wolkam IT · YouTube" / "Xarxa de Webcams — Turisme Comunitat Valenciana"
  fuenteUrl: string;            // enlace a la página original, para atribución clicable
}
```

## 4. Pipeline (seed → caché → endpoint)

No aplica el patrón habitual — no hay fuente que cachear en servidor, es un `<iframe>`/`<video>` apuntando directo al proveedor desde el cliente. Registro estático `src/config/camaras-urbanas.ts` (mismo patrón `def()` que `map-layer-definitions.ts`, sin backend).

| Parámetro | Valor |
|---|---|
| Frecuencia de refresco | N/A — es un directo, no un dato que se recachea |
| Comportamiento si la fuente falla | La tarjeta de esa cámara muestra "no disponible ahora mismo" en vez de un hueco roto (evento `error` del `<video>`/iframe); el resto de cámaras no se ven afectadas |
| Endpoint interno | Ninguno — no hay dato que servir desde `/api` |

## 5. Contrato de panel (no geoespacial, igual patrón que spec 009 §5)

```typescript
{
  key: 'camarasUrbanas',
  specId: '038',
  renderers: ['panel'],
  zoomMinimo: 0,
  agregacion: 'lista',
  icono: '📹',
}
```

Ubicación en la UI: **panel flotante** `#camaras-panel`, mismo estilo que `#media-panel`/`#tendencia-panel` (spec 009), a la izquierda de ambos. Toggle "Cámaras en vivo" en el grupo "Contexto e informativas" del selector de capas.

**Diseño en tarjetas "clic para reproducir"** (patrón del panel "CÁMARAS EN VIVO" de World Monitor, pedido explícitamente por el usuario): cada cámara es una tarjeta con un `.camara-tile__stage` que empieza como un placeholder (degradado oscuro + botón ▶), **sin ningún vídeo cargado**. Solo al pulsar el botón se construye el reproductor real (`<video>` + dash.js) y sustituye el placeholder. El nombre de la cámara vive **fuera** del stage, en una línea siempre visible encima (v4 — en v3 estaba superpuesto dentro del placeholder y desaparecía al reproducir). **v4 — columna única a 16:9 real** (antes rejilla de 2 columnas a 4:3): las cámaras de Turisme CV son `1920×1080`, un recuadro 4:3 las recortaba por los lados — reportado por el usuario como "no sale el recuadro como toca". Atribución fija bajo cada tarjeta, siempre visible.

## 6. Criterios de aceptación (Definition of Done)

- [x] Fuente Turisme CV probada con `curl` real contra los 2 manifiestos DASH, cabeceras CORS y `type="dynamic"` confirmados en ambos.
- [x] `src/config/camaras-urbanas.ts` con el registro de **2 cámaras personales** Turisme CV-DASH (v4: la de YouTube se retiró, ver §2) y `camarasVisibles()`, con tests — incluye un test explícito de que la cámara de la playa ya no se llama como el complejo Ciutat de les Arts.
- [x] Diseño en tarjetas de clic-para-reproducir (`src/main.ts`, `renderCamarasPanel`/`reproducirCamara`) — ningún reproductor se crea hasta pulsar su tarjeta.
- [x] Reproductor DASH implementado con `dashjs` (import dinámico — no entra en el bundle principal, confirmado en un chunk aparte del build). `player.updateSettings` desactiva `liveCatchup`.
- [x] Atribución visible y clicable a la fuente original en cada tarjeta; nombre de la cámara siempre visible (v4, corregido — antes desaparecía al reproducir).
- [x] Recuadro a 16:9 real, sin recortar la imagen — verificado en navegador: `stage` a 284×159,75 px, ratio 1.78 = 16:9 exacto, igual que el vídeo real (`1920×1080`).
- [x] `npm run typecheck` + `npm run test` (335/335) + `npm run build` verdes.
- [x] **Verificado en navegador con red estable** (v4, pendiente de v3): las 2 cámaras DASH reproducen en directo de verdad — `currentTime` avanza en tiempo real (2,0003 s reales en 2 s de espera), `readyState 4`, `1920×1080`, imagen real reconocible de la plaza y de la playa (capturas de pantalla comprobadas). Se corrigió el nombre de la segunda cámara tras confirmar con una página dedicada + la nota de prensa oficial de Turisme CV qué es lo que realmente enseña.
- [x] Cámara de YouTube retirada a petición del usuario — no sustituida por falta de una alternativa fiable (ver §2/§7).
- [ ] **Autoplay del `<video>` DASH sigue sin ser 100% fiable**: en el entorno de verificación automatizado, Chrome lo pausa a veces por su política de ahorro de energía para vídeo sin audio en pestañas que no cuenta como "en primer plano" — en una pasada con red estable SÍ reprodujo solo; en otras pasadas del mismo entorno, no. Mitigación en el código: reintento en `visibilitychange` + controles nativos (`controls`) del `<video>` siempre visibles. Pendiente de confirmar en un navegador de usuario real (fuera del entorno de verificación) si hace falta darle al play a mano alguna vez.
- [ ] Manejo explícito de cámara caída (mensaje "no disponible" si el vídeo da error tras el clic) — sigue sin implementar.
- [ ] Solo 2 puntos de la ciudad — el usuario pidió más; no se encontró una tercera cámara distinta de Valencia ciudad con cauce técnico/legal claro en esta ronda de investigación (ver §7).

## 7. Riesgos y fuera de alcance

- **Resuelto en v3:** el vídeo de YouTube fijado en v2 no estaba en directo — `oembed` solo confirma que un vídeo es embebible, no que esté en directo. Corregido comprobando `isLiveNow` real y cambiando a embed de canal.
- **Resuelto en v4 — retirada la cámara de YouTube:** el canal amateur ("Wolkam IT") no estaba emitiendo cuando el usuario lo probó tras el cambio a embed de canal — sin garantía contractual de disponibilidad, se retira del registro a petición explícita. Se investigó una alternativa institucional (canal oficial de "Ciudad de las Artes y las Ciencias") y no tiene directo permanente, solo grabaciones puntuales de eventos — no hay sustituto de YouTube fiable identificado todavía.
- **Resuelto en v4 — corregido el nombre de la cámara de la playa:** no era una cámara equivocada, era una **etiqueta equivocada** — mostraba la Platja de Les Arenes / El Cabanyal pero se llamaba "Ciutat de les Arts" porque su manifest se encontró embebido en esa página de Turisme CV. Confirmado con la página dedicada real (`valencia-las-arenas`) y la nota de prensa oficial. Lección: cuando un manifest aparece en la página de un sitio distinto al que dio nombre a la variable, verificar con la página **propia y dedicada** de esa cámara antes de nombrarla, no con la primera página donde aparezca.
- **Riesgo (sin resolver del todo):** en pruebas automatizadas, Chrome pausó el `<video>` DASH por su política de ahorro de energía para vídeo sin audio en pestañas sin foco — en una pasada con red estable reprodujo solo sin intervención, en otras no. Mitigación: reintento en `visibilitychange` + controles nativos siempre visibles como respaldo manual. No confirmado aún en un navegador de usuario real fuera de este entorno de verificación.
- **Riesgo (aceptado, ver `ADR-003`):** el stream de Turisme CV no tiene permiso escrito explícito de reuso — se trata como fuente **personal**, no pública, mientras no exista esa confirmación. Con la cámara de YouTube retirada, **hoy no hay ninguna cámara "pública" activa por defecto en el repo público** — solo las 2 personales, gateadas. Acción de seguimiento no bloqueante: enviar una solicitud de confirmación a Turisme Comunitat Valenciana.
- **Descartado explícitamente:** el panel de cámaras de tráfico del Ajuntament — prohibición expresa en sus propios términos.
- **Fuera de alcance de esta versión:** más de 2 puntos de la ciudad (se buscó y no se encontró una tercera cámara de Valencia-ciudad con cauce claro en la misma red de Turisme CV; si el usuario conoce o encuentra otra cámara/página concreta, investigarla puntualmente rinde mejor que buscar en general — así se encontraron las 2 actuales), grabación, control PTZ, y manejo de error explícito cuando un reproductor falla tras el clic.
- **Riesgo (no nuevo):** los paneles flotantes de la derecha se salen de la pantalla en ventanas de escritorio muy estrechas — ya afectaba a `#tendencia-panel` antes de esta spec.

## 8. Historial

| Versión | Fecha | Cambio |
|---|---|---|
| 1 | 2026-09-14 | Creación. Investigación en vivo de 3 fuentes candidatas (YouTube verificado y usable, Turisme CV verificado pero clasificado "personal" por `ADR-003`, panel del Ayuntamiento descartado por prohibición explícita en sus propios términos). Pendiente de definir ubicación en la UI y de implementar. |
| 2 | 2026-09-14 | Implementada la cámara pública (YouTube): `src/config/camaras-urbanas.ts` (con tests), panel flotante `#camaras-panel` + toggle en el selector de capas, iframe creado solo al activar el toggle. La cámara personal (Turisme CV) queda deliberadamente sin reproductor — `camarasVisibles()` la excluye aunque se active su `envFlag`. Verificado con `npm run typecheck`/`test` (334/334)/`build` y en navegador (iframe real de YouTube). DoD abierto: encuadre visual, mensaje de error explícito, reproductor DASH. |
| 3 | 2026-09-14 | Corrección + rediseño a petición del usuario ("ese vídeo no es en directo" + "UX muy deficiente"). (1) El vídeo de YouTube de v2 era una grabación de 2022, no un directo — `oembed` no comprueba liveness; corregido verificando `isLiveNow` real y cambiando a embed de **canal en directo**, no de vídeo suelto. (2) Rediseño completo del panel a rejilla de tarjetas "clic para reproducir" (patrón de World Monitor pedido explícitamente por el usuario) — arregla que la interfaz de YouTube (título, sugerencias) tapara el vídeo en tarjetas pequeñas. (3) Se añaden 2 cámaras DASH de Turisme CV (Plaça de l'Ajuntament + Les Arenes/Ciutat de les Arts) con reproductor real (`dashjs`, import dinámico). `.env.local` (gitignored) con `VITE_PERSONAL_CAMARA_TURISME_CV=1` para desarrollo. Verificado en navegador hasta que la red del entorno se volvió inestable a media verificación: manifest DASH cargando con datos reales (1920×1080), iframe de YouTube-canal con URL correcta. DoD abierto: fiabilidad del autoplay del `<video>` DASH (Chrome lo pausó por ahorro de energía en las pruebas automatizadas — mitigado con reintento en `visibilitychange` + controles nativos, sin confirmar aún en un navegador de usuario real), encuadre visual, mensaje de error explícito. typecheck + test (335/335) + build verdes. |
| 4 | 2026-09-14 | Tres correcciones a petición del usuario tras ver la v3 en directo. (1) **Retirada la cámara de YouTube** — el canal no estaba emitiendo; sin sustituto identificado (se investigó el canal oficial de Ciutat de les Arts, sin directo permanente). Hoy el registro son 2 cámaras, ambas "personales" (`ADR-003`) — no hay ninguna "pública" activa por defecto. (2) **Corregido el nombre de la cámara de la playa** de "Les Arenes / Ciutat de les Arts" a "Platja de Les Arenes / El Cabanyal": no era la cámara equivocada, era la etiqueta — no enseña el complejo Calatrava, enseña la playa junto al Hostal Miramar (confirmado con la página dedicada real de Turisme CV y su nota de prensa oficial). (3) **Recuadro corregido a 16:9 real** (antes 4:3, recortaba el 1920×1080 real de las cámaras) y rediseño a columna única con el nombre siempre visible fuera del "stage" (antes desaparecía al reproducir). Verificado en navegador con red ya estable: **las 2 cámaras reproducen en directo de verdad** (`currentTime` avanza en tiempo real, imagen real reconocible de la plaza y de la playa). `npm run typecheck`/`test` (335/335)/`build` verdes. DoD abierto: fiabilidad del autoplay fuera de este entorno de verificación, mensaje de error explícito, una tercera cámara de otro punto de la ciudad (no encontrada todavía con cauce claro). |
