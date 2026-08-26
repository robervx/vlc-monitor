/**
 * Motor de propuesta de cordón por incidente — spec 021. Función pura: sin
 * red, sin DOM. "Propone, nunca decide ni ejecuta" (CLAUDE.md §4) — el
 * resultado es siempre editable, nunca se auto-confirma ni se envía nada.
 *
 * Punto de diseño importante (DoD spec 021 §6): la clasificación de tramos
 * usa DISTANCIA DE RED (recorrido real por el grafo de spec 020), no
 * distancia euclídea — un tramo al otro lado del cauce del Turia puede estar
 * cerca en línea recta y lejos en distancia real de calle, y es la distancia
 * real la que debe mandar. Los polígonos de Área de Intervención/Socorro
 * (círculos) son solo para visualización — la clasificación de tramos no
 * los usa.
 *
 * Otro punto de diseño explícito: para decidir qué calles cortar, se trata
 * todo tramo como transitable en ambos sentidos al calcular distancia de
 * red, aunque `tramo.sentido` sea 'unidireccional' — el sentido de
 * circulación de tráfico no cambia la conectividad física de la calle, que
 * es lo único relevante para "qué tan lejos está esta calle del incidente
 * andando/por la red viaria".
 */
import { circle } from '@turf/circle';
import type { Tramo } from './red-viaria';
import type { IndiceRedViaria } from './red-viaria-indice';
import { distanciaMetros, puntoMasCercanoEnSegmento, type Coordenada } from './proximidad';
import { buscarRegla, type ReglaPerimetro } from '../config/reglas-perimetro-incendio';

/**
 * Distancia real desde `punto` a cada extremo del tramo, recorriendo su
 * propia geometría (no solo la distancia perpendicular a la línea) — así el
 * tramo donde cae el incidente no queda mal clasificado cuando el incidente
 * está a mitad de un tramo largo y el radio de la regla es pequeño (ej.
 * 'conato', 10m): sin este cálculo, ambos extremos se inicializarían con la
 * distancia perpendicular (~0m), que puede ser mucho menor que la distancia
 * real recorriendo el tramo hasta cada extremo.
 */
function distanciasAExtremosDelTramo(punto: Coordenada, tramo: Tramo): { aOrigen: number; aDestino: number } {
  const coords = tramo.geometria.coordinates as Coordenada[];
  let acumulada = 0;
  let mejorDistPerp = Infinity;
  let distanciaHastaCercano = 0;
  for (let i = 0; i < coords.length - 1; i++) {
    const a = coords[i]!;
    const b = coords[i + 1]!;
    const cercano = puntoMasCercanoEnSegmento(punto, a, b);
    const distPerp = distanciaMetros(punto, cercano);
    if (distPerp < mejorDistPerp) {
      mejorDistPerp = distPerp;
      distanciaHastaCercano = acumulada + distanciaMetros(a, cercano);
    }
    acumulada += distanciaMetros(a, b);
  }
  return { aOrigen: distanciaHastaCercano, aDestino: Math.max(0, tramo.longitudM - distanciaHastaCercano) };
}

export type SubtipoIncidente =
  | 'vivienda'
  | 'edificio'
  | 'bajoLocal'
  | 'garajeAparcamiento'
  | 'vehiculoCombustion'
  | 'vehiculoElectricoHibrido';

export type IntensidadIncidente = 'conato' | 'incendioControlado' | 'incendioGeneralizado';

export interface Incidente {
  idIncidente: string;
  tipo: 'incendio';
  subtipo: SubtipoIncidente;
  ubicacion: { lat: number; lon: number };
  plantasAfectadas?: number;
  viviendasAfectadas?: number;
  necesidadDesalojo: boolean;
  intensidad: IntensidadIncidente;
  observaciones?: string;
  creadoEn: string;
}

export interface PropuestaCordon {
  idIncidente: string;
  regla: ReglaPerimetro;
  tramosCerrados: string[];
  tramosCorte: string[];
  tramosDesvioSugerido: string[];
  geometriaAreaIntervencion: GeoJSON.Polygon;
  geometriaAreaSocorro: GeoJSON.Polygon;
  generadaEn: string;
  editadaManualmente: boolean;
}

export type ResultadoPropuesta = { ok: true; propuesta: PropuestaCordon } | { ok: false; error: string };

const MARGEN_DESVIO_M = 150;
const BANDA_CORTE_FRACCION = 0.2; // último 20% del radio de socorro cuenta como "borde"

interface Vecino {
  tramo: Tramo;
  nodoVecino: string;
}

function construirAdyacencia(tramos: Tramo[]): Map<string, Vecino[]> {
  const adyacencia = new Map<string, Vecino[]>();
  const add = (nodo: string, nodoVecino: string, tramo: Tramo) => {
    if (!adyacencia.has(nodo)) adyacencia.set(nodo, []);
    adyacencia.get(nodo)!.push({ tramo, nodoVecino });
  };
  for (const tramo of tramos) {
    // Conectividad física, no sentido de tráfico — ver cabecera del módulo.
    add(tramo.nodoOrigenId, tramo.nodoDestinoId, tramo);
    add(tramo.nodoDestinoId, tramo.nodoOrigenId, tramo);
  }
  return adyacencia;
}

/** Dijkstra acotado por distancia máxima — el radio de búsqueda es pequeño (decenas/cientos de metros), así que una cola simple basta. */
function distanciasDesdeNodos(
  adyacencia: Map<string, Vecino[]>,
  nodosIniciales: { nodo: string; distanciaInicial: number }[],
  distanciaMaxima: number,
): Map<string, number> {
  const distancias = new Map<string, number>();
  const cola: { nodo: string; distancia: number }[] = [];
  for (const { nodo, distanciaInicial } of nodosIniciales) {
    if (!distancias.has(nodo) || distanciaInicial < distancias.get(nodo)!) {
      distancias.set(nodo, distanciaInicial);
      cola.push({ nodo, distancia: distanciaInicial });
    }
  }
  const visitados = new Set<string>();
  while (cola.length > 0) {
    cola.sort((a, b) => a.distancia - b.distancia);
    const actual = cola.shift()!;
    if (visitados.has(actual.nodo)) continue;
    visitados.add(actual.nodo);
    if (actual.distancia > distanciaMaxima) continue;

    for (const { tramo, nodoVecino } of adyacencia.get(actual.nodo) ?? []) {
      const nuevaDistancia = actual.distancia + tramo.longitudM;
      if (nuevaDistancia > distanciaMaxima) continue;
      if (!distancias.has(nodoVecino) || nuevaDistancia < distancias.get(nodoVecino)!) {
        distancias.set(nodoVecino, nuevaDistancia);
        cola.push({ nodo: nodoVecino, distancia: nuevaDistancia });
      }
    }
  }
  return distancias;
}

export function proponerCordon(
  incidente: Incidente,
  todosLosTramos: Tramo[],
  indiceRedViaria: IndiceRedViaria,
): ResultadoPropuesta {
  const regla = buscarRegla(incidente.subtipo, incidente.intensidad);
  if (!regla) {
    return { ok: false, error: `No hay ReglaPerimetro para ${incidente.subtipo}/${incidente.intensidad}` };
  }

  const centro: Coordenada = [incidente.ubicacion.lon, incidente.ubicacion.lat];
  const radioMaximoBusqueda = regla.radioAreaSocorroM + MARGEN_DESVIO_M;

  const snap = indiceRedViaria.tramoMasCercano(centro, Math.max(radioMaximoBusqueda, 250));
  if (!snap) {
    return { ok: false, error: 'No se encontró ningún tramo de la red viaria cerca del incidente' };
  }

  const adyacencia = construirAdyacencia(todosLosTramos);
  // Distancia real hasta cada extremo del tramo donde cae el incidente
  // (recorriendo su geometría, no la perpendicular a la línea) — ver
  // distanciasAExtremosDelTramo() arriba.
  const { aOrigen, aDestino } = distanciasAExtremosDelTramo(centro, snap.tramo);
  const distancias = distanciasDesdeNodos(
    adyacencia,
    [
      { nodo: snap.tramo.nodoOrigenId, distanciaInicial: aOrigen },
      { nodo: snap.tramo.nodoDestinoId, distanciaInicial: aDestino },
    ],
    radioMaximoBusqueda,
  );

  const distanciaTramo = (tramo: Tramo): number | null => {
    // El propio tramo del incidente usa la distancia perpendicular real
    // (snap.distanciaMetros), no la aproximación por nodos — si no, un
    // incidente a mitad de un tramo largo podría salir "lejos" de su propio
    // tramo cuando en realidad está encima.
    if (tramo.idTramo === snap.tramo.idTramo) return snap.distanciaMetros;
    const dOrigen = distancias.get(tramo.nodoOrigenId);
    const dDestino = distancias.get(tramo.nodoDestinoId);
    if (dOrigen === undefined && dDestino === undefined) return null;
    return Math.min(dOrigen ?? Infinity, dDestino ?? Infinity);
  };

  const tramosCerrados: string[] = [];
  const tramosCorte: string[] = [];
  const tramosDesvioSugerido: string[] = [];
  const inicioBandaCorte = regla.radioAreaSocorroM * (1 - BANDA_CORTE_FRACCION);

  for (const tramo of todosLosTramos) {
    const d = distanciaTramo(tramo);
    if (d === null) continue;
    if (d <= regla.radioAreaIntervencionM) {
      tramosCerrados.push(tramo.idTramo);
    } else if (d <= regla.radioAreaSocorroM) {
      if (d >= inicioBandaCorte) tramosCorte.push(tramo.idTramo);
    } else if (d <= regla.radioAreaSocorroM + MARGEN_DESVIO_M) {
      tramosDesvioSugerido.push(tramo.idTramo);
    }
  }

  const areaIntervencion = circle(centro, regla.radioAreaIntervencionM, { units: 'meters', steps: 32 });
  const areaSocorro = circle(centro, regla.radioAreaSocorroM, { units: 'meters', steps: 32 });

  return {
    ok: true,
    propuesta: {
      idIncidente: incidente.idIncidente,
      regla,
      tramosCerrados,
      tramosCorte,
      tramosDesvioSugerido,
      geometriaAreaIntervencion: areaIntervencion.geometry,
      geometriaAreaSocorro: areaSocorro.geometry,
      generadaEn: new Date().toISOString(),
      editadaManualmente: false,
    },
  };
}

// Reexportado por conveniencia — algunos consumidores solo necesitan medir
// distancia recta (p.ej. para mostrar "a X m del incidente" en el formulario).
export { distanciaMetros };
