/**
 * Ruta alternativa de un corte de calle — spec 022 (v6). Función pura: sin
 * red, sin DOM.
 *
 * Para cada tramo cortado, calcula el camino dirigido más corto que va de su
 * nodo de origen a su nodo de destino SIN pasar por ningún corte — es decir,
 * "por dónde tendría que dar la vuelta el tráfico que iba por aquí". Se usa
 * para la animación cualitativa del simulador: los coches dejan de pasar por
 * la calle cortada y se ve el desvío por la alternativa (petición del
 * usuario, revisión del gemelo digital).
 *
 * NO es reparto de tráfico con volúmenes: es UNA ruta representativa por
 * corte, la más corta. Distinto de lo que se retiró en la v4 de spec 022
 * (que animaba "flujo" sobre la propia calle cortada, poco intuitivo) — aquí
 * la calle cortada queda sin animación y lo que se anima es el rodeo.
 */
import type { Coordenada } from './proximidad';
import type { Tramo } from './red-viaria';

export interface RutaAlternativa {
  idTramoCortado: string;
  nombreCalleCortada: string | null;
  tramosRuta: string[];
  geometria: Coordenada[];
  longitudM: number;
}

interface AristaDirigida {
  nodo: string;
  tramo: Tramo;
}

function adyacenciaDirigida(tramos: Tramo[], excluidos: ReadonlySet<string>): Map<string, AristaDirigida[]> {
  const adj = new Map<string, AristaDirigida[]>();
  const add = (desde: string, nodo: string, tramo: Tramo) => {
    const l = adj.get(desde);
    if (l) l.push({ nodo, tramo });
    else adj.set(desde, [{ nodo, tramo }]);
  };
  for (const t of tramos) {
    if (excluidos.has(t.idTramo)) continue;
    add(t.nodoOrigenId, t.nodoDestinoId, t);
    if (t.sentido === 'bidireccional') add(t.nodoDestinoId, t.nodoOrigenId, t);
  }
  return adj;
}

/** Dijkstra dirigido acotado por longitud. Cola simple (búsqueda corta). */
function caminoMasCorto(
  adj: Map<string, AristaDirigida[]>,
  origen: string,
  destino: string,
  maxLongitudM: number,
): { tramos: Tramo[]; nodos: string[]; longitudM: number } | null {
  if (origen === destino) return null;
  const dist = new Map<string, number>([[origen, 0]]);
  const prev = new Map<string, { nodo: string; tramo: Tramo }>();
  const cola: Array<{ nodo: string; d: number }> = [{ nodo: origen, d: 0 }];
  const visto = new Set<string>();

  while (cola.length > 0) {
    cola.sort((a, b) => a.d - b.d);
    const actual = cola.shift()!;
    if (visto.has(actual.nodo)) continue;
    visto.add(actual.nodo);
    if (actual.nodo === destino) break;
    if (actual.d > maxLongitudM) continue;
    for (const arista of adj.get(actual.nodo) ?? []) {
      const nd = actual.d + arista.tramo.longitudM;
      if (nd > maxLongitudM) continue;
      if (!dist.has(arista.nodo) || nd < dist.get(arista.nodo)!) {
        dist.set(arista.nodo, nd);
        prev.set(arista.nodo, { nodo: actual.nodo, tramo: arista.tramo });
        cola.push({ nodo: arista.nodo, d: nd });
      }
    }
  }

  if (!dist.has(destino) || !prev.has(destino)) return null;
  const tramos: Tramo[] = [];
  const nodos: string[] = [destino];
  let cur = destino;
  while (cur !== origen) {
    const p = prev.get(cur);
    if (!p) return null;
    tramos.push(p.tramo);
    nodos.push(p.nodo);
    cur = p.nodo;
  }
  tramos.reverse();
  nodos.reverse();
  return { tramos, nodos, longitudM: dist.get(destino)! };
}

/** Concatena la geometría de los tramos del camino, orientando cada uno en el sentido de avance. */
function concatenarGeometria(tramos: Tramo[], nodos: string[]): Coordenada[] {
  const out: Coordenada[] = [];
  for (let i = 0; i < tramos.length; i++) {
    const t = tramos[i]!;
    let coords = t.geometria.coordinates as Coordenada[];
    if (t.nodoOrigenId !== nodos[i]) coords = [...coords].reverse();
    for (const c of coords) {
      const ultimo = out[out.length - 1];
      if (!ultimo || ultimo[0] !== c[0] || ultimo[1] !== c[1]) out.push(c);
    }
  }
  return out;
}

export function calcularRutasAlternativas(
  tramos: Tramo[],
  tramosCortados: ReadonlySet<string>,
  opciones: { maxLongitudM?: number } = {},
): RutaAlternativa[] {
  if (tramosCortados.size === 0) return [];
  const porId = new Map(tramos.map((t) => [t.idTramo, t]));
  const adj = adyacenciaDirigida(tramos, tramosCortados);
  const rutas: RutaAlternativa[] = [];

  for (const id of tramosCortados) {
    const cortado = porId.get(id);
    if (!cortado) continue;
    // Rodeo razonable: hasta 12x la longitud del tramo cortado, acotado a
    // [400, 1500] m — un desvío más largo que eso rara vez aporta como
    // animación y sí ensucia el mapa (el tramo afectado ya sale en cian).
    const maxLongitudM = opciones.maxLongitudM ?? Math.min(1500, Math.max(400, cortado.longitudM * 12));
    const camino = caminoMasCorto(adj, cortado.nodoOrigenId, cortado.nodoDestinoId, maxLongitudM);
    if (!camino || camino.tramos.length === 0) continue;
    rutas.push({
      idTramoCortado: id,
      nombreCalleCortada: cortado.nombreCalle,
      tramosRuta: camino.tramos.map((t) => t.idTramo),
      geometria: concatenarGeometria(camino.tramos, camino.nodos),
      longitudM: camino.longitudM,
    });
  }
  return rutas;
}
