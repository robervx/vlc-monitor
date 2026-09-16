// Router por hash — spec 040. Dos vistas, sin dependencia nueva (`CLAUDE.md`
// §5, "sin framework"): `#/` (mapa operativo) y `#/inteligencia` (hub de
// cámaras/prensa/redes/tendencia/agenda). El resto del estado en URL
// (`?layers=&foco=`, spec 000) vive en la query string, independiente del
// hash — cambiar de vista nunca lo toca ni recarga la página.
export type Vista = 'mapa' | 'inteligencia';

const HASH_INTELIGENCIA = '#/inteligencia';

export function vistaActual(): Vista {
  return location.hash === HASH_INTELIGENCIA ? 'inteligencia' : 'mapa';
}

export function irAVista(vista: Vista): void {
  const hash = vista === 'inteligencia' ? HASH_INTELIGENCIA : '#/';
  if (location.hash !== hash) location.hash = hash;
}

/** Aplica `data-vista` a `<html>` (mismo patrón que `data-layout`, ver `deteccion-dispositivo.ts`) y avisa a `cb` en cada cambio, incluida la llamada inicial. */
export function initRouter(cb: (vista: Vista) => void): void {
  const aplicar = (): void => {
    const vista = vistaActual();
    document.documentElement.dataset.vista = vista;
    cb(vista);
  };
  window.addEventListener('hashchange', aplicar);
  aplicar();
}
