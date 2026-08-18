// GET /api/fallas/v1/actual — endpoint definido en specs/008-agenda-aglomeraciones-fallas.md §4.
// Llama al Geoportal (4 capas) a través de la caché con TTL de 6h
// (stale-on-error) — dato casi estático fuera de la ventana de Fallas.
import { getOrFetch } from '../../_shared/cache';
import { fetchDatosFallas } from '../../../src/services/fallas';

export const config = { runtime: 'edge' };

const CACHE_KEY = 'fallas:valencia-actual:v1';
const TTL_MS = 6 * 60 * 60 * 1000;

export default async function handler(): Promise<Response> {
  try {
    const { value: datos, fresh } = await getOrFetch(CACHE_KEY, TTL_MS, fetchDatosFallas);
    return new Response(JSON.stringify({ ...datos, fresh }), {
      status: 200,
      headers: {
        'content-type': 'application/json; charset=utf-8',
        'cache-control': 'public, max-age=3600, stale-while-revalidate=21600',
      },
    });
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : String(err) }),
      { status: 502, headers: { 'content-type': 'application/json; charset=utf-8' } },
    );
  }
}
