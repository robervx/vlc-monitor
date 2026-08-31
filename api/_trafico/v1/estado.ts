// GET /api/trafico/v1/estado — endpoint definido en specs/004-capa-trafico-tiempo-real.md §4.
// Llama al Geoportal a través de la caché con TTL de 3 min (stale-on-error) —
// nunca en caliente por cada petición del cliente.
import { getOrFetch } from '../../_shared/cache';
import { fetchEstadoTrafico } from '../../../src/services/trafico';
import {
  distritosFromGeoJSON,
  setLoadedDistricts,
  getDistrictAtCoordinates,
} from '../../../src/services/district-geometry';
import distritosGeoJSON from '../../../data/distritos-valencia.json';

export const config = { runtime: 'edge' };

const CACHE_KEY = 'trafico:valencia-estado:v1';
const TTL_MS = 3 * 60 * 1000;

// Los endpoints edge no tienen "origen de página" para un fetch relativo, así
// que cargamos la geometría de distritos directamente del asset estático
// (mismo patrón que api/geo/v1/distritos.ts) en vez de usar preloadDistrictGeometry().
setLoadedDistricts(distritosFromGeoJSON(distritosGeoJSON));

export default async function handler(): Promise<Response> {
  try {
    const { value: tramos, fresh } = await getOrFetch(CACHE_KEY, TTL_MS, () =>
      fetchEstadoTrafico((lat, lon) => getDistrictAtCoordinates(lat, lon)?.codigo ?? null),
    );
    return new Response(JSON.stringify({ tramos, fresh }), {
      status: 200,
      headers: {
        'content-type': 'application/json; charset=utf-8',
        'cache-control': 'public, max-age=60, stale-while-revalidate=180',
      },
    });
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : String(err) }),
      { status: 502, headers: { 'content-type': 'application/json; charset=utf-8' } },
    );
  }
}
