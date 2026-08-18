import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchDatosFallas } from './fallas';

const MONUMENTO_EJEMPLO = {
  type: 'FeatureCollection',
  features: [
    {
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [-0.38, 39.475] },
      properties: {
        id_falla: 1,
        nombre: 'Plaça Mercat Central',
        seccion: '1A',
        fallera: 'Sonia Blasco',
        presidente: 'José Vte. Archer',
        artista: 'Palacio i Serra Artesans',
        lema: 'Indio-tades',
        anyo_fundacion: 1797,
        distintivo: 'Brillants (1991)',
        boceto: 'http://example.com/boceto.jpg',
      },
    },
    {
      // fila vacía del ArcGIS Server — debe descartarse
      type: 'Feature',
      geometry: null,
      properties: {
        id_falla: null,
        nombre: null,
        seccion: null,
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

const INFANTILES_VACIO = { type: 'FeatureCollection', features: [] };

const CARPA_EJEMPLO = {
  type: 'FeatureCollection',
  features: [
    {
      type: 'Feature',
      geometry: { type: 'Polygon', coordinates: [[[-0.38, 39.449], [-0.3807, 39.4492], [-0.38, 39.449]]] },
      properties: { objectid: 4218, id_falla: 1 },
    },
  ],
};

const ZONA_EJEMPLO = {
  type: 'FeatureCollection',
  features: [
    {
      type: 'Feature',
      geometry: { type: 'Polygon', coordinates: [[[-0.38, 39.47], [-0.381, 39.471], [-0.38, 39.47]]] },
      properties: { gid: 321, descripcion: 'Mascletà' },
    },
  ],
};

function mockFetchPorUrl(): void {
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string) => {
      if (url.includes('/215/')) return Promise.resolve({ ok: true, json: () => Promise.resolve(MONUMENTO_EJEMPLO) });
      if (url.includes('/0/')) return Promise.resolve({ ok: true, json: () => Promise.resolve(INFANTILES_VACIO) });
      if (url.includes('/205/')) return Promise.resolve({ ok: true, json: () => Promise.resolve(CARPA_EJEMPLO) });
      return Promise.resolve({ ok: true, json: () => Promise.resolve(ZONA_EJEMPLO) });
    }),
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('fetchDatosFallas', () => {
  it('normaliza los 4 recursos y descarta filas vacías', async () => {
    mockFetchPorUrl();

    const datos = await fetchDatosFallas();

    expect(datos.monumentos).toHaveLength(1);
    expect(datos.monumentos[0]).toMatchObject({
      id: '1',
      nombre: 'Plaça Mercat Central',
      esInfantil: false,
      distintivo: 'Brillants (1991)',
    });
    expect(datos.carpas).toHaveLength(1);
    expect(datos.zonasMovilidadReducida).toHaveLength(1);
    expect(datos.zonasMovilidadReducida[0]?.descripcion).toBe('Mascletà');
  });

  it('enriquece nombreFalla de la carpa cruzando por idFalla', async () => {
    mockFetchPorUrl();
    const datos = await fetchDatosFallas();
    expect(datos.carpas[0]?.nombreFalla).toBe('Plaça Mercat Central');
  });

  it('deja nombreFalla en null si no hay monumento con ese idFalla', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string) => {
        if (url.includes('/205/')) {
          return Promise.resolve({
            ok: true,
            json: () =>
              Promise.resolve({
                type: 'FeatureCollection',
                features: [
                  {
                    type: 'Feature',
                    geometry: CARPA_EJEMPLO.features[0]!.geometry,
                    properties: { objectid: 99, id_falla: 999 },
                  },
                ],
              }),
          });
        }
        if (url.includes('/215/')) return Promise.resolve({ ok: true, json: () => Promise.resolve(MONUMENTO_EJEMPLO) });
        if (url.includes('/0/')) return Promise.resolve({ ok: true, json: () => Promise.resolve(INFANTILES_VACIO) });
        return Promise.resolve({ ok: true, json: () => Promise.resolve(ZONA_EJEMPLO) });
      }),
    );

    const datos = await fetchDatosFallas();
    expect(datos.carpas[0]?.nombreFalla).toBeNull();
  });

  it('lanza si alguna de las 4 llamadas falla', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string) => {
        if (url.includes('/222/')) return Promise.resolve({ ok: false, status: 503 });
        return Promise.resolve({ ok: true, json: () => Promise.resolve(INFANTILES_VACIO) });
      }),
    );
    await expect(fetchDatosFallas()).rejects.toThrow('503');
  });
});
