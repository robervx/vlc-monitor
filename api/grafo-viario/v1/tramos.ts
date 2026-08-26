// GET /api/grafo-viario/v1/tramos — endpoint definido en specs/020-grafo-viario-base.md §4.
// Sirve el grafo viario rodado desde el asset estático versionado en el repo
// (data/red-viaria-rodada.json, generado por scripts/seed-red-viaria.ts) —
// nunca llama a Overpass en el momento de la petición.
//
// Riesgo documentado en spec 020 §7: el fichero pesa ~7.7MB sin comprimir
// (13k+ tramos), muy por encima del resto de assets estáticos del proyecto
// (distritos-valencia.json son ~600KB) — no se ha verificado todavía contra
// el límite real de tamaño de función edge de Vercel en producción. Si falla
// ahí, la salida es moverlo a una función Node serverless (límite mayor) o
// paginar la respuesta por distrito, no forzar el edge runtime a toda costa.
import redViaria from '../../../data/red-viaria-rodada.json';

export const config = { runtime: 'edge' };

export default async function handler(): Promise<Response> {
  return new Response(JSON.stringify(redViaria), {
    status: 200,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      // El grafo es casi estático (ver spec 020 §4) — cacheable de forma agresiva.
      'cache-control': 'public, max-age=3600, s-maxage=86400, stale-while-revalidate=86400',
    },
  });
}
