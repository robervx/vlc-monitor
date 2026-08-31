// GET /api/aire/v1/actual — endpoint definido en specs/002-capa-calidad-aire.md §4.
// Llama a Open-Meteo Air Quality a través de la caché con TTL de 60 min
// (stale-on-error) — nunca en caliente por cada petición del cliente.
import { getOrFetch } from './_shared/cache';
import { fetchCalidadAire } from '../services/calidad-aire';

export const config = { runtime: 'edge' };

const CACHE_KEY = 'aire:valencia-actual:v1';
const TTL_MS = 60 * 60 * 1000;

export default async function handler(): Promise<Response> {
  try {
    const { value: calidad, fresh } = await getOrFetch(CACHE_KEY, TTL_MS, fetchCalidadAire);
    return new Response(JSON.stringify({ calidad, fresh }), {
      status: 200,
      headers: {
        'content-type': 'application/json; charset=utf-8',
        'cache-control': 'public, max-age=300, stale-while-revalidate=3600',
      },
    });
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : String(err) }),
      { status: 502, headers: { 'content-type': 'application/json; charset=utf-8' } },
    );
  }
}
