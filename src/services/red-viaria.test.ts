import { describe, expect, it } from 'vitest';
import { construirRedViaria, type OverpassElement } from './red-viaria';

// Fixture sintético: una "T" de calles.
//   n1 --- n2 --- n3 --- n4   (way A, bidireccional)
//                  |
//                  n5          (way B, oneway)
// n3 es intersección real (usada por A y B) -> debe partir el way A en dos tramos.
function fixtureElementos(): OverpassElement[] {
  return [
    { type: 'node', id: 1, lat: 39.47, lon: -0.377 },
    { type: 'node', id: 2, lat: 39.4705, lon: -0.3765 },
    { type: 'node', id: 3, lat: 39.471, lon: -0.376 },
    { type: 'node', id: 4, lat: 39.4715, lon: -0.3755 },
    { type: 'node', id: 5, lat: 39.4695, lon: -0.3758 },
    {
      type: 'way',
      id: 100,
      nodes: [1, 2, 3, 4],
      tags: { highway: 'residential', name: 'Calle A' },
    },
    {
      type: 'way',
      id: 101,
      nodes: [3, 5],
      tags: { highway: 'residential', name: 'Calle B', oneway: 'yes' },
    },
  ];
}

const OPCIONES_BASE = { versionGrafo: 'test', fuenteGeometria: 'test-fixture' };
const resolverSiempreDistrito01 = () => '01';

describe('construirRedViaria', () => {
  it('parte un way en la intersección real compartida con otro way', () => {
    const red = construirRedViaria(fixtureElementos(), { ...OPCIONES_BASE, resolverDistrito: resolverSiempreDistrito01 });
    const tramosCalleA = red.tramos.filter((t) => t.nombreCalle === 'Calle A');
    expect(tramosCalleA).toHaveLength(2);
  });

  it('no parte un way sin intersecciones internas', () => {
    const red = construirRedViaria(fixtureElementos(), { ...OPCIONES_BASE, resolverDistrito: resolverSiempreDistrito01 });
    const tramosCalleB = red.tramos.filter((t) => t.nombreCalle === 'Calle B');
    expect(tramosCalleB).toHaveLength(1);
  });

  it('respeta oneway=yes como unidireccional y ausencia de oneway como bidireccional', () => {
    const red = construirRedViaria(fixtureElementos(), { ...OPCIONES_BASE, resolverDistrito: resolverSiempreDistrito01 });
    const b = red.tramos.find((t) => t.nombreCalle === 'Calle B');
    const a = red.tramos.find((t) => t.nombreCalle === 'Calle A');
    expect(b?.sentido).toBe('unidireccional');
    expect(a?.sentido).toBe('bidireccional');
  });

  it('descarta tramos cuyo punto medio cae fuera de cualquier distrito', () => {
    const red = construirRedViaria(fixtureElementos(), { ...OPCIONES_BASE, resolverDistrito: () => null });
    expect(red.tramos).toHaveLength(0);
  });

  it('ignora ways sin tag highway o con highway fuera del conjunto rodado', () => {
    const elementos: OverpassElement[] = [
      { type: 'node', id: 1, lat: 39.47, lon: -0.377 },
      { type: 'node', id: 2, lat: 39.4705, lon: -0.3765 },
      { type: 'way', id: 200, nodes: [1, 2], tags: { highway: 'footway' } },
      { type: 'way', id: 201, nodes: [1, 2] }, // sin tags
    ];
    const red = construirRedViaria(elementos, { ...OPCIONES_BASE, resolverDistrito: resolverSiempreDistrito01 });
    expect(red.tramos).toHaveLength(0);
  });

  it('mapea highway=* al bucket de tipoVia correcto', () => {
    const red = construirRedViaria(fixtureElementos(), { ...OPCIONES_BASE, resolverDistrito: resolverSiempreDistrito01 });
    expect(red.tramos.every((t) => t.tipoVia === 'residencial')).toBe(true);
  });

  it('calcula longitud > 0 por tramo', () => {
    const red = construirRedViaria(fixtureElementos(), { ...OPCIONES_BASE, resolverDistrito: resolverSiempreDistrito01 });
    for (const tramo of red.tramos) {
      expect(tramo.longitudM).toBeGreaterThan(0);
    }
  });

  it('genera nodos únicos deduplicados por coordenada, con grado y tipoNodo correctos', () => {
    const red = construirRedViaria(fixtureElementos(), { ...OPCIONES_BASE, resolverDistrito: resolverSiempreDistrito01 });
    // n1, n3, n4, n3(repetido), n5 -> 4 nodos únicos de grafo (n1, n3, n4, n5)
    expect(red.nodos.length).toBe(4);
    const n3 = red.nodos.find((n) => Math.abs(n.lat - 39.471) < 1e-4);
    // n3 es extremo de 3 tramos: destino de A[1-3], origen de A[3-4], origen de B[3-5].
    expect(n3?.grado).toBe(3);
    expect(n3?.tipoNodo).toBe('interseccion');
    const n1 = red.nodos.find((n) => Math.abs(n.lat - 39.47) < 1e-4);
    expect(n1?.tipoNodo).toBe('finalVia');
  });

  it('descarta un way si alguno de sus nodos no está resuelto en el mapa de nodos', () => {
    const elementos: OverpassElement[] = [
      { type: 'node', id: 1, lat: 39.47, lon: -0.377 },
      { type: 'way', id: 300, nodes: [1, 999], tags: { highway: 'residential' } },
    ];
    const red = construirRedViaria(elementos, { ...OPCIONES_BASE, resolverDistrito: resolverSiempreDistrito01 });
    expect(red.tramos).toHaveLength(0);
  });

  it('idTramo es determinista y estable para la misma entrada', () => {
    const red1 = construirRedViaria(fixtureElementos(), { ...OPCIONES_BASE, resolverDistrito: resolverSiempreDistrito01 });
    const red2 = construirRedViaria(fixtureElementos(), { ...OPCIONES_BASE, resolverDistrito: resolverSiempreDistrito01 });
    expect(red1.tramos.map((t) => t.idTramo).sort()).toEqual(red2.tramos.map((t) => t.idTramo).sort());
  });

  it('nombreCalle y nombreCalleRaw coinciden en v1 (CDNCV aún no resuelto)', () => {
    const red = construirRedViaria(fixtureElementos(), { ...OPCIONES_BASE, resolverDistrito: resolverSiempreDistrito01 });
    for (const tramo of red.tramos) {
      expect(tramo.nombreCalle).toBe(tramo.nombreCalleRaw);
    }
  });
});
