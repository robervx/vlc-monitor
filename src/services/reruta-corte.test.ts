import { describe, expect, it } from 'vitest';
import { calcularRutasAlternativas } from './reruta-corte';
import type { Tramo } from './red-viaria';

function t(id: string, o: string, d: string, sentido: Tramo['sentido'], coords: [number, number][], nombre = id): Tramo {
  let long = 0;
  for (let i = 0; i < coords.length - 1; i++) {
    long += Math.hypot(coords[i + 1]![0] - coords[i]![0], coords[i + 1]![1] - coords[i]![1]) * 111_000;
  }
  return {
    idTramo: id,
    nodoOrigenId: o,
    nodoDestinoId: d,
    geometria: { type: 'LineString', coordinates: coords },
    longitudM: long,
    tipoVia: 'residencial',
    sentido,
    nombreCalle: nombre,
    nombreCalleRaw: nombre,
    distrito: '01',
    osmWayId: 1,
    versionGrafo: 'test',
    fuenteGeometria: 'test',
    confianzaTopologica: 'limpiezaAutomatica',
  };
}

// Manzana cuadrada de sentido único (horario):
//   A --ab--> B
//   ^         |
//   da        bc
//   |         v
//   D <--cd-- C
function manzana(): Tramo[] {
  return [
    t('ab', 'A', 'B', 'unidireccional', [[0, 0.001], [0.001, 0.001]]),
    t('bc', 'B', 'C', 'unidireccional', [[0.001, 0.001], [0.001, 0]]),
    t('cd', 'C', 'D', 'unidireccional', [[0.001, 0], [0, 0]]),
    t('da', 'D', 'A', 'unidireccional', [[0, 0], [0, 0.001]]),
  ];
}

describe('calcularRutasAlternativas', () => {
  it('sin cortes: sin rutas', () => {
    expect(calcularRutasAlternativas(manzana(), new Set())).toEqual([]);
  });

  it('ciclo de sentido único sin alivio: cortar una arista deja sin alternativa (0 rutas)', () => {
    // El ciclo es A->B->C->D->A; sin 'ab' no hay forma de ir de A a B
    // siguiendo el sentido, así que no se propone ningún desvío.
    const rutas = calcularRutasAlternativas(manzana(), new Set(['ab']), { maxLongitudM: 10_000 });
    expect(rutas).toHaveLength(0);
  });

  it('con una arista bidireccional de alivio, el desvío existe y concatena geometría continua', () => {
    const tramos = [
      ...manzana(),
      // atajo bidireccional B <-> A por el norte
      t('atajo', 'B', 'A', 'bidireccional', [[0.001, 0.001], [0.0005, 0.002], [0, 0.001]], 'Atajo'),
    ];
    const rutas = calcularRutasAlternativas(tramos, new Set(['ab']), { maxLongitudM: 10_000 });
    expect(rutas).toHaveLength(1);
    expect(rutas[0]!.tramosRuta).toEqual(['atajo']);
    const g = rutas[0]!.geometria;
    // empieza en A (0,0.001) y termina en B (0.001,0.001)
    expect(g[0]).toEqual([0, 0.001]);
    expect(g[g.length - 1]).toEqual([0.001, 0.001]);
    // sin vértices duplicados consecutivos
    for (let i = 1; i < g.length; i++) expect(g[i]).not.toEqual(g[i - 1]);
  });

  it('respeta el tope de longitud: si el rodeo es más largo que maxLongitudM, no hay ruta', () => {
    const tramos = [...manzana(), t('atajo', 'B', 'A', 'bidireccional', [[0.001, 0.001], [0, 0.001]], 'Atajo')];
    const rutas = calcularRutasAlternativas(tramos, new Set(['ab']), { maxLongitudM: 1 });
    expect(rutas).toHaveLength(0);
  });
});
