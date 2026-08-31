// GET /api/meteo/v1/prediccion-corto-plazo — endpoint definido en
// specs/016-prediccion-corto-plazo-meteo.md §4. Mismo patrón que
// api/meteo/v1/actual.ts (spec 001): caché con TTL de 15 min, stale-on-error.
import { getOrFetch } from '../../_shared/cache';
import { fetchPrediccionCortoPlazo } from '../../../src/services/prediccion-corto-plazo';

export const config = { runtime: 'edge' };

const CACHE_KEY = 'meteo:valencia-prediccion-4h:v1';
const TTL_MS = 15 * 60 * 1000;

export default async function handler(): Promise<Response> {
  try {
    const { value: prediccion, fresh } = await getOrFetch(CACHE_KEY, TTL_MS, fetchPrediccionCortoPlazo);
    return new Response(JSON.stringify({ prediccion, fresh }), {
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
