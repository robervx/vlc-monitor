/**
 * Contrato y normalización de la spec 004 (specs/004-capa-trafico-tiempo-real.md §3).
 * Fuente: Geoportal ArcGIS del Ayuntamiento (sin API key) — mismo proveedor
 * que la geometría de distritos de la spec 000, capa Trafico/MapServer/192.
 */

export type EstadoTramo = 'fluido' | 'denso' | 'congestionado' | 'cortado' | 'sin-datos';

export interface TramoTrafico {
  id: string;
  nombre: string;
  geometry: GeoJSON.LineString | GeoJSON.MultiLineString;
  estadoCodigo: number | null;
  estado: EstadoTramo;
  esPasoInferior: boolean;
  distrito: string | null;
  observedAt: string;
  fetchedAt: string;
  source: 'ajuntament-valencia-geoportal';
}

const ESTADO_POR_CODIGO_BASE: Record<number, EstadoTramo> = {
  0: 'fluido',
  1: 'denso',
  2: 'congestionado',
  3: 'cortado',
  4: 'sin-datos',
};

/** Códigos 5-9 son las mismas categorías que 0-4 pero en paso inferior/túnel — ver spec 004 §2. */
export function normalizarEstado(codigo: number | null): { estado: EstadoTramo; esPasoInferior: boolean } {
  if (codigo === null) return { estado: 'sin-datos', esPasoInferior: false };
  const esPasoInferior = codigo >= 5;
  const base = ESTADO_POR_CODIGO_BASE[codigo % 5] ?? 'sin-datos';
  return { estado: base, esPasoInferior };
}

function puntoMedio(geometry: GeoJSON.LineString | GeoJSON.MultiLineString): [number, number] {
  const linea = geometry.type === 'LineString' ? geometry.coordinates : geometry.coordinates[0]!;
  const punto = linea[Math.floor(linea.length / 2)]!;
  return [punto[0]!, punto[1]!];
}

interface ArcGisTrafficFeature {
  type: 'Feature';
  geometry: (GeoJSON.LineString | GeoJSON.MultiLineString) | null;
  properties: {
    idtramo: number | null;
    denominacion: string | null;
    estado: number | null;
  };
}

interface ArcGisTrafficResponse {
  type: 'FeatureCollection';
  features: ArcGisTrafficFeature[];
}

const GEOPORTAL_TRAFICO_URL =
  'https://geoportal.valencia.es/server/rest/services/OPENDATA/Trafico/MapServer/192/query?where=1=1&outFields=*&f=geojson';

export async function fetchEstadoTrafico(
  resolverDistrito: (lat: number, lon: number) => string | null,
): Promise<TramoTrafico[]> {
  const res = await fetch(GEOPORTAL_TRAFICO_URL, {
    headers: { 'User-Agent': 'vlc-monitor/1.0 (+https://github.com/)' },
  });
  if (!res.ok) {
    throw new Error(`Geoportal (tráfico) respondió HTTP ${res.status}`);
  }
  const body = (await res.json()) as ArcGisTrafficResponse;
  const fetchedAt = new Date().toISOString();

  // ~8% de las filas de origen llegan con geometry/idtramo/denominacion a
  // null (filas vacías del ArcGIS Server) — sin geometría no hay tramo que
  // representar, se descartan.
  const featuresValidas = body.features.filter(
    (f): f is ArcGisTrafficFeature & { geometry: NonNullable<ArcGisTrafficFeature['geometry']>; properties: { idtramo: number; denominacion: string; estado: number | null } } =>
      f.geometry !== null && f.properties.idtramo !== null && f.properties.denominacion !== null,
  );

  return featuresValidas.map((feature) => {
    const { estado, esPasoInferior } = normalizarEstado(feature.properties.estado);
    const [lon, lat] = puntoMedio(feature.geometry);

    return {
      id: String(feature.properties.idtramo),
      nombre: feature.properties.denominacion,
      geometry: feature.geometry,
      estadoCodigo: feature.properties.estado,
      estado,
      esPasoInferior,
      distrito: resolverDistrito(lat, lon),
      observedAt: fetchedAt, // la fuente no expone timestamp por tramo, solo el snapshot completo
      fetchedAt,
      source: 'ajuntament-valencia-geoportal',
    };
  });
}
