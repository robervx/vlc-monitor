// Panel de cámaras urbanas en vivo — spec 038.
//
// Sin backend ni polling: son embeds de terceros reproducidos directo en el
// navegador de quien mira, nunca grabados ni rehosteados por nosotros (ver
// spec 038 §1). Diseño en tarjetas "clic para reproducir" (como el panel de
// referencia de World Monitor): nada de vídeo se carga hasta que se pulsa su
// tarjeta — así ninguna tarjeta se queda a medio cargar mostrando el título y
// la interfaz de YouTube por encima en vez de la imagen.
//
// Primer panel extraído de `main.ts` a `src/ui/` como demostración del
// patrón antes de aplicarlo al resto (ver spec 038 historial v6): cada panel
// vive en su propio módulo con una única función `montar*` que construye su
// DOM, lo cablea y no expone nada más — `main.ts` solo la llama.

import { camarasVisibles, type CamaraUrbana } from '../config/camaras-urbanas';

function buildCamarasPanel(): { root: HTMLDivElement; grid: HTMLDivElement } {
  const root = document.createElement('div');
  root.id = 'camaras-panel';
  root.hidden = true;
  root.innerHTML = `
    <div class="media-panel__header">Cámaras en vivo</div>
    <div class="camaras-grid" id="camaras-panel-grid"></div>
  `;
  document.body.appendChild(root);
  return { root, grid: root.querySelector('#camaras-panel-grid')! };
}

/** Parámetros que minimizan la interfaz propia de YouTube (título, sugerencias, marca). */
function iframeYoutubeCanal(channelId: string, nombre: string): HTMLIFrameElement {
  const src =
    `https://www.youtube.com/embed/live_stream?channel=${encodeURIComponent(channelId)}` +
    '&autoplay=1&mute=1&modestbranding=1&rel=0&iv_load_policy=3&playsinline=1';
  const iframe = document.createElement('iframe');
  iframe.className = 'camara-tile__player';
  iframe.src = src;
  iframe.title = nombre;
  iframe.allow = 'autoplay; encrypted-media; picture-in-picture';
  iframe.allowFullscreen = true;
  iframe.referrerPolicy = 'strict-origin-when-cross-origin';
  return iframe;
}

/** Reproductor DASH (spec 038 §7, cámara "personal" — solo llega aquí si su envFlag está activo). */
async function reproducirDash(stage: HTMLElement, manifestUrl: string): Promise<void> {
  const video = document.createElement('video');
  video.className = 'camara-tile__player camara-tile__player--video';
  video.muted = true;
  video.autoplay = true;
  video.playsInline = true;
  video.controls = true;
  stage.appendChild(video);
  try {
    const { MediaPlayer } = await import('dashjs');
    const player = MediaPlayer().create();
    // El "live catchup" (acelerar/recortar buffer para pegarse al directo) de
    // dashjs entraba en un bucle play/pause en este stream — se desactiva y se
    // deja un colchón de buffer algo mayor antes del borde en directo.
    player.updateSettings({
      streaming: { liveCatchup: { enabled: false }, delay: { liveDelayFragmentCount: 4 } },
    });
    // spec 038 v5 — dash.js puede fallar de forma asíncrona tras initialize()
    // (p.ej. El Saler: manifiesto con códec mal formado, "No streams to
    // play"), sin lanzar una excepción que el try/catch de abajo pueda
    // atrapar. Sin este listener, la tarjeta se queda con un <video> vacío e
    // indefinido en vez de avisar.
    player.on(MediaPlayer.events.ERROR, () => {
      player.destroy();
      stage.innerHTML = '<div class="camara-tile__error">No disponible ahora mismo</div>';
    });
    player.initialize(video, manifestUrl, true);
    // Chrome pausa por ahorro de energía el vídeo-solo-sin-audio que queda en
    // una pestaña en segundo plano ("video-only background media was paused
    // to save power") — se reintenta al volver a primer plano. Con controles
    // nativos visibles (arriba), la persona siempre puede darle a play a mano.
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible' && video.paused && video.isConnected) {
        void video.play().catch(() => {});
      }
    });
  } catch (err) {
    console.error('Fallo al iniciar el reproductor DASH:', err);
    stage.innerHTML = '<div class="camara-tile__error">No disponible ahora mismo</div>';
  }
}

function reproducirCamara(stage: HTMLElement, camara: CamaraUrbana): void {
  stage.innerHTML = '';
  if (camara.proveedor === 'youtube-canal' && camara.youtubeChannelId) {
    stage.appendChild(iframeYoutubeCanal(camara.youtubeChannelId, camara.nombre));
  } else if (camara.proveedor === 'turisme-cv-dash' && camara.manifestUrl) {
    void reproducirDash(stage, camara.manifestUrl);
  } else {
    stage.innerHTML = '<div class="camara-tile__error">No disponible</div>';
  }
}

function renderCamarasPanel(panel: { grid: HTMLDivElement }, camaras: CamaraUrbana[]): void {
  // El nombre vive fuera del "stage" (a diferencia de v3) para que se siga
  // viendo una vez reproduciendo — antes se borraba junto al placeholder.
  panel.grid.innerHTML = camaras
    .map(
      (_, i) => `
        <div class="camara-tile">
          <div class="camara-tile__nombre"></div>
          <div class="camara-tile__stage" data-camara-index="${i}">
            <button type="button" class="camara-tile__play">▶</button>
          </div>
          <a class="camara-tile__atribucion" target="_blank" rel="noopener noreferrer"></a>
        </div>
      `,
    )
    .join('');

  panel.grid.querySelectorAll<HTMLDivElement>('.camara-tile').forEach((tile, i) => {
    const camara = camaras[i];
    if (!camara) return;
    const stage = tile.querySelector<HTMLDivElement>('.camara-tile__stage')!;
    tile.querySelector('.camara-tile__nombre')!.textContent = camara.nombre;
    const atribucion = tile.querySelector<HTMLAnchorElement>('.camara-tile__atribucion')!;
    atribucion.href = camara.fuenteUrl;
    atribucion.textContent = `${camara.atribucion} ↗`;
    stage.querySelector('.camara-tile__play')!.addEventListener(
      'click',
      () => reproducirCamara(stage, camara),
      { once: true },
    );
  });
}

/**
 * Monta `#camaras-panel` (oculto) y lo cablea al checkbox `toggle`.
 * Sin backend ni polling: las tarjetas se construyen la primera vez que se
 * activa el panel, pero ningún vídeo se reproduce hasta que se pulsa
 * "Reproducir" en su tarjeta (ver `renderCamarasPanel`).
 */
export function montarCamarasPanel(toggle: HTMLInputElement): void {
  const camarasPanel = buildCamarasPanel();
  let camarasCargadas = false;
  toggle.addEventListener('change', () => {
    camarasPanel.root.hidden = !toggle.checked;
    if (toggle.checked && !camarasCargadas) {
      camarasCargadas = true;
      const camaras = camarasVisibles();
      if (camaras.length > 0) {
        renderCamarasPanel(camarasPanel, camaras);
      } else {
        camarasPanel.grid.textContent = 'No hay cámaras disponibles en esta build.';
      }
    }
  });
}
