// Caja "Recomendaciones de actuación" — spec 047. Generadas por IA a partir
// de las señales ya correlacionadas de la caja hermana (senales-ia-panel.ts).
// Guardrails de CLAUDE.md §4: siempre condicional, nunca ejecutable — el
// aviso es fijo y siempre visible, igual que el resto de paneles con IA
// (spec 045).
import type { RecomendacionActuacion } from '../services/sintesis-ia-v2';
import { escapeHtml, metaFrescura, startPolling } from './panel-utils';

interface RespuestaSintesisV2 {
  recomendaciones: RecomendacionActuacion[];
  generadaEn: string;
  modelo: string;
  fresh: boolean;
}

async function fetchSintesisV2(): Promise<RespuestaSintesisV2> {
  const res = await fetch('/api/sintesis/v2/actual');
  if (!res.ok) throw new Error(`GET /api/sintesis/v2/actual -> HTTP ${res.status}`);
  return (await res.json()) as RespuestaSintesisV2;
}

function renderRecomendaciones(recomendaciones: RecomendacionActuacion[]): string {
  if (recomendaciones.length === 0) {
    return '<div class="recomendaciones-ia__vacio">Sin recomendaciones activas ahora mismo.</div>';
  }
  return recomendaciones
    .map(
      (r) => `
        <div class="recomendaciones-ia__item">
          <span class="recomendaciones-ia__zona">${escapeHtml(r.zona)}</span>
          <span class="recomendaciones-ia__texto">${escapeHtml(r.texto)}</span>
          <span class="recomendaciones-ia__fuentes">${r.fuenteSpec.map((f) => `<span class="insight-card__fuente-chip">${escapeHtml(f)}</span>`).join('')}</span>
        </div>
      `,
    )
    .join('');
}

export function montarRecomendacionesPanel(): void {
  const root = document.createElement('div');
  root.id = 'recomendaciones-ia-panel';
  root.innerHTML = `
    <div class="media-panel__header">Recomendaciones de actuación</div>
    <div class="sintesis-ia__advertencia">⚠ Generado por IA a partir de señales del producto — no sustituye al criterio profesional ni autoriza ninguna actuación por sí sola.</div>
    <div id="recomendaciones-ia-body"></div>
    <div class="info-panel__meta" id="recomendaciones-ia-meta"></div>
  `;
  document.body.appendChild(root);
  const body = root.querySelector<HTMLDivElement>('#recomendaciones-ia-body')!;

  async function refresh(): Promise<void> {
    try {
      const datos = await fetchSintesisV2();
      body.innerHTML = renderRecomendaciones(datos.recomendaciones);
      const meta = root.querySelector('#recomendaciones-ia-meta')!;
      meta.innerHTML = metaFrescura(`Mirall (IA — ${datos.modelo})`, datos.generadaEn, datos.fresh);
    } catch (err) {
      body.textContent = 'Recomendaciones no disponibles ahora mismo.';
      console.error('Fallo al cargar recomendaciones de actuación:', err);
    }
  }

  startPolling(refresh, 90 * 60 * 1000); // mismo TTL que el endpoint
}
