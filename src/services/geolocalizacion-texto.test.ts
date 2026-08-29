import { describe, expect, it, beforeAll } from 'vitest';
import distritosGeoJSON from '../../data/distritos-valencia.json';
import { setLoadedDistricts, type Distrito } from './district-geometry';
import { findDistrictMentions, resetTablaPatronesGeolocalizacion } from './geolocalizacion-texto';

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
  resetTablaPatronesGeolocalizacion();
});

describe('findDistrictMentions', () => {
  it('encuentra un distrito por su nombre oficial', () => {
    const menciones = findDistrictMentions('Obras de mejora en l\'Olivereta este verano');
    expect(menciones).toEqual([
      expect.objectContaining({ distritoCodigo: '07', coincidencia: 'distrito', bajaConfianza: false }),
    ]);
  });

  it('encuentra un distrito por el nombre de uno de sus barrios (no ambiguo)', () => {
    const menciones = findDistrictMentions('Concierto gratuito este sábado en Benimaclet');
    expect(menciones).toEqual([
      expect.objectContaining({
        distritoCodigo: '14',
        distritoNombre: 'Benimaclet',
        coincidencia: 'barrio',
        textoCoincidente: 'Benimaclet',
        bajaConfianza: false,
      }),
    ]);
  });

  it('encuentra un barrio por su alias castellano', () => {
    const menciones = findDistrictMentions('Fiestas populares en el barrio de Ruzafa');
    expect(menciones).toEqual([
      expect.objectContaining({ distritoCodigo: '02', coincidencia: 'barrio', textoCoincidente: 'Ruzafa' }),
    ]);
  });

  it('devuelve [] si no hay ninguna coincidencia', () => {
    expect(findDistrictMentions('El Ayuntamiento aprueba el presupuesto municipal')).toEqual([]);
  });

  it('devuelve los dos distritos si el texto menciona dos, sin colapsar a uno', () => {
    const menciones = findDistrictMentions('Cortes de tráfico afectan a Benimaclet y también a Patraix');
    const codigos = menciones.map((m) => m.distritoCodigo).sort();
    expect(codigos).toEqual(['08', '14']);
  });

  it('no genera match para "Jesús" en sentido no geográfico (nombre ambiguo sin marcador de contexto)', () => {
    expect(findDistrictMentions('Un vecino llamado Jesús gana la lotería')).toEqual([]);
  });

  it('genera match de baja confianza para "Jesús" cuando va precedido de un marcador geográfico', () => {
    const menciones = findDistrictMentions('Corte de agua en el barrio de Jesús durante toda la mañana');
    expect(menciones).toEqual([
      expect.objectContaining({ distritoCodigo: '09', coincidencia: 'distrito', bajaConfianza: true }),
    ]);
  });

  it('deduplica: mismo distrito citado por nombre de distrito y por uno de sus barrios queda como una sola entrada "barrio"', () => {
    const menciones = findDistrictMentions('Obras en Benimaclet, dentro del distrito de Benimaclet');
    const deBenimaclet = menciones.filter((m) => m.distritoCodigo === '14');
    expect(deBenimaclet).toHaveLength(1);
    expect(deBenimaclet[0]?.coincidencia).toBe('barrio');
  });
});
