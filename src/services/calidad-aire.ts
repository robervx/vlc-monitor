/**
 * Contrato y normalización de la spec 002 (specs/002-capa-calidad-aire.md §3).
 * Fuente: Open-Meteo Air Quality (sin API key), mismo proveedor que la
 * meteorología de la spec 001 pero un servicio HTTP distinto.
 */

export interface CalidadAire {
  id: 'valencia';
  lat: number;
  lon: number;
  pm10: number;
  pm25: number;
  monoxidoCarbono: number;
  dioxidoNitrogeno: number;
  dioxidoAzufre: number;
  ozono: number;
  indiceEuropeo: number;
  indiceUS: number;
  categoria: string;
  observedAt: string;
  fetchedAt: string;
  source: 'open-meteo';
}

const VALENCIA_LAT = 39.4699;
const VALENCIA_LON = -0.3763;

// Bandas del European AQI (EEA) — ver spec 002 §3.
export function categoriaIndiceEuropeo(indice: number): string {
  if (indice < 20) return 'Buena';
  if (indice < 40) return 'Aceptable';
  if (indice < 60) return 'Moderada';
  if (indice < 80) return 'Mala';
  if (indice < 100) return 'Muy mala';
  return 'Extremadamente mala';
}

interface OpenMeteoAirQualityResponse {
  current: {
    time: string;
    pm10: number;
    pm2_5: number;
    carbon_monoxide: number;
    nitrogen_dioxide: number;
    sulphur_dioxide: number;
    ozone: number;
    us_aqi: number;
    european_aqi: number;
  };
}

// timezone=UTC por el mismo motivo que en estado-meteo.ts: current.time sin
// ambigüedad de DST, convertible a ISO 8601 solo añadiendo "Z".
const OPEN_METEO_AIR_QUALITY_URL =
  `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${VALENCIA_LAT}&longitude=${VALENCIA_LON}` +
  '&current=pm10,pm2_5,carbon_monoxide,nitrogen_dioxide,sulphur_dioxide,ozone,us_aqi,european_aqi&timezone=UTC';

export async function fetchCalidadAire(): Promise<CalidadAire> {
  const res = await fetch(OPEN_METEO_AIR_QUALITY_URL);
  if (!res.ok) {
    throw new Error(`Open-Meteo Air Quality respondió HTTP ${res.status}`);
  }
  const body = (await res.json()) as OpenMeteoAirQualityResponse;
  const { current } = body;

  return {
    id: 'valencia',
    lat: VALENCIA_LAT,
    lon: VALENCIA_LON,
    pm10: current.pm10,
    pm25: current.pm2_5,
    monoxidoCarbono: current.carbon_monoxide,
    dioxidoNitrogeno: current.nitrogen_dioxide,
    dioxidoAzufre: current.sulphur_dioxide,
    ozono: current.ozone,
    indiceEuropeo: current.european_aqi,
    indiceUS: current.us_aqi,
    categoria: categoriaIndiceEuropeo(current.european_aqi),
    observedAt: new Date(`${current.time}:00Z`).toISOString(),
    fetchedAt: new Date().toISOString(),
    source: 'open-meteo',
  };
}
