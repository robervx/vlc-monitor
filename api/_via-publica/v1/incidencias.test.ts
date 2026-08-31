import { afterEach, describe, expect, it, vi } from 'vitest';
import handler from './incidencias';

const AHORA = Date.now();
const UN_DIA_MS = 24 * 60 * 60 * 1000;

const RESPUESTA_OK = {
  type: 'FeatureCollection',
  features: [
    {
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [-0.3814, 39.4529] },
      properties: {
        id_incidencia: 1,
        desc_incidencia: 'Obra activa',
        tipo_incidencia: 'OBRAS',
        desc_calle: 'C/ Sollana',
        tipo_afectacion: 'ACERA',
        fecha_inicio: AHORA - UN_DIA_MS,
        fecha_fin: AHORA + UN_DIA_MS, // vigente
      },
    },
    {
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [-0.37, 39.47] },
      properties: {
        id_incidencia: 2,
        desc_incidencia: 'Obra expirada',
        tipo_incidencia: 'OBRAS',
        desc_calle: 'C/ Ejemplo',
        tipo_afectacion: 'CALZADA',
        fecha_inicio: AHORA - UN_DIA_MS * 10,
        fecha_fin: AHORA - UN_DIA_MS, // ya expirada
      },
    },
  ],
};

afterEach(() => {
  vi.unstubAllGlobals();
});

// Orden importa: la caché del módulo empieza vacía — ver api/meteo/v1/actual.test.ts.
describe('GET /api/via-publica/v1/incidencias', () => {
  it('devuelve 502 si la fuente falla y nunca hubo un valor previo cacheado', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 503 }));

    const res = await handler();
    const body = (await res.json()) as { error: string };

    expect(res.status).toBe(502);
    expect(body.error).toContain('503');
  });

  it('filtra las incidencias ya expiradas y devuelve solo las vigentes', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve(RESPUESTA_OK) }));

    const res = await handler();
    const body = (await res.json()) as { incidencias: Array<{ id: string }>; fresh: boolean };

    expect(res.status).toBe(200);
    expect(body.fresh).toBe(true);
    expect(body.incidencias).toHaveLength(1);
    expect(body.incidencias[0]?.id).toBe('1');
  });
});
