/**
 * Altimetría de Valencia por distrito — spec 044 §2/§4. Fuente: IGN
 * (Instituto Geográfico Nacional), servicio WMS INSPIRE del Modelo Digital
 * del Terreno (`servicios.idee.es/wms-inspire/mdt`, capa
 * `EL.ElevationGridCoverage`) — datos geográficos oficiales de libre
 * reutilización. Verificado en vivo el 2026-09-17 con `GetFeatureInfo` en
 * varios puntos reales de Valencia (resultados coherentes con la topografía
 * conocida de la ciudad: 0-30 m, prácticamente plana).
 *
 * Dato **estático** (la altimetría no cambia) — se seedea una sola vez
 * (`scripts/seed-altimetria.ts`), igual que el grafo viario de spec 020, no
 * es un pipeline con caché/TTL.
 */

export interface MuestraElevacion {
  lat: number;
  lon: number;
  elevacionM: number;
  distritoCodigo: string;
}

export interface ResumenAltimetriaDistrito {
  distritoCodigo: string;
  distritoNombre: string;
  elevacionMinM: number;
  elevacionMaxM: number;
  elevacionMediaM: number;
  muestras: number;
}

/** Sentinel NODATA real que devuelve el WMS del IGN sobre mar/zonas sin cobertura (verificado en vivo). */
export const NODATA_IGN = -32767;

/** Agrupa muestras de elevación ya resueltas por distrito y calcula min/max/media. */
export function resumenAltimetriaPorDistrito(
  muestras: MuestraElevacion[],
  nombrePorCodigo: Map<string, string>,
): ResumenAltimetriaDistrito[] {
  const porDistrito = new Map<string, number[]>();
  for (const m of muestras) {
    if (m.elevacionM === NODATA_IGN) continue;
    const arr = porDistrito.get(m.distritoCodigo) ?? [];
    arr.push(m.elevacionM);
    porDistrito.set(m.distritoCodigo, arr);
  }
  return [...porDistrito.entries()]
    .map(([codigo, valores]) => ({
      distritoCodigo: codigo,
      distritoNombre: nombrePorCodigo.get(codigo) ?? codigo,
      elevacionMinM: Math.min(...valores),
      elevacionMaxM: Math.max(...valores),
      elevacionMediaM: valores.reduce((a, b) => a + b, 0) / valores.length,
      muestras: valores.length,
    }))
    .sort((a, b) => b.elevacionMediaM - a.elevacionMediaM);
}
