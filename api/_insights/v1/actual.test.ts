import { afterEach, describe, expect, it, vi } from 'vitest';
import handler from './actual';

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

const PREDICCION_OK = {
  hourly: {
    time: ['2026-08-18T11:00', '2026-08-18T12:00'],
    temperature_2m: [23, 23],
    precipitation_probability: [0, 0],
    precipitation: [0, 0],
    weather_code: [0, 0],
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

function stubFetch(overrides: { trafico?: 'fail'; prediccion?: 'fail' } = {}): void {
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string) => {
      if (url.includes('geoportal.valencia.es')) {
        if (overrides.trafico === 'fail') return Promise.resolve({ ok: false, status: 503 });
        return Promise.resolve({ ok: true, json: () => Promise.resolve(TRAFICO_OK) });
      }
      if (url.includes('air-quality-api')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve(AIRE_OK) });
      }
      if (url.includes('api.open-meteo.com') && url.includes('hourly=')) {
        if (overrides.prediccion === 'fail') return Promise.resolve({ ok: false, status: 503 });
        return Promise.resolve({ ok: true, json: () => Promise.resolve(PREDICCION_OK) });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve(METEO_OK) });
    }),
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

// Orden importa: la caché del módulo empieza vacía — ver api/meteo/v1/actual.test.ts.
describe('GET /api/insights/v1/actual', () => {
  it('devuelve 502 si meteo o aire fallan sin caché previa (fuentes requeridas)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string) => {
        if (url.includes('air-quality-api')) return Promise.resolve({ ok: false, status: 503 });
        return Promise.resolve({ ok: true, json: () => Promise.resolve(METEO_OK) });
      }),
    );

    const res = await handler();
    expect(res.status).toBe(502);
  });

  it('devuelve 200 con el panel de insights cuando las cuatro fuentes responden', async () => {
    stubFetch();

    const res = await handler();
    const body = (await res.json()) as { panel: { insights: unknown[]; source: string }; fresh: boolean };

    expect(res.status).toBe(200);
    expect(body.fresh).toBe(true);
    expect(body.panel.source).toBe('vlc-monitor-insights');
    expect(body.panel.insights).toHaveLength(0); // datos neutros, sin ninguna regla activa
  });

  it('se degrada sin romper si tráfico o predicción fallan (fuentes opcionales)', async () => {
    stubFetch({ trafico: 'fail', prediccion: 'fail' });

    const res = await handler();
    const body = (await res.json()) as { panel: { insights: unknown[] } };

    expect(res.status).toBe(200);
    expect(body.panel.insights).toHaveLength(0);
  });
});
