import { describe, expect, it } from 'vitest';
import { normalizarSonometroRuzafa, normalizarZonasZas } from './zas';

// Fila real capturada en la verificación en vivo del 2026-09-24 (sensor de
// C/ Cádiz, 16 — T248671-daily).
const CSV_REAL =
  'recvtime;"entitytype";"entityid";laeq;laeq_d;laeq_den;laeq_e;laeq_n;"dateobserved"\n' +
  '2026-09-24 05:31:07.95;"NoiseLevelObservedAggregated";"T248671-daily";61.2599983215332;60.939998626708984;67.94999694824219;61.209999084472656;61.72999954223633;"2026-09-23"\n' +
  '2026-09-23 05:31:49.685;"NoiseLevelObservedAggregated";"T248671-daily";61.20000076293945;61.439998626708984;67.41000366210938;60.65999984741211;61.040000915527344;"2026-09-22"\n';

// Fila real con laeq_d/laeq_den nulos (muestra del 20/09, sensor de Cádiz 16
// — motivo del tipo `number | null` por campo en el contrato, spec 049 §3).
const CSV_CON_NULOS =
  'recvtime;"entitytype";"entityid";laeq;laeq_d;laeq_den;laeq_e;laeq_n;"dateobserved"\n' +
  '2026-09-21 05:31:13.333;"NoiseLevelObservedAggregated";"T248671-daily";59.45000076293945;;;56.650001525878906;61.349998474121094;"2026-09-20"\n';

const CSV_SIN_FILAS = 'recvtime;"entitytype";"entityid";laeq;laeq_d;laeq_den;laeq_e;laeq_n;"dateobserved"\n';

describe('normalizarSonometroRuzafa', () => {
  it('parsea la fila más reciente (primera) de un CSV real', () => {
    const resultado = normalizarSonometroRuzafa('T248671', 'C/ Cádiz, 16', CSV_REAL, '2026-09-24T15:00:00.000Z');
    expect(resultado).toMatchObject({
      id: 'T248671',
      direccion: 'C/ Cádiz, 16',
      laeqDb: 61.2599983215332,
      laeqDiaDb: 60.939998626708984,
      laeqTardeDb: 61.209999084472656,
      laeqNocheDb: 61.72999954223633,
      laeqLdenDb: 67.94999694824219,
      fecha: '2026-09-23',
      source: 'vlci-sonometros-ruzafa',
    });
  });

  it('ignora filas antiguas — solo usa la primera fila de datos', () => {
    const resultado = normalizarSonometroRuzafa('T248671', 'C/ Cádiz, 16', CSV_REAL, '2026-09-24T15:00:00.000Z');
    expect(resultado!.fecha).not.toBe('2026-09-22');
  });

  it('tolera laeq_d/laeq_den/laeq_e... nulos sin romper, laeqDb sigue siendo obligatorio', () => {
    const resultado = normalizarSonometroRuzafa('T248671', 'C/ Cádiz, 16', CSV_CON_NULOS, '2026-09-24T15:00:00.000Z');
    expect(resultado).toMatchObject({ laeqDb: 59.45000076293945, laeqDiaDb: null, laeqLdenDb: null });
  });

  it('devuelve null si el CSV no trae ninguna fila de datos (sensor caído)', () => {
    expect(normalizarSonometroRuzafa('T248671', 'C/ Cádiz, 16', CSV_SIN_FILAS, '2026-09-24T15:00:00.000Z')).toBeNull();
  });

  it('convierte la fecha a ISO 8601', () => {
    const resultado = normalizarSonometroRuzafa('T248671', 'C/ Cádiz, 16', CSV_REAL, '2026-09-24T15:00:00.000Z');
    expect(resultado!.observedAt).toBe(new Date('2026-09-23').toISOString());
  });
});

describe('normalizarZonasZas', () => {
  // Feature real (recortada) del geoportal — .../SociedadBienestar/MapServer/5, verificado 2026-09-24.
  const featuresReales = [
    {
      type: 'Feature' as const,
      properties: { objectid: 6, zona: 'CARMEN' },
      geometry: { type: 'Polygon' as const, coordinates: [[[-0.38243, 39.4805], [-0.38282, 39.48026], [-0.38243, 39.4805]]] },
    },
    {
      type: 'Feature' as const,
      properties: { objectid: 9, zona: 'WOODY' },
      geometry: { type: 'Polygon' as const, coordinates: [[[-0.35, 39.47], [-0.351, 39.471], [-0.35, 39.47]]] },
    },
  ];

  it('mapea objectid/zona/geometry al contrato de ZonaZas', () => {
    const resultado = normalizarZonasZas(featuresReales, '2026-09-24T10:00:00.000Z');
    expect(resultado).toEqual([
      {
        id: '6',
        nombre: 'CARMEN',
        geometry: featuresReales[0]!.geometry,
        observedAt: '2026-09-24T10:00:00.000Z',
        fetchedAt: '2026-09-24T10:00:00.000Z',
        source: 'geoportal-valencia-zas',
      },
      {
        id: '9',
        nombre: 'WOODY',
        geometry: featuresReales[1]!.geometry,
        observedAt: '2026-09-24T10:00:00.000Z',
        fetchedAt: '2026-09-24T10:00:00.000Z',
        source: 'geoportal-valencia-zas',
      },
    ]);
  });
});
