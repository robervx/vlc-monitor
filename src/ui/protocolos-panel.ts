// Panel de protocolos de actuación — spec 042, dentro de /inteligencia (spec
// 040). Contenido estático (sin red ni caché) — la única "carga" es
// construir el DOM desde `PROTOCOLOS_ACTUACION`. Fecha de última revisión
// siempre visible (§6): es la mitigación principal de la spec contra
// contenido desactualizado sin que se note.
import { PROTOCOLOS_ACTUACION, type ProtocoloActuacion } from '../config/protocolos-actuacion';
import { escapeHtml } from './panel-utils';

function formatoFecha(iso: string): string {
  return new Date(iso).toLocaleDateString('es-ES', { day: '2-digit', month: 'long', year: 'numeric' });
}

function renderProtocolo(p: ProtocoloActuacion): string {
  const lista = (items: string[]) => items.map((i) => `<li>${escapeHtml(i)}</li>`).join('');
  const fuente = p.fuente
    ? `<a class="protocolo__fuente" href="${escapeHtml(p.fuente)}" target="_blank" rel="noopener noreferrer">Fuente ↗</a>`
    : '<span class="protocolo__fuente protocolo__fuente--sin-citar">Sin fuente oficial citada</span>';
  return `
    <details class="protocolo">
      <summary class="protocolo__titulo">${escapeHtml(p.titulo)}</summary>
      <div class="protocolo__cuerpo">
        <div class="protocolo__bloque">
          <div class="protocolo__bloque-titulo">Antes</div>
          <ul>${lista(p.antes)}</ul>
        </div>
        <div class="protocolo__bloque">
          <div class="protocolo__bloque-titulo">Durante</div>
          <ul>${lista(p.durante)}</ul>
        </div>
        <div class="protocolo__pie">
          <span class="protocolo__revision">Última revisión: ${formatoFecha(p.ultimaRevision)}</span>
          ${fuente}
        </div>
      </div>
    </details>
  `;
}

export function buildProtocolosContent(): HTMLElement {
  const root = document.createElement('div');
  root.id = 'protocolos-panel';
  root.innerHTML = `
    <div class="media-panel__header">Protocolos de actuación</div>
    <p class="cordon-intro">Contenido de referencia, punto de vista policía local. No sustituye el protocolo oficial de cada cuerpo ni la coordinación real con 112/bomberos.</p>
    <div class="protocolos-lista">${PROTOCOLOS_ACTUACION.map(renderProtocolo).join('')}</div>
  `;
  return root;
}
