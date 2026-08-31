// GET /api/pulso/v1/distrito — endpoint definido en specs/010-indice-pulso-distrito.md §4.
// No tiene fuente externa propia: combina las cachés ya existentes de las
// specs 001 (meteo), 002 (aire) y 004 (tráfico) — mismas claves de caché que
// sus propios endpoints, así que si ya están calientes no hay llamada de red.
import { getOrFetch } from './_shared/cache';
import { calcularPulsoDistrito } from '../services/pulso-distrito';
import { fetchEstadoMeteo } from '../services/estado-meteo';
import { fetchCalidadAire } from '../services/calidad-aire';
import { fetchEstadoTrafico } from '../services/trafico';
import {
  distritosFromGeoJSON,
  setLoadedDistricts,
  getDistrictAtCoordinates,
} from '../services/district-geometry';
import distritosGeoJSON from '../../data/distritos-valencia.json' with { type: 'json' };

export const config = { runtime: 'edge' };

setLoadedDistricts(distritosFromGeoJSON(distritosGeoJSON));
const distritosBasicos = distritosFromGeoJSON(distritosGeoJSON).map((d) => ({
  codigo: d.codigo,
  nombre: d.nombre,
}));

export default async function handler(): Promise<Response> {
  try {
    const [meteoResult, aireResult, traficoResult] = await Promise.all([
      getOrFetch('meteo:valencia-actual:v1', 15 * 60 * 1000, fetchEstadoMeteo),
      getOrFetch('aire:valencia-actual:v1', 60 * 60 * 1000, fetchCalidadAire),
      getOrFetch('trafico:valencia-estado:v1', 3 * 60 * 1000, () =>
        fetchEstadoTrafico((lat, lon) => getDistrictAtCoordinates(lat, lon)?.codigo ?? null),
      ),
    ]);

    const distritos = calcularPulsoDistrito(
      distritosBasicos,
      meteoResult.value,
      aireResult.value,
      traficoResult.value,
    );
    const fresh = meteoResult.fresh && aireResult.fresh && traficoResult.fresh;

    return new Response(JSON.stringify({ distritos, fresh }), {
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
