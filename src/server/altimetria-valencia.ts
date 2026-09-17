// GET /api/emergencia/v1/altimetria — spec 044 §4. Dato estático (seedeado
// una sola vez con `npm run seed:altimetria`, fuente IGN) — sin llamada de
// red ni caché propia, igual que data/distritos-valencia.json.
import type { ResumenAltimetriaDistrito } from '../services/altimetria';
import altimetria from '../../data/altimetria-valencia.json' with { type: 'json' };

export const config = { runtime: 'edge' };

export default async function handler(): Promise<Response> {
  return new Response(JSON.stringify({ distritos: altimetria as ResumenAltimetriaDistrito[] }), {
    status: 200,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'public, max-age=86400, stale-while-revalidate=604800',
    },
  });
}
