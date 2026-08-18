import { afterEach, describe, expect, it, vi } from 'vitest';
import handler from './estaciones';

const RESPUESTA_OK = {
  type: 'FeatureCollection',
  features: [
    {
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [-0.3829, 39.48] },
      properties: {
        gid: 902133,
        name: '001_GUILLEN_DE_CASTRO',
        number: 1,
        address: 'C/GUILLEM DE CASTRO',
        open: 'T',
        available: 3,
        free: 21,
        total: 25,
        update_jcd: 1787050405000,
      },
    },
  ],
};

afterEach(() => {
  vi.unstubAllGlobals();
});

// Orden importa: la caché del módulo empieza vacía — ver api/meteo/v1/actual.test.ts.
describe('GET /api/valenbisi/v1/estaciones', () => {
  it('devuelve 502 si la fuente falla y nunca hubo un valor previo cacheado', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 503 }));

    const res = await handler();
    const body = (await res.json()) as { error: string };

    expect(res.status).toBe(502);
    expect(body.error).toContain('503');
  });

  it('devuelve las estaciones normalizadas con fresh:true en un fetch correcto', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve(RESPUESTA_OK) }),
    );

    const res = await handler();
    const body = (await res.json()) as { estaciones: Array<{ bicisDisponibles: number }>; fresh: boolean };

    expect(res.status).toBe(200);
    expect(body.fresh).toBe(true);
    expect(body.estaciones).toHaveLength(1);
    expect(body.estaciones[0]?.bicisDisponibles).toBe(3);
  });
});
