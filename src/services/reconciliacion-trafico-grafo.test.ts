import { describe, expect, it } from 'vitest';
import {
  emparejarTraficoConGrafo,
  proyectarEstadoSobreGrafo,
  normalizarNombreCalle,
} from './reconciliacion-trafico-grafo';
import type { Tramo } from './red-viaria';
import type { TramoTrafico } from './trafico';

const LAT = 39.47;

function tramoGrafo(id: string, lonA: number, lonB: number, nombreCalle: string | null = 'Carrer de Colón'): Tramo {
  return {
    idTramo: id,
    nodoOrigenId: `${id}-a`,
    nodoDestinoId: `${id}-b`,
    geometria: { type: 'LineString', coordinates: [[lonA, LAT], [lonB, LAT]] },
    longitudM: 100,
    tipoVia: 'secundaria',
    sentido: 'bidireccional',
    nombreCalle,
    nombreCalleRaw: nombreCalle,
    distrito: '01',
    osmWayId: Number(id.replace(/\D/g, '')) || 1,
    versionGrafo: 'test',
    fuenteGeometria: 'test',
    confianzaTopologica: 'validadoManual',
  };
}

function tramoTrafico(
  id: string,
  coords: Array<[number, number]>,
  nombre: string,
  estado: TramoTrafico['estado'] = 'fluido',
): TramoTrafico {
  return {
    id,
    nombre,
    geometry: { type: 'LineString', coordinates: coords },
    estadoCodigo: 0,
    estado,
    esPasoInferior: false,
    distrito: '01',
    observedAt: '2026-09-16T10:00:00.000Z',
    fetchedAt: '2026-09-16T10:00:00.000Z',
    source: 'ajuntament-valencia-geoportal',
  };
}

describe('normalizarNombreCalle', () => {
  it('quita acentos, mayúsculas y el prefijo de tipo de vía', () => {
    expect(normalizarNombreCalle('Carrer de Colom')).toBe('colom');
    expect(normalizarNombreCalle('CALLE COLÓN')).toBe('colon');
    expect(normalizarNombreCalle('Avinguda del Regne de València')).toBe('regne de valencia');
  });

  it('null si no hay nombre', () => {
    expect(normalizarNombreCalle(null)).toBeNull();
  });
});

describe('emparejarTraficoConGrafo', () => {
  it('solape total: mismo trazado exacto → confianza alta, un solo tramo de grafo', () => {
    const g1 = tramoGrafo('g1', -0.38, -0.379);
    const tt = tramoTrafico('tt1', [[-0.38, LAT], [-0.379, LAT]], 'CALLE COLÓN');
    const [r] = emparejarTraficoConGrafo([tt], [g1]);
    expect(r!.idsTramoGrafo).toEqual(['g1']);
    expect(r!.metodo).toBe('nombre+solape');
    expect(r!.solapeFraccion).toBeCloseTo(1, 5);
    expect(r!.confianza).toBe('alta');
  });

  it('solape parcial: el tramo de tráfico se extiende más allá del grafo disponible → confianza media', () => {
    const g1 = tramoGrafo('g1', -0.38, -0.379);
    // El doble de largo que g1 — la segunda mitad no tiene ningún tramo de grafo cerca.
    const tt = tramoTrafico('tt2', [[-0.38, LAT], [-0.378, LAT]], 'CALLE COLÓN');
    const [r] = emparejarTraficoConGrafo([tt], [g1]);
    expect(r!.idsTramoGrafo).toEqual(['g1']);
    expect(r!.solapeFraccion).toBeGreaterThan(0.3);
    expect(r!.solapeFraccion).toBeLessThan(1);
    expect(r!.confianza).not.toBe('alta');
  });

  it('nombre coincide pero la geometría está lejos → sinEmparejar (el nombre solo no basta)', () => {
    const g1 = tramoGrafo('g1', -0.38, -0.379, 'Carrer de Colom');
    // Mismo nombre, pero a ~1 grado de distancia (>100 km) — ninguna candidata geométrica.
    const tt = tramoTrafico('tt3', [[0.62, LAT], [0.621, LAT]], 'CALLE COLÓN');
    const [r] = emparejarTraficoConGrafo([tt], [g1]);
    expect(r!.metodo).toBe('sinEmparejar');
    expect(r!.idsTramoGrafo).toEqual([]);
    expect(r!.solapeFraccion).toBe(0);
  });

  it('un tramo de tráfico largo cruza varios tramos de grafo consecutivos', () => {
    const g1 = tramoGrafo('g1', -0.38, -0.379);
    const g2 = tramoGrafo('g2', -0.379, -0.378);
    const tt = tramoTrafico('tt4', [[-0.38, LAT], [-0.379, LAT], [-0.378, LAT]], 'CALLE COLÓN');
    const [r] = emparejarTraficoConGrafo([tt], [g1, g2]);
    expect(r!.idsTramoGrafo.sort()).toEqual(['g1', 'g2']);
    expect(r!.metodo).toBe('nombre+solape');
  });

  it('sin ningún tramo de grafo cerca, marca sinEmparejar y no lanza', () => {
    const tt = tramoTrafico('tt5', [[-0.38, LAT], [-0.379, LAT]], 'CALLE SIN RELACIÓN');
    const [r] = emparejarTraficoConGrafo([tt], [tramoGrafo('lejos', 10, 10.001)]);
    expect(r!.metodo).toBe('sinEmparejar');
  });
});

describe('proyectarEstadoSobreGrafo', () => {
  it('proyecta el estado del tráfico sobre los tramos de grafo emparejados con confianza suficiente', () => {
    const g1 = tramoGrafo('g1', -0.38, -0.379);
    const tt = tramoTrafico('tt1', [[-0.38, LAT], [-0.379, LAT]], 'CALLE COLÓN', 'cortado');
    const emparejamientos = emparejarTraficoConGrafo([tt], [g1]);
    const proyeccion = proyectarEstadoSobreGrafo(emparejamientos, [tt]);
    expect(proyeccion).toHaveLength(1);
    expect(proyeccion[0]).toMatchObject({ idTramoGrafo: 'g1', estado: 'cortado', idTramoTraficoOrigen: 'tt1' });
  });

  it('no proyecta nada para los sinEmparejar', () => {
    const tt = tramoTrafico('tt3', [[0.62, LAT], [0.621, LAT]], 'CALLE COLÓN', 'cortado');
    const emparejamientos = emparejarTraficoConGrafo([tt], [tramoGrafo('g1', -0.38, -0.379, 'Carrer de Colom')]);
    expect(proyectarEstadoSobreGrafo(emparejamientos, [tt])).toEqual([]);
  });
});
