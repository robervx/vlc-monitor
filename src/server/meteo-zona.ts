// GET /api/emergencia/v1/meteo-zona — spec 044 §4. Lluvia/viento por
// distrito, mismo TTL que spec 001 (15 min) — modelo Open-Meteo (sin API
// key), no estación real (ver spec 044 §7, se distingue en la UI del dato
// medido de pluviometros-saih.ts).
import { getOrFetch } from './_shared/cache';
import {
  distritosFromGeoJSON,
  setLoadedDistricts,
  getLoadedDistricts,
} from '../services/district-geometry';
import {
  construirParametrosOpenMeteo,
  normalizarLluviaVientoPorDistrito,
  type RespuestaOpenMeteoPunto,
  type LluviaVientoDistrito,
  type DistritoConCentroide,
} from '../services/meteo-zona';
import distritosGeoJSON from '../../data/distritos-valencia.json' with { type: 'json' };

export const config = { runtime: 'edge' };

setLoadedDistricts(distritosFromGeoJSON(distritosGeoJSON));

const CACHE_KEY = 'emergencia:meteo-zona:v1';
const TTL_MS = 15 * 60 * 1000;

async function fetchMeteoZona(): Promise<LluviaVientoDistrito[]> {
  const distritos: DistritoConCentroide[] = getLoadedDistricts().map((d) => ({
    codigo: d.codigo,
    nombre: d.nombre,
    centroide: d.centroide,
  }));
  const { latitude, longitude } = construirParametrosOpenMeteo(distritos);
  const url =
    `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}` +
    '&current=precipitation,wind_speed_10m,wind_gusts_10m&timezone=UTC';
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Open-Meteo respondió HTTP ${res.status}`);
  const respuesta = (await res.json()) as RespuestaOpenMeteoPunto[];
  return normalizarLluviaVientoPorDistrito(distritos, respuesta);
}

export default async function handler(): Promise<Response> {
  try {
    const { value: distritos, fresh } = await getOrFetch(CACHE_KEY, TTL_MS, fetchMeteoZona);
    return new Response(JSON.stringify({ distritos, fresh }), {
      status: 200,
      headers: {
        'content-type': 'application/json; charset=utf-8',
        'cache-control': 'public, max-age=60, stale-while-revalidate=900',
      },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : String(err) }), {
      status: 502,
      headers: { 'content-type': 'application/json; charset=utf-8' },
    });
  }
}
