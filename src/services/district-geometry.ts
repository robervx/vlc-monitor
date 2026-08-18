/**
 * Servicio de geometría de distritos — implementa el contrato de la spec 000
 * (specs/000-mapa-base-distritos.md). Equivalente a nivel ciudad del
 * country-geometry.ts de World Monitor.
 *
 * Estado: stub — pendiente de implementar hasta verificar manualmente el
 * endpoint real (ver spec 000 §2, punto marcado "Pendiente").
 */

export interface Distrito {
  codigo: string;
  nombre: string;
  geometry: GeoJSON.Polygon | GeoJSON.MultiPolygon;
  centroide: [number, number];
  bbox: [number, number, number, number];
  fetchedAt: string;
  source: 'ajuntament-valencia-opendatasoft';
}

// TODO(spec-000): preloadDistrictGeometry()
// TODO(spec-000): getDistrictAtCoordinates(lat: number, lon: number): Distrito | null
// TODO(spec-000): getDistrictCentroid(codigo: string)
// TODO(spec-000): getDistrictBbox(codigo: string)
// TODO(spec-000): nameToDistrictCode(texto: string)
export {};
