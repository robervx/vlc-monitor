// Caja "Señales" — spec 047. Hechos correlacionados y trazables (tipo,
// calle, distrito, severidad, fuente), calculados en servidor SIN
// intervención de IA (`correlacion-senales.ts`) — a diferencia de la caja
// hermana de recomendaciones, esta nunca depende de la disponibilidad del
// modelo. Pensada para anticipar y para investigar a posteriori (CLAUDE.md
// §4: solo infraestructura pública, nunca un dato de persona/vehículo
// concreto).
import type { SenalCorrelacionada, TipoSenal, Severidad } from '../services/correlacion-senales';
import { escapeHtml, metaFrescura, startPolling } from './panel-utils';

interface RespuestaSintesisV2 {
  senales: SenalCorrelacionada[];
  generadaEn: string;
  fresh: boolean;
}

async function fetchSintesisV2(): Promise<RespuestaSintesisV2> {
  const res = await fetch('/api/sintesis/v2/actual');
  if (!res.ok) throw new Error(`GET /api/sintesis/v2/actual -> HTTP ${res.status}`);
  return (await res.json()) as RespuestaSintesisV2;
}

const ETIQUETA_TIPO: Record<TipoSenal, string> = {
  trafico: 'Tráfico',
  incidencia: 'Incidencia',
  clima: 'Clima',
  evento: 'Evento',
  camara: 'Cámara',
};

const ORDEN_SEVERIDAD: Record<Severidad, number> = { urgente: 0, aviso: 1, informativo: 2 };

function renderSenales(senales: SenalCorrelacionada[]): string {
  if (senales.length === 0) {
    return '<div class="senales-ia__vacio">Sin señales activas ahora mismo.</div>';
  }
  return senales
    .slice()
    .sort((a, b) => ORDEN_SEVERIDAD[a.severidad] - ORDEN_SEVERIDAD[b.severidad])
    .map(
      (s) => `
        <div class="senales-ia__item senales-ia__item--${s.severidad}">
          <span class="senales-ia__tipo">${escapeHtml(ETIQUETA_TIPO[s.tipo])}</span>
          <span class="senales-ia__texto">${escapeHtml(s.descripcion)}</span>
          <span class="senales-ia__fuentes">${s.fuenteSpec.map((f) => `<span class="insight-card__fuente-chip">${escapeHtml(f)}</span>`).join('')}</span>
        </div>
      `,
    )
    .join('');
}

export function montarSenalesPanel(): void {
  const root = document.createElement('div');
  root.id = 'senales-ia-panel';
  root.innerHTML = `
    <div class="media-panel__header">Señales</div>
    <div id="senales-ia-body"></div>
    <div class="info-panel__meta" id="senales-ia-meta"></div>
  `;
  document.body.appendChild(root);
  const body = root.querySelector<HTMLDivElement>('#senales-ia-body')!;

  async function refresh(): Promise<void> {
    try {
      const datos = await fetchSintesisV2();
      body.innerHTML = renderSenales(datos.senales);
      const meta = root.querySelector('#senales-ia-meta')!;
      meta.innerHTML = metaFrescura('Correlación interna (sin IA)', datos.generadaEn, datos.fresh);
    } catch (err) {
      body.textContent = 'Señales no disponibles ahora mismo.';
      console.error('Fallo al cargar señales correlacionadas:', err);
    }
  }

  startPolling(refresh, 90 * 60 * 1000); // mismo TTL que el endpoint
}
