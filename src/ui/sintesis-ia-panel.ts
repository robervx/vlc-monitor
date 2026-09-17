// Panel de síntesis con IA — spec 045, dentro de /inteligencia (spec 040).
// Decisión de producto en docs/decisiones/ADR-005-panel-sintesis-ia.md.
// El aviso "generado por IA" es fijo y siempre visible (mismo principio que
// el badge MOCK de spec 003, nunca en letra pequeña) — nunca una acción
// ejecutable, solo texto para que lo valore una persona (CLAUDE.md §4).
import type { SintesisIA } from '../services/sintesis-ia';
import { escapeHtml, metaFrescura, startPolling } from './panel-utils';

async function fetchSintesisActual(): Promise<{ sintesis: SintesisIA; fresh: boolean }> {
  const res = await fetch('/api/sintesis/v1/actual');
  if (!res.ok) throw new Error(`GET /api/sintesis/v1/actual -> HTTP ${res.status}`);
  return (await res.json()) as { sintesis: SintesisIA; fresh: boolean };
}

function renderSintesis(s: SintesisIA): string {
  const insights = s.insights
    .map(
      (i) => `
        <div class="sintesis-ia__item sintesis-ia__item--${i.severidad}">
          <span class="sintesis-ia__severidad">${escapeHtml(i.severidad)}</span>
          <span class="sintesis-ia__texto">${escapeHtml(i.texto)}</span>
          <span class="sintesis-ia__fuentes">${i.fuenteSpec.map((f) => `<span class="insight-card__fuente-chip">${escapeHtml(f)}</span>`).join('')}</span>
        </div>
      `,
    )
    .join('');
  const recomendaciones = s.recomendaciones
    .map(
      (r) => `
        <div class="sintesis-ia__item">
          <span class="sintesis-ia__texto">${escapeHtml(r.texto)}</span>
          <span class="sintesis-ia__fuentes">${r.fuenteSpec.map((f) => `<span class="insight-card__fuente-chip">${escapeHtml(f)}</span>`).join('')}</span>
        </div>
      `,
    )
    .join('');
  return `
    <div class="sintesis-ia__advertencia">⚠ ${escapeHtml(s.advertencia)}</div>
    <div class="sintesis-ia__resumen">${escapeHtml(s.resumen)}</div>
    ${insights ? `<div class="sintesis-ia__subtitulo">Insights</div>${insights}` : ''}
    ${recomendaciones ? `<div class="sintesis-ia__subtitulo">Recomendaciones</div>${recomendaciones}` : ''}
  `;
}

export function buildSintesisIaContent(): { root: HTMLDivElement; body: HTMLDivElement } {
  const root = document.createElement('div');
  root.id = 'sintesis-ia-panel';
  root.innerHTML = `
    <div class="media-panel__header">Síntesis con IA</div>
    <div id="sintesis-ia-body"></div>
    <div class="info-panel__meta" id="sintesis-ia-meta"></div>
  `;
  return { root, body: root.querySelector('#sintesis-ia-body')! };
}

export function montarSintesisIaPanel(): void {
  const panel = buildSintesisIaContent();
  document.body.appendChild(panel.root);

  async function refresh(): Promise<void> {
    try {
      const { sintesis, fresh } = await fetchSintesisActual();
      panel.body.innerHTML = renderSintesis(sintesis);
      const meta = panel.root.querySelector('#sintesis-ia-meta')!;
      meta.innerHTML = metaFrescura(`Mirall (IA — ${sintesis.modelo})`, sintesis.generadaEn, fresh);
    } catch (err) {
      panel.body.textContent = 'Síntesis con IA no disponible ahora mismo.';
      console.error('Fallo al cargar la síntesis con IA:', err);
    }
  }

  startPolling(refresh, 90 * 60 * 1000); // mismo TTL que la caché del endpoint (ADR-005 — cuota gratuita ajustada)
}
