import { describe, expect, it, vi } from 'vitest';
import { getOrFetch } from './cache';

describe('getOrFetch', () => {
  it('llama al fetcher en un miss y cachea el resultado', async () => {
    const fetcher = vi.fn().mockResolvedValue('valor-1');
    const key = `test-${Math.random()}`;

    const primera = await getOrFetch(key, 1000, fetcher);
    const segunda = await getOrFetch(key, 1000, fetcher);

    expect(primera).toEqual({ value: 'valor-1', fresh: true });
    expect(segunda).toEqual({ value: 'valor-1', fresh: true });
    expect(fetcher).toHaveBeenCalledTimes(1); // segunda llamada sirvió de caché
  });

  it('vuelve a llamar al fetcher cuando expira el TTL', async () => {
    const fetcher = vi.fn().mockResolvedValue('valor-2');
    const key = `test-${Math.random()}`;

    await getOrFetch(key, 10, fetcher);
    await new Promise((resolve) => setTimeout(resolve, 20));
    await getOrFetch(key, 10, fetcher);

    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it('stale-on-error: si el fetcher falla, sirve el último valor bueno', async () => {
    const key = `test-${Math.random()}`;
    const fetcherOk = vi.fn().mockResolvedValue('valor-bueno');
    const fetcherFalla = vi.fn().mockRejectedValue(new Error('fuente caída'));

    await getOrFetch(key, 1, fetcherOk);
    await new Promise((resolve) => setTimeout(resolve, 5)); // forzar expiración

    const resultado = await getOrFetch(key, 1, fetcherFalla);
    expect(resultado).toEqual({ value: 'valor-bueno', fresh: false });
  });

  it('propaga el error si el fetcher falla y nunca hubo valor previo', async () => {
    const key = `test-${Math.random()}`;
    const fetcherFalla = vi.fn().mockRejectedValue(new Error('fuente caída'));

    await expect(getOrFetch(key, 1000, fetcherFalla)).rejects.toThrow('fuente caída');
  });
});
