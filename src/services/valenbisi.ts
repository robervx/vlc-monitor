/**
 * Contrato y normalización de la spec 005 (specs/005-capa-valenbisi.md §3).
 * Fuente: Geoportal ArcGIS del Ayuntamiento (sin API key), capa
 * Trafico/MapServer/228 — dato original de JCDecaux redistribuido.
 */

export interface EstacionValenbisi {
  id: string;
  numero: number;
  nombre: string;
  direccion: string;
  lat: number;
  lon: number;
  abierta: boolean;
  bicisDisponibles: number;
  huecosLibres: number;
  capacidadTotal: number;
  distrito: string | null;
  observedAt: string;
  fetchedAt: string;
  source: 'ajuntament-valencia-geoportal';
}

interface ArcGisValenbisiFeature {
  type: 'Feature';
  geometry: GeoJSON.Point | null;
  properties: {
    gid: number | null;
    name: string | null;
    number: number | null;
    address: string | null;
    open: string | null;
    available: number | null;
    free: number | null;
    total: number | null;
    update_jcd: number | null;
  };
}

interface ArcGisValenbisiResponse {
  type: 'FeatureCollection';
  features: ArcGisValenbisiFeature[];
}

const GEOPORTAL_VALENBISI_URL =
  'https://geoportal.valencia.es/server/rest/services/OPENDATA/Trafico/MapServer/228/query?where=1=1&outFields=*&f=geojson';

export async function fetchEstacionesValenbisi(
  resolverDistrito: (lat: number, lon: number) => string | null,
): Promise<EstacionValenbisi[]> {
  const res = await fetch(GEOPORTAL_VALENBISI_URL, {
    headers: { 'User-Agent': 'vlc-monitor/1.0 (+https://github.com/)' },
  });
  if (!res.ok) {
    throw new Error(`Geoportal (Valenbisi) respondió HTTP ${res.status}`);
  }
  const body = (await res.json()) as ArcGisValenbisiResponse;
  const fetchedAt = new Date().toISOString();

  const featuresValidas = body.features.filter(
    (f): f is ArcGisValenbisiFeature & {
      geometry: GeoJSON.Point;
      properties: { gid: number; name: string; number: number; address: string; open: string; available: number; free: number; total: number; update_jcd: number | null };
    } =>
      f.geometry !== null &&
      f.properties.gid !== null &&
      f.properties.name !== null &&
      f.properties.number !== null &&
      f.properties.address !== null &&
      f.properties.open !== null &&
      f.properties.available !== null &&
      f.properties.free !== null &&
      f.properties.total !== null,
  );

  return featuresValidas.map((feature) => {
    const [lon, lat] = feature.geometry.coordinates;
    return {
      id: String(feature.properties.gid),
      numero: feature.properties.number,
      nombre: feature.properties.name,
      direccion: feature.properties.address,
      lat: lat!,
      lon: lon!,
      abierta: feature.properties.open === 'T',
      bicisDisponibles: feature.properties.available,
      huecosLibres: feature.properties.free,
      capacidadTotal: feature.properties.total,
      distrito: resolverDistrito(lat!, lon!),
      observedAt: feature.properties.update_jcd
        ? new Date(feature.properties.update_jcd).toISOString()
        : fetchedAt,
      fetchedAt,
      source: 'ajuntament-valencia-geoportal',
    };
  });
}
