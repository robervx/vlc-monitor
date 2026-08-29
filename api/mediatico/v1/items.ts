// GET /api/mediatico/v1/items — endpoint definido en specs/009-contexto-mediatico.md §4.
// Combina 3 fuentes independientes (Las Provincias, Valencia Plaza, GDELT), cada
// una con su propia caché — si una falla, se sirven las otras dos (spec 009 §4).
import { getOrFetch } from '../../_shared/cache';
import {
  fetchLasProvincias,
  fetchValenciaPlaza,
  fetchGdeltValencia,
  type ItemMediatico,
} from '../../../src/services/mediatico';
import { distritosFromGeoJSON, setLoadedDistricts } from '../../../src/services/district-geometry';
import distritosGeoJSON from '../../../data/distritos-valencia.json';

export const config = { runtime: 'edge' };

// Spec 023 — el matching de distrito/barrio (geolocalizacion-texto.ts) necesita los
// distritos ya cargados antes de normalizar cada fuente; los endpoints edge no
// tienen "origen de página" implícito, así que se cargan del asset estático
// directamente, no vía fetch (mismo patrón que api/trafico/v1/estado.ts).
setLoadedDistricts(distritosFromGeoJSON(distritosGeoJSON));

const TTL_MS = 15 * 60 * 1000;

const FUENTES = [
  { nombre: 'Las Provincias', cacheKey: 'mediatico:las-provincias:v1', fetcher: fetchLasProvincias },
  { nombre: 'Valencia Plaza', cacheKey: 'mediatico:valencia-plaza:v1', fetcher: fetchValenciaPlaza },
  { nombre: 'GDELT', cacheKey: 'mediatico:gdelt:v1', fetcher: fetchGdeltValencia },
];

export default async function handler(): Promise<Response> {
  const resultados = await Promise.allSettled(
    FUENTES.map((f) => getOrFetch(f.cacheKey, TTL_MS, f.fetcher)),
  );

  const items: ItemMediatico[] = [];
  const fuentesFallidas: string[] = [];
  let fresh = true;

  resultados.forEach((resultado, i) => {
    const nombre = FUENTES[i]!.nombre;
    if (resultado.status === 'fulfilled') {
      items.push(...resultado.value.value);
      if (!resultado.value.fresh) fresh = false;
    } else {
      fuentesFallidas.push(nombre);
      fresh = false;
    }
  });

  if (items.length === 0 && fuentesFallidas.length === FUENTES.length) {
    return new Response(JSON.stringify({ error: 'Ninguna fuente de contexto mediático respondió' }), {
      status: 502,
      headers: { 'content-type': 'application/json; charset=utf-8' },
    });
  }

  items.sort((a, b) => b.publicadoEn.localeCompare(a.publicadoEn));

  return new Response(JSON.stringify({ items: items.slice(0, 30), fresh, fuentesFallidas }), {
    status: 200,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'public, max-age=300, stale-while-revalidate=900',
    },
  });
}
