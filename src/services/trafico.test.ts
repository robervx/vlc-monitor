import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchEstadoTrafico, normalizarEstado } from './trafico';

const RESPUESTA_GEOPORTAL_EJEMPLO = {
  type: 'FeatureCollection',
  features: [
    {
      type: 'Feature',
      geometry: { type: 'LineString', coordinates: [[-0.38, 39.47], [-0.379, 39.471], [-0.378, 39.472]] },
      properties: { idtramo: 336, denominacion: 'MARIA CRISTINA', estado: 0 },
    },
    {
      type: 'Feature',
      geometry: { type: 'LineString', coordinates: [[-0.36, 39.46], [-0.361, 39.461]] },
      properties: { idtramo: 500, denominacion: 'CALLE X', estado: 3 },
    },
    {
      type: 'Feature',
      geometry: { type: 'LineString', coordinates: [[-0.37, 39.48], [-0.371, 39.481]] },
      properties: { idtramo: 700, denominacion: 'CALLE Y', estado: null },
    },
  ],
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('normalizarEstado', () => {
  it('mapea los códigos base 0-4', () => {
    expect(normalizarEstado(0)).toEqual({ estado: 'fluido', esPasoInferior: false });
    expect(normalizarEstado(1)).toEqual({ estado: 'denso', esPasoInferior: false });
    expect(normalizarEstado(2)).toEqual({ estado: 'congestionado', esPasoInferior: false });
    expect(normalizarEstado(3)).toEqual({ estado: 'cortado', esPasoInferior: false });
    expect(normalizarEstado(4)).toEqual({ estado: 'sin-datos', esPasoInferior: false });
  });

  it('mapea los códigos de paso inferior 5-9 al mismo estado base', () => {
    expect(normalizarEstado(5)).toEqual({ estado: 'fluido', esPasoInferior: true });
    expect(normalizarEstado(8)).toEqual({ estado: 'cortado', esPasoInferior: true });
  });

  it('trata null como sin-datos', () => {
    expect(normalizarEstado(null)).toEqual({ estado: 'sin-datos', esPasoInferior: false });
  });
});

describe('fetchEstadoTrafico', () => {
  it('normaliza la respuesta del Geoportal y resuelve distrito por el punto medio del tramo', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve(RESPUESTA_GEOPORTAL_EJEMPLO) }),
    );
    const resolverDistrito = vi.fn().mockReturnValue('01');

    const tramos = await fetchEstadoTrafico(resolverDistrito);

    expect(tramos).toHaveLength(3);
    expect(tramos[0]).toMatchObject({
      id: '336',
      nombre: 'MARIA CRISTINA',
      estado: 'fluido',
      estadoCodigo: 0,
      distrito: '01',
      source: 'ajuntament-valencia-geoportal',
    });
    expect(tramos[1]?.estado).toBe('cortado');
    expect(tramos[2]?.estado).toBe('sin-datos');
    // punto medio del primer tramo (3 puntos) -> el del medio
    expect(resolverDistrito).toHaveBeenCalledWith(39.471, -0.379);
  });

  it('lanza si el Geoportal responde con error HTTP', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 503 }));
    await expect(fetchEstadoTrafico(() => null)).rejects.toThrow('503');
  });
});
