import { afterEach, describe, expect, it, vi } from 'vitest';
import handler from './aparcamiento-estado';

const RESPUESTA_OK = {
  type: 'FeatureCollection',
  features: [
    {
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [-0.3641, 39.477] },
      properties: {
        id_aparcamiento: 78,
        nombre: 'SEVERO OCHOA',
        direccion: 'Profesor Severo Ochoa',
        plazastota: 371,
        plazaslibr: 46,
        ocupacion: 87.6,
        ultima_mod: 1787050550000,
      },
    },
  ],
};

afterEach(() => {
  vi.unstubAllGlobals();
});

// Orden importa: la caché del módulo empieza vacía — ver api/meteo/v1/actual.test.ts.
describe('GET /api/aparcamiento/v1/estado', () => {
  it('devuelve 502 si la fuente falla y nunca hubo un valor previo cacheado', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 503 }));

    const res = await handler();
    const body = (await res.json()) as { error: string };

    expect(res.status).toBe(502);
    expect(body.error).toContain('503');
  });

  it('devuelve los aparcamientos normalizados con fresh:true en un fetch correcto', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve(RESPUESTA_OK) }),
    );

    const res = await handler();
    const body = (await res.json()) as { aparcamientos: Array<{ ocupacionPorcentaje: number }>; fresh: boolean };

    expect(res.status).toBe(200);
    expect(body.fresh).toBe(true);
    expect(body.aparcamientos).toHaveLength(1);
    expect(body.aparcamientos[0]?.ocupacionPorcentaje).toBe(87.6);
  });
});
