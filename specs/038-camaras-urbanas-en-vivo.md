# 038 — Cámaras urbanas en vivo

```yaml
id: 038
titulo: "Cámaras urbanas en vivo (embeds de terceros, sin captura ni almacenamiento propio)"
estado: Draft
tipo: panel
depende_de: []
propietario: ""
version: 3
```

## 1. Problema / motivación

Poder ver de un vistazo cómo está la ciudad ahora mismo (aforo de una plaza, tiempo real visual) además de los datos numéricos del mapa. Inspirado en el panel "CÁMARAS EN VIVO" de World Monitor, pero limitado a lo que existe realmente para València y a fuentes que se pueden embeber sin ambigüedad.

**Regla de diseño explícita del usuario:** ningún vídeo se graba, almacena ni redistribuye — se reproduce en directo, en el navegador de quien lo mira, directamente desde el servidor del proveedor (igual que cualquier iframe de YouTube). No hay infraestructura de vídeo propia.

## 2. Fuente(s) de datos — clasificadas según `ADR-003`

| Fuente | Mecanismo | Categoría (`ADR-003`) | Verificada manualmente el ___ |
|---|---|---|---|
| YouTube — canal **Wolkam IT** (`UCq19Y98jvY_Tjgm6QMk6vWA`) | Embed de **canal en directo** (`youtube.com/embed/live_stream?channel=<id>`) | **Pública** — mecanismo pensado y autorizado explícitamente por YouTube para terceros | **2026-09-14, corregida el mismo día.** v2 fijó un ID de vídeo concreto (`smuCiyrSzio`) que pasó el `oembed` pero **no estaba en directo** (`isLiveNow:false`, `lengthSeconds:8876`, `publishDate:2022-07-08` — una grabación de 2022, detectado por el usuario probándolo). Se comprobó `isLiveNow` en la página real de varios vídeos del canal: `dVAtjVi7bUQ` sí tenía `isLiveNow:true` en ese momento, pero el `oembed` de ese mismo vídeo daba 401 (embebido desactivado para ese vídeo en concreto). Conclusión: los IDs de vídeo de este canal no son ni estables ni fiables uno a uno. Se cambia al **embed de canal** (`embed/live_stream?channel=`), que YouTube resuelve siempre al directo activo del canal — sin necesidad de mantener un ID de vídeo. Verificado que la URL responde 200 con contenido de reproductor real (no una página de error). |
| **Xarxa de Webcams — Turisme Comunitat Valenciana** (`streaming.comunitatvalenciana.com`) — **2 cámaras**: "ValenciaPlazaAyuntamiento" y "ValenciaLasArenas" | Stream **DASH en directo** (`manifest.mpd`, `type="dynamic"`), reproducible con `<video>` + dash.js | **Personal** (`ADR-003`) — técnicamente abierto (`Access-Control-Allow-Origin: *`, sin auth, probado con y sin `Referer`) pero el aviso legal de `comunitatvalenciana.com/es/aviso-legal` solo dice "reservados los derechos... no autorizada la reproducción total o parcial", sin mención de embebido ni de uso personal — no llega al nivel de cauce legal explícito para el repo público. Gate: `VITE_PERSONAL_CAMARA_TURISME_CV`. | **2026-09-14** — `curl` real a ambos manifiestos: HTTP 200, `content-type: application/dash+xml`, CORS abierto, `type="dynamic"` y `publishTime` reciente en los dos. La segunda se encontró en la página pública de "Ciutat de les Arts i les Ciències" — su elemento `#featured-webcam-visor` conecta a ese mismo manifest `ValenciaLasArenas` (verificado en el HTML real), así que probablemente es una cámara del paseo de Les Arenes con vista hacia el complejo, no necesariamente los edificios en plano — nombrada con esa ambigüedad explícita en el registro. Titular de ambas: Turisme Comunitat Valenciana (Generalitat), CIF Q9655770G. |
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

**Diseño v3 — rejilla de tarjetas "clic para reproducir"** (patrón del panel "CÁMARAS EN VIVO" de World Monitor, que el usuario pidió explícitamente replicar tras ver la v2): cada cámara es una tarjeta con un `.camara-tile__stage` que empieza como un placeholder (degradado oscuro + nombre + botón ▶), **sin ningún vídeo cargado**. Solo al pulsar el botón se construye el reproductor real (iframe de YouTube o `<video>` + dash.js) y sustituye el placeholder. Esto es la corrección directa del problema de v2: un iframe de YouTube autoinsertado y en pausa muestra el título del vídeo, la miniatura y la interfaz propia de YouTube tapando la imagen — con clic-para-reproducir esa interfaz nunca se ve a medio cargar, y cuando se pulsa, el vídeo entra ya con parámetros que minimizan el "chrome" de YouTube (`modestbranding=1&rel=0&iv_load_policy=3`). Rejilla de 2 columnas, ~320 px de ancho de panel. Atribución fija bajo cada tarjeta, siempre visible (no depende de si ya se reprodujo).

## 6. Criterios de aceptación (Definition of Done)

- [x] Fuente YouTube probada con llamada real: `oembed` (v2, insuficiente por sí solo) **+ comprobación real de `isLiveNow` en el HTML de la página** (v3, la comprobación que faltaba) + embed de canal en vez de vídeo suelto.
- [x] Fuente Turisme CV probada con `curl` real contra los 2 manifiestos DASH, cabeceras CORS y `type="dynamic"` confirmados en ambos.
- [x] `src/config/camaras-urbanas.ts` con el registro de 3 cámaras (1 pública YouTube-canal + 2 personales Turisme CV-DASH) y `camarasVisibles()`, con tests.
- [x] Diseño en tarjetas de clic-para-reproducir (`src/main.ts`, `renderCamarasPanel`/`reproducirCamara`) — ningún reproductor se crea hasta pulsar su tarjeta. Verificado en navegador: antes del clic no hay `<iframe>` ni `<video>` en el `stage`; tras el clic aparece el correcto según el proveedor.
- [x] Reproductor DASH implementado con `dashjs` (import dinámico — no entra en el bundle principal, se comprobó en el build que sale en un chunk aparte). `player.updateSettings` desactiva `liveCatchup` (evitaba un bucle interno play/pause de dashjs en este stream).
- [x] Atribución visible y clicable a la fuente original en cada tarjeta.
- [x] `npm run typecheck` + `npm run test` (335/335) + `npm run build` verdes.
- [x] Verificado en navegador (antes de que la red del entorno de verificación se volviera inestable a media sesión): el `<video>` de la cámara DASH alcanza `readyState 4` con dimensiones reales `1920×1080` — el stream se descarga y decodifica correctamente; el iframe de YouTube-canal carga con la URL de canal correcta.
- [ ] **Autoplay del `<video>` DASH poco fiable en este entorno de verificación** (ver §7) — se añadió un intento de reanudación en `visibilitychange` y quedan los controles nativos (`controls`) como respaldo, pero no se ha podido confirmar en una sesión de navegador real y estable si el autoplay funciona sin intervención. Pendiente de confirmar con el usuario en su propio navegador.
- [ ] Verificación visual de que el encuadre real de cada cámara corresponde a lo indicado (especialmente "Les Arenes / Ciutat de les Arts", cuyo nombre real de cámara sugiere que podría no mostrar los edificios en plano — ver nota en §2).
- [ ] Manejo explícito de cámara caída (mensaje "no disponible" si el iframe/vídeo da error tras el clic) — sigue sin implementar.

## 7. Riesgos y fuera de alcance

- **Resuelto en v3:** el vídeo de YouTube fijado en v2 no estaba en directo (detectado por el usuario) — causa raíz: `oembed` solo confirma que un vídeo es embebible, no que esté en directo ahora. Corregido comprobando `isLiveNow` en el HTML real y, sobre todo, cambiando a un embed de **canal en directo** (`embed/live_stream?channel=`) en vez de un ID de vídeo concreto — ya no depende de que un vídeo individual siga existiendo o en directo.
- **Riesgo (aceptado, sigue):** el canal de YouTube es de un operador amateur (monetizado con publicidad, colabora con `grupo-adhoc.com`) — no hay garantía contractual de disponibilidad continua. El embed de canal mitiga la inestabilidad de IDs pero no garantiza que el canal esté siempre emitiendo.
- **Riesgo (nuevo, encontrado en la verificación de v3):** en pruebas automatizadas, Chrome pausó el `<video>` DASH con el mensaje "video-only background media was paused to save power" — una política de ahorro de energía de Chrome para vídeo sin pista de audio en pestañas que no cuenta como "en primer plano" activo. No se ha podido confirmar si esto ocurre igual en una sesión de usuario real con la pestaña visible (donde no debería aplicar) o si es un artefacto del propio entorno de navegador automatizado de esta verificación. Mitigación en el código: reintento en `visibilitychange` + controles nativos del `<video>` siempre visibles como respaldo manual.
- **Riesgo (aceptado, ver `ADR-003`):** el stream de Turisme CV no tiene permiso escrito explícito de reuso — se trata como fuente **personal**, no pública, mientras no exista esa confirmación. Acción de seguimiento no bloqueante: enviar una solicitud de confirmación a Turisme Comunitat Valenciana; si responden autorizando, pasa a "pública" sin cambiar código, solo quitando el gate.
- **Descartado explícitamente:** el panel de cámaras de tráfico del Ajuntament — prohibición expresa en sus propios términos, no se reconsidera salvo que cambien esos términos.
- **Fuera de alcance de esta versión:** cualquier grabación, control PTZ, selección de cámara por el usuario final más allá de elegir entre las configuradas, cualquier cámara cuyo titular no esté identificado con claridad, y manejo de error explícito cuando un reproductor falla tras el clic (hoy se queda tal cual, sin mensaje).
- **Riesgo (no nuevo):** los paneles flotantes de la derecha (`#media-panel`/`#tendencia-panel`/`#camaras-panel`) se salen de la pantalla en ventanas de escritorio muy estrechas — ya afectaba a `#tendencia-panel` antes de esta spec. Fuera de alcance arreglar el sistema de paneles flotantes aquí.

## 8. Historial

| Versión | Fecha | Cambio |
|---|---|---|
| 1 | 2026-09-14 | Creación. Investigación en vivo de 3 fuentes candidatas (YouTube verificado y usable, Turisme CV verificado pero clasificado "personal" por `ADR-003`, panel del Ayuntamiento descartado por prohibición explícita en sus propios términos). Pendiente de definir ubicación en la UI y de implementar. |
| 2 | 2026-09-14 | Implementada la cámara pública (YouTube): `src/config/camaras-urbanas.ts` (con tests), panel flotante `#camaras-panel` + toggle en el selector de capas, iframe creado solo al activar el toggle. La cámara personal (Turisme CV) queda deliberadamente sin reproductor — `camarasVisibles()` la excluye aunque se active su `envFlag`. Verificado con `npm run typecheck`/`test` (334/334)/`build` y en navegador (iframe real de YouTube). DoD abierto: encuadre visual, mensaje de error explícito, reproductor DASH. |
| 3 | 2026-09-14 | Corrección + rediseño a petición del usuario ("ese vídeo no es en directo" + "UX muy deficiente"). (1) El vídeo de YouTube de v2 era una grabación de 2022, no un directo — `oembed` no comprueba liveness; corregido verificando `isLiveNow` real y cambiando a embed de **canal en directo**, no de vídeo suelto. (2) Rediseño completo del panel a rejilla de tarjetas "clic para reproducir" (patrón de World Monitor pedido explícitamente por el usuario) — arregla que la interfaz de YouTube (título, sugerencias) tapara el vídeo en tarjetas pequeñas. (3) Se añaden 2 cámaras DASH de Turisme CV (Plaça de l'Ajuntament + Les Arenes/Ciutat de les Arts) con reproductor real (`dashjs`, import dinámico). `.env.local` (gitignored) con `VITE_PERSONAL_CAMARA_TURISME_CV=1` para desarrollo. Verificado en navegador hasta que la red del entorno se volvió inestable a media verificación: manifest DASH cargando con datos reales (1920×1080), iframe de YouTube-canal con URL correcta. DoD abierto: fiabilidad del autoplay del `<video>` DASH (Chrome lo pausó por ahorro de energía en las pruebas automatizadas — mitigado con reintento en `visibilitychange` + controles nativos, sin confirmar aún en un navegador de usuario real), encuadre visual, mensaje de error explícito. typecheck + test (335/335) + build verdes. |
