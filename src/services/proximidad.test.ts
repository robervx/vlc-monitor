import { describe, expect, it } from 'vitest';
import { calcularCercania, distanciaMetros, formatoDistancia } from './proximidad';
import type { TramoTrafico } from './trafico';
import type { EstacionValenbisi } from './valenbisi';
import type { Aparcamiento } from './aparcamiento';

// Centro de Valencia — Plaza del Ayuntamiento aprox.
const POSICION_CENTRO: [number, number] = [-0.3763, 39.4699];

function tramo(id: string, coords: [number, number][]): TramoTrafico {
  return {
    id,
    nombre: `Tramo ${id}`,
    geometry: { type: 'LineString', coordinates: coords },
    estadoCodigo: 0,
    estado: 'fluido',
    esPasoInferior: false,
    distrito: null,
    observedAt: '2026-08-19T10:00:00.000Z',
    fetchedAt: '2026-08-19T10:00:00.000Z',
    source: 'ajuntament-valencia-geoportal',
  };
}

function estacion(id: string, lon: number, lat: number): EstacionValenbisi {
  return {
    id,
    numero: Number(id),
    nombre: `Estación ${id}`,
    direccion: '',
    lat,
    lon,
    abierta: true,
    bicisDisponibles: 5,
    huecosLibres: 5,
    capacidadTotal: 10,
    distrito: null,
    observedAt: '2026-08-19T10:00:00.000Z',
    fetchedAt: '2026-08-19T10:00:00.000Z',
    source: 'ajuntament-valencia-geoportal',
  };
}

function aparcamiento(id: string, lon: number, lat: number): Aparcamiento {
  return {
    id,
    nombre: `Aparcamiento ${id}`,
    direccion: '',
    lat,
    lon,
    plazasTotales: 100,
    plazasLibres: 20,
    ocupacionPorcentaje: 80,
    sinDatos: false,
    distrito: null,
    observedAt: '2026-08-19T10:00:00.000Z',
    fetchedAt: '2026-08-19T10:00:00.000Z',
    source: 'ajuntament-valencia-geoportal',
  };
}

describe('distanciaMetros', () => {
  it('devuelve 0 para el mismo punto', () => {
    expect(distanciaMetros(POSICION_CENTRO, POSICION_CENTRO)).toBe(0);
  });

  it('devuelve una distancia razonable entre dos puntos conocidos de Valencia (~1.4km)', () => {
    // Plaza del Ayuntamiento -> Ciudad de las Artes y las Ciencias, aprox.
    const d = distanciaMetros(POSICION_CENTRO, [-0.3543, 39.4544]);
    expect(d).toBeGreaterThan(2000);
    expect(d).toBeLessThan(3500);
  });
});

describe('calcularCercania', () => {
  it('ordena por distancia ascendente y respeta el límite', () => {
    const lejos = estacion('1', -0.34, 39.49);
    const cerca = estacion('2', -0.3765, 39.47);
    const media = estacion('3', -0.37, 39.475);
    const resultado = calcularCercania(
      POSICION_CENTRO,
      { tramosTrafico: [], estacionesValenbisi: [lejos, cerca, media], aparcamientos: [] },
      2,
    );
    expect(resultado.valenbisi).toHaveLength(2);
    expect(resultado.valenbisi[0]?.item.id).toBe('2');
    expect(resultado.valenbisi[1]?.item.id).toBe('3');
  });

  it('calcula distancia punto-a-tramo para geometría LineString', () => {
    const t = tramo('t1', [
      [-0.377, 39.469],
      [-0.375, 39.4705],
    ]);
    const resultado = calcularCercania(POSICION_CENTRO, {
      tramosTrafico: [t],
      estacionesValenbisi: [],
      aparcamientos: [],
    });
    expect(resultado.trafico).toHaveLength(1);
    expect(resultado.trafico[0]?.distanciaMetros).toBeGreaterThanOrEqual(0);
    expect(resultado.trafico[0]?.distanciaMetros).toBeLessThan(500);
  });

  it('calcula distancia punto-a-tramo para geometría MultiLineString', () => {
    const t: TramoTrafico = {
      ...tramo('t2', []),
      geometry: {
        type: 'MultiLineString',
        coordinates: [
          [
            [-0.34, 39.49],
            [-0.339, 39.491],
          ],
          [
            [-0.3765, 39.4695],
            [-0.376, 39.47],
          ],
        ],
      },
    };
    const resultado = calcularCercania(POSICION_CENTRO, {
      tramosTrafico: [t],
      estacionesValenbisi: [],
      aparcamientos: [],
    });
    expect(resultado.trafico[0]?.distanciaMetros).toBeLessThan(200);
  });

  it('no revienta con capas vacías — devuelve listas vacías', () => {
    const resultado = calcularCercania(POSICION_CENTRO, {
      tramosTrafico: [],
      estacionesValenbisi: [],
      aparcamientos: [],
    });
    expect(resultado.trafico).toHaveLength(0);
    expect(resultado.valenbisi).toHaveLength(0);
    expect(resultado.aparcamiento).toHaveLength(0);
  });

  it('incluye aparcamientos ordenados por distancia', () => {
    const a1 = aparcamiento('a1', -0.3765, 39.4695);
    const a2 = aparcamiento('a2', -0.35, 39.45);
    const resultado = calcularCercania(POSICION_CENTRO, {
      tramosTrafico: [],
      estacionesValenbisi: [],
      aparcamientos: [a2, a1],
    });
    expect(resultado.aparcamiento[0]?.item.id).toBe('a1');
  });
});

describe('formatoDistancia', () => {
  it('muestra metros redondeados por debajo de 1000m', () => {
    expect(formatoDistancia(42.4)).toBe('42 m');
    expect(formatoDistancia(999)).toBe('999 m');
  });

  it('muestra km con un decimal a partir de 1000m', () => {
    expect(formatoDistancia(1500)).toBe('1.5 km');
    expect(formatoDistancia(2000)).toBe('2.0 km');
  });
});
