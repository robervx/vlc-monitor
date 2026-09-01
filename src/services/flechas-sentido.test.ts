import { describe, expect, it } from 'vitest';
import { anguloDesdeEste, marcadorParaTramo } from './flechas-sentido';
import type { Tramo } from './red-viaria';

const TRAMO_BASE: Omit<Tramo, 'geometria' | 'sentido'> = {
  idTramo: 't1',
  nodoOrigenId: 'a',
  nodoDestinoId: 'b',
  longitudM: 100,
  tipoVia: 'residencial',
  nombreCalle: null,
  nombreCalleRaw: null,
  distrito: '01',
  osmWayId: 1,
  versionGrafo: 'test',
  fuenteGeometria: 'test',
  confianzaTopologica: 'limpiezaAutomatica',
};

describe('anguloDesdeEste', () => {
  it('0° apuntando al este, 90° al norte, ±180° al oeste', () => {
    expect(anguloDesdeEste([0, 0], [1, 0])).toBeCloseTo(0, 4);
    expect(anguloDesdeEste([0, 0], [0, 1])).toBeCloseTo(90, 1);
    expect(Math.abs(anguloDesdeEste([0, 0], [-1, 0]))).toBeCloseTo(180, 1);
  });
});

describe('marcadorParaTramo', () => {
  it('orienta la flecha en el sentido canónico origen→destino de la geometría', () => {
    const haciaEste: Tramo = {
      ...TRAMO_BASE,
      sentido: 'unidireccional',
      geometria: { type: 'LineString', coordinates: [[-0.38, 39.47], [-0.37, 39.47]] },
    };
    const haciaOeste: Tramo = {
      ...TRAMO_BASE,
      sentido: 'unidireccional',
      geometria: { type: 'LineString', coordinates: [[-0.37, 39.47], [-0.38, 39.47]] },
    };
    expect(marcadorParaTramo(haciaEste)!.anguloGrados).toBeCloseTo(0, 1);
    expect(Math.abs(marcadorParaTramo(haciaOeste)!.anguloGrados)).toBeCloseTo(180, 1);
  });

  it('coloca el marcador dentro del bounding box de la geometría y conserva el sentido', () => {
    const t: Tramo = {
      ...TRAMO_BASE,
      sentido: 'bidireccional',
      geometria: { type: 'LineString', coordinates: [[-0.38, 39.47], [-0.379, 39.472], [-0.377, 39.473]] },
    };
    const m = marcadorParaTramo(t)!;
    expect(m.sentido).toBe('bidireccional');
    expect(m.posicion[0]).toBeGreaterThanOrEqual(-0.38);
    expect(m.posicion[0]).toBeLessThanOrEqual(-0.377);
    expect(m.posicion[1]).toBeGreaterThanOrEqual(39.47);
    expect(m.posicion[1]).toBeLessThanOrEqual(39.473);
  });

  it('devuelve null si la geometría es degenerada (un solo punto o longitud 0)', () => {
    expect(
      marcadorParaTramo({ ...TRAMO_BASE, sentido: 'bidireccional', geometria: { type: 'LineString', coordinates: [[-0.38, 39.47]] } }),
    ).toBeNull();
    expect(
      marcadorParaTramo({
        ...TRAMO_BASE,
        sentido: 'bidireccional',
        geometria: { type: 'LineString', coordinates: [[-0.38, 39.47], [-0.38, 39.47]] },
      }),
    ).toBeNull();
  });
});
