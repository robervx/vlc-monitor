// GET /api/geo/v1/distritos — endpoint definido en specs/000-mapa-base-distritos.md §4.
// Sirve el GeoJSON de distritos desde el asset estático versionado en el repo
// (data/distritos-valencia.json, generado por scripts/seed-distritos.mjs) —
// nunca llama a la fuente externa (Geoportal) en el momento de la petición.
import { distritosFromGeoJSON } from '../services/district-geometry';
import distritosGeoJSON from '../../data/distritos-valencia.json' with { type: 'json' };

export const config = { runtime: 'edge' };

export default async function handler(): Promise<Response> {
  const distritos = distritosFromGeoJSON(distritosGeoJSON);

  return new Response(JSON.stringify({ distritos }), {
    status: 200,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      // Baja frecuencia de cambio (ver spec 000 §4) — cacheable de forma agresiva.
      'cache-control': 'public, max-age=3600, s-maxage=86400, stale-while-revalidate=86400',
    },
  });
}
