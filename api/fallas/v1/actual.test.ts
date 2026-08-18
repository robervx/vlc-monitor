import { afterEach, describe, expect, it, vi } from 'vitest';
import handler from './actual';

const VACIO = { type: 'FeatureCollection', features: [] };

const MONUMENTO_OK = {
  type: 'FeatureCollection',
  features: [
    {
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [-0.38, 39.475] },
      properties: {
        id_falla: 1,
        nombre: 'Test Falla',
        seccion: '1A',
        fallera: null,
        presidente: null,
        artista: null,
        lema: null,
        anyo_fundacion: null,
        distintivo: null,
        boceto: null,
      },
    },
  ],
};

function mockFetchOk(): void {
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string) => {
      if (url.includes('/215/')) return Promise.resolve({ ok: true, json: () => Promise.resolve(MONUMENTO_OK) });
      return Promise.resolve({ ok: true, json: () => Promise.resolve(VACIO) });
    }),
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

// Orden importa: la caché del módulo empieza vacía — ver api/meteo/v1/actual.test.ts.
describe('GET /api/fallas/v1/actual', () => {
  it('devuelve 502 si alguna fuente falla sin caché previa', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string) => {
        if (url.includes('/222/')) return Promise.resolve({ ok: false, status: 503 });
        return Promise.resolve({ ok: true, json: () => Promise.resolve(VACIO) });
      }),
    );

    const res = await handler();
    expect(res.status).toBe(502);
  });

  it('devuelve los 4 recursos con fresh:true en un fetch correcto', async () => {
    mockFetchOk();

    const res = await handler();
    const body = (await res.json()) as {
      monumentos: Array<{ nombre: string }>;
      carpas: unknown[];
      zonasMovilidadReducida: unknown[];
      fresh: boolean;
    };

    expect(res.status).toBe(200);
    expect(body.fresh).toBe(true);
    expect(body.monumentos).toHaveLength(1);
    expect(body.monumentos[0]?.nombre).toBe('Test Falla');
  });
});
