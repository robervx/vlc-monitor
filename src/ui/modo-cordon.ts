/**
 * Orquestador del "modo cordón de incidente" — spec 021. Vive fuera de
 * chasis.ts y de main.ts a propósito (evita import circular: main.ts monta
 * chasis.ts, chasis.ts no puede importar de vuelta desde main.ts). Ambos
 * módulos se suscriben a este store: chasis.ts pinta el formulario,
 * main.ts pinta el resultado sobre el mapa y oculta/muestra los paneles
 * habituales.
 *
 * "Avisa, no actúa" (CLAUDE.md §4): este módulo nunca hace fetch de nada
 * salvo el propio grafo viario (lectura), nunca envía la propuesta a
 * ningún sitio, no hay botón que dispare una acción real — "Confirmar" es
 * únicamente un estado local (`confirmada`), igual de inerte que el resto.
 */
import { distanciaMetros, type Coordenada } from '../services/proximidad';
import {
  proponerCordon,
  type Incidente,
  type SubtipoIncidente,
  type IntensidadIncidente,
  type ResultadoPropuesta,
} from '../services/cordon-incidente';
import {
  cargarGrafoViario,
  obtenerBasePropagacion,
  type BasePropagacionCliente,
} from '../services/grafo-viario-cliente';
import {
  propagarCorte,
  type TramoAfectado,
  type TramoDesvioForzado,
} from '../services/propagacion-corte';
import type { Tramo } from '../services/red-viaria';
import type { IndiceRedViaria } from '../services/red-viaria-indice';
import { salirSimulacionCortes } from './modo-simulacion-cortes';

/** Propagación que se escapa del perímetro de socorro — lo que de verdad hay que vigilar (spec 031 §5). */
export interface PropagacionFueraDelCordon {
  sinEntrada: TramoAfectado[];
  sinSalida: TramoAfectado[];
  desvio: TramoDesvioForzado[];
}

export type FaseModoCordon = 'inactivo' | 'esperandoClicMapa' | 'formulario';

export interface FormularioIncidente {
  subtipo: SubtipoIncidente;
  intensidad: IntensidadIncidente;
  plantasAfectadas?: number;
  viviendasAfectadas?: number;
  necesidadDesalojo: boolean;
  observaciones?: string;
}

export interface EstadoModoCordon {
  fase: FaseModoCordon;
  ubicacion: Coordenada | null;
  formulario: FormularioIncidente;
  resultado: ResultadoPropuesta | null;
  /** Tramos cortados a mano por el mando además de los que propone el perímetro (spec 021 v3). */
  cortesManuales: string[];
  /** Efecto en cadena (spec 031) de cerrados + cortes manuales que SE ESCAPA del área de socorro. */
  propagacionFuera: PropagacionFueraDelCordon | null;
  editadaManualmente: boolean;
  confirmada: boolean;
  cargandoGrafo: boolean;
  errorGrafo: string | null;
}

const FORM_INICIAL: FormularioIncidente = {
  subtipo: 'vivienda',
  intensidad: 'conato',
  necesidadDesalojo: false,
};

const ESTADO_INICIAL: EstadoModoCordon = {
  fase: 'inactivo',
  ubicacion: null,
  formulario: { ...FORM_INICIAL },
  resultado: null,
  cortesManuales: [],
  propagacionFuera: null,
  editadaManualmente: false,
  confirmada: false,
  cargandoGrafo: false,
  errorGrafo: null,
};

let estado: EstadoModoCordon = { ...ESTADO_INICIAL };

type Listener = (e: EstadoModoCordon) => void;
const listeners = new Set<Listener>();
function notificar(): void {
  listeners.forEach((l) => l(estado));
}

export function onCambioModoCordon(fn: Listener): () => void {
  listeners.add(fn);
  fn(estado);
  return () => listeners.delete(fn);
}

export function getEstadoModoCordon(): EstadoModoCordon {
  return estado;
}

let tramosCache: Tramo[] | null = null;
let tramosPorIdCache: Map<string, Tramo> | null = null;
let indiceCache: IndiceRedViaria | null = null;
let baseCache: BasePropagacionCliente | null = null;

export function getTramoPorId(id: string): Tramo | undefined {
  return tramosPorIdCache?.get(id);
}

async function asegurarGrafoCargado(): Promise<boolean> {
  if (tramosCache && indiceCache && baseCache) return true;
  estado = { ...estado, cargandoGrafo: true, errorGrafo: null };
  notificar();
  try {
    const grafo = await cargarGrafoViario();
    tramosCache = grafo.tramos;
    tramosPorIdCache = grafo.tramosPorId;
    indiceCache = grafo.indice;
    baseCache = obtenerBasePropagacion(grafo); // memoizado, compartido con spec 022
    estado = { ...estado, cargandoGrafo: false };
    notificar();
    return true;
  } catch {
    estado = {
      ...estado,
      cargandoGrafo: false,
      errorGrafo: 'No se pudo cargar el grafo viario (spec 020) — el modo cordón no está disponible ahora mismo.',
    };
    notificar();
    return false;
  }
}

function puntoMedio(t: Tramo): Coordenada {
  const c = t.geometria.coordinates as Coordenada[];
  return c[Math.floor(c.length / 2)]!;
}

/**
 * Efecto en cadena (spec 031) de los tramos cerrados por el perímetro + los
 * cortes manuales — filtrado a lo que SE ESCAPA del área de socorro. El
 * interior del cordón siempre queda sin entrada/salida (lo has sellado a
 * propósito): eso no es una alarma. Lo relevante es si el corte arrastra
 * calles lejos del incidente (spec 031 §5).
 */
function calcularPropagacionFuera(
  tramosCerrados: string[],
  radioSocorroM: number,
): PropagacionFueraDelCordon | null {
  if (!estado.ubicacion || !tramosCache || !baseCache) return null;
  const cortes = new Set([...tramosCerrados, ...estado.cortesManuales]);
  if (cortes.size === 0) return null;
  const r = propagarCorte(tramosCache, cortes, baseCache.base);
  const fuera = (idTramo: string): boolean => {
    const t = tramosPorIdCache?.get(idTramo);
    if (!t) return false;
    return distanciaMetros(estado.ubicacion!, puntoMedio(t)) > radioSocorroM;
  };
  return {
    sinEntrada: [...r.tramosSinEntrada, ...r.tramosAislados].filter((t) => fuera(t.idTramo)),
    sinSalida: [...r.tramosSinSalida, ...r.tramosAislados].filter((t) => fuera(t.idTramo)),
    desvio: r.tramosDesvioForzado.filter((t) => fuera(t.idTramo)),
  };
}

function recalcular(): void {
  if (!estado.ubicacion || !tramosCache || !indiceCache) return;
  const incidente: Incidente = {
    idIncidente: `inc-${Date.now()}`,
    tipo: 'incendio',
    subtipo: estado.formulario.subtipo,
    intensidad: estado.formulario.intensidad,
    ubicacion: { lat: estado.ubicacion[1], lon: estado.ubicacion[0] },
    plantasAfectadas: estado.formulario.plantasAfectadas,
    viviendasAfectadas: estado.formulario.viviendasAfectadas,
    necesidadDesalojo: estado.formulario.necesidadDesalojo,
    observaciones: estado.formulario.observaciones,
    creadoEn: new Date().toISOString(),
  };
  const resultado = proponerCordon(incidente, tramosCache, indiceCache);
  const propagacionFuera = resultado.ok
    ? calcularPropagacionFuera(resultado.propuesta.tramosCerrados, resultado.propuesta.regla.radioAreaSocorroM)
    : null;
  estado = { ...estado, resultado, propagacionFuera, confirmada: false };
  notificar();
}

/** Clic sobre una calle en fase formulario — la añade/quita de los cortes manuales. */
export function toggleCorteManual(idTramo: string): void {
  if (estado.fase !== 'formulario') return;
  const yaCortado = estado.cortesManuales.includes(idTramo);
  estado = {
    ...estado,
    cortesManuales: yaCortado
      ? estado.cortesManuales.filter((id) => id !== idTramo)
      : [...estado.cortesManuales, idTramo],
    confirmada: false,
  };
  notificar();
  recalcular();
}

export async function activarSeleccionUbicacion(): Promise<void> {
  salirSimulacionCortes();
  estado = { ...ESTADO_INICIAL, fase: 'esperandoClicMapa' };
  notificar();
  await asegurarGrafoCargado();
}

export function reportarUbicacionElegida(coord: Coordenada): void {
  if (estado.fase !== 'esperandoClicMapa') return;
  estado = { ...estado, fase: 'formulario', ubicacion: coord };
  notificar();
  recalcular();
}

export function actualizarFormulario(cambios: Partial<FormularioIncidente>): void {
  estado = { ...estado, formulario: { ...estado.formulario, ...cambios }, editadaManualmente: true, confirmada: false };
  notificar();
  recalcular();
}

export function confirmarPropuesta(): void {
  // Estado puramente local — nunca dispara red ni notificación (CLAUDE.md §4).
  if (!estado.resultado?.ok) return;
  estado = { ...estado, confirmada: true };
  notificar();
}

export function volverASeleccionUbicacion(): void {
  estado = {
    ...estado,
    fase: 'esperandoClicMapa',
    ubicacion: null,
    resultado: null,
    cortesManuales: [],
    propagacionFuera: null,
    confirmada: false,
  };
  notificar();
}

export function salirModoCordon(): void {
  estado = { ...ESTADO_INICIAL };
  notificar();
}
