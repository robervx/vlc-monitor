import { afterEach, describe, expect, it, vi } from 'vitest';
import handler from './pulso-distrito';

const METEO_OK = {
  current: {
    time: '2026-08-18T10:00',
    temperature_2m: 22,
    apparent_temperature: 22,
    relative_humidity_2m: 50,
    precipitation: 0,
    weather_code: 0,
    wind_speed_10m: 10,
    wind_direction_10m: 90,
    wind_gusts_10m: 15,
    pressure_msl: 1015,
    uv_index: 3,
  },
};

const AIRE_OK = {
  current: {
    time: '2026-08-18T10:00',
    pm10: 10,
    pm2_5: 5,
    carbon_monoxide: 100,
    nitrogen_dioxide: 5,
    sulphur_dioxide: 1,
    ozone: 50,
    us_aqi: 20,
    european_aqi: 10,
  },
};

const TRAFICO_OK = {
  type: 'FeatureCollection',
  features: [
    {
      type: 'Feature',
      geometry: { type: 'LineString', coordinates: [[-0.38, 39.475]] },
      properties: { idtramo: 1, denominacion: 'CALLE X', estado: 0 },
    },
  ],
};

function mockFetchPorUrl(): void {
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string) => {
      if (url.includes('air-quality-api')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve(AIRE_OK) });
      }
      if (url.includes('api.open-meteo.com')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve(METEO_OK) });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve(TRAFICO_OK) });
    }),
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

// Orden importa: la caché del módulo empieza vacía — ver api/meteo/v1/actual.test.ts.
describe('GET /api/pulso/v1/distrito', () => {
  it('devuelve 502 si alguna de las tres fuentes falla sin caché previa', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string) => {
        if (url.includes('geoportal.valencia.es')) {
          return Promise.resolve({ ok: false, status: 503 });
        }
        if (url.includes('air-quality-api')) {
          return Promise.resolve({ ok: true, json: () => Promise.resolve(AIRE_OK) });
        }
        return Promise.resolve({ ok: true, json: () => Promise.resolve(METEO_OK) });
      }),
    );

    const res = await handler();
    expect(res.status).toBe(502);
  });

  it('devuelve el índice para los 19 distritos combinando las tres fuentes', async () => {
    mockFetchPorUrl();

    const res = await handler();
    const body = (await res.json()) as {
      distritos: Array<{ distritoCodigo: string; indice: number; source: string }>;
      fresh: boolean;
    };

    expect(res.status).toBe(200);
    expect(body.fresh).toBe(true);
    expect(body.distritos).toHaveLength(19);
    expect(body.distritos.every((d) => d.source === 'vlc-monitor-compuesto')).toBe(true);
  });
});
