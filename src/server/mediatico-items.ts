// GET /api/mediatico/v1/items — endpoint definido en specs/009-contexto-mediatico.md §4.
// Combina N fuentes independientes (registro en src/services/mediatico-fuentes.ts),
// cada una con su propia caché — si una falla, se sirven las demás (spec 009 §4).
// El filtro Valencia-ciudad (§3.1) se aplica dentro de cada fetcher, antes de cachear.
import { getOrFetch } from './_shared/cache';
import { FUENTES_MEDIATICAS } from '../services/mediatico-fuentes';
import { deduplicarNoticias } from '../services/dedup-noticias';
import type { ItemMediatico } from '../services/mediatico';

export const config = { runtime: 'edge' };

const TTL_MS = 15 * 60 * 1000;
const MAX_ITEMS = 40;

export default async function handler(): Promise<Response> {
  const resultados = await Promise.allSettled(
    FUENTES_MEDIATICAS.map((f) => getOrFetch(f.cacheKey, TTL_MS, f.fetcher)),
  );

  const items: ItemMediatico[] = [];
  const fuentesFallidas: string[] = [];
  let fresh = true;

  resultados.forEach((resultado, i) => {
    const nombre = FUENTES_MEDIATICAS[i]!.nombre;
    if (resultado.status === 'fulfilled') {
      items.push(...resultado.value.value);
      if (!resultado.value.fresh) fresh = false;
    } else {
      fuentesFallidas.push(nombre);
      fresh = false;
    }
  });

  if (items.length === 0 && fuentesFallidas.length === FUENTES_MEDIATICAS.length) {
    return new Response(JSON.stringify({ error: 'Ninguna fuente de contexto mediático respondió' }), {
      status: 502,
      headers: { 'content-type': 'application/json; charset=utf-8' },
    });
  }

  items.sort((a, b) => b.publicadoEn.localeCompare(a.publicadoEn));

  // Dedup: URL exacta -> titular idéntico -> misma noticia VA/ES del mismo medio
  // (Levante-EMV publica cada pieza en los dos idiomas). Ver dedup-noticias.ts.
  const deduplicados = deduplicarNoticias(items);

  return new Response(
    JSON.stringify({ items: deduplicados.slice(0, MAX_ITEMS), fresh, fuentesFallidas }),
    {
      status: 200,
      headers: {
        'content-type': 'application/json; charset=utf-8',
        'cache-control': 'public, max-age=300, stale-while-revalidate=900',
      },
    },
  );
}
