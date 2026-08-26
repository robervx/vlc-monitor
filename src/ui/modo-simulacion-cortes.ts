/**
 * Orquestador del "modo simulador de cortes" — spec 022. Mismo patrón que
 * `modo-cordon.ts` (spec 021): vive fuera de chasis.ts/main.ts para evitar
 * el import circular, ambos se suscriben a este store.
 *
 * Mutuamente excluyente con el modo cordón (spec 021) — activar uno sale
 * del otro, nunca los dos interceptando clics del mapa a la vez.
 */
import { cargarGrafoViario } from '../services/grafo-viario-cliente';
import { calcularAlcanzablesBase, calcularAislados, type ResultadoSimulacionCortes } from '../services/simulacion-cortes';
import type { Tramo } from '../services/red-viaria';
import { salirModoCordon } from './modo-cordon';

export type FaseModoSimulacion = 'inactivo' | 'seleccionando';

export interface EstadoModoSimulacion {
  fase: FaseModoSimulacion;
  tramosCortados: string[]; // orden de selección, no un Set (para poder listar en la UI)
  resultado: ResultadoSimulacionCortes | null;
  cargandoGrafo: boolean;
  errorGrafo: string | null;
}

// Plaza del Ayuntamiento — mismo punto usado como referencia en otras specs
// de esta sesión, ver spec 022 §3.
const REFERENCIA_COORD: [number, number] = [-0.3763, 39.4699];

const ESTADO_INICIAL: EstadoModoSimulacion = {
  fase: 'inactivo',
  tramosCortados: [],
  resultado: null,
  cargandoGrafo: false,
  errorGrafo: null,
};

let estado: EstadoModoSimulacion = { ...ESTADO_INICIAL };

type Listener = (e: EstadoModoSimulacion) => void;
const listeners = new Set<Listener>();
function notificar(): void {
  listeners.forEach((l) => l(estado));
}

export function onCambioModoSimulacion(fn: Listener): () => void {
  listeners.add(fn);
  fn(estado);
  return () => listeners.delete(fn);
}

export function getEstadoModoSimulacion(): EstadoModoSimulacion {
  return estado;
}

let tramosCache: Tramo[] | null = null;
let tramosPorIdCache: Map<string, Tramo> | null = null;
let nodoReferenciaIdCache: string | null = null;
let alcanzablesBaseCache: Set<string> | null = null;

export function getTramoPorIdSimulacion(id: string): Tramo | undefined {
  return tramosPorIdCache?.get(id);
}

export async function activarSimulacionCortes(): Promise<void> {
  salirModoCordon();
  estado = { ...ESTADO_INICIAL, fase: 'seleccionando', cargandoGrafo: true };
  notificar();
  try {
    const grafo = await cargarGrafoViario();
    tramosCache = grafo.tramos;
    tramosPorIdCache = grafo.tramosPorId;
    const snap = grafo.indice.tramoMasCercano(REFERENCIA_COORD, 500);
    if (!snap) throw new Error('No se encontró un tramo cerca del punto de referencia');
    nodoReferenciaIdCache = snap.tramo.nodoOrigenId;
    alcanzablesBaseCache = calcularAlcanzablesBase(grafo.tramos, nodoReferenciaIdCache);
    estado = { ...estado, cargandoGrafo: false };
    notificar();
  } catch {
    estado = {
      ...estado,
      cargandoGrafo: false,
      errorGrafo: 'No se pudo cargar el grafo viario (spec 020) — el simulador no está disponible ahora mismo.',
    };
    notificar();
  }
}

function recalcular(): void {
  if (!tramosCache || !nodoReferenciaIdCache || !alcanzablesBaseCache) return;
  const resultado = calcularAislados(
    tramosCache,
    new Set(estado.tramosCortados),
    nodoReferenciaIdCache,
    alcanzablesBaseCache,
  );
  estado = { ...estado, resultado };
  notificar();
}

/** Clic sobre un tramo — lo añade si no estaba cortado, lo quita si ya lo estaba. */
export function toggleTramoCortado(idTramo: string): void {
  if (estado.fase !== 'seleccionando') return;
  const yaCortado = estado.tramosCortados.includes(idTramo);
  estado = {
    ...estado,
    tramosCortados: yaCortado
      ? estado.tramosCortados.filter((id) => id !== idTramo)
      : [...estado.tramosCortados, idTramo],
  };
  notificar();
  recalcular();
}

export function salirSimulacionCortes(): void {
  estado = { ...ESTADO_INICIAL };
  notificar();
}
