/**
 * Carga y caché en memoria del grafo viario en el cliente — compartida entre
 * spec 021 (modo cordón) y spec 022 (simulador de cortes) para no duplicar
 * el `fetch` ni el índice `rbush`. Antes vivía duplicada dentro de
 * `ui/modo-cordon.ts`.
 */
import { construirIndiceEspacial, type IndiceRedViaria } from './red-viaria-indice';
import type { RedViaria, Tramo, Nodo } from './red-viaria';

export interface GrafoViarioCliente {
  nodos: Nodo[];
  tramos: Tramo[];
  tramosPorId: Map<string, Tramo>;
  indice: IndiceRedViaria;
}

let cache: GrafoViarioCliente | null = null;
let promesaEnCurso: Promise<GrafoViarioCliente> | null = null;

export async function cargarGrafoViario(): Promise<GrafoViarioCliente> {
  if (cache) return cache;
  if (promesaEnCurso) return promesaEnCurso;

  promesaEnCurso = (async () => {
    // Asset estático versionado (spec 020): ~9 MB, servido por el CDN (gzip
    // ~1.1 MB), no por una función — supera el límite de tamaño/respuesta de
    // las funciones de Vercel. Sigue siendo mismo-origen y propio.
    const res = await fetch('/data/red-viaria-rodada.json');
    if (!res.ok) throw new Error(`GET /data/red-viaria-rodada.json -> HTTP ${res.status}`);
    const red = (await res.json()) as RedViaria;
    const resultado: GrafoViarioCliente = {
      nodos: red.nodos,
      tramos: red.tramos,
      tramosPorId: new Map(red.tramos.map((t) => [t.idTramo, t])),
      indice: construirIndiceEspacial(red.tramos),
    };
    cache = resultado;
    promesaEnCurso = null;
    return resultado;
  })().catch((err: unknown) => {
    promesaEnCurso = null;
    throw err;
  });

  return promesaEnCurso;
}

/** Solo para tests — evita que la caché de un test contamine el siguiente. */
export function _resetCacheGrafoViarioParaTests(): void {
  cache = null;
  promesaEnCurso = null;
}
