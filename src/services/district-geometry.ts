/**
 * Servicio de geometría de distritos — implementa el contrato de la spec 000
 * (specs/000-mapa-base-distritos.md). Equivalente a nivel ciudad del
 * country-geometry.ts de World Monitor.
 *
 * Consume siempre el endpoint interno GET /api/geo/v1/distritos — nunca llama
 * directamente al Geoportal (ver CLAUDE.md §2).
 */

/** Barrio real dentro de un distrito — spec 023 §3 (antes `string[]` en la spec 000, sin datos). */
export interface BarrioInfo {
  nombre: string;
  alias: string[];
  ambiguo: boolean;
}

export interface Distrito {
  codigo: string;
  nombre: string;
  geometry: GeoJSON.Polygon | GeoJSON.MultiPolygon;
  centroide: [number, number];
  bbox: [number, number, number, number];
  barrios: BarrioInfo[];
  /** true si `nombre` colisiona con una palabra/nombre propio común (spec 023 §2/§3) — solo el distrito 09 "Jesus" de momento. */
  ambiguo?: boolean;
  fetchedAt: string;
  source: 'ajuntament-valencia-geoportal';
}

interface DistritosResponse {
  distritos: Distrito[];
}

interface DistritoFeature {
  type: 'Feature';
  geometry: GeoJSON.Polygon | GeoJSON.MultiPolygon;
  properties: Omit<Distrito, 'geometry'>;
}

/**
 * Transforma el asset estático `data/distritos-valencia.json` (FeatureCollection)
 * en `Distrito[]`. Usado tanto por `GET /api/geo/v1/distritos` como por
 * cualquier otro endpoint edge que necesite resolver distrito por coordenadas
 * server-side (ej. spec 004) sin depender de un `fetch` relativo — los
 * endpoints edge no tienen "origen de página" implícito.
 */
export function distritosFromGeoJSON(geojson: { features: unknown[] }): Distrito[] {
  return (geojson.features as DistritoFeature[]).map((feature) => ({
    ...feature.properties,
    geometry: feature.geometry,
  }));
}

let distritos: Distrito[] = [];
let preloadPromise: Promise<Distrito[]> | null = null;

export async function preloadDistrictGeometry(): Promise<Distrito[]> {
  if (distritos.length > 0) return distritos;
  if (!preloadPromise) {
    preloadPromise = fetch('/api/geo/v1/distritos')
      .then((res) => {
        if (!res.ok) {
          throw new Error(`GET /api/geo/v1/distritos -> HTTP ${res.status}`);
        }
        return res.json() as Promise<DistritosResponse>;
      })
      .then((body) => {
        distritos = body.distritos;
        return distritos;
      })
      .catch((err) => {
        preloadPromise = null; // permitir reintentar en la siguiente llamada
        throw err;
      });
  }
  return preloadPromise;
}

/** Para tests/consumidores que ya tienen los datos cargados (o inyectados). */
export function setLoadedDistricts(loaded: Distrito[]): void {
  distritos = loaded;
}

export function getLoadedDistricts(): Distrito[] {
  return distritos;
}

function pointInRing(lon: number, lat: number, ring: GeoJSON.Position[]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const pi = ring[i]!;
    const pj = ring[j]!;
    const xi = pi[0]!;
    const yi = pi[1]!;
    const xj = pj[0]!;
    const yj = pj[1]!;
    const intersects = yi > lat !== yj > lat && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi;
    if (intersects) inside = !inside;
  }
  return inside;
}

function pointInPolygon(lon: number, lat: number, coordinates: GeoJSON.Position[][]): boolean {
  const [outer, ...holes] = coordinates;
  if (!outer || !pointInRing(lon, lat, outer)) return false;
  return !holes.some((hole) => pointInRing(lon, lat, hole));
}

function pointInGeometry(
  lon: number,
  lat: number,
  geometry: GeoJSON.Polygon | GeoJSON.MultiPolygon,
): boolean {
  if (geometry.type === 'Polygon') {
    return pointInPolygon(lon, lat, geometry.coordinates);
  }
  return geometry.coordinates.some((polygon) => pointInPolygon(lon, lat, polygon));
}

/** Point-in-polygon (ray casting) sobre los distritos precargados. */
export function getDistrictAtCoordinates(lat: number, lon: number): Distrito | null {
  for (const distrito of distritos) {
    const [minLon, minLat, maxLon, maxLat] = distrito.bbox;
    if (lon < minLon || lon > maxLon || lat < minLat || lat > maxLat) continue;
    if (pointInGeometry(lon, lat, distrito.geometry)) return distrito;
  }
  return null;
}

export function getDistrictCentroid(codigo: string): [number, number] | null {
  return distritos.find((d) => d.codigo === codigo)?.centroide ?? null;
}

export function getDistrictBbox(codigo: string): [number, number, number, number] | null {
  return distritos.find((d) => d.codigo === codigo)?.bbox ?? null;
}

/** Exportada para reutilizar en spec 023 (geolocalizacion-texto.ts) — no duplicar. */
export function normalizeForSearch(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

/** Resuelve texto libre (con o sin acentos/mayúsculas) al código de distrito. */
export function nameToDistrictCode(texto: string): string | null {
  const target = normalizeForSearch(texto);
  if (!target) return null;
  const exact = distritos.find((d) => normalizeForSearch(d.nombre) === target);
  if (exact) return exact.codigo;
  const partial = distritos.find((d) => normalizeForSearch(d.nombre).includes(target));
  return partial?.codigo ?? null;
}
