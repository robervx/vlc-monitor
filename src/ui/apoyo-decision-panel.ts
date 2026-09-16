// Panel de apoyo a decisión operativa — spec 041, dentro de /inteligencia
// (spec 040). Cruza señales ya calculadas por otras specs (§2) y muestra una
// sugerencia de texto en condicional — nunca una acción ejecutable (§0,
// CLAUDE.md §4): no hay botón "enviar" ni "despachar", solo "Ver en el mapa"
// (navega a /mapa y centra en el punto, no dispara nada por sí mismo).
import type { SugerenciaOperativa } from '../services/apoyo-decision';
import { escapeHtml, metaFrescura, startPolling } from './panel-utils';
import { pedirCentrarMapa } from './centrar-mapa';
import { irAVista } from './router';

async function fetchSugerenciasActuales(): Promise<{ sugerencias: SugerenciaOperativa[]; fresh: boolean }> {
  const res = await fetch('/api/decision/v1/sugerencias');
  if (!res.ok) throw new Error(`GET /api/decision/v1/sugerencias -> HTTP ${res.status}`);
  return (await res.json()) as { sugerencias: SugerenciaOperativa[]; fresh: boolean };
}

function renderSugerencia(s: SugerenciaOperativa, i: number): string {
  const chips = s.señalesCombinadas.map((señal) => `<span class="sugerencia-operativa__chip">${escapeHtml(señal)}</span>`).join('');
  const fuentes = s.fuenteSpec.map((spec) => `<span class="insight-card__fuente-chip">${escapeHtml(spec)}</span>`).join('');
  const donde = s.calle ? `${escapeHtml(s.calle)} · ${escapeHtml(s.distrito ?? '')}` : escapeHtml(s.distrito ?? 'Valencia');
  return `
    <div class="sugerencia-operativa sugerencia-operativa--${s.severidad}">
      <div class="sugerencia-operativa__cabecera">
        <span class="sugerencia-operativa__lugar">${donde}</span>
        <span class="sugerencia-operativa__severidad">${s.severidad}</span>
      </div>
      <div class="sugerencia-operativa__chips">${chips}</div>
      <div class="sugerencia-operativa__resumen">${escapeHtml(s.resumen)}</div>
      <div class="sugerencia-operativa__texto">${escapeHtml(s.sugerenciaTexto)}</div>
      <div class="sugerencia-operativa__pie">
        <button type="button" class="sugerencia-operativa__ver-mapa" data-sugerencia-index="${i}">Ver en el mapa</button>
        <span class="sugerencia-operativa__fuentes">${fuentes}</span>
      </div>
    </div>
  `;
}

export function buildApoyoDecisionContent(): { root: HTMLDivElement; list: HTMLDivElement } {
  const root = document.createElement('div');
  root.id = 'apoyo-decision-panel';
  root.innerHTML = `
    <div class="media-panel__header">Apoyo a decisión operativa</div>
    <p class="cordon-intro">Cruce de señales ya existentes (Pulso de Distrito, tráfico, incidencias, lluvia) — nunca una acción ejecutable, solo un texto para que lo valore una persona.</p>
    <div class="media-panel__list" id="apoyo-decision-list"></div>
    <div class="info-panel__meta" id="apoyo-decision-meta"></div>
  `;
  return { root, list: root.querySelector('#apoyo-decision-list')! };
}

export function montarApoyoDecisionPanel(): void {
  const panel = buildApoyoDecisionContent();
  document.body.appendChild(panel.root);

  let ultimasSugerencias: SugerenciaOperativa[] = [];

  panel.list.addEventListener('click', (ev) => {
    const boton = (ev.target as HTMLElement).closest<HTMLButtonElement>('button[data-sugerencia-index]');
    if (!boton) return;
    const sugerencia = ultimasSugerencias[Number(boton.dataset.sugerenciaIndex)];
    if (!sugerencia) return;
    pedirCentrarMapa({ coordenadas: sugerencia.centroide, zoom: 16 });
    irAVista('mapa');
  });

  async function refresh(): Promise<void> {
    try {
      const { sugerencias, fresh } = await fetchSugerenciasActuales();
      ultimasSugerencias = sugerencias;
      if (sugerencias.length === 0) {
        panel.list.innerHTML = '<div class="info-panel__desc">Sin conjunción de señales activa ahora mismo.</div>';
      } else {
        panel.list.innerHTML = sugerencias.map(renderSugerencia).join('');
      }
      const meta = panel.root.querySelector('#apoyo-decision-meta')!;
      meta.innerHTML = metaFrescura('Mirall (apoyo a decisión)', new Date().toISOString(), fresh);
    } catch (err) {
      panel.list.textContent = 'Apoyo a decisión no disponible';
      console.error('Fallo al cargar sugerencias de apoyo a decisión:', err);
    }
  }

  startPolling(refresh, 3 * 60 * 1000); // igual TTL que la caché de tráfico, la señal más rápida de las que combina (spec 041 §4)
}
