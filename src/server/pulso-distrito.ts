// GET /api/pulso/v1/distrito — endpoint definido en specs/010-indice-pulso-distrito.md §4.
// No tiene fuente externa propia: combina las cachés ya existentes de las
// specs 001 (meteo), 002 (aire), 004 (tráfico) y 026 (incidencias de vía
// pública) — mismas claves de caché que sus propios endpoints, así que si ya
// están calientes no hay llamada de red. Incidencias degrada si falla (v3).
import { getOrFetch } from './_shared/cache';
import { calcularPulsoDistrito } from '../services/pulso-distrito';
import { fetchEstadoMeteo } from '../services/estado-meteo';
import { fetchCalidadAire } from '../services/calidad-aire';
import { fetchEstadoTrafico } from '../services/trafico';
import { fetchIncidenciasViaPublica } from '../services/via-publica';
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
    const resolverDistrito = (lat: number, lon: number) => getDistrictAtCoordinates(lat, lon)?.codigo ?? null;
    const [meteoResult, aireResult, traficoResult] = await Promise.all([
      getOrFetch('meteo:valencia-actual:v1', 15 * 60 * 1000, fetchEstadoMeteo),
      getOrFetch('aire:valencia-actual:v1', 60 * 60 * 1000, fetchCalidadAire),
      getOrFetch('trafico:valencia-estado:v1', 3 * 60 * 1000, () => fetchEstadoTrafico(resolverDistrito)),
    ]);

    // Incidencias de vía pública (spec 026): componente por distrito de la v3.
    // Si falla, `incidencias = []` y el índice se calcula sin ese componente.
    let incidencias: Awaited<ReturnType<typeof fetchIncidenciasViaPublica>> = [];
    try {
      const r = await getOrFetch('via-publica:incidencias-valencia:v1', 60 * 60 * 1000, () =>
        fetchIncidenciasViaPublica(resolverDistrito),
      );
      const ahora = Date.now();
      incidencias = r.value.filter((i) => new Date(i.vigenciaHasta).getTime() >= ahora);
    } catch {
      /* degrada: sin componente de incidencias */
    }

    const distritos = calcularPulsoDistrito(
      distritosBasicos,
      meteoResult.value,
      aireResult.value,
      traficoResult.value,
      incidencias,
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
