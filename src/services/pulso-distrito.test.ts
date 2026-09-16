import { describe, expect, it } from 'vitest';
import { componenteTrafico } from './pulso-distrito';
import type { TramoTrafico } from './trafico';

// v4 (spec 010 §10): todo lo demás que vivía aquí (índice ponderado,
// componenteIncidencias/Aire/Meteo, categoriaPulso, calcularPulsoDistrito)
// se retiró — ver src/services/pulso-escenarios.test.ts para el motor de
// escenarios que lo sustituye. componenteTrafico sobrevive porque spec 017
// (histórico) sigue usándolo.
function tramo(distrito: string, estado: TramoTrafico['estado']): TramoTrafico {
  return {
    id: '1',
    nombre: 'test',
    geometry: { type: 'LineString', coordinates: [[0, 0]] },
    estadoCodigo: 0,
    estado,
    esPasoInferior: false,
    distrito,
    observedAt: '2026-08-18T10:00:00.000Z',
    fetchedAt: '2026-08-18T10:00:00.000Z',
    source: 'ajuntament-valencia-geoportal',
  };
}

describe('componenteTrafico (media ponderada 0-1, sin amplificar)', () => {
  it('es 0 cuando todos los tramos son fluidos', () => {
    expect(componenteTrafico([tramo('01', 'fluido'), tramo('01', 'fluido')])).toBe(0);
  });

  it('es 1 cuando todos los tramos están cortados', () => {
    expect(componenteTrafico([tramo('01', 'cortado')])).toBe(1);
  });

  it('promedia estados mixtos y excluye sin-datos', () => {
    const tramos = [tramo('01', 'fluido'), tramo('01', 'cortado'), tramo('01', 'sin-datos')];
    expect(componenteTrafico(tramos)).toBeCloseTo(0.5, 5); // (0 + 1) / 2
  });

  it('es 0 (neutro) cuando no hay tramos con dato', () => {
    expect(componenteTrafico([])).toBe(0);
    expect(componenteTrafico([tramo('01', 'sin-datos')])).toBe(0);
  });
});
