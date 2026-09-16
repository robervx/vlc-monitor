// Utilidades compartidas por los paneles de datos (info-panel): escapado
// defensivo, formato de frescura y el contenedor `#info-panels` + polling
// adaptativo. Antes vivían sueltas en `main.ts`, usadas por todos los
// paneles (meteo, aire, tráfico, Valenbisi, aparcamiento...); primer paso al
// extraer el panel de meteorología (ver spec 038 v6 para el primer panel
// movido, cámaras) — cada panel que se vaya extrayendo importa desde aquí en
// vez de duplicar estas funciones o depender de otro módulo de panel.

// Escapado defensivo — títulos/URLs de fuentes externas (RSS, etc.) nunca se
// insertan en el DOM sin pasar por aquí (riesgo de XSS si una fuente llega
// corrupta o comprometida).
export function escapeHtml(texto: string): string {
  return texto
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function formatoFrescura(fetchedAt: string): string {
  const minutos = Math.round((Date.now() - new Date(fetchedAt).getTime()) / 60000);
  if (minutos < 1) return 'hace instantes';
  if (minutos === 1) return 'hace 1 min';
  return `hace ${minutos} min`;
}

export function metaFrescura(fuente: string, fetchedAt: string, fresh: boolean): string {
  const aviso = fresh
    ? ''
    : '<span class="info-panel__stale" title="No se pudo refrescar, mostrando el último dato bueno">⚠ no actualizado</span>';
  return `${fuente} · actualizado ${formatoFrescura(fetchedAt)} ${aviso}`;
}

export function buildInfoPanel(id: string, opciones?: { colapsable?: boolean }): HTMLDivElement {
  let container = document.getElementById('info-panels') as HTMLDivElement | null;
  if (!container) {
    container = document.createElement('div');
    container.id = 'info-panels';
    document.body.appendChild(container);
  }
  const root = document.createElement('div');
  root.id = id;
  root.className = 'info-panel';
  // spec 035 §5.2 (v2) — las leyendas de capa arrancan colapsadas a su
  // título y se expanden solo con clic/tap, igual en escritorio que en
  // móvil (antes también se expandían al hover, ver historial de la spec).
  if (opciones?.colapsable) {
    root.classList.add('info-panel--colapsable');
    root.tabIndex = 0;
    root.addEventListener('click', (ev) => {
      if ((ev.target as HTMLElement).closest('button, a')) return;
      root.classList.toggle('is-expandida');
    });
  }
  root.textContent = 'Cargando…';
  container.appendChild(root);
  return root;
}

export function startPolling(refresh: () => Promise<void>, intervalMs: number): void {
  refresh().catch((err: unknown) => console.error('Fallo al refrescar panel:', err));
  setInterval(() => {
    refresh().catch((err: unknown) => console.error('Fallo al refrescar panel:', err));
  }, intervalMs);
}
