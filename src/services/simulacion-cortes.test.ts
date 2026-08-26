import { describe, expect, it } from 'vitest';
import { calcularAislados, calcularAlcanzablesBase } from './simulacion-cortes';
import type { Tramo } from './red-viaria';

function tramoFixture(parcial: Partial<Tramo> & Pick<Tramo, 'idTramo' | 'nodoOrigenId' | 'nodoDestinoId' | 'sentido'>): Tramo {
  return {
    geometria: { type: 'LineString', coordinates: [[0, 0], [0, 0]] },
    longitudM: 10,
    tipoVia: 'residencial',
    nombreCalle: null,
    nombreCalleRaw: null,
    distrito: '01',
    osmWayId: 1,
    versionGrafo: 'test',
    fuenteGeometria: 'test',
    confianzaTopologica: 'limpiezaAutomatica',
    ...parcial,
  };
}

describe('calcularAislados', () => {
  it('sin cortes, no hay ningún tramo aislado', () => {
    const tramos = [tramoFixture({ idTramo: 't1', nodoOrigenId: 'A', nodoDestinoId: 'B', sentido: 'bidireccional' })];
    const base = calcularAlcanzablesBase(tramos, 'A');
    const resultado = calcularAislados(tramos, new Set(), 'A', base);
    expect(resultado.tramosAislados).toHaveLength(0);
    expect(resultado.nodosAisladosCount).toBe(0);
  });

  it('cortar un puente bidireccional aísla la zona al otro lado', () => {
    // A(ref) --t1-- B --t2(puente)-- C --t3-- D
    const tramos = [
      tramoFixture({ idTramo: 't1', nodoOrigenId: 'A', nodoDestinoId: 'B', sentido: 'bidireccional' }),
      tramoFixture({ idTramo: 't2', nodoOrigenId: 'B', nodoDestinoId: 'C', sentido: 'bidireccional', nombreCalle: 'Puente' }),
      tramoFixture({ idTramo: 't3', nodoOrigenId: 'C', nodoDestinoId: 'D', sentido: 'bidireccional', nombreCalle: 'Calle D' }),
    ];
    const base = calcularAlcanzablesBase(tramos, 'A');
    const resultado = calcularAislados(tramos, new Set(['t2']), 'A', base);
    expect(resultado.nodosAisladosCount).toBe(2); // C y D
    expect(resultado.tramosAislados.map((t) => t.idTramo)).toContain('t3');
  });

  it('cortar una calle con ruta alternativa no aísla nada', () => {
    // A(ref) -t1- B -t2- C, y además A -t3- C directo (alternativa)
    const tramos = [
      tramoFixture({ idTramo: 't1', nodoOrigenId: 'A', nodoDestinoId: 'B', sentido: 'bidireccional' }),
      tramoFixture({ idTramo: 't2', nodoOrigenId: 'B', nodoDestinoId: 'C', sentido: 'bidireccional' }),
      tramoFixture({ idTramo: 't3', nodoOrigenId: 'A', nodoDestinoId: 'C', sentido: 'bidireccional' }),
    ];
    const base = calcularAlcanzablesBase(tramos, 'A');
    const resultado = calcularAislados(tramos, new Set(['t2']), 'A', base);
    expect(resultado.tramosAislados).toHaveLength(0);
    expect(resultado.nodosAisladosCount).toBe(0);
  });

  it('calle unidireccional: cortar la única SALIDA de una zona la aísla', () => {
    // Z tiene salida unidireccional Z->A y entrada unidireccional A->Z
    const tramos = [
      tramoFixture({ idTramo: 'salida', nodoOrigenId: 'Z', nodoDestinoId: 'A', sentido: 'unidireccional', nombreCalle: 'Salida' }),
      tramoFixture({ idTramo: 'entrada', nodoOrigenId: 'A', nodoDestinoId: 'Z', sentido: 'unidireccional', nombreCalle: 'Entrada' }),
    ];
    const base = calcularAlcanzablesBase(tramos, 'A');
    const resultado = calcularAislados(tramos, new Set(['salida']), 'A', base);
    expect(resultado.nodosAisladosCount).toBe(1); // Z
  });

  it('calle unidireccional: cortar solo la ENTRADA no aísla (la salida real sigue intacta)', () => {
    const tramos = [
      tramoFixture({ idTramo: 'salida', nodoOrigenId: 'Z', nodoDestinoId: 'A', sentido: 'unidireccional' }),
      tramoFixture({ idTramo: 'entrada', nodoOrigenId: 'A', nodoDestinoId: 'Z', sentido: 'unidireccional' }),
    ];
    const base = calcularAlcanzablesBase(tramos, 'A');
    const resultado = calcularAislados(tramos, new Set(['entrada']), 'A', base);
    expect(resultado.nodosAisladosCount).toBe(0);
  });

  it('cortar dos calles a la vez puede aislar lo que una sola no aislaría', () => {
    // C tiene dos salidas independientes: C-B-A y C-D-A
    const tramos = [
      tramoFixture({ idTramo: 't1', nodoOrigenId: 'A', nodoDestinoId: 'B', sentido: 'bidireccional' }),
      tramoFixture({ idTramo: 't2', nodoOrigenId: 'B', nodoDestinoId: 'C', sentido: 'bidireccional' }),
      tramoFixture({ idTramo: 't3', nodoOrigenId: 'A', nodoDestinoId: 'D', sentido: 'bidireccional' }),
      tramoFixture({ idTramo: 't4', nodoOrigenId: 'D', nodoDestinoId: 'C', sentido: 'bidireccional' }),
    ];
    const base = calcularAlcanzablesBase(tramos, 'A');
    const soloUnCorte = calcularAislados(tramos, new Set(['t2']), 'A', base);
    expect(soloUnCorte.nodosAisladosCount).toBe(0); // sigue habiendo ruta por D
    const dosCortes = calcularAislados(tramos, new Set(['t2', 't4']), 'A', base);
    expect(dosCortes.nodosAisladosCount).toBe(1); // C aislado
  });
});
