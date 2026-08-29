// GET /api/via-publica/v1/incidencias — endpoint definido en specs/026-incidencias-via-publica.md §4.
// Llama al Geoportal a través de la caché con TTL de 1h (stale-on-error) —
// nunca en caliente por cada petición del cliente. Filtra en servidor las
// incidencias cuya vigencia ya expiró (spec 026 §4) — la caché guarda todas,
// el filtrado por "ahora" se recalcula en cada respuesta.
import { getOrFetch } from '../../_shared/cache';
import { fetchIncidenciasViaPublica } from '../../../src/services/via-publica';
import {
  distritosFromGeoJSON,
  setLoadedDistricts,
  getDistrictAtCoordinates,
} from '../../../src/services/district-geometry';
import distritosGeoJSON from '../../../data/distritos-valencia.json';

export const config = { runtime: 'edge' };

const CACHE_KEY = 'via-publica:incidencias-valencia:v1';
const TTL_MS = 60 * 60 * 1000;

setLoadedDistricts(distritosFromGeoJSON(distritosGeoJSON));

export default async function handler(): Promise<Response> {
  try {
    const { value: todas, fresh } = await getOrFetch(CACHE_KEY, TTL_MS, () =>
      fetchIncidenciasViaPublica((lat, lon) => getDistrictAtCoordinates(lat, lon)?.codigo ?? null),
    );
    const ahora = Date.now();
    const incidencias = todas.filter((i) => new Date(i.vigenciaHasta).getTime() >= ahora);

    return new Response(JSON.stringify({ incidencias, fresh }), {
      status: 200,
      headers: {
        'content-type': 'application/json; charset=utf-8',
        'cache-control': 'public, max-age=600, stale-while-revalidate=3600',
      },
    });
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : String(err) }),
      { status: 502, headers: { 'content-type': 'application/json; charset=utf-8' } },
    );
  }
}
