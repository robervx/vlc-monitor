import { describe, expect, it } from 'vitest';
import {
  agregarSnapshotPorDistrito,
  compactarSnapshotsAntiguos,
  construirHistoricoDistrito,
  sparklinePath,
  type RollupDiario,
  type SnapshotHorario,
} from './trafico-historico';
import type { TramoTrafico } from './trafico';

function tramo(distrito: string | null, estado: TramoTrafico['estado']): TramoTrafico {
  return {
    id: `t-${Math.random()}`,
    nombre: 'Calle X',
    geometry: { type: 'LineString', coordinates: [[-0.38, 39.47]] },
    estadoCodigo: 0,
    estado,
    esPasoInferior: false,
    distrito,
    observedAt: '2026-08-18T10:00:00.000Z',
    fetchedAt: '2026-08-18T10:00:00.000Z',
    source: 'ajuntament-valencia-geoportal',
  };
}

describe('agregarSnapshotPorDistrito', () => {
  it('agrupa tramos por distrito y calcula congestión + muestras', () => {
    const tramos = [tramo('01', 'fluido'), tramo('01', 'congestionado'), tramo('02', 'sin-datos')];
    const snap = agregarSnapshotPorDistrito(tramos, [{ codigo: '01' }, { codigo: '02' }], '2026-08-18T10:00:00.000Z');

    expect(snap.timestamp).toBe('2026-08-18T10:00:00.000Z');
    const d01 = snap.distritos.find((d) => d.codigo === '01')!;
    expect(d01.muestras).toBe(2);
    expect(d01.congestion).toBeCloseTo((0 + 0.6) / 2);
    const d02 = snap.distritos.find((d) => d.codigo === '02')!;
    expect(d02.muestras).toBe(0);
    expect(d02.congestion).toBe(0);
  });

  it('ignora tramos sin distrito asignado', () => {
    const tramos = [tramo(null, 'congestionado')];
    const snap = agregarSnapshotPorDistrito(tramos, [{ codigo: '01' }], '2026-08-18T10:00:00.000Z');
    expect(snap.distritos[0]?.muestras).toBe(0);
  });
});

describe('compactarSnapshotsAntiguos', () => {
  const AHORA = new Date('2026-08-18T12:00:00.000Z');

  it('deja intactos los snapshots dentro de la ventana de retención', () => {
    const snapshots: SnapshotHorario[] = [
      { timestamp: '2026-08-17T10:00:00.000Z', distritos: [{ codigo: '01', congestion: 0.5, muestras: 3 }] },
    ];
    const { snapshotsRecientes, rollupsActualizados } = compactarSnapshotsAntiguos(snapshots, [], AHORA, 30);
    expect(snapshotsRecientes).toHaveLength(1);
    expect(rollupsActualizados).toHaveLength(0);
  });

  it('compacta a rollup diario los snapshots más antiguos que la retención', () => {
    const hace40dias = new Date(AHORA.getTime() - 40 * 24 * 60 * 60 * 1000).toISOString();
    const snapshots: SnapshotHorario[] = [
      { timestamp: hace40dias, distritos: [{ codigo: '01', congestion: 0.2, muestras: 3 }] },
      { timestamp: hace40dias.replace('00:00:00', '06:00:00'), distritos: [{ codigo: '01', congestion: 0.6, muestras: 3 }] },
    ];
    const { snapshotsRecientes, rollupsActualizados } = compactarSnapshotsAntiguos(snapshots, [], AHORA, 30);

    expect(snapshotsRecientes).toHaveLength(0);
    expect(rollupsActualizados).toHaveLength(1);
    expect(rollupsActualizados[0]?.distritos[0]?.congestionMedia).toBeCloseTo(0.4);
    expect(rollupsActualizados[0]?.distritos[0]?.muestras).toBe(2);
  });

  it('es idempotente: no duplica un día ya compactado en una ejecución anterior', () => {
    const hace40dias = new Date(AHORA.getTime() - 40 * 24 * 60 * 60 * 1000).toISOString();
    const fecha = hace40dias.slice(0, 10);
    const snapshots: SnapshotHorario[] = [
      { timestamp: hace40dias, distritos: [{ codigo: '01', congestion: 0.9, muestras: 3 }] },
    ];
    const rollupsExistentes: RollupDiario[] = [
      { fecha, distritos: [{ codigo: '01', congestionMedia: 0.4, muestras: 2 }] },
    ];
    const { rollupsActualizados } = compactarSnapshotsAntiguos(snapshots, rollupsExistentes, AHORA, 30);

    expect(rollupsActualizados).toHaveLength(1);
    expect(rollupsActualizados[0]?.distritos[0]?.congestionMedia).toBe(0.4); // no se recalcula
  });
});

describe('construirHistoricoDistrito', () => {
  const AHORA = new Date('2026-08-18T12:00:00.000Z');

  it('combina horarios y diarios, filtra por ventana de días y ordena cronológicamente', () => {
    const snapshots: SnapshotHorario[] = [
      { timestamp: '2026-08-18T10:00:00.000Z', distritos: [{ codigo: '01', congestion: 0.3, muestras: 3 }] },
    ];
    const rollups: RollupDiario[] = [
      { fecha: '2026-08-17', distritos: [{ codigo: '01', congestionMedia: 0.5, muestras: 24 }] },
      { fecha: '2026-01-01', distritos: [{ codigo: '01', congestionMedia: 0.9, muestras: 24 }] }, // fuera de ventana
    ];

    const puntos = construirHistoricoDistrito(snapshots, rollups, '01', 7, AHORA);

    expect(puntos).toHaveLength(2);
    expect(puntos[0]?.timestamp).toBe('2026-08-17T00:00:00.000Z');
    expect(puntos[0]?.resolucion).toBe('diaria');
    expect(puntos[1]?.resolucion).toBe('horaria');
  });

  it('calcula la media de ciudad cuando no se pide un distrito concreto', () => {
    const snapshots: SnapshotHorario[] = [
      {
        timestamp: '2026-08-18T10:00:00.000Z',
        distritos: [
          { codigo: '01', congestion: 0.2, muestras: 3 },
          { codigo: '02', congestion: 0.6, muestras: 3 },
        ],
      },
    ];
    const puntos = construirHistoricoDistrito(snapshots, [], null, 7, AHORA);
    expect(puntos[0]?.congestion).toBeCloseTo(0.4);
  });
});

describe('sparklinePath', () => {
  it('devuelve cadena vacía sin valores', () => {
    expect(sparklinePath([], 100, 20)).toBe('');
  });

  it('genera un punto por valor, dentro del viewBox', () => {
    const path = sparklinePath([0, 0.5, 1], 100, 20);
    const puntos = path.split(' ').map((p) => p.split(',').map(Number));
    expect(puntos).toHaveLength(3);
    expect(puntos[0]?.[0]).toBe(0);
    expect(puntos[2]?.[0]).toBe(100);
    // valor más alto (1) → y más pequeño (arriba); valor más bajo (0) → y = height
    expect(puntos[2]?.[1]).toBeLessThan(puntos[0]?.[1] ?? 0);
  });

  it('no revienta con un único valor', () => {
    expect(sparklinePath([0.5], 100, 20)).toBe('0,10 100,10');
  });
});
