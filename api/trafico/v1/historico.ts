// GET /api/trafico/v1/historico — endpoint definido en
// specs/017-historico-trafico.md §4. Sin llamada de red ni caché propia: lee
// los ficheros versionados que escribe scripts/snapshot-trafico-historico.ts
// (bundleados en build time, igual que data/distritos-valencia.json).
import { construirHistoricoDistrito } from '../../../src/services/trafico-historico';
import type { HistoricoTrafico, RollupDiario, SnapshotHorario } from '../../../src/services/trafico-historico';
import snapshots from '../../../data/trafico-historico.json';
import rollups from '../../../data/trafico-historico-diario.json';

export const config = { runtime: 'edge' };

const DIAS_DEFECTO = 7;
const DIAS_MAXIMO = 400; // cubre el histórico diario completo, sin límite artificial bajo

export default async function handler(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const distritoParam = url.searchParams.get('distrito');
  const diasParam = Number(url.searchParams.get('dias'));
  const dias = Number.isFinite(diasParam) && diasParam > 0 ? Math.min(diasParam, DIAS_MAXIMO) : DIAS_DEFECTO;

  const puntos = construirHistoricoDistrito(
    snapshots as SnapshotHorario[],
    rollups as RollupDiario[],
    distritoParam,
    dias,
    new Date(),
  );

  const historico: HistoricoTrafico = {
    distritoCodigo: distritoParam ?? 'ciudad',
    puntos,
    fetchedAt: new Date().toISOString(),
    source: 'vlc-monitor-historico',
  };

  return new Response(JSON.stringify({ historico }), {
    status: 200,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'public, max-age=300, stale-while-revalidate=3600',
    },
  });
}
