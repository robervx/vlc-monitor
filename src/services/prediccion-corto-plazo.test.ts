import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchPrediccionCortoPlazo } from './prediccion-corto-plazo';

const RESPUESTA_OPEN_METEO_EJEMPLO = {
  hourly: {
    time: [
      '2026-08-18T13:00',
      '2026-08-18T14:00',
      '2026-08-18T15:00',
      '2026-08-18T16:00',
      '2026-08-18T17:00',
      '2026-08-18T18:00',
    ],
    temperature_2m: [32.9, 32.9, 32.5, 32.0, 31.5, 30.9],
    precipitation_probability: [0, 10, 20, 30, 40, 50],
    precipitation: [0, 0, 0, 0.1, 0.2, 0.3],
    weather_code: [0, 0, 1, 61, 61, 3],
  },
};

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-08-18T13:05:00Z'));
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('fetchPrediccionCortoPlazo', () => {
  it('normaliza al contrato PrediccionCortoPlazo, descartando el tramo horario en curso', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(RESPUESTA_OPEN_METEO_EJEMPLO),
      }),
    );

    const prediccion = await fetchPrediccionCortoPlazo();

    expect(prediccion.id).toBe('valencia');
    expect(prediccion.source).toBe('open-meteo');
    expect(prediccion.ventanaHoras).toBe(4);
    expect(prediccion.predicciones).toHaveLength(4);
    // El tramo de las 13:00 (hora en curso, ahora=13:05) queda excluido.
    expect(prediccion.predicciones[0]?.horaObjetivo).toBe('2026-08-18T14:00:00.000Z');
    expect(prediccion.predicciones[0]?.temperatura).toBe(32.9);
    expect(prediccion.predicciones[3]?.horaObjetivo).toBe('2026-08-18T17:00:00.000Z');
    expect(prediccion.predicciones[2]?.descripcion).toBe('Lluvia ligera');
    expect(prediccion.predicciones[1]?.probabilidadPrecipitacion).toBe(20);
    expect(prediccion.observedAt).toBe('2026-08-18T14:00:00.000Z');
  });

  it('lanza si Open-Meteo responde con error HTTP', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 503 }));
    await expect(fetchPrediccionCortoPlazo()).rejects.toThrow('503');
  });
});
