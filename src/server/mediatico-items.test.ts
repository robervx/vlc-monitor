import { afterEach, describe, expect, it, vi } from 'vitest';
import handler from './mediatico-items';

const RSS_OK = `<rss><channel><item>
<title>Titular de prueba en Valencia</title>
<link>https://example.com/1</link>
<description>Resumen</description>
<pubDate>Tue, 18 Aug 2026 12:00:00 +0200</pubDate>
</item></channel></rss>`;

const GDELT_OK = {
  articles: [
    {
      url: 'https://example.com/gdelt-1',
      title: 'Valencia celebra un evento',
      seendate: '20260818T120000Z',
      domain: 'example.com',
    },
  ],
};

function respuestaPorUrl(url: string): unknown {
  if (url.includes('gdeltproject.org')) {
    return { ok: true, json: () => Promise.resolve(GDELT_OK) };
  }
  return { ok: true, text: () => Promise.resolve(RSS_OK) };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

// Orden importa: la caché del módulo empieza vacía — ver api/meteo/v1/actual.test.ts.
describe('GET /api/mediatico/v1/items', () => {
  it('devuelve 502 si las 3 fuentes fallan sin caché previa', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 503 }));

    const res = await handler();
    expect(res.status).toBe(502);
  });

  it('devuelve 200 con los ítems de las fuentes que sí responden si GDELT falla sin caché previa', async () => {
    // GDELT sigue "frío" (el test anterior falló para las 3, nunca se guardó nada)
    // — aquí solo falla GDELT, RSS responde bien, así que se sirve lo que hay.
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string) => {
        if (url.includes('gdeltproject.org')) return Promise.resolve({ ok: false, status: 500 });
        return Promise.resolve(respuestaPorUrl(url));
      }),
    );

    const res = await handler();
    const body = (await res.json()) as { items: unknown[]; fresh: boolean; fuentesFallidas: string[] };

    expect(res.status).toBe(200);
    expect(body.fresh).toBe(false);
    expect(body.fuentesFallidas).toEqual(['GDELT']);
    expect(body.items.length).toBeGreaterThan(0);
  });

  it('devuelve 200 con fresh:true y sin fuentesFallidas cuando las 3 fuentes responden', async () => {
    vi.stubGlobal('fetch', vi.fn((url: string) => Promise.resolve(respuestaPorUrl(url))));

    const res = await handler();
    const body = (await res.json()) as { items: unknown[]; fresh: boolean; fuentesFallidas: string[] };

    expect(res.status).toBe(200);
    expect(body.fresh).toBe(true);
    expect(body.items.length).toBeGreaterThan(0);
    expect(body.fuentesFallidas).toEqual([]);
  });
});
