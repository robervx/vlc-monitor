import { afterEach, describe, expect, it, vi } from 'vitest';
import handler from './actual';

const RESPUESTA_OK = {
  current: {
    time: '2026-08-18T10:00',
    pm10: 23.9,
    pm2_5: 13.9,
    carbon_monoxide: 144.0,
    nitrogen_dioxide: 8.9,
    sulphur_dioxide: 2.1,
    ozone: 99.0,
    us_aqi: 61,
    european_aqi: 40,
  },
};

afterEach(() => {
  vi.unstubAllGlobals();
});

// Orden importa: la caché del módulo empieza vacía — ver api/meteo/v1/actual.test.ts.
describe('GET /api/aire/v1/actual', () => {
  it('devuelve 502 si la fuente falla y nunca hubo un valor previo cacheado', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 503 }));

    const res = await handler();
    const body = (await res.json()) as { error: string };

    expect(res.status).toBe(502);
    expect(body.error).toContain('503');
  });

  it('devuelve la calidad del aire normalizada con fresh:true en un fetch correcto', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve(RESPUESTA_OK) }),
    );

    const res = await handler();
    const body = (await res.json()) as { calidad: { categoria: string }; fresh: boolean };

    expect(res.status).toBe(200);
    expect(body.fresh).toBe(true);
    expect(body.calidad.categoria).toBe('Moderada');
  });
});
