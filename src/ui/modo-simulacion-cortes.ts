/**
 * Orquestador del "modo simulador de cortes" — spec 022 (v5). Mismo patrón
 * que `modo-cordon.ts` (spec 021): vive fuera de chasis.ts/main.ts para
 * evitar el import circular, ambos se suscriben a este store.
 *
 * Mutuamente excluyente con el modo cordón (spec 021) — activar uno sale
 * del otro, nunca los dos interceptando clics del mapa a la vez.
 *
 * v5: sustituye el cálculo propio de alcanzabilidad a un nodo único (Plaza
 * del Ayuntamiento) por el motor compartido de propagación dirigida (spec
 * 031): además de "zonas sin salida" ahora reporta "zonas sin entrada" y
 * "desvío forzado". La referencia pasa a ser la SCC principal del grafo.
 */
import { cargarGrafoViario, obtenerBasePropagacion, type BasePropagacionCliente } from '../services/grafo-viario-cliente';
import { propagarCorte, type ResultadoPropagacionCorte } from '../services/propagacion-corte';
import { calcularRutasAlternativas, type RutaAlternativa } from '../services/reruta-corte';
import type { Tramo } from '../services/red-viaria';
import { salirModoCordon } from './modo-cordon';

export type FaseModoSimulacion = 'inactivo' | 'seleccionando';

export interface EstadoModoSimulacion {
  fase: FaseModoSimulacion;
  tramosCortados: string[]; // orden de selección, no un Set (para poder listar en la UI)
  resultado: ResultadoPropagacionCorte | null;
  /** Ruta representativa del desvío por cada corte — para la animación cualitativa (spec 022 v6). */
  rutasAlternativas: RutaAlternativa[];
  cargandoGrafo: boolean;
  errorGrafo: string | null;
}

const ESTADO_INICIAL: EstadoModoSimulacion = {
  fase: 'inactivo',
  tramosCortados: [],
  resultado: null,
  rutasAlternativas: [],
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
let baseCache: BasePropagacionCliente | null = null;

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
    baseCache = obtenerBasePropagacion(grafo); // memoizado, compartido con spec 021
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
  if (!tramosCache || !baseCache) return;
  const cortados = new Set(estado.tramosCortados);
  const resultado = propagarCorte(tramosCache, cortados, baseCache.base);
  const rutasAlternativas = calcularRutasAlternativas(tramosCache, cortados);
  estado = { ...estado, resultado, rutasAlternativas };
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
