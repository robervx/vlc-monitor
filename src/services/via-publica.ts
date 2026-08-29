/**
 * Contrato y normalización de la spec 026 (specs/026-incidencias-via-publica.md §3).
 * Fuente: Geoportal ArcGIS del Ayuntamiento (sin API key), capa
 * Trafico/MapServer/209 ("Ocupació via pública").
 */

export type TipoIncidenciaViaPublica = 'obras' | 'incidencias' | 'festejos';

export interface IncidenciaViaPublica {
  id: string;
  descripcion: string;
  tipo: TipoIncidenciaViaPublica;
  calle: string;
  afectacion: string;
  lat: number;
  lon: number;
  /** Resuelto con point-in-polygon (spec 000) — null si cae fuera de los 19 distritos. */
  distritoCodigo: string | null;
  /** Vigencia del permiso administrativo, no la duración real confirmada de la obra/corte — ver spec 026 §2. */
  vigenciaDesde: string;
  vigenciaHasta: string;
  fetchedAt: string;
  source: 'ajuntament-valencia-geoportal';
}

const TIPO_POR_VALOR_ORIGEN: Record<string, TipoIncidenciaViaPublica> = {
  OBRAS: 'obras',
  INCIDENCIAS: 'incidencias',
  FESTEJOS: 'festejos',
};

interface ArcGisIncidenciaFeature {
  type: 'Feature';
  geometry: GeoJSON.Point | null;
  properties: {
    id_incidencia: number | null;
    desc_incidencia: string | null;
    tipo_incidencia: string | null;
    desc_calle: string | null;
    tipo_afectacion: string | null;
    fecha_inicio: number | null;
    fecha_fin: number | null;
  };
}

interface ArcGisIncidenciaResponse {
  type: 'FeatureCollection';
  features: ArcGisIncidenciaFeature[];
}

const GEOPORTAL_VIA_PUBLICA_URL =
  'https://geoportal.valencia.es/server/rest/services/OPENDATA/Trafico/MapServer/209/query?where=1=1&outFields=*&f=geojson';

/** No filtra por vigencia — eso es responsabilidad del endpoint (spec 026 §4), no del servicio. */
export async function fetchIncidenciasViaPublica(
  resolverDistrito: (lat: number, lon: number) => string | null,
): Promise<IncidenciaViaPublica[]> {
  const res = await fetch(GEOPORTAL_VIA_PUBLICA_URL, {
    headers: { 'User-Agent': 'vlc-monitor/1.0 (+https://github.com/)' },
  });
  if (!res.ok) {
    throw new Error(`Geoportal (vía pública) respondió HTTP ${res.status}`);
  }
  const body = (await res.json()) as ArcGisIncidenciaResponse;
  const fetchedAt = new Date().toISOString();

  return body.features
    .map((feature): IncidenciaViaPublica | null => {
      const p = feature.properties;
      if (
        feature.geometry === null ||
        p.id_incidencia === null ||
        p.desc_incidencia === null ||
        p.tipo_incidencia === null ||
        p.desc_calle === null ||
        p.tipo_afectacion === null ||
        p.fecha_inicio === null ||
        p.fecha_fin === null
      ) {
        return null;
      }
      const tipo = TIPO_POR_VALOR_ORIGEN[p.tipo_incidencia];
      if (!tipo) return null; // valor de tipo_incidencia no documentado — no se inventa una categoría

      const [lon, lat] = feature.geometry.coordinates;
      return {
        id: String(p.id_incidencia),
        descripcion: p.desc_incidencia,
        tipo,
        calle: p.desc_calle,
        afectacion: p.tipo_afectacion,
        lat: lat!,
        lon: lon!,
        distritoCodigo: resolverDistrito(lat!, lon!),
        vigenciaDesde: new Date(p.fecha_inicio).toISOString(),
        vigenciaHasta: new Date(p.fecha_fin).toISOString(),
        fetchedAt,
        source: 'ajuntament-valencia-geoportal',
      };
    })
    .filter((item): item is IncidenciaViaPublica => item !== null);
}
