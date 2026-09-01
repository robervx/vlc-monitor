/**
 * Motor de propagación dirigida de cortes de calle — spec 031. Función pura:
 * sin red, sin DOM. Compartido por el modo cordón (spec 021) y el simulador
 * de cortes (spec 022).
 *
 * Idea: dado un conjunto de tramos cortados, ¿a qué tramos deja de poder
 * llegar el tráfico del resto de la ciudad (`sinEntrada`), cuáles dejan de
 * poder volver al resto de la ciudad (`sinSalida`), y qué vías abiertas
 * desembocan justo en un corte y obligan a desviarse (`desvioForzado`)?
 *
 * "El resto de la ciudad" = la mayor componente fuertemente conexa (SCC) del
 * grafo dirigido — verificado sobre el grafo real: cubre el 95,4 % de los
 * nodos (spec 031 §2). Sustituye al nodo de referencia único (Plaza del
 * Ayuntamiento) que usaba spec 022, y con él el riesgo de su §7.
 *
 * Todo se calcula como DIFERENCIA contra la línea base (grafo sin cortes):
 * solo se reporta lo que cambia por culpa de los cortes, nunca la
 * alcanzabilidad absoluta (así una zona ya débilmente conectada de antes no
 * genera una falsa alarma).
 */
import type { Tramo } from './red-viaria';

export type MotivoAfectacion = 'sinEntrada' | 'sinSalida' | 'aislado';

export interface TramoAfectado {
  idTramo: string;
  nombreCalle: string | null;
  sentido: Tramo['sentido'];
  motivo: MotivoAfectacion;
}

export interface TramoDesvioForzado {
  idTramo: string;
  nombreCalle: string | null;
  /** Nodo (extremo de un tramo cortado) donde este tramo desemboca. */
  nodoConflicto: string;
  /** true si desde `nodoConflicto` no queda ninguna salida no cortada — el corte crea un fondo de saco, no solo un giro obligado. */
  sinContinuidad: boolean;
}

export interface ResultadoPropagacionCorte {
  tramosCortados: string[];
  tramosSinEntrada: TramoAfectado[];
  tramosSinSalida: TramoAfectado[];
  tramosAislados: TramoAfectado[];
  tramosDesvioForzado: TramoDesvioForzado[];
  nodosSinEntradaCount: number;
  nodosSinSalidaCount: number;
  referencia: 'sccPrincipal';
  generadaEn: string;
}

/** Precálculo compartido, una vez por carga del grafo (ver `grafo-viario-cliente.ts`). */
export interface BasePropagacion {
  /** Nodo ancla dentro de la SCC principal (el de mayor grado). */
  anclaScc: string;
  /** Nodos alcanzables DESDE el ancla en el grafo dirigido (reciben tráfico del núcleo). */
  entrantesBase: Set<string>;
  /** Nodos alcanzables desde el ancla en el grafo INVERTIDO (envían tráfico al núcleo). */
  salientesBase: Set<string>;
}

type Adyacencia = Map<string, string[]>;
const SIN_EXCLUIDOS: ReadonlySet<string> = new Set<string>();

function construirAdyacencia(
  tramos: Tramo[],
  excluidos: ReadonlySet<string>,
): { directa: Adyacencia; inversa: Adyacencia } {
  const directa: Adyacencia = new Map();
  const inversa: Adyacencia = new Map();
  const add = (m: Adyacencia, a: string, b: string) => {
    const l = m.get(a);
    if (l) l.push(b);
    else m.set(a, [b]);
  };
  for (const t of tramos) {
    if (excluidos.has(t.idTramo)) continue;
    add(directa, t.nodoOrigenId, t.nodoDestinoId);
    add(inversa, t.nodoDestinoId, t.nodoOrigenId);
    if (t.sentido === 'bidireccional') {
      add(directa, t.nodoDestinoId, t.nodoOrigenId);
      add(inversa, t.nodoOrigenId, t.nodoDestinoId);
    }
  }
  return { directa, inversa };
}

function bfs(adyacencia: Adyacencia, inicio: string): Set<string> {
  const visitados = new Set<string>([inicio]);
  const cola: string[] = [inicio];
  // Índice en vez de `shift()` — O(1) por elemento en vez de O(n).
  for (let i = 0; i < cola.length; i++) {
    for (const vecino of adyacencia.get(cola[i]!) ?? []) {
      if (!visitados.has(vecino)) {
        visitados.add(vecino);
        cola.push(vecino);
      }
    }
  }
  return visitados;
}

/**
 * Mayor componente fuertemente conexa del grafo dirigido, vía Kosaraju con
 * DFS ITERATIVO — con ~9k nodos una DFS recursiva desbordaría la pila de JS.
 */
export function calcularSccPrincipal(tramos: Tramo[]): Set<string> {
  const { directa, inversa } = construirAdyacencia(tramos, SIN_EXCLUIDOS);

  const nodos = new Set<string>();
  for (const t of tramos) {
    nodos.add(t.nodoOrigenId);
    nodos.add(t.nodoDestinoId);
  }

  // Paso 1: orden de finalización de una DFS sobre el grafo directo.
  const visitados = new Set<string>();
  const ordenFin: string[] = [];
  for (const inicio of nodos) {
    if (visitados.has(inicio)) continue;
    const pila: Array<{ nodo: string; i: number }> = [{ nodo: inicio, i: 0 }];
    visitados.add(inicio);
    while (pila.length > 0) {
      const marco = pila[pila.length - 1]!;
      const vecinos = directa.get(marco.nodo) ?? [];
      if (marco.i < vecinos.length) {
        const w = vecinos[marco.i++]!;
        if (!visitados.has(w)) {
          visitados.add(w);
          pila.push({ nodo: w, i: 0 });
        }
      } else {
        ordenFin.push(marco.nodo);
        pila.pop();
      }
    }
  }

  // Paso 2: DFS sobre el grafo inverso en orden de finalización decreciente.
  const asignados = new Set<string>();
  let mayor = new Set<string>();
  for (let k = ordenFin.length - 1; k >= 0; k--) {
    const raiz = ordenFin[k]!;
    if (asignados.has(raiz)) continue;
    const miembros: string[] = [];
    const pila = [raiz];
    asignados.add(raiz);
    while (pila.length > 0) {
      const nodo = pila.pop()!;
      miembros.push(nodo);
      for (const w of inversa.get(nodo) ?? []) {
        if (!asignados.has(w)) {
          asignados.add(w);
          pila.push(w);
        }
      }
    }
    if (miembros.length > mayor.size) mayor = new Set(miembros);
  }
  return mayor;
}

export function calcularBasePropagacion(tramos: Tramo[], sccPrincipal: ReadonlySet<string>): BasePropagacion {
  const { directa, inversa } = construirAdyacencia(tramos, SIN_EXCLUIDOS);
  let anclaScc = '';
  let mejorGrado = -1;
  for (const n of sccPrincipal) {
    const grado = (directa.get(n)?.length ?? 0) + (inversa.get(n)?.length ?? 0);
    if (grado > mejorGrado) {
      mejorGrado = grado;
      anclaScc = n;
    }
  }
  return {
    anclaScc,
    entrantesBase: anclaScc ? bfs(directa, anclaScc) : new Set(),
    salientesBase: anclaScc ? bfs(inversa, anclaScc) : new Set(),
  };
}

/** Un tramo no puede recibir tráfico del núcleo si no se puede llegar a su punto de acceso. */
function bloqueadoParaEntrar(t: Tramo, nodosSinEntrada: ReadonlySet<string>): boolean {
  if (t.sentido === 'unidireccional') return nodosSinEntrada.has(t.nodoOrigenId);
  // Bidireccional: se puede circular por él si se alcanza cualquiera de sus extremos.
  return nodosSinEntrada.has(t.nodoOrigenId) && nodosSinEntrada.has(t.nodoDestinoId);
}

function bloqueadoParaSalir(t: Tramo, nodosSinSalida: ReadonlySet<string>): boolean {
  if (t.sentido === 'unidireccional') return nodosSinSalida.has(t.nodoDestinoId);
  return nodosSinSalida.has(t.nodoOrigenId) && nodosSinSalida.has(t.nodoDestinoId);
}

export function propagarCorte(
  tramos: Tramo[],
  tramosCortados: ReadonlySet<string>,
  base: BasePropagacion,
): ResultadoPropagacionCorte {
  const idsCortados = [...tramosCortados];
  const generadaEn = new Date().toISOString();
  const vacio: ResultadoPropagacionCorte = {
    tramosCortados: idsCortados,
    tramosSinEntrada: [],
    tramosSinSalida: [],
    tramosAislados: [],
    tramosDesvioForzado: [],
    nodosSinEntradaCount: 0,
    nodosSinSalidaCount: 0,
    referencia: 'sccPrincipal',
    generadaEn,
  };
  if (tramosCortados.size === 0 || !base.anclaScc) return vacio;

  const { directa, inversa } = construirAdyacencia(tramos, tramosCortados);
  const entrantesTrasCorte = bfs(directa, base.anclaScc);
  const salientesTrasCorte = bfs(inversa, base.anclaScc);

  const nodosSinEntrada = new Set<string>();
  for (const n of base.entrantesBase) if (!entrantesTrasCorte.has(n)) nodosSinEntrada.add(n);
  const nodosSinSalida = new Set<string>();
  for (const n of base.salientesBase) if (!salientesTrasCorte.has(n)) nodosSinSalida.add(n);

  const sinEntrada: TramoAfectado[] = [];
  const sinSalida: TramoAfectado[] = [];
  const aislados: TramoAfectado[] = [];
  const idsSinEntradaOAislado = new Set<string>();

  for (const t of tramos) {
    if (tramosCortados.has(t.idTramo)) continue;
    const noEntra = bloqueadoParaEntrar(t, nodosSinEntrada);
    const noSale = bloqueadoParaSalir(t, nodosSinSalida);
    if (!noEntra && !noSale) continue;
    const afectado: TramoAfectado = {
      idTramo: t.idTramo,
      nombreCalle: t.nombreCalle,
      sentido: t.sentido,
      motivo: noEntra && noSale ? 'aislado' : noEntra ? 'sinEntrada' : 'sinSalida',
    };
    if (noEntra && noSale) {
      aislados.push(afectado);
      idsSinEntradaOAislado.add(t.idTramo);
    } else if (noEntra) {
      sinEntrada.push(afectado);
      idsSinEntradaOAislado.add(t.idTramo);
    } else {
      sinSalida.push(afectado);
    }
  }

  // Vías abiertas que desembocan en una "boca de corte" (extremo de un tramo
  // cortado por donde el tráfico llegaba) — siguen abiertas pero obligan a
  // desviarse. Son "las que entran a la avenida" del ejemplo del usuario.
  const tramosPorId = new Map(tramos.map((t) => [t.idTramo, t]));
  const bocasCorte = new Set<string>();
  for (const id of tramosCortados) {
    const c = tramosPorId.get(id);
    if (!c) continue;
    bocasCorte.add(c.nodoOrigenId);
    if (c.sentido === 'bidireccional') bocasCorte.add(c.nodoDestinoId);
  }

  const desvioForzado: TramoDesvioForzado[] = [];
  for (const t of tramos) {
    if (tramosCortados.has(t.idTramo) || idsSinEntradaOAislado.has(t.idTramo)) continue;
    let nodoConflicto: string | null = null;
    let nodoLlegada: string | null = null;
    if (bocasCorte.has(t.nodoDestinoId)) {
      nodoConflicto = t.nodoDestinoId;
      nodoLlegada = t.nodoOrigenId;
    } else if (t.sentido === 'bidireccional' && bocasCorte.has(t.nodoOrigenId)) {
      nodoConflicto = t.nodoOrigenId;
      nodoLlegada = t.nodoDestinoId;
    }
    if (!nodoConflicto) continue;
    // `directa` ya excluye los tramos cortados — ¿queda alguna salida que no
    // sea volver por donde se ha venido?
    const salidas = (directa.get(nodoConflicto) ?? []).filter((d) => d !== nodoLlegada);
    desvioForzado.push({
      idTramo: t.idTramo,
      nombreCalle: t.nombreCalle,
      nodoConflicto,
      sinContinuidad: salidas.length === 0,
    });
  }

  return {
    tramosCortados: idsCortados,
    tramosSinEntrada: sinEntrada,
    tramosSinSalida: sinSalida,
    tramosAislados: aislados,
    tramosDesvioForzado: desvioForzado,
    nodosSinEntradaCount: nodosSinEntrada.size,
    nodosSinSalidaCount: nodosSinSalida.size,
    referencia: 'sccPrincipal',
    generadaEn,
  };
}
