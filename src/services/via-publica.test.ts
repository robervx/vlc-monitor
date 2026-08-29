import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchIncidenciasViaPublica } from './via-publica';

function feature(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    type: 'Feature',
    geometry: { type: 'Point', coordinates: [-0.3814, 39.4529] },
    properties: {
      id_incidencia: 250094801,
      desc_incidencia: 'UTE CANAL DE ACCESO',
      tipo_incidencia: 'OBRAS',
      desc_calle: 'AV. POETA FEDERICO GARCIA LORCA',
      tipo_afectacion: 'ZONA ESTACIONAMIENTO LADO OESTE',
      fecha_inicio: 1742860800000,
      fecha_fin: 1805932740000,
      ...overrides,
    },
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('fetchIncidenciasViaPublica', () => {
  it('normaliza los 3 tipos reales y resuelve el distrito por coordenadas', async () => {
    const respuesta = {
      type: 'FeatureCollection',
      features: [
        feature({ tipo_incidencia: 'OBRAS' }),
        feature({ id_incidencia: 2, tipo_incidencia: 'INCIDENCIAS' }),
        feature({ id_incidencia: 3, tipo_incidencia: 'FESTEJOS' }),
      ],
    };
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve(respuesta) }));
    const resolverDistrito = vi.fn().mockReturnValue('09');

    const incidencias = await fetchIncidenciasViaPublica(resolverDistrito);

    expect(incidencias).toHaveLength(3);
    expect(incidencias.map((i) => i.tipo)).toEqual(['obras', 'incidencias', 'festejos']);
    expect(incidencias[0]).toMatchObject({
      id: '250094801',
      calle: 'AV. POETA FEDERICO GARCIA LORCA',
      afectacion: 'ZONA ESTACIONAMIENTO LADO OESTE',
      distritoCodigo: '09',
      source: 'ajuntament-valencia-geoportal',
    });
    expect(incidencias[0]?.vigenciaDesde).toBe('2025-03-25T00:00:00.000Z');
  });

  it('descarta filas sin geometría o con campos requeridos ausentes', async () => {
    const respuesta = {
      type: 'FeatureCollection',
      features: [
        feature(),
        { type: 'Feature', geometry: null, properties: { id_incidencia: 9 } },
        feature({ id_incidencia: 10, desc_calle: null }),
      ],
    };
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve(respuesta) }));

    const incidencias = await fetchIncidenciasViaPublica(() => null);
    expect(incidencias).toHaveLength(1);
  });

  it('descarta filas con un tipo_incidencia no documentado en vez de inventar una categoría', async () => {
    const respuesta = {
      type: 'FeatureCollection',
      features: [feature({ tipo_incidencia: 'ALGO_NUEVO' })],
    };
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve(respuesta) }));

    expect(await fetchIncidenciasViaPublica(() => null)).toEqual([]);
  });

  it('devuelve incidencias ya expiradas (el filtrado de vigencia es responsabilidad del endpoint)', async () => {
    const respuesta = {
      type: 'FeatureCollection',
      features: [feature({ fecha_fin: 1000 })], // 1970, claramente expirado
    };
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve(respuesta) }));

    const incidencias = await fetchIncidenciasViaPublica(() => null);
    expect(incidencias).toHaveLength(1);
  });

  it('lanza si el Geoportal responde con error HTTP', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 503 }));
    await expect(fetchIncidenciasViaPublica(() => null)).rejects.toThrow('503');
  });
});
