/**
 * Contrato y normalización de la spec 006 (specs/006-capa-aparcamiento.md §3).
 * Fuente: Geoportal ArcGIS del Ayuntamiento (sin API key), capa
 * Trafico/MapServer/194 ("Parkings").
 */

export interface Aparcamiento {
  id: string;
  nombre: string;
  direccion: string;
  lat: number;
  lon: number;
  plazasTotales: number;
  plazasLibres: number; // valor crudo — puede ser negativo si sinDatos, ver abajo
  ocupacionPorcentaje: number; // ídem
  /**
   * true si el sensor del parking no reporta ocupación real — la fuente usa
   * centinelas negativos (-1, -2) en `plazaslibr`/`ocupacion` en vez de omitir
   * el campo. Confirmado en vivo el 2026-08-18: 13 de 23 parkings devuelven
   * esto, algunos con `ultima_mod` de hasta 2016 (sensor caído hace años).
   * Ver spec 006 §7. Nunca tratar estos valores como "0% ocupado".
   */
  sinDatos: boolean;
  distrito: string | null;
  observedAt: string;
  fetchedAt: string;
  source: 'ajuntament-valencia-geoportal';
}

interface ArcGisParkingFeature {
  type: 'Feature';
  geometry: GeoJSON.Point | null;
  properties: {
    id_aparcamiento: number | null;
    nombre: string | null;
    direccion: string | null;
    plazastota: number | null;
    plazaslibr: number | null;
    ocupacion: number | null;
    ultima_mod: number | null;
  };
}

interface ArcGisParkingResponse {
  type: 'FeatureCollection';
  features: ArcGisParkingFeature[];
}

const GEOPORTAL_PARKINGS_URL =
  'https://geoportal.valencia.es/server/rest/services/OPENDATA/Trafico/MapServer/194/query?where=1=1&outFields=*&f=geojson';

export async function fetchAparcamientos(
  resolverDistrito: (lat: number, lon: number) => string | null,
): Promise<Aparcamiento[]> {
  const res = await fetch(GEOPORTAL_PARKINGS_URL, {
    headers: { 'User-Agent': 'vlc-monitor/1.0 (+https://github.com/)' },
  });
  if (!res.ok) {
    throw new Error(`Geoportal (aparcamiento) respondió HTTP ${res.status}`);
  }
  const body = (await res.json()) as ArcGisParkingResponse;
  const fetchedAt = new Date().toISOString();

  const featuresValidas = body.features.filter(
    (f): f is ArcGisParkingFeature & {
      geometry: GeoJSON.Point;
      properties: { id_aparcamiento: number; nombre: string; direccion: string; plazastota: number; plazaslibr: number; ocupacion: number; ultima_mod: number | null };
    } =>
      f.geometry !== null &&
      f.properties.id_aparcamiento !== null &&
      f.properties.nombre !== null &&
      f.properties.direccion !== null &&
      f.properties.plazastota !== null &&
      f.properties.plazaslibr !== null &&
      f.properties.ocupacion !== null,
  );

  return featuresValidas.map((feature) => {
    const [lon, lat] = feature.geometry.coordinates;
    return {
      id: String(feature.properties.id_aparcamiento),
      nombre: feature.properties.nombre,
      direccion: feature.properties.direccion,
      lat: lat!,
      lon: lon!,
      plazasTotales: feature.properties.plazastota,
      plazasLibres: feature.properties.plazaslibr,
      ocupacionPorcentaje: feature.properties.ocupacion,
      sinDatos: feature.properties.plazaslibr < 0 || feature.properties.ocupacion < 0,
      distrito: resolverDistrito(lat!, lon!),
      observedAt: feature.properties.ultima_mod
        ? new Date(feature.properties.ultima_mod).toISOString()
        : fetchedAt,
      fetchedAt,
      source: 'ajuntament-valencia-geoportal',
    };
  });
}
