// GET /api/emergencia/v1/zas — spec 049 §4. Combina el seed estático de
// polígonos ZAS (declaración administrativa, no cambia salvo nueva ordenanza)
// con la lectura en vivo de los 16 sonómetros diarios de Russafa (16 fetch en
// paralelo, uno por sensor — no hay un endpoint agregado, ver spec §2). Un
// sensor caído no rompe la respuesta entera (Promise.allSettled).
import { getOrFetch } from './_shared/cache';
import { normalizarSonometroRuzafa, SONOMETROS_RUZAFA, type PanelZas, type SonometroRuzafa, type ZonaZas } from '../services/zas';
import zonasZas from '../../data/zonas-zas.json' with { type: 'json' };

export const config = { runtime: 'edge' };

const CACHE_KEY = 'emergencia:zas:v1';
const TTL_MS = 60 * 60 * 1000; // datos diarios, no instantáneos — spec 049 §4/§7

const CDA_URL_BASE =
  'https://datosbi.vlci.valencia.es/pentaho/plugin/cda/api/doQuery?path=/public/vlci/datosabiertos/calidadambiental_sonometros_ruzafa_diarios.cda&dataAccessId=sqlSonometrosRuzafaDaily&outputType=CSV&_TRUST_USER_=publicoda';

async function fetchSonometro(id: string, direccion: string, fetchedAt: string): Promise<SonometroRuzafa | null> {
  const url = `${CDA_URL_BASE}&paramid=${id}-daily`;
  const res = await fetch(url);
  if (!res.ok) return null;
  const csv = await res.text();
  return normalizarSonometroRuzafa(id, direccion, csv, fetchedAt);
}

async function fetchPanelZas(): Promise<PanelZas> {
  const fetchedAt = new Date().toISOString();
  const resultados = await Promise.allSettled(
    SONOMETROS_RUZAFA.map(({ id, direccion }) => fetchSonometro(id, direccion, fetchedAt)),
  );
  const sonometrosRuzafa = resultados
    .filter((r): r is PromiseFulfilledResult<SonometroRuzafa | null> => r.status === 'fulfilled')
    .map((r) => r.value)
    .filter((s): s is SonometroRuzafa => s !== null);

  return {
    zonas: zonasZas as ZonaZas[],
    sonometrosRuzafa,
    fetchedAt,
    source: 'vlc-monitor-zas',
  };
}

export default async function handler(): Promise<Response> {
  try {
    const { value: panel, fresh } = await getOrFetch(CACHE_KEY, TTL_MS, fetchPanelZas);
    return new Response(JSON.stringify({ ...panel, fresh }), {
      status: 200,
      headers: {
        'content-type': 'application/json; charset=utf-8',
        'cache-control': 'public, max-age=300, stale-while-revalidate=3600',
      },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : String(err) }), {
      status: 502,
      headers: { 'content-type': 'application/json; charset=utf-8' },
    });
  }
}
