import { afterEach, describe, expect, it, vi } from 'vitest';
import { descripcionWeatherCode, fetchEstadoMeteo } from './estado-meteo';

const RESPUESTA_OPEN_METEO_EJEMPLO = {
  current: {
    time: '2026-08-18T10:15',
    temperature_2m: 32.3,
    relative_humidity_2m: 49,
    apparent_temperature: 36.3,
    precipitation: 0,
    weather_code: 0,
    wind_speed_10m: 8.8,
    wind_direction_10m: 102,
    wind_gusts_10m: 22.7,
    pressure_msl: 1016.3,
    uv_index: 6.2,
  },
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('descripcionWeatherCode', () => {
  it('resuelve códigos WMO conocidos', () => {
    expect(descripcionWeatherCode(0)).toBe('Cielo despejado');
    expect(descripcionWeatherCode(61)).toBe('Lluvia ligera');
    expect(descripcionWeatherCode(95)).toBe('Tormenta');
  });

  it('no revienta con un código desconocido', () => {
    expect(descripcionWeatherCode(12345)).toContain('12345');
  });
});

describe('fetchEstadoMeteo', () => {
  it('normaliza la respuesta de Open-Meteo al contrato EstadoMeteo', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(RESPUESTA_OPEN_METEO_EJEMPLO),
      }),
    );

    const estado = await fetchEstadoMeteo();

    expect(estado.id).toBe('valencia');
    expect(estado.temperatura).toBe(32.3);
    expect(estado.descripcion).toBe('Cielo despejado');
    expect(estado.source).toBe('open-meteo');
    expect(estado.observedAt).toBe('2026-08-18T10:15:00.000Z');
    expect(() => new Date(estado.fetchedAt).toISOString()).not.toThrow();
  });

  it('lanza si Open-Meteo responde con error HTTP', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 503 }));
    await expect(fetchEstadoMeteo()).rejects.toThrow('503');
  });
});
