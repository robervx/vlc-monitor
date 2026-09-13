// Panel "Actualidad institucional en redes" — spec 039, sección del sidebar (spec 019).
//
// Cada entidad puede tener un widget de Facebook (Page Plugin) y/o de X (embed
// de timeline vía publish.x.com) — ninguno de los dos usa la API de pago
// (CLAUDE.md §3, aclarado tras `ADR-003`). Sin filtrado ni fusión cronológica
// entre entidades: es una limitación estructural de los iframes de origen
// cruzado que Facebook/X controlan por completo, no un defecto de esta
// implementación (spec 039 §1) — cada ficha muestra su propio widget.
//
// Carga diferida (spec 039 §4/§6): los SDK de Facebook y de X, que fijan sus
// propias cookies, solo se piden la primera vez que se abre la ficha de una
// entidad — nunca en el arranque de la app ni al abrir el panel en general.
import { ENTIDADES_REDES, type EntidadRed } from '../config/entidades-redes';

const TIEMPO_FALLBACK_MS = 8000;

interface VentanaConSdks extends Window {
  FB?: { init: (opts: Record<string, unknown>) => void; XFBML: { parse: (el?: HTMLElement) => void } };
  fbAsyncInit?: () => void;
  twttr?: { widgets?: { load: (el?: HTMLElement) => void } };
}

let fbSdkPromise: Promise<void> | null = null;
let xSdkPromise: Promise<VentanaConSdks['twttr']> | null = null;

function cargarFacebookSdk(): Promise<void> {
  if (fbSdkPromise) return fbSdkPromise;
  fbSdkPromise = new Promise((resolve) => {
    const w = window as VentanaConSdks;
    if (w.FB) {
      resolve();
      return;
    }
    if (!document.getElementById('fb-root')) {
      const root = document.createElement('div');
      root.id = 'fb-root';
      document.body.appendChild(root);
    }
    w.fbAsyncInit = () => {
      w.FB!.init({ xfbml: false, version: 'v21.0' });
      resolve();
    };
    const script = document.createElement('script');
    script.async = true;
    script.defer = true;
    script.crossOrigin = 'anonymous';
    script.src = 'https://connect.facebook.net/es_ES/sdk.js#xfbml=0&version=v21.0';
    document.body.appendChild(script);
  });
  return fbSdkPromise;
}

function cargarXSdk(): Promise<VentanaConSdks['twttr']> {
  if (xSdkPromise) return xSdkPromise;
  xSdkPromise = new Promise((resolve) => {
    const w = window as VentanaConSdks;
    if (w.twttr?.widgets) {
      resolve(w.twttr);
      return;
    }
    const script = document.createElement('script');
    script.async = true;
    script.src = 'https://platform.twitter.com/widgets.js';
    script.onload = () => resolve((window as VentanaConSdks).twttr);
    document.body.appendChild(script);
  });
  return xSdkPromise;
}

/** Ficha simple con enlace directo — spec 039 §6: nunca un hueco roto si el widget no carga. */
export function construirTarjetaFallback(nombre: string, url: string): HTMLAnchorElement {
  const enlace = document.createElement('a');
  enlace.className = 'red-entidad__fallback';
  enlace.href = url;
  enlace.target = '_blank';
  enlace.rel = 'noopener noreferrer';
  enlace.textContent = `${nombre} — ver publicaciones ↗`;
  return enlace;
}

function programarFallback(container: HTMLElement, nombre: string, url: string, ms = TIEMPO_FALLBACK_MS): void {
  window.setTimeout(() => {
    if (container.querySelector('iframe')) return; // el widget ya renderizó
    container.innerHTML = '';
    container.appendChild(construirTarjetaFallback(nombre, url));
  }, ms);
}

async function montarWidgetFacebook(container: HTMLElement, pageUrl: string): Promise<void> {
  await cargarFacebookSdk();
  const div = document.createElement('div');
  div.className = 'fb-page';
  div.dataset.href = pageUrl;
  div.dataset.tabs = 'timeline';
  div.dataset.width = '280';
  div.dataset.height = '360';
  div.dataset.smallHeader = 'true';
  div.dataset.hideCover = 'true';
  div.dataset.showFacepile = 'false';
  container.appendChild(div);
  (window as VentanaConSdks).FB?.XFBML.parse(container);
  programarFallback(container, 'Facebook', pageUrl);
}

async function montarWidgetX(container: HTMLElement, handle: string): Promise<void> {
  const twttr = await cargarXSdk();
  const enlace = document.createElement('a');
  enlace.className = 'twitter-timeline';
  enlace.setAttribute('data-height', '360');
  enlace.setAttribute('data-chrome', 'noheader nofooter');
  enlace.href = `https://twitter.com/${handle}?ref_src=twsrc%5Etfw`;
  enlace.textContent = `Tuits de @${handle}`;
  container.appendChild(enlace);
  twttr?.widgets?.load(container);
  programarFallback(container, `@${handle}`, `https://x.com/${handle}`);
}

/**
 * Ficha de una entidad como acordeón: el shell (título, contenedores vacíos)
 * se construye ya, sin cargar ningún SDK — solo al abrirla por primera vez se
 * piden los widgets de verdad (spec 039 §4).
 */
export function construirFichaEntidad(entidad: EntidadRed): HTMLDetailsElement {
  const det = document.createElement('details');
  det.className = 'red-entidad';
  det.dataset.entidadId = entidad.id;

  const sum = document.createElement('summary');
  sum.className = 'red-entidad__titulo';
  sum.textContent = entidad.nombre;
  det.appendChild(sum);

  const cuerpo = document.createElement('div');
  cuerpo.className = 'red-entidad__cuerpo';
  det.appendChild(cuerpo);

  let cargado = false;
  det.addEventListener('toggle', () => {
    if (!det.open || cargado) return;
    cargado = true;
    if (entidad.facebookPageUrl) {
      const cont = document.createElement('div');
      cont.className = 'red-entidad__widget';
      cuerpo.appendChild(cont);
      void montarWidgetFacebook(cont, entidad.facebookPageUrl);
    }
    if (entidad.xHandle) {
      const cont = document.createElement('div');
      cont.className = 'red-entidad__widget';
      cuerpo.appendChild(cont);
      void montarWidgetX(cont, entidad.xHandle);
    }
  });

  return det;
}

export function buildActualidadRedesContent(): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'sidebar-panel-content actualidad-redes';

  const intro = document.createElement('p');
  intro.className = 'cordon-intro';
  intro.textContent =
    'Cuentas oficiales de organismos de la ciudad. Cada ficha carga su propio widget al abrirla, sin filtro ni orden único entre entidades — limitación de los iframes de Facebook/X, no de esta app.';
  wrap.appendChild(intro);

  const aviso = document.createElement('p');
  aviso.className = 'glosario-nota';
  aviso.textContent = 'Al abrir una ficha se cargan los scripts oficiales de Meta y/o X, que pueden fijar sus propias cookies.';
  wrap.appendChild(aviso);

  for (const entidad of ENTIDADES_REDES) {
    wrap.appendChild(construirFichaEntidad(entidad));
  }

  return wrap;
}
