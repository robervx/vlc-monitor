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
import type { Coordenada } from '../services/proximidad';
import {
  proponerCordon,
  type Incidente,
  type SubtipoIncidente,
  type IntensidadIncidente,
  type ResultadoPropuesta,
} from '../services/cordon-incidente';
import { cargarGrafoViario } from '../services/grafo-viario-cliente';
import type { Tramo } from '../services/red-viaria';
import type { IndiceRedViaria } from '../services/red-viaria-indice';
import { salirSimulacionCortes } from './modo-simulacion-cortes';

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

export function getTramoPorId(id: string): Tramo | undefined {
  return tramosPorIdCache?.get(id);
}

async function asegurarGrafoCargado(): Promise<boolean> {
  if (tramosCache && indiceCache) return true;
  estado = { ...estado, cargandoGrafo: true, errorGrafo: null };
  notificar();
  try {
    const grafo = await cargarGrafoViario();
    tramosCache = grafo.tramos;
    tramosPorIdCache = grafo.tramosPorId;
    indiceCache = grafo.indice;
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
  estado = { ...estado, resultado: proponerCordon(incidente, tramosCache, indiceCache), confirmada: false };
  notificar();
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
  estado = { ...estado, fase: 'esperandoClicMapa', ubicacion: null, resultado: null, confirmada: false };
  notificar();
}

export function salirModoCordon(): void {
  estado = { ...ESTADO_INICIAL };
  notificar();
}
