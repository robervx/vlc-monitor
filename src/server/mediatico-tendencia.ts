// GET /api/mediatico/v1/tendencia?ventana=hora|dia — endpoint definido en
// specs/025-tendencia-terminos-mediaticos.md §4. No tiene fuente externa
// propia: reutiliza las mismas 3 claves de caché que api/mediatico/v1/items.ts
// (si ya están calientes, no hay llamada de red) para trabajar sobre el
// conjunto completo, no solo el top-30 que sirve el panel de titulares.
import { getOrFetch } from './_shared/cache';
import {
  fetchLasProvincias,
  fetchValenciaPlaza,
  fetchGdeltValencia,
  type ItemMediatico,
} from '../services/mediatico';
import { calcularTendenciaTerminos, type VentanaTiempo } from '../services/tendencia-terminos';

export const config = { runtime: 'edge' };

const TTL_MS = 15 * 60 * 1000;

const FUENTES = [
  { cacheKey: 'mediatico:las-provincias:v1', fetcher: fetchLasProvincias },
  { cacheKey: 'mediatico:valencia-plaza:v1', fetcher: fetchValenciaPlaza },
  { cacheKey: 'mediatico:gdelt:v1', fetcher: fetchGdeltValencia },
];

export default async function handler(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const ventana: VentanaTiempo = url.searchParams.get('ventana') === 'dia' ? 'dia' : 'hora';

  const resultados = await Promise.allSettled(
    FUENTES.map((f) => getOrFetch(f.cacheKey, TTL_MS, f.fetcher)),
  );

  const items: ItemMediatico[] = [];
  let fuentesOk = 0;
  let fresh = true;

  resultados.forEach((resultado) => {
    if (resultado.status === 'fulfilled') {
      items.push(...resultado.value.value);
      fuentesOk += 1;
      if (!resultado.value.fresh) fresh = false;
    } else {
      fresh = false;
    }
  });

  if (fuentesOk === 0) {
    return new Response(JSON.stringify({ error: 'Ninguna fuente de contexto mediático respondió' }), {
      status: 502,
      headers: { 'content-type': 'application/json; charset=utf-8' },
    });
  }

  const panel = calcularTendenciaTerminos(items, ventana);

  return new Response(JSON.stringify({ panel, fresh }), {
    status: 200,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'public, max-age=300, stale-while-revalidate=900',
    },
  });
}
