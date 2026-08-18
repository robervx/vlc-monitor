/**
 * Contrato y normalización de la spec 001 (specs/001-capa-meteorologia.md §3).
 * Fuente primaria: Open-Meteo (sin API key). AEMET avisos queda pendiente de
 * que el usuario aporte su propia API key — ver spec 001 §2.
 */

export interface EstadoMeteo {
  id: 'valencia';
  lat: number;
  lon: number;
  temperatura: number;
  sensacionTermica: number;
  humedad: number;
  precipitacion: number;
  weatherCode: number;
  descripcion: string;
  vientoVelocidad: number;
  vientoDireccion: number;
  vientoRachas: number;
  presion: number;
  uvIndex: number;
  observedAt: string;
  fetchedAt: string;
  source: 'open-meteo';
}

const VALENCIA_LAT = 39.4699;
const VALENCIA_LON = -0.3763;

// Códigos WMO — tabla estándar de Open-Meteo (https://open-meteo.com/en/docs).
const DESCRIPCION_WEATHER_CODE: Record<number, string> = {
  0: 'Cielo despejado',
  1: 'Mayormente despejado',
  2: 'Parcialmente nublado',
  3: 'Nublado',
  45: 'Niebla',
  48: 'Niebla con escarcha',
  51: 'Llovizna ligera',
  53: 'Llovizna moderada',
  55: 'Llovizna intensa',
  56: 'Llovizna helada ligera',
  57: 'Llovizna helada intensa',
  61: 'Lluvia ligera',
  63: 'Lluvia moderada',
  65: 'Lluvia intensa',
  66: 'Lluvia helada ligera',
  67: 'Lluvia helada intensa',
  71: 'Nevada ligera',
  73: 'Nevada moderada',
  75: 'Nevada intensa',
  77: 'Granos de nieve',
  80: 'Chubascos ligeros',
  81: 'Chubascos moderados',
  82: 'Chubascos violentos',
  85: 'Chubascos de nieve ligeros',
  86: 'Chubascos de nieve intensos',
  95: 'Tormenta',
  96: 'Tormenta con granizo ligero',
  99: 'Tormenta con granizo intenso',
};

export function descripcionWeatherCode(codigo: number): string {
  return DESCRIPCION_WEATHER_CODE[codigo] ?? `Código WMO ${codigo} (sin descripción)`;
}

interface OpenMeteoResponse {
  current: {
    time: string;
    temperature_2m: number;
    apparent_temperature: number;
    relative_humidity_2m: number;
    precipitation: number;
    weather_code: number;
    wind_speed_10m: number;
    wind_direction_10m: number;
    wind_gusts_10m: number;
    pressure_msl: number;
    uv_index: number;
  };
}

// timezone=UTC a propósito: así `current.time` es un instante UTC sin ambigüedad
// de DST (Europe/Madrid cambia entre +01:00/+02:00) y se puede convertir a ISO
// 8601 solo añadiendo "Z", sin adivinar el offset.
const OPEN_METEO_URL =
  `https://api.open-meteo.com/v1/forecast?latitude=${VALENCIA_LAT}&longitude=${VALENCIA_LON}` +
  '&current=temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,weather_code,' +
  'wind_speed_10m,wind_direction_10m,wind_gusts_10m,pressure_msl,uv_index&timezone=UTC';

export async function fetchEstadoMeteo(): Promise<EstadoMeteo> {
  const res = await fetch(OPEN_METEO_URL);
  if (!res.ok) {
    throw new Error(`Open-Meteo respondió HTTP ${res.status}`);
  }
  const body = (await res.json()) as OpenMeteoResponse;
  const { current } = body;

  return {
    id: 'valencia',
    lat: VALENCIA_LAT,
    lon: VALENCIA_LON,
    temperatura: current.temperature_2m,
    sensacionTermica: current.apparent_temperature,
    humedad: current.relative_humidity_2m,
    precipitacion: current.precipitation,
    weatherCode: current.weather_code,
    descripcion: descripcionWeatherCode(current.weather_code),
    vientoVelocidad: current.wind_speed_10m,
    vientoDireccion: current.wind_direction_10m,
    vientoRachas: current.wind_gusts_10m,
    presion: current.pressure_msl,
    uvIndex: current.uv_index,
    observedAt: new Date(`${current.time}:00Z`).toISOString(),
    fetchedAt: new Date().toISOString(),
    source: 'open-meteo',
  };
}
