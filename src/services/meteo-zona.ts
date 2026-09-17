/**
 * Lluvia y viento por distrito — spec 044 §2/§3. Extiende el patrón de la
 * spec 001 (un único punto de ciudad) a un punto por distrito, reutilizando
 * la misma fuente (Open-Meteo, modelo, sin API key) con su soporte nativo de
 * múltiples coordenadas en una sola llamada (`latitude`/`longitude` con
 * listas separadas por comas) — verificado en vivo el 2026-09-17: la
 * respuesta es un array en el mismo orden que las coordenadas de la
 * petición.
 *
 * Es un **modelo meteorológico** interpolado, no una estación real — se
 * distingue explícitamente del dato medido de `pluviometros-saih.ts` en la
 * UI (spec 044 §7).
 */

export interface RespuestaOpenMeteoPunto {
  latitude: number;
  longitude: number;
  current: {
    time: string;
    precipitation: number;
    wind_speed_10m: number;
    wind_gusts_10m: number;
  };
}

export interface LluviaVientoDistrito {
  distritoCodigo: string;
  distritoNombre: string;
  precipitacionMm: number;
  vientoKmh: number;
  rachaKmh: number;
  fecha: string;
}

export interface DistritoConCentroide {
  codigo: string;
  nombre: string;
  centroide: [number, number]; // [lon, lat]
}

/** Construye los parámetros `latitude`/`longitude` (listas separadas por comas, mismo orden que `distritos`). */
export function construirParametrosOpenMeteo(distritos: DistritoConCentroide[]): { latitude: string; longitude: string } {
  return {
    latitude: distritos.map((d) => d.centroide[1]).join(','),
    longitude: distritos.map((d) => d.centroide[0]).join(','),
  };
}

/** Empareja la respuesta (array, mismo orden que la petición) con cada distrito. */
export function normalizarLluviaVientoPorDistrito(
  distritos: DistritoConCentroide[],
  respuesta: RespuestaOpenMeteoPunto[],
): LluviaVientoDistrito[] {
  return distritos
    .map((d, i) => {
      const r = respuesta[i];
      if (!r) return null;
      return {
        distritoCodigo: d.codigo,
        distritoNombre: d.nombre,
        precipitacionMm: r.current.precipitation,
        vientoKmh: r.current.wind_speed_10m,
        rachaKmh: r.current.wind_gusts_10m,
        fecha: r.current.time,
      };
    })
    .filter((x): x is LluviaVientoDistrito => x !== null);
}
