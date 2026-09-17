/**
 * Conversión UTM (ETRS89, huso 30N — EPSG:25830, el datum/huso que usa la
 * Confederación Hidrográfica del Júcar en su SAIH) a lat/lon WGS84. Fórmula
 * estándar de Mercator transversa inversa (elipsoide GRS80/WGS84, prácticamente
 * idénticos para este uso) — verificada contra dos estaciones reales del SAIH
 * ("VALENCIA" y "TANCAT DE LA PIPA"), cuyo resultado cae exactamente donde se
 * esperaba geográficamente (spec 044 §2).
 */
const A = 6378137.0;
const F = 1 / 298.257223563;
const K0 = 0.9996;

export function utmToLatLon(easting: number, northing: number, zone = 30, northern = true): { lat: number; lon: number } {
  const e = Math.sqrt(F * (2 - F));
  const x = easting - 500_000.0;
  const y = northern ? northing : northing - 10_000_000.0;

  const m = y / K0;
  const mu = m / (A * (1 - e ** 2 / 4 - (3 * e ** 4) / 64 - (5 * e ** 6) / 256));

  const e1 = (1 - Math.sqrt(1 - e ** 2)) / (1 + Math.sqrt(1 - e ** 2));
  const j1 = (3 * e1) / 2 - (27 * e1 ** 3) / 32;
  const j2 = (21 * e1 ** 2) / 16 - (55 * e1 ** 4) / 32;
  const j3 = (151 * e1 ** 3) / 96;
  const j4 = (1097 * e1 ** 4) / 512;
  const fp = mu + j1 * Math.sin(2 * mu) + j2 * Math.sin(4 * mu) + j3 * Math.sin(6 * mu) + j4 * Math.sin(8 * mu);

  const e2 = e ** 2 / (1 - e ** 2);
  const c1 = e2 * Math.cos(fp) ** 2;
  const t1 = Math.tan(fp) ** 2;
  const r1 = (A * (1 - e ** 2)) / (1 - e ** 2 * Math.sin(fp) ** 2) ** 1.5;
  const n1 = A / Math.sqrt(1 - e ** 2 * Math.sin(fp) ** 2);
  const d = x / (n1 * K0);

  const q1 = (n1 * Math.tan(fp)) / r1;
  const q2 = d ** 2 / 2;
  const q3 = ((5 + 3 * t1 + 10 * c1 - 4 * c1 ** 2 - 9 * e2) * d ** 4) / 24;
  const q4 = ((61 + 90 * t1 + 298 * c1 + 45 * t1 ** 2 - 3 * c1 ** 2 - 252 * e2) * d ** 6) / 720;
  const lat = fp - q1 * (q2 - q3 + q4);

  const q6 = ((1 + 2 * t1 + c1) * d ** 3) / 6;
  const q7 = ((5 - 2 * c1 + 28 * t1 - 3 * c1 ** 2 + 8 * e2 + 24 * t1 ** 2) * d ** 5) / 120;
  const lon = (d - q6 + q7) / Math.cos(fp);

  const lonOrigin = (zone - 1) * 6 - 180 + 3;
  return { lat: (lat * 180) / Math.PI, lon: (lon * 180) / Math.PI + lonOrigin };
}
