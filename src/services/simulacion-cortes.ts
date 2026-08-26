/**
 * Simulador de cortes de calle — spec 022. Función pura: sin red, sin DOM.
 * No es simulación de flujo de tráfico (sin volúmenes ni velocidades) — es
 * un análisis de alcanzabilidad sobre el grafo DIRIGIDO (respeta
 * `tramo.sentido`, a diferencia del grafo no-dirigido que usa spec 021 para
 * el cordón, donde lo que importaba era conectividad física, no si se
 * puede circular).
 *
 * Idea central: un nodo queda "aislado por esta combinación de cortes" si
 * podía alcanzar el nodo de referencia en el grafo SIN cortes y deja de
 * poder hacerlo con los cortes aplicados. Se compara siempre contra esa
 * línea base, no contra "alcanzabilidad absoluta", para no generar falsas
 * alarmas por zonas que ya estuvieran débilmente conectadas por otros
 * motivos ajenos a los cortes del usuario (ver spec 022 §7).
 */
import type { Tramo } from './red-viaria';

export interface TramoAislado {
  idTramo: string;
  nombreCalle: string | null;
}

export interface ResultadoSimulacionCortes {
  tramosAislados: TramoAislado[];
  nodosAisladosCount: number;
}

function construirAdyacenciaDirigida(tramos: Tramo[], cortados: ReadonlySet<string>): Map<string, string[]> {
  const adyacencia = new Map<string, string[]>();
  const add = (a: string, b: string) => {
    if (!adyacencia.has(a)) adyacencia.set(a, []);
    adyacencia.get(a)!.push(b);
  };
  for (const t of tramos) {
    if (cortados.has(t.idTramo)) continue;
    add(t.nodoOrigenId, t.nodoDestinoId);
    if (t.sentido === 'bidireccional') add(t.nodoDestinoId, t.nodoOrigenId);
  }
  return adyacencia;
}

function invertirAdyacencia(adyacencia: Map<string, string[]>): Map<string, string[]> {
  const inversa = new Map<string, string[]>();
  for (const [origen, destinos] of adyacencia) {
    for (const destino of destinos) {
      if (!inversa.has(destino)) inversa.set(destino, []);
      inversa.get(destino)!.push(origen);
    }
  }
  return inversa;
}

function bfs(adyacencia: Map<string, string[]>, inicio: string): Set<string> {
  const visitados = new Set<string>([inicio]);
  const cola: string[] = [inicio];
  while (cola.length > 0) {
    const actual = cola.shift()!;
    for (const vecino of adyacencia.get(actual) ?? []) {
      if (!visitados.has(vecino)) {
        visitados.add(vecino);
        cola.push(vecino);
      }
    }
  }
  return visitados;
}

/**
 * Línea base (sin cortes): nodos que pueden alcanzar `nodoReferenciaId`.
 * Calcular una vez por carga del grafo y reutilizar — no depende de los
 * cortes, así que recalcularla en cada clic sería trabajo repetido inútil.
 */
export function calcularAlcanzablesBase(tramos: Tramo[], nodoReferenciaId: string): Set<string> {
  const adyacencia = construirAdyacenciaDirigida(tramos, new Set());
  const inversa = invertirAdyacencia(adyacencia);
  return bfs(inversa, nodoReferenciaId);
}

export function calcularAislados(
  tramos: Tramo[],
  tramosCortados: ReadonlySet<string>,
  nodoReferenciaId: string,
  alcanzablesBase: ReadonlySet<string>,
): ResultadoSimulacionCortes {
  if (tramosCortados.size === 0) {
    return { tramosAislados: [], nodosAisladosCount: 0 };
  }

  const adyacenciaCortada = construirAdyacenciaDirigida(tramos, tramosCortados);
  const inversaCortada = invertirAdyacencia(adyacenciaCortada);
  const alcanzablesDespues = bfs(inversaCortada, nodoReferenciaId);

  const nodosAislados = new Set<string>();
  for (const nodo of alcanzablesBase) {
    if (!alcanzablesDespues.has(nodo)) nodosAislados.add(nodo);
  }

  const tramosAisladosMap = new Map<string, TramoAislado>();
  for (const t of tramos) {
    if (tramosCortados.has(t.idTramo)) continue;
    if (nodosAislados.has(t.nodoOrigenId) || nodosAislados.has(t.nodoDestinoId)) {
      tramosAisladosMap.set(t.idTramo, { idTramo: t.idTramo, nombreCalle: t.nombreCalle });
    }
  }

  return { tramosAislados: [...tramosAisladosMap.values()], nodosAisladosCount: nodosAislados.size };
}
