// GET /api/meteo/v1/actual — endpoint definido en specs/001-capa-meteorologia.md §4.
// Llama a Open-Meteo a través de la caché con TTL de 15 min (stale-on-error) —
// nunca en caliente por cada petición del cliente.
import { getOrFetch } from '../../_shared/cache';
import { fetchEstadoMeteo } from '../../../src/services/estado-meteo';

export const config = { runtime: 'edge' };

const CACHE_KEY = 'meteo:valencia-actual:v1';
const TTL_MS = 15 * 60 * 1000;

export default async function handler(): Promise<Response> {
  try {
    const { value: estado, fresh } = await getOrFetch(CACHE_KEY, TTL_MS, fetchEstadoMeteo);
    return new Response(JSON.stringify({ estado, fresh }), {
      status: 200,
      headers: {
        'content-type': 'application/json; charset=utf-8',
        'cache-control': 'public, max-age=60, stale-while-revalidate=900',
      },
    });
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : String(err) }),
      { status: 502, headers: { 'content-type': 'application/json; charset=utf-8' } },
    );
  }
}
