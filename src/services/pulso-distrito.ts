/**
 * v4 (spec 010, specs/010-indice-pulso-distrito.md §10): el índice ponderado
 * 0-100 de v3 se retiró — el motor de escenarios vive ahora en
 * `src/services/pulso-escenarios.ts` (tipos `PulsoDistrito`/`NivelPulso`
 * incluidos). Este fichero sobrevive solo por `componenteTrafico`, que spec
 * 017 (histórico de tráfico) sigue usando como métrica de congestión sin
 * amplificar — ver `src/services/trafico-historico.ts`.
 */
import type { TramoTrafico, EstadoTramo } from './trafico';

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

/**
 * Media ponderada del estado de los tramos del distrito (0-1). La usa
 * spec 017 (histórico) como métrica de congestión — sin amplificar, a
 * diferencia de como la usaba el índice de Pulso en v3.
 */
export function componenteTrafico(tramosDistrito: TramoTrafico[]): number {
  const conDato = tramosDistrito.filter((t) => t.estado !== 'sin-datos');
  if (conDato.length === 0) return 0;
  const suma = conDato.reduce((acc, t) => acc + PESO_TRAFICO_POR_ESTADO[t.estado], 0);
  return clamp01(suma / conDato.length);
}
