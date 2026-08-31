// GET /api/valenbisi/v1/estaciones — endpoint definido en specs/005-capa-valenbisi.md §4.
// Llama al Geoportal a través de la caché con TTL de 2 min (stale-on-error) —
// nunca en caliente por cada petición del cliente.
import { getOrFetch } from './_shared/cache';
import { fetchEstacionesValenbisi } from '../services/valenbisi';
import {
  distritosFromGeoJSON,
  setLoadedDistricts,
  getDistrictAtCoordinates,
} from '../services/district-geometry';
import distritosGeoJSON from '../../data/distritos-valencia.json' with { type: 'json' };

export const config = { runtime: 'edge' };

const CACHE_KEY = 'valenbisi:valencia-estaciones:v1';
const TTL_MS = 2 * 60 * 1000;

setLoadedDistricts(distritosFromGeoJSON(distritosGeoJSON));

export default async function handler(): Promise<Response> {
  try {
    const { value: estaciones, fresh } = await getOrFetch(CACHE_KEY, TTL_MS, () =>
      fetchEstacionesValenbisi((lat, lon) => getDistrictAtCoordinates(lat, lon)?.codigo ?? null),
    );
    return new Response(JSON.stringify({ estaciones, fresh }), {
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
