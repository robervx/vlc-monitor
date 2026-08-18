/**
 * Contrato y normalización de la spec 008 (specs/008-agenda-aglomeraciones-fallas.md §3).
 * Fuente: Geoportal ArcGIS del Ayuntamiento (sin API key), capas bajo
 * OPENDATA/Turismo — mismo proveedor que distritos/tráfico/Valenbisi/aparcamiento.
 */

export interface MonumentoFalla {
  id: string;
  nombre: string;
  seccion: string;
  esInfantil: boolean;
  lat: number;
  lon: number;
  fallera: string | null;
  presidente: string | null;
  artista: string | null;
  lema: string | null;
  anyoFundacion: number | null;
  distintivo: string | null;
  bocetoUrl: string | null;
  observedAt: string;
  fetchedAt: string;
  source: 'ajuntament-valencia-geoportal';
}

export interface CarpaFalla {
  id: string;
  idFalla: string | null;
  nombreFalla: string | null;
  geometry: GeoJSON.Polygon | GeoJSON.MultiPolygon;
  observedAt: string;
  fetchedAt: string;
  source: 'ajuntament-valencia-geoportal';
}

export interface ZonaMovilidadReducida {
  id: string;
  descripcion: string;
  geometry: GeoJSON.Polygon | GeoJSON.MultiPolygon;
  observedAt: string;
  fetchedAt: string;
  source: 'ajuntament-valencia-geoportal';
}

export interface DatosFallas {
  monumentos: MonumentoFalla[];
  carpas: CarpaFalla[];
  zonasMovilidadReducida: ZonaMovilidadReducida[];
}

const BASE_URL = 'https://geoportal.valencia.es/server/rest/services/OPENDATA/Turismo/MapServer';
const HEADERS = { 'User-Agent': 'vlc-monitor/1.0 (+https://github.com/)' };

interface MonumentoProperties {
  id_falla: number | null;
  nombre: string | null;
  seccion: string | null;
  fallera: string | null;
  presidente: string | null;
  artista: string | null;
  lema: string | null;
  anyo_fundacion: number | null;
  distintivo: string | null;
  boceto: string | null;
}

interface ArcGisFeature<P> {
  type: 'Feature';
  geometry: GeoJSON.Geometry | null;
  properties: P;
}

interface ArcGisResponse<P> {
  type: 'FeatureCollection';
  features: ArcGisFeature<P>[];
}

async function fetchArcGis<P>(layerId: number): Promise<ArcGisResponse<P>> {
  const res = await fetch(`${BASE_URL}/${layerId}/query?where=1=1&outFields=*&f=geojson`, {
    headers: HEADERS,
  });
  if (!res.ok) {
    throw new Error(`Geoportal (Fallas, capa ${layerId}) respondió HTTP ${res.status}`);
  }
  return (await res.json()) as ArcGisResponse<P>;
}

function normalizarMonumentos(
  respuesta: ArcGisResponse<MonumentoProperties>,
  esInfantil: boolean,
  fetchedAt: string,
): MonumentoFalla[] {
  return respuesta.features
    .filter(
      (f): f is ArcGisFeature<MonumentoProperties> & { geometry: GeoJSON.Point } =>
        f.geometry !== null && f.geometry.type === 'Point' && f.properties.id_falla !== null && f.properties.nombre !== null,
    )
    .map((f) => {
      const [lon, lat] = f.geometry.coordinates;
      return {
        id: String(f.properties.id_falla),
        nombre: f.properties.nombre!.trim(),
        seccion: f.properties.seccion ?? '',
        esInfantil,
        lat: lat!,
        lon: lon!,
        fallera: f.properties.fallera,
        presidente: f.properties.presidente,
        artista: f.properties.artista,
        lema: f.properties.lema,
        anyoFundacion: f.properties.anyo_fundacion,
        distintivo: f.properties.distintivo,
        bocetoUrl: f.properties.boceto,
        observedAt: fetchedAt,
        fetchedAt,
        source: 'ajuntament-valencia-geoportal',
      };
    });
}

interface CarpaProperties {
  objectid: number | null;
  id_falla: number | null;
}

function normalizarCarpas(
  respuesta: ArcGisResponse<CarpaProperties>,
  nombrePorIdFalla: Map<string, string>,
  fetchedAt: string,
): CarpaFalla[] {
  return respuesta.features
    .filter(
      (f): f is ArcGisFeature<CarpaProperties> & { geometry: GeoJSON.Polygon | GeoJSON.MultiPolygon } =>
        f.geometry !== null &&
        (f.geometry.type === 'Polygon' || f.geometry.type === 'MultiPolygon') &&
        f.properties.objectid !== null,
    )
    .map((f) => {
      const idFalla = f.properties.id_falla !== null ? String(f.properties.id_falla) : null;
      return {
        id: String(f.properties.objectid),
        idFalla,
        nombreFalla: idFalla ? (nombrePorIdFalla.get(idFalla) ?? null) : null,
        geometry: f.geometry,
        observedAt: fetchedAt,
        fetchedAt,
        source: 'ajuntament-valencia-geoportal',
      };
    });
}

interface ZonaProperties {
  gid: number | null;
  descripcion: string | null;
}

function normalizarZonas(
  respuesta: ArcGisResponse<ZonaProperties>,
  fetchedAt: string,
): ZonaMovilidadReducida[] {
  return respuesta.features
    .filter(
      (f): f is ArcGisFeature<ZonaProperties> & { geometry: GeoJSON.Polygon | GeoJSON.MultiPolygon } =>
        f.geometry !== null &&
        (f.geometry.type === 'Polygon' || f.geometry.type === 'MultiPolygon') &&
        f.properties.gid !== null &&
        f.properties.descripcion !== null,
    )
    .map((f) => ({
      id: String(f.properties.gid),
      descripcion: f.properties.descripcion!,
      geometry: f.geometry,
      observedAt: fetchedAt,
      fetchedAt,
      source: 'ajuntament-valencia-geoportal' as const,
    }));
}

export async function fetchDatosFallas(): Promise<DatosFallas> {
  const fetchedAt = new Date().toISOString();

  const [monumentosRaw, infantilesRaw, carpasRaw, zonasRaw] = await Promise.all([
    fetchArcGis<MonumentoProperties>(215),
    fetchArcGis<MonumentoProperties>(0),
    fetchArcGis<CarpaProperties>(205),
    fetchArcGis<ZonaProperties>(222),
  ]);

  const monumentos = [
    ...normalizarMonumentos(monumentosRaw, false, fetchedAt),
    ...normalizarMonumentos(infantilesRaw, true, fetchedAt),
  ];
  const nombrePorIdFalla = new Map(monumentos.filter((m) => !m.esInfantil).map((m) => [m.id, m.nombre]));
  const carpas = normalizarCarpas(carpasRaw, nombrePorIdFalla, fetchedAt);
  const zonasMovilidadReducida = normalizarZonas(zonasRaw, fetchedAt);

  return { monumentos, carpas, zonasMovilidadReducida };
}
