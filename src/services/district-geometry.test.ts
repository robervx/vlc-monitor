import { describe, expect, it, beforeAll } from 'vitest';
import distritosGeoJSON from '../../data/distritos-valencia.json' with { type: 'json' };
import {
  setLoadedDistricts,
  getDistrictAtCoordinates,
  getDistrictCentroid,
  getDistrictBbox,
  nameToDistrictCode,
  type Distrito,
} from './district-geometry';

interface DistritoFeature {
  type: 'Feature';
  geometry: GeoJSON.Polygon | GeoJSON.MultiPolygon;
  properties: Omit<Distrito, 'geometry'>;
}

beforeAll(() => {
  const distritos: Distrito[] = (distritosGeoJSON.features as unknown as DistritoFeature[]).map(
    (feature) => ({ ...feature.properties, geometry: feature.geometry }),
  );
  setLoadedDistricts(distritos);
});

// Coordenadas conocidas — requisito del DoD de specs/000-mapa-base-distritos.md §6.
// Distrito esperado verificado manualmente contra el GeoJSON real (2026-08-18).
describe('getDistrictAtCoordinates', () => {
  it.each([
    ['Ciutat de les Arts i les Ciències', 39.454, -0.353, '10', 'Quatre Carreres'],
    ['Mercado Central', 39.4739, -0.3789, '01', 'Ciutat Vella'],
    ['Playa de la Malvarrosa', 39.4751, -0.3277, '11', 'Poblats Maritims'],
    ['Torres de Serranos', 39.4795, -0.3763, '01', 'Ciutat Vella'],
    ['Bioparc Valencia', 39.4826, -0.4118, '04', 'Campanar'],
  ] as const)('%s -> distrito %s (%s)', (_nombre, lat, lon, codigoEsperado, nombreEsperado) => {
    const distrito = getDistrictAtCoordinates(lat, lon);
    expect(distrito).not.toBeNull();
    expect(distrito?.codigo).toBe(codigoEsperado);
    expect(distrito?.nombre).toBe(nombreEsperado);
  });

  it('devuelve null para coordenadas fuera del término municipal', () => {
    expect(getDistrictAtCoordinates(40.4168, -3.7038)).toBeNull(); // Madrid
  });
});

describe('getDistrictCentroid / getDistrictBbox', () => {
  it('devuelve centroide y bbox para un código válido', () => {
    expect(getDistrictCentroid('01')).not.toBeNull();
    expect(getDistrictBbox('01')).not.toBeNull();
  });

  it('devuelve null para un código inexistente', () => {
    expect(getDistrictCentroid('99')).toBeNull();
    expect(getDistrictBbox('99')).toBeNull();
  });
});

describe('nameToDistrictCode', () => {
  it('resuelve nombre exacto sin acentos ni mayúsculas', () => {
    expect(nameToDistrictCode('benimaclet')).toBe('14');
  });

  it('resuelve nombre con apóstrofe y acentos', () => {
    expect(nameToDistrictCode("L'Eixample")).toBe('02');
  });

  it('devuelve null si no hay coincidencia', () => {
    expect(nameToDistrictCode('Distrito Inexistente')).toBeNull();
  });
});
