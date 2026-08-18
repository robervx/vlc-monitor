// GET /api/insights/v1/actual — endpoint definido en
// specs/013-motor-insights-alertas.md §4. Sin fuente externa propia: combina
// las cachés ya existentes de 001 (meteo), 002 (aire), 010 (Pulso de
// Distrito, recalculado con las mismas cachés de 001/002/004) y 016
// (predicción a corto plazo). Mismo patrón que api/pulso/v1/distrito.ts.
import { getOrFetch } from '../../_shared/cache';
import { calcularInsights } from '../../../src/services/insights';
import { fetchEstadoMeteo } from '../../../src/services/estado-meteo';
import { fetchCalidadAire } from '../../../src/services/calidad-aire';
import { fetchEstadoTrafico } from '../../../src/services/trafico';
import { fetchPrediccionCortoPlazo } from '../../../src/services/prediccion-corto-plazo';
import { calcularPulsoDistrito } from '../../../src/services/pulso-distrito';
import {
  distritosFromGeoJSON,
  setLoadedDistricts,
  getDistrictAtCoordinates,
} from '../../../src/services/district-geometry';
import distritosGeoJSON from '../../../data/distritos-valencia.json';

export const config = { runtime: 'edge' };

setLoadedDistricts(distritosFromGeoJSON(distritosGeoJSON));
const distritosBasicos = distritosFromGeoJSON(distritosGeoJSON).map((d) => ({
  codigo: d.codigo,
  nombre: d.nombre,
}));

export default async function handler(): Promise<Response> {
  try {
    const [meteoResult, aireResult] = await Promise.all([
      getOrFetch('meteo:valencia-actual:v1', 15 * 60 * 1000, fetchEstadoMeteo),
      getOrFetch('aire:valencia-actual:v1', 60 * 60 * 1000, fetchCalidadAire),
    ]);

    // Fuentes "opcionales": si fallan, se degrada sirviendo los insights que
    // sí se pudieron calcular en vez de romper todo el panel (spec 013 §4).
    const [prediccionResult, traficoResult] = await Promise.allSettled([
      getOrFetch('meteo:valencia-prediccion-4h:v1', 15 * 60 * 1000, fetchPrediccionCortoPlazo),
      getOrFetch('trafico:valencia-estado:v1', 3 * 60 * 1000, () =>
        fetchEstadoTrafico((lat, lon) => getDistrictAtCoordinates(lat, lon)?.codigo ?? null),
      ),
    ]);

    const prediccion = prediccionResult.status === 'fulfilled' ? prediccionResult.value.value : null;
    const distritos =
      traficoResult.status === 'fulfilled'
        ? calcularPulsoDistrito(distritosBasicos, meteoResult.value, aireResult.value, traficoResult.value.value)
        : null;

    const panel = calcularInsights(meteoResult.value, aireResult.value, distritos, prediccion);
    const fresh = meteoResult.fresh && aireResult.fresh;

    return new Response(JSON.stringify({ panel, fresh }), {
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
