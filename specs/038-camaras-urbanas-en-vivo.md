# 038 — Cámaras urbanas en vivo

```yaml
id: 038
titulo: "Cámaras urbanas en vivo (embeds de terceros, sin captura ni almacenamiento propio)"
estado: Draft
tipo: panel
depende_de: []
propietario: ""
version: 1
```

## 1. Problema / motivación

Poder ver de un vistazo cómo está la ciudad ahora mismo (aforo de una plaza, tiempo real visual) además de los datos numéricos del mapa. Inspirado en el panel "CÁMARAS EN VIVO" de World Monitor, pero limitado a lo que existe realmente para València y a fuentes que se pueden embeber sin ambigüedad.

**Regla de diseño explícita del usuario:** ningún vídeo se graba, almacena ni redistribuye — se reproduce en directo, en el navegador de quien lo mira, directamente desde el servidor del proveedor (igual que cualquier iframe de YouTube). No hay infraestructura de vídeo propia.

## 2. Fuente(s) de datos — clasificadas según `ADR-003`

| Fuente | Mecanismo | Categoría (`ADR-003`) | Verificada manualmente el ___ |
|---|---|---|---|
| YouTube — canal **Wolkam IT**, "🍊 VALENCIA EN DIRECTO - LIVE 24h/365d" | Embed oficial de YouTube (`youtube.com/embed/<id>`) | **Pública** — mecanismo pensado y autorizado explícitamente por YouTube para terceros | **2026-09-14** — confirmado con la API pública `oembed` de YouTube: `id=smuCiyrSzio`, HTTP 200, devuelve `<iframe src="youtube.com/embed/smuCiyrSzio">` válido. Otros 2 vídeos candidatos encontrados por búsqueda (`dVAtjVi7bUQ`, `t_ooBUbe5O4`, ambos etiquetados de Fallas 2026, probablemente temporales) devolvieron 401 — **no usar sin re-verificar con `oembed` antes de implementar**, los IDs de directos de YouTube no son estables. |
| **Xarxa de Webcams — Turisme Comunitat Valenciana** (`streaming.comunitatvalenciana.com`), cámara "ValenciaPlazaAyuntamiento" | Stream **DASH en directo** (`manifest.mpd`, `type="dynamic"`), reproducible con `<video>` + Shaka Player o dash.js | **Personal** (`ADR-003`) — técnicamente abierto (`Access-Control-Allow-Origin: *`, sin auth, probado con y sin `Referer`) pero el aviso legal de `comunitatvalenciana.com/es/aviso-legal` solo dice "reservados los derechos... no autorizada la reproducción total o parcial", sin mención de embebido ni de uso personal — no llega al nivel de cauce legal explícito para el repo público. Gate: `VITE_PERSONAL_CAMARA_TURISME_CV`. | **2026-09-14** — `curl` real al manifest: HTTP 200, `content-type: application/dash+xml`, cabeceras CORS abiertas confirmadas. Titular: Turisme Comunitat Valenciana (Generalitat), CIF Q9655770G. |
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
  embedId?: string;             // id de vídeo de YouTube
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

Ubicación en la UI: **a decidir** — por defecto, panel flotante igual que `#media-panel` (spec 009), salvo que el usuario prefiera integrarlo en el sidebar junto al panel de redes (`039`), que sí tiene ubicación decidida (sidebar izquierdo).

## 6. Criterios de aceptación (Definition of Done)

- [x] Fuente YouTube probada con llamada real a su API pública (`oembed`), no solo documentación.
- [x] Fuente Turisme CV probada con `curl` real contra el manifest DASH, cabeceras CORS confirmadas.
- [ ] `src/config/camaras-urbanas.ts` con el registro de cámaras (patrón `def()`).
- [ ] Verificación visual de que el encuadre real de la cámara de YouTube corresponde a lo indicado en su título (el título no lo confirma explícitamente — pendiente de mirar el directo).
- [ ] Reproducción de la cámara pública (YouTube) en un panel, sin controles de descarga/grabación en la UI.
- [ ] Reproducción de la cámara personal (Turisme CV, DASH) solo cuando `VITE_PERSONAL_CAMARA_TURISME_CV` está definida; ausente por defecto en el repo/demo pública — verificar que sin la variable la tarjeta ni se registra (no solo que esté oculta con CSS).
- [ ] Atribución visible y clicable a la fuente original en cada tarjeta.
- [ ] Manejo explícito de cámara caída (mensaje, no hueco roto).
- [ ] `npm run typecheck` + `npm run test` + `npm run build` verdes, verificado en navegador con las cámaras reales.

## 7. Riesgos y fuera de alcance

- **Riesgo:** los directos de YouTube no tienen IDs estables — un canal puede terminar un directo y empezar uno nuevo con otro ID. Re-verificar con `oembed` antes de fijar el ID en producción y periódicamente después (a diferencia de una capa de datos, aquí no hay forma de "detectar" el cambio automáticamente salvo que el vídeo deje de responder).
- **Riesgo (aceptado, ver `ADR-003`):** el stream de Turisme CV no tiene permiso escrito explícito de reuso — se trata como fuente **personal**, no pública, mientras no exista esa confirmación. Acción de seguimiento no bloqueante: enviar una solicitud de confirmación a Turisme Comunitat Valenciana; si responden autorizando, esta fuente pasa a "pública" sin cambiar código, solo quitando el gate.
- **Descartado explícitamente:** el panel de cámaras de tráfico del Ajuntament — prohibición expresa en sus propios términos, no se reconsidera salvo que cambien esos términos.
- **Fuera de alcance de esta versión:** cualquier grabación, control PTZ, selección de cámara por el usuario final más allá de elegir entre las configuradas, y cualquier cámara cuyo titular no esté identificado con claridad.

## 8. Historial

| Versión | Fecha | Cambio |
|---|---|---|
| 1 | 2026-09-14 | Creación. Investigación en vivo de 3 fuentes candidatas (YouTube verificado y usable, Turisme CV verificado pero clasificado "personal" por `ADR-003`, panel del Ayuntamiento descartado por prohibición explícita en sus propios términos). Pendiente de definir ubicación en la UI y de implementar. |
