// GET /api/emergencia/v1/riesgo-escorrentia — spec 046 §4. Cruza la
// vulnerabilidad estructural estática (seed de imbornales por distrito) con
// la lluvia en vivo de `044` (invocada como handler en el mismo proceso,
// mismo patrón que `047`/`sintesis-ia-v2.ts` — nunca una llamada HTTP
// interna). Mismo TTL que `emergencia/v1/meteo-zona` (15 min), ya que la
// única parte dinámica es la lluvia.
import { getOrFetch } from './_shared/cache';
import { calcularRiesgoEscorrentia, type RiesgoEscorrentiaDistrito, type ImbornalesDistrito } from '../services/riesgo-escorrentia';
import type { LluviaVientoDistrito } from '../services/meteo-zona';
import meteoZonaHandler from './meteo-zona';
import imbornalesDistrito from '../../data/imbornales-distrito.json' with { type: 'json' };

export const config = { runtime: 'edge' };

const CACHE_KEY = 'emergencia:riesgo-escorrentia:v1';
const TTL_MS = 15 * 60 * 1000;

async function leerLluviaPorDistrito(): Promise<{ lluvia: Map<string, number>; observedAt: string }> {
  try {
    const res = await meteoZonaHandler();
    if (!res.ok) return { lluvia: new Map(), observedAt: new Date().toISOString() };
    const body = (await res.json()) as { distritos: LluviaVientoDistrito[] };
    const lluvia = new Map(body.distritos.map((d) => [d.distritoCodigo, d.precipitacionMm]));
    const observedAt = body.distritos[0]?.fecha ?? new Date().toISOString();
    return { lluvia, observedAt };
  } catch (err) {
    console.error('emergencia/v1/meteo-zona no disponible para riesgo-escorrentia:', err);
    return { lluvia: new Map(), observedAt: new Date().toISOString() };
  }
}

async function fetchRiesgoEscorrentia(): Promise<RiesgoEscorrentiaDistrito[]> {
  const { lluvia, observedAt } = await leerLluviaPorDistrito();
  const fetchedAt = new Date().toISOString();
  return calcularRiesgoEscorrentia(imbornalesDistrito as ImbornalesDistrito[], lluvia, fetchedAt, observedAt);
}

export default async function handler(): Promise<Response> {
  try {
    const { value: distritos, fresh } = await getOrFetch(CACHE_KEY, TTL_MS, fetchRiesgoEscorrentia);
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
