import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import handler from './meteo-prediccion';

const RESPUESTA_OK = {
  hourly: {
    time: ['2026-08-18T13:00', '2026-08-18T14:00', '2026-08-18T15:00', '2026-08-18T16:00', '2026-08-18T17:00', '2026-08-18T18:00'],
    temperature_2m: [32.9, 32.9, 32.5, 32.0, 31.5, 30.9],
    precipitation_probability: [0, 10, 20, 30, 40, 50],
    precipitation: [0, 0, 0, 0.1, 0.2, 0.3],
    weather_code: [0, 0, 1, 61, 61, 3],
  },
};

// La normalización filtra por "solo tramos futuros" (ver src/services/
// prediccion-corto-plazo.ts) — hay que fijar la hora del sistema para que
// este test no dependa de cuándo se ejecute de verdad.
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-08-18T13:05:00Z'));
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

// Mismo motivo de orden que api/meteo/v1/actual.test.ts: la caché del módulo
// empieza vacía, el caso "sin valor previo" debe ir primero.
describe('GET /api/meteo/v1/prediccion-corto-plazo', () => {
  it('devuelve 502 si la fuente falla y nunca hubo un valor previo cacheado', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 503 }));

    const res = await handler();
    const body = (await res.json()) as { error: string };

    expect(res.status).toBe(502);
    expect(body.error).toContain('503');
  });

  it('devuelve la predicción normalizada con fresh:true en un fetch correcto', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve(RESPUESTA_OK) }),
    );

    const res = await handler();
    const body = (await res.json()) as { prediccion: { predicciones: unknown[] }; fresh: boolean };

    expect(res.status).toBe(200);
    expect(body.fresh).toBe(true);
    expect(body.prediccion.predicciones).toHaveLength(4);
  });

  // Stale-on-error ya está cubierto exhaustivamente en api/_shared/cache.test.ts.
});
