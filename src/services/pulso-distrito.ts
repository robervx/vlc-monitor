/**
 * Cálculo del índice compuesto de la spec 010
 * (specs/010-indice-pulso-distrito.md §3). Función pura, sin red — combina
 * datos ya obtenidos de las specs 001 (meteo), 002 (aire) y 004 (tráfico).
 */
import type { EstadoMeteo } from './estado-meteo';
import type { CalidadAire } from './calidad-aire';
import type { TramoTrafico, EstadoTramo } from './trafico';

export type CategoriaPulso = 'Tranquilo' | 'Moderado' | 'Tenso' | 'Crítico';

export interface PulsoDistrito {
  distritoCodigo: string;
  distritoNombre: string;
  indice: number;
  categoria: CategoriaPulso;
  componentes: {
    trafico: number;
    aire: number;
    meteo: number;
  };
  observedAt: string;
  fetchedAt: string;
  source: 'vlc-monitor-compuesto';
}

interface DistritoBasico {
  codigo: string;
  nombre: string;
}

function clamp01(x: number): number {
  return Math.min(1, Math.max(0, x));
}

const PESO_TRAFICO_POR_ESTADO: Record<EstadoTramo, number> = {
  fluido: 0,
  denso: 0.3,
  congestionado: 0.6,
  cortado: 1,
  'sin-datos': 0,
};

/** Media ponderada del estado de los tramos del distrito — spec 010 §3. */
export function componenteTrafico(tramosDistrito: TramoTrafico[]): number {
  const conDato = tramosDistrito.filter((t) => t.estado !== 'sin-datos');
  if (conDato.length === 0) return 0;
  const suma = conDato.reduce((acc, t) => acc + PESO_TRAFICO_POR_ESTADO[t.estado], 0);
  return clamp01(suma / conDato.length);
}

export function componenteAire(aire: CalidadAire): number {
  return clamp01(aire.indiceEuropeo / 100);
}

/** El factor más adverso domina — no se promedian calor/frío/viento/lluvia. */
export function componenteMeteo(meteo: EstadoMeteo): number {
  const calor = clamp01((meteo.temperatura - 35) / 7);
  const frio = clamp01((5 - meteo.temperatura) / 10);
  const viento = clamp01((meteo.vientoRachas - 50) / 40);
  const lluvia = clamp01((meteo.precipitacion - 2) / 8);
  return Math.max(calor, frio, viento, lluvia);
}

export function categoriaPulso(indice: number): CategoriaPulso {
  if (indice < 25) return 'Tranquilo';
  if (indice < 50) return 'Moderado';
  if (indice < 75) return 'Tenso';
  return 'Crítico';
}

export function calcularPulsoDistrito(
  distritos: DistritoBasico[],
  meteo: EstadoMeteo,
  aire: CalidadAire,
  tramos: TramoTrafico[],
): PulsoDistrito[] {
  const aireScore = componenteAire(aire);
  const meteoScore = componenteMeteo(meteo);
  const fetchedAt = new Date().toISOString();
  const observedAt = [meteo.observedAt, aire.observedAt, ...tramos.map((t) => t.observedAt)]
    .sort()[0] ?? fetchedAt;

  const tramosPorDistrito = new Map<string, TramoTrafico[]>();
  for (const tramo of tramos) {
    if (!tramo.distrito) continue;
    const lista = tramosPorDistrito.get(tramo.distrito) ?? [];
    lista.push(tramo);
    tramosPorDistrito.set(tramo.distrito, lista);
  }

  return distritos.map((distrito) => {
    const traficoScore = componenteTrafico(tramosPorDistrito.get(distrito.codigo) ?? []);
    const indice = Math.round(100 * (0.5 * traficoScore + 0.3 * aireScore + 0.2 * meteoScore));

    return {
      distritoCodigo: distrito.codigo,
      distritoNombre: distrito.nombre,
      indice,
      categoria: categoriaPulso(indice),
      componentes: { trafico: traficoScore, aire: aireScore, meteo: meteoScore },
      observedAt,
      fetchedAt,
      source: 'vlc-monitor-compuesto',
    };
  });
}
