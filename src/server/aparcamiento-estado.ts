// GET /api/aparcamiento/v1/estado — endpoint definido en specs/006-capa-aparcamiento.md §4.
// Llama al Geoportal a través de la caché con TTL de 2 min (stale-on-error) —
// nunca en caliente por cada petición del cliente.
import { getOrFetch } from './_shared/cache';
import { fetchAparcamientos } from '../services/aparcamiento';
import {
  distritosFromGeoJSON,
  setLoadedDistricts,
  getDistrictAtCoordinates,
} from '../services/district-geometry';
import distritosGeoJSON from '../../data/distritos-valencia.json' with { type: 'json' };

export const config = { runtime: 'edge' };

const CACHE_KEY = 'aparcamiento:valencia-parkings:v1';
const TTL_MS = 2 * 60 * 1000;

setLoadedDistricts(distritosFromGeoJSON(distritosGeoJSON));

export default async function handler(): Promise<Response> {
  try {
    const { value: aparcamientos, fresh } = await getOrFetch(CACHE_KEY, TTL_MS, () =>
      fetchAparcamientos((lat, lon) => getDistrictAtCoordinates(lat, lon)?.codigo ?? null),
    );
    return new Response(JSON.stringify({ aparcamientos, fresh }), {
      status: 200,
      headers: {
        'content-type': 'application/json; charset=utf-8',
        'cache-control': 'public, max-age=60, stale-while-revalidate=120',
      },
    });
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : String(err) }),
      { status: 502, headers: { 'content-type': 'application/json; charset=utf-8' } },
    );
  }
}
