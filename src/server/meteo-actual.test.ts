import { afterEach, describe, expect, it, vi } from 'vitest';
import handler from './meteo-actual';

const RESPUESTA_OK = {
  current: {
    time: '2026-08-18T10:15',
    temperature_2m: 32.3,
    relative_humidity_2m: 49,
    apparent_temperature: 36.3,
    precipitation: 0,
    weather_code: 0,
    wind_speed_10m: 8.8,
    wind_direction_10m: 102,
    wind_gusts_10m: 22.7,
    pressure_msl: 1016.3,
    uv_index: 6.2,
  },
};

afterEach(() => {
  vi.unstubAllGlobals();
});

// Orden importa: la caché del módulo empieza vacía, así que el primer test
// (fuente caída, sin valor previo) tiene que ejecutarse antes que cualquiera
// que la caliente con un valor bueno.
describe('GET /api/meteo/v1/actual', () => {
  it('devuelve 502 si la fuente falla y nunca hubo un valor previo cacheado', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 503 }));

    const res = await handler();
    const body = (await res.json()) as { error: string };

    expect(res.status).toBe(502);
    expect(body.error).toContain('503');
  });

  it('devuelve el estado normalizado con fresh:true en un fetch correcto', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve(RESPUESTA_OK) }),
    );

    const res = await handler();
    const body = (await res.json()) as { estado: { temperatura: number }; fresh: boolean };

    expect(res.status).toBe(200);
    expect(body.fresh).toBe(true);
    expect(body.estado.temperatura).toBe(32.3);
  });

  // El caso "stale-on-error sirve el último valor bueno tras expirar el TTL"
  // está cubierto exhaustivamente en api/_shared/cache.test.ts, que es la
  // pieza que implementa ese comportamiento — este fichero prueba que el
  // endpoint lo usa correctamente en los dos extremos (sin caché / con caché).
});
