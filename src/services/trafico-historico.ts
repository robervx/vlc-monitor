/**
 * Histórico de tráfico de la spec 017 (specs/017-historico-trafico.md §3-4).
 * Funciones puras, sin red — el script de snapshot (scripts/snapshot-trafico-historico.ts)
 * y el endpoint de lectura (api/trafico/v1/historico.ts) son los únicos
 * puntos de I/O.
 */
import type { TramoTrafico } from './trafico';
import { componenteTrafico } from './pulso-distrito';

export interface SnapshotDistrito {
  codigo: string;
  congestion: number;
  muestras: number;
}

export interface SnapshotHorario {
  timestamp: string;
  distritos: SnapshotDistrito[];
}

export interface RollupDistritoDiario {
  codigo: string;
  congestionMedia: number;
  muestras: number;
}

export interface RollupDiario {
  fecha: string; // YYYY-MM-DD
  distritos: RollupDistritoDiario[];
}

interface DistritoBasico {
  codigo: string;
}

/** Un snapshot horario a partir del estado de tráfico crudo — spec 017 §3. */
export function agregarSnapshotPorDistrito(
  tramos: TramoTrafico[],
  distritos: DistritoBasico[],
  timestamp: string,
): SnapshotHorario {
  const tramosPorDistrito = new Map<string, TramoTrafico[]>();
  for (const tramo of tramos) {
    if (!tramo.distrito) continue;
    const lista = tramosPorDistrito.get(tramo.distrito) ?? [];
    lista.push(tramo);
    tramosPorDistrito.set(tramo.distrito, lista);
  }

  return {
    timestamp,
    distritos: distritos.map((d) => {
      const tramosDistrito = tramosPorDistrito.get(d.codigo) ?? [];
      return {
        codigo: d.codigo,
        congestion: componenteTrafico(tramosDistrito),
        muestras: tramosDistrito.filter((t) => t.estado !== 'sin-datos').length,
      };
    }),
  };
}

function soloFecha(iso: string): string {
  return iso.slice(0, 10);
}

/**
 * Separa snapshots horarios en "recientes" (dentro de la ventana de
 * retención) y "antiguos" (a compactar en rollups diarios). Idempotente:
 * un día ya presente en `rollupsExistentes` no se recalcula ni se duplica.
 */
export function compactarSnapshotsAntiguos(
  snapshots: SnapshotHorario[],
  rollupsExistentes: RollupDiario[],
  ahora: Date,
  diasRetencion = 30,
): { snapshotsRecientes: SnapshotHorario[]; rollupsActualizados: RollupDiario[] } {
  const corte = new Date(ahora.getTime() - diasRetencion * 24 * 60 * 60 * 1000);
  const recientes: SnapshotHorario[] = [];
  const antiguosPorFecha = new Map<string, SnapshotHorario[]>();

  for (const snap of snapshots) {
    if (new Date(snap.timestamp) >= corte) {
      recientes.push(snap);
      continue;
    }
    const fecha = soloFecha(snap.timestamp);
    const lista = antiguosPorFecha.get(fecha) ?? [];
    lista.push(snap);
    antiguosPorFecha.set(fecha, lista);
  }

  const fechasYaCompactadas = new Set(rollupsExistentes.map((r) => r.fecha));
  const nuevosRollups: RollupDiario[] = [];

  for (const [fecha, snapsDelDia] of antiguosPorFecha) {
    if (fechasYaCompactadas.has(fecha)) continue; // ya compactado en una ejecución anterior

    const porDistrito = new Map<string, number[]>();
    for (const snap of snapsDelDia) {
      for (const d of snap.distritos) {
        const valores = porDistrito.get(d.codigo) ?? [];
        valores.push(d.congestion);
        porDistrito.set(d.codigo, valores);
      }
    }

    nuevosRollups.push({
      fecha,
      distritos: Array.from(porDistrito.entries()).map(([codigo, valores]) => ({
        codigo,
        congestionMedia: valores.reduce((a, b) => a + b, 0) / valores.length,
        muestras: valores.length,
      })),
    });
  }

  return {
    snapshotsRecientes: recientes,
    rollupsActualizados: [...rollupsExistentes, ...nuevosRollups].sort((a, b) => a.fecha.localeCompare(b.fecha)),
  };
}

export type ResolucionHistorico = 'horaria' | 'diaria';

export interface PuntoHistoricoTrafico {
  timestamp: string;
  congestion: number;
  resolucion: ResolucionHistorico;
}

export interface HistoricoTrafico {
  distritoCodigo: string;
  puntos: PuntoHistoricoTrafico[];
  fetchedAt: string;
  source: 'vlc-monitor-historico';
}

/** Media simple de un conjunto de valores de congestión — usada para 'ciudad'. */
function mediaCongestion(distritos: Array<{ codigo: string; congestion?: number; congestionMedia?: number }>): number {
  const valores = distritos.map((d) => d.congestion ?? d.congestionMedia ?? 0);
  if (valores.length === 0) return 0;
  return valores.reduce((a, b) => a + b, 0) / valores.length;
}

/**
 * Serie temporal para un distrito (o 'ciudad' = media de todos) combinando
 * snapshots horarios y rollups diarios, filtrada a los últimos `dias`.
 */
export function construirHistoricoDistrito(
  snapshots: SnapshotHorario[],
  rollups: RollupDiario[],
  distritoCodigo: string | null,
  dias: number,
  ahora: Date,
): PuntoHistoricoTrafico[] {
  const desde = new Date(ahora.getTime() - dias * 24 * 60 * 60 * 1000);

  const puntosHorarios: PuntoHistoricoTrafico[] = snapshots
    .filter((s) => new Date(s.timestamp) >= desde)
    .map((s) => ({
      timestamp: s.timestamp,
      congestion: distritoCodigo
        ? s.distritos.find((d) => d.codigo === distritoCodigo)?.congestion ?? 0
        : mediaCongestion(s.distritos),
      resolucion: 'horaria' as const,
    }));

  const puntosDiarios: PuntoHistoricoTrafico[] = rollups
    .filter((r) => new Date(`${r.fecha}T00:00:00.000Z`) >= desde)
    .map((r) => ({
      timestamp: `${r.fecha}T00:00:00.000Z`,
      congestion: distritoCodigo
        ? r.distritos.find((d) => d.codigo === distritoCodigo)?.congestionMedia ?? 0
        : mediaCongestion(r.distritos),
      resolucion: 'diaria' as const,
    }));

  return [...puntosDiarios, ...puntosHorarios].sort((a, b) => a.timestamp.localeCompare(b.timestamp));
}

// Margen vertical para que el trazo (stroke-width 2) no quede recortado por
// el borde del viewBox cuando el valor toca el máximo o el mínimo exactos.
const SPARK_PADDING = 2;

/** Puntos SVG (atributo `points` de un `<polyline>`) para un sparkline simple. */
export function sparklinePath(valores: number[], width: number, height: number): string {
  if (valores.length === 0) return '';
  if (valores.length === 1) return `0,${height / 2} ${width},${height / 2}`;

  const max = Math.max(...valores, 0.01);
  const min = Math.min(...valores, 0);
  const rango = max - min || 1;
  const alturaUtil = Math.max(height - 2 * SPARK_PADDING, 0);

  return valores
    .map((v, i) => {
      const x = (i / (valores.length - 1)) * width;
      const y = SPARK_PADDING + alturaUtil - ((v - min) / rango) * alturaUtil;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');
}
