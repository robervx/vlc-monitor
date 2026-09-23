// GET /api/movilidad/v1/avisos-incidencias-previsiones — endpoint definido en
// specs/048-avisos-movilidad-incidencias-previsiones.md §4. Llama a la página
// de incidencias y previsiones de valencia.es a través de la caché con TTL de
// 6h (stale-on-error) — nunca en caliente por cada petición del cliente.
// Mismo patrón que avisos-meteo.ts (spec 001).
import { getOrFetch } from './_shared/cache';
import { fetchAvisosMovilidad } from '../services/movilidad-incidencias-previsiones';

export const config = { runtime: 'edge' };

const CACHE_KEY = 'movilidad:avisos-incidencias-previsiones:v1';
const TTL_MS = 6 * 60 * 60 * 1000;

export default async function handler(): Promise<Response> {
  try {
    const { value: snapshot, fresh } = await getOrFetch(CACHE_KEY, TTL_MS, fetchAvisosMovilidad);
    return new Response(JSON.stringify({ ...snapshot, fresh }), {
      status: 200,
      headers: {
        'content-type': 'application/json; charset=utf-8',
        'cache-control': 'public, max-age=600, stale-while-revalidate=21600',
      },
    });
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : String(err) }),
      { status: 502, headers: { 'content-type': 'application/json; charset=utf-8' } },
    );
  }
}
