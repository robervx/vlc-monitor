import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchEstacionesValenbisi } from './valenbisi';

const RESPUESTA_GEOPORTAL_EJEMPLO = {
  type: 'FeatureCollection',
  features: [
    {
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [-0.3829, 39.48] },
      properties: {
        gid: 902133,
        name: '001_GUILLEN_DE_CASTRO',
        number: 1,
        address: 'C/GUILLEM DE CASTRO esquina con C/NA JORDANA',
        open: 'T',
        available: 3,
        free: 21,
        total: 25,
        update_jcd: 1787050405000,
      },
    },
    {
      type: 'Feature',
      geometry: null,
      properties: {
        gid: null,
        name: null,
        number: null,
        address: null,
        open: null,
        available: null,
        free: null,
        total: null,
        update_jcd: null,
      },
    },
  ],
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('fetchEstacionesValenbisi', () => {
  it('normaliza la respuesta del Geoportal y descarta filas vacías', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve(RESPUESTA_GEOPORTAL_EJEMPLO) }),
    );
    const resolverDistrito = vi.fn().mockReturnValue('01');

    const estaciones = await fetchEstacionesValenbisi(resolverDistrito);

    expect(estaciones).toHaveLength(1);
    expect(estaciones[0]).toMatchObject({
      id: '902133',
      numero: 1,
      nombre: '001_GUILLEN_DE_CASTRO',
      abierta: true,
      bicisDisponibles: 3,
      huecosLibres: 21,
      capacidadTotal: 25,
      distrito: '01',
      source: 'ajuntament-valencia-geoportal',
    });
    expect(estaciones[0]?.observedAt).toBe('2026-08-18T10:53:25.000Z');
  });

  it('marca la estación como cerrada cuando open !== "T"', async () => {
    const cerrada = {
      ...RESPUESTA_GEOPORTAL_EJEMPLO,
      features: [
        {
          ...RESPUESTA_GEOPORTAL_EJEMPLO.features[0],
          properties: { ...RESPUESTA_GEOPORTAL_EJEMPLO.features[0]!.properties, open: 'F' },
        },
      ],
    };
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve(cerrada) }));

    const [estacion] = await fetchEstacionesValenbisi(() => null);
    expect(estacion?.abierta).toBe(false);
  });

  it('lanza si el Geoportal responde con error HTTP', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 503 }));
    await expect(fetchEstacionesValenbisi(() => null)).rejects.toThrow('503');
  });
});
