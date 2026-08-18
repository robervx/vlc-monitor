import { afterEach, describe, expect, it, vi } from 'vitest';
import { categoriaIndiceEuropeo, fetchCalidadAire } from './calidad-aire';

const RESPUESTA_OPEN_METEO_EJEMPLO = {
  current: {
    time: '2026-08-18T10:00',
    pm10: 23.9,
    pm2_5: 13.9,
    carbon_monoxide: 144.0,
    nitrogen_dioxide: 8.9,
    sulphur_dioxide: 2.1,
    ozone: 99.0,
    us_aqi: 61,
    european_aqi: 40,
  },
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('categoriaIndiceEuropeo', () => {
  it('mapea las bandas del European AQI', () => {
    expect(categoriaIndiceEuropeo(10)).toBe('Buena');
    expect(categoriaIndiceEuropeo(40)).toBe('Moderada');
    expect(categoriaIndiceEuropeo(79)).toBe('Mala');
    expect(categoriaIndiceEuropeo(120)).toBe('Extremadamente mala');
  });
});

describe('fetchCalidadAire', () => {
  it('normaliza la respuesta de Open-Meteo Air Quality al contrato CalidadAire', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(RESPUESTA_OPEN_METEO_EJEMPLO),
      }),
    );

    const calidad = await fetchCalidadAire();

    expect(calidad.id).toBe('valencia');
    expect(calidad.pm25).toBe(13.9);
    expect(calidad.indiceEuropeo).toBe(40);
    expect(calidad.categoria).toBe('Moderada');
    expect(calidad.source).toBe('open-meteo');
    expect(calidad.observedAt).toBe('2026-08-18T10:00:00.000Z');
  });

  it('lanza si Open-Meteo Air Quality responde con error HTTP', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 503 }));
    await expect(fetchCalidadAire()).rejects.toThrow('503');
  });
});
