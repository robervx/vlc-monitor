// GET /api/agenda/v1/eventos — endpoint definido en
// specs/027-agenda-eventos-scraping.md §4. Sin llamada de red ni caché
// propia: lee el snapshot ya escrito por scripts/scrape-agenda-eventos.ts
// (bundleado en build time, mismo patrón que data/trafico-historico.json de
// spec 017).
import type { SnapshotAgenda } from '../services/agenda-eventos';
import snapshot from '../../data/agenda-eventos.json' with { type: 'json' };

export const config = { runtime: 'edge' };

export default async function handler(): Promise<Response> {
  const datos = snapshot as SnapshotAgenda;

  return new Response(JSON.stringify(datos), {
    status: 200,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'public, max-age=600, stale-while-revalidate=3600',
    },
  });
}
