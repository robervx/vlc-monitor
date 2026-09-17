// Panel de cámaras urbanas en vivo — spec 038 (Valencia ciudad) y spec 043
// (red viaria externa, DGT). Dos cajas separadas a partir de la
// reestructuración pedida por el usuario el 2026-09-17 — antes vivían juntas
// en un único `#camaras-panel`, pero son de naturaleza muy distinta (vídeo en
// directo con reproducción manual vs. imagen JPEG que se refresca sola) y
// las de la DGT no se pueden ver a tamaño grande como las de ciudad.
//
// Sin backend ni polling: son embeds/imágenes de terceros mostrados directo
// en el navegador de quien mira, nunca grabados ni rehosteados por nosotros
// (spec 038 §1). Diseño en tarjetas "clic para reproducir" (como el panel de
// referencia de World Monitor): nada de vídeo se carga hasta que se pulsa su
// tarjeta — así ninguna tarjeta se queda a medio cargar mostrando el título y
// la interfaz de YouTube por encima en vez de la imagen.
//
// Primer panel extraído de `main.ts` a `src/ui/` como demostración del
// patrón antes de aplicarlo al resto (ver spec 038 historial v6): cada panel
// vive en su propio módulo con una única función `montar*` que construye su
// DOM, lo cablea y no expone nada más — `main.ts` solo la llama.

import { camarasVisibles, type CamaraUrbana } from '../config/camaras-urbanas';
import { agruparPorCarretera, type CamaraExternaDgt } from '../services/camaras-dgt';
import camarasDgtValencia from '../../data/camaras-dgt-valencia.json' with { type: 'json' };

function buildCamarasPanel(): { root: HTMLDivElement; grid: HTMLDivElement } {
  const root = document.createElement('div');
  root.id = 'camaras-panel';
  root.hidden = true;
  root.innerHTML = `
    <div class="media-panel__header">Cámaras en vivo — Valencia ciudad</div>
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
 * Monta `#camaras-panel` (Valencia ciudad, spec 038) y lo cablea al checkbox
 * `toggle`. Sin backend ni polling: las tarjetas se construyen la primera
 * vez que se activa el panel, pero ningún vídeo se reproduce hasta que se
 * pulsa "Reproducir" en su tarjeta.
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

// ---------------------------------------------------------------------------
// spec 043 — cámaras urbanas EXTERNAS (red viaria que rodea Valencia: rondas,
// autovías de acceso), caja propia separada de las internas de arriba.
// Fuente: DGT, dataset "Cámaras DGT DATEX2 v3.7" (licencia Creative Commons
// Attribution — pública por defecto, sin gating de ADR-003, a diferencia de
// las internas). Imagen JPEG estática que se refresca sola cada ~2 min en
// origen (no un vídeo en directo — no se pueden ver a tamaño grande como las
// de ciudad) — aquí se fuerza un refresco periódico del lado del cliente con
// un parámetro de caché (`?t=timestamp`).
// ---------------------------------------------------------------------------
const REFRESCO_CAMARAS_DGT_MS = 120_000;

function buildCamarasDgtPanel(): HTMLDivElement {
  const root = document.createElement('div');
  root.id = 'camaras-dgt-panel';
  root.hidden = true;
  document.body.appendChild(root);
  return root;
}

function escapeHtmlLocal(s: string): string {
  const div = document.createElement('div');
  div.textContent = s;
  return div.innerHTML;
}

function renderCamarasExternasDgt(root: HTMLDivElement, camaras: CamaraExternaDgt[]): void {
  if (camaras.length === 0) {
    root.innerHTML = '<div class="media-panel__header">Cámaras en vías de acceso (DGT)</div><div class="info-panel__desc">Sin cámaras disponibles.</div>';
    return;
  }
  const grupos = agruparPorCarretera(camaras);
  root.innerHTML = `
    <div class="media-panel__header">Cámaras en vías de acceso (DGT)</div>
    <div class="agenda-panel__aviso">Imágenes en directo de la Dirección General de Tráfico (dataset "Cámaras DGT DATEX2 v3.7", licencia Creative Commons Attribution) — se actualizan cada ~2 min.</div>
    ${grupos
      .map(
        (g) => `
          <details class="camaras-dgt-carretera">
            <summary>${escapeHtmlLocal(g.carretera)} (${g.camaras.length})</summary>
            <div class="camaras-dgt-grid" data-carretera="${escapeHtmlLocal(g.carretera)}"></div>
          </details>
        `,
      )
      .join('')}
  `;
  const detalles = root.querySelectorAll<HTMLDivElement>('.camaras-dgt-grid');
  detalles.forEach((contenedor) => {
    const carretera = contenedor.dataset.carretera;
    const grupo = grupos.find((g) => g.carretera === carretera);
    if (!grupo) return;
    contenedor.innerHTML = grupo.camaras
      .map(
        (c) => `
          <figure class="camara-dgt-tile">
            <img class="camara-dgt-tile__img" loading="lazy" data-src="${escapeHtmlLocal(c.imagenUrl)}" alt="Cámara ${escapeHtmlLocal(c.carretera)} PK ${escapeHtmlLocal(c.pk)}" />
            <figcaption>PK ${escapeHtmlLocal(c.pk)} · sentido ${escapeHtmlLocal(c.sentido)}</figcaption>
          </figure>
        `,
      )
      .join('');
  });

  function refrescarImagenes(): void {
    root.querySelectorAll<HTMLImageElement>('.camara-dgt-tile__img').forEach((img) => {
      const base = img.dataset.src;
      if (base) img.src = `${base}?t=${Date.now()}`;
    });
  }
  refrescarImagenes();
  setInterval(refrescarImagenes, REFRESCO_CAMARAS_DGT_MS);
}

/**
 * Monta `#camaras-dgt-panel` (accesos, spec 043). Visibilidad por vista
 * gestionada por el router (`idsInteligencia` en `main.ts`), no por un
 * toggle propio — el contenido es estático (JSON local) y se renderiza de
 * una vez al montar.
 */
export function montarCamarasDgtPanel(): void {
  const root = buildCamarasDgtPanel();
  renderCamarasExternasDgt(root, camarasDgtValencia as CamaraExternaDgt[]);
}
