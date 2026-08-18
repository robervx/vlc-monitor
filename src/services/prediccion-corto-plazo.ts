/**
 * Contrato y normalización de la spec 016 (specs/016-prediccion-corto-plazo-meteo.md §3).
 * Fuente: Open-Meteo `hourly` (misma fuente que estado-meteo.ts, spec 001).
 */
import { descripcionWeatherCode } from './estado-meteo';

export interface PrediccionHoraria {
  horaObjetivo: string;
  temperatura: number;
  probabilidadPrecipitacion: number;
  precipitacion: number;
  weatherCode: number;
  descripcion: string;
}

export interface PrediccionCortoPlazo {
  id: 'valencia';
  ventanaHoras: number;
  predicciones: PrediccionHoraria[];
  observedAt: string;
  fetchedAt: string;
  source: 'open-meteo';
}

const VALENCIA_LAT = 39.4699;
const VALENCIA_LON = -0.3763;
const VENTANA_HORAS = 4;
// Se piden más tramos de los necesarios porque el primer tramo que devuelve
// Open-Meteo es la hora actual (parcialmente pasada), no la siguiente — se
// filtran después los que ya quedaron atrás (ver fetchPrediccionCortoPlazo).
const TRAMOS_SOLICITADOS = VENTANA_HORAS + 2;

interface OpenMeteoHourlyResponse {
  hourly: {
    time: string[];
    temperature_2m: number[];
    precipitation_probability: number[];
    precipitation: number[];
    weather_code: number[];
  };
}

// timezone=UTC por el mismo motivo que en estado-meteo.ts: `hourly.time` son
// instantes UTC sin ambigüedad de DST, convertibles a ISO 8601 solo con "Z".
const OPEN_METEO_URL =
  `https://api.open-meteo.com/v1/forecast?latitude=${VALENCIA_LAT}&longitude=${VALENCIA_LON}` +
  '&hourly=temperature_2m,precipitation_probability,precipitation,weather_code' +
  `&forecast_hours=${TRAMOS_SOLICITADOS}&timezone=UTC`;

export async function fetchPrediccionCortoPlazo(): Promise<PrediccionCortoPlazo> {
  const res = await fetch(OPEN_METEO_URL);
  if (!res.ok) {
    throw new Error(`Open-Meteo respondió HTTP ${res.status}`);
  }
  const body = (await res.json()) as OpenMeteoHourlyResponse;
  const { hourly } = body;

  const ahora = Date.now();
  // Los cuatro arrays de `hourly` vienen paralelos y de igual longitud
  // (garantía del contrato de Open-Meteo) — non-null assertion deliberada,
  // igual de confiada que el resto de campos de estado-meteo.ts.
  const predicciones: PrediccionHoraria[] = hourly.time
    .map((time, i) => ({
      horaObjetivo: new Date(`${time}:00Z`).toISOString(),
      temperatura: hourly.temperature_2m[i]!,
      probabilidadPrecipitacion: hourly.precipitation_probability[i]!,
      precipitacion: hourly.precipitation[i]!,
      weatherCode: hourly.weather_code[i]!,
      descripcion: descripcionWeatherCode(hourly.weather_code[i]!),
    }))
    // Solo tramos estrictamente futuros — el primer bucket que devuelve
    // Open-Meteo es la hora en curso (parcialmente pasada), no la siguiente.
    .filter((tramo) => new Date(tramo.horaObjetivo).getTime() > ahora)
    .slice(0, VENTANA_HORAS);

  return {
    id: 'valencia',
    ventanaHoras: predicciones.length,
    predicciones,
    observedAt: predicciones[0]?.horaObjetivo ?? new Date(ahora).toISOString(),
    fetchedAt: new Date(ahora).toISOString(),
    source: 'open-meteo',
  };
}
