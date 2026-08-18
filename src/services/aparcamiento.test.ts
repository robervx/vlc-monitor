import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchAparcamientos } from './aparcamiento';

const RESPUESTA_GEOPORTAL_EJEMPLO = {
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
    {
      type: 'Feature',
      geometry: null,
      properties: {
        id_aparcamiento: null,
        nombre: null,
        direccion: null,
        plazastota: null,
        plazaslibr: null,
        ocupacion: null,
        ultima_mod: null,
      },
    },
  ],
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('fetchAparcamientos', () => {
  it('normaliza la respuesta del Geoportal y descarta filas vacías', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve(RESPUESTA_GEOPORTAL_EJEMPLO) }),
    );
    const resolverDistrito = vi.fn().mockReturnValue('09');

    const aparcamientos = await fetchAparcamientos(resolverDistrito);

    expect(aparcamientos).toHaveLength(1);
    expect(aparcamientos[0]).toMatchObject({
      id: '78',
      nombre: 'SEVERO OCHOA',
      plazasTotales: 371,
      plazasLibres: 46,
      ocupacionPorcentaje: 87.6,
      sinDatos: false,
      distrito: '09',
      source: 'ajuntament-valencia-geoportal',
    });
  });

  it('marca sinDatos:true cuando la fuente usa el centinela negativo (sensor caído)', async () => {
    const conCentinela = {
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          geometry: { type: 'Point', coordinates: [-0.356, 39.4707] },
          properties: {
            id_aparcamiento: 70,
            nombre: 'PARKING CHILE - AV. ARAGÓN',
            direccion: 'Chile, s/n',
            plazastota: 527,
            plazaslibr: -1,
            ocupacion: -1,
            ultima_mod: null,
          },
        },
      ],
    };
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve(conCentinela) }));

    const [aparcamiento] = await fetchAparcamientos(() => null);
    expect(aparcamiento?.sinDatos).toBe(true);
  });

  it('lanza si el Geoportal responde con error HTTP', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 503 }));
    await expect(fetchAparcamientos(() => null)).rejects.toThrow('503');
  });
});
