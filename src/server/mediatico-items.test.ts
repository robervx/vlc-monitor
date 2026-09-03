import { afterEach, describe, expect, it, vi } from 'vitest';
import handler from './mediatico-items';

const RSS_OK = `<rss><channel><item>
<title>Titular de prueba en Valencia</title>
<link>https://example.com/1</link>
<description>Resumen</description>
<pubDate>Tue, 18 Aug 2026 12:00:00 +0200</pubDate>
</item></channel></rss>`;

afterEach(() => {
  vi.unstubAllGlobals();
});

// Orden importa: la caché del módulo empieza vacía — ver api/meteo/v1/actual.test.ts.
describe('GET /api/mediatico/v1/items', () => {
  it('devuelve 502 si todas las fuentes fallan sin caché previa', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 503 }));

    const res = await handler();
    expect(res.status).toBe(502);
  });

  it('devuelve 200 con los ítems de las fuentes que sí responden si una falla sin caché previa', async () => {
    // Solo falla el feed de Google News de Levante-EMV; el resto responde bien,
    // así que se sirve lo que hay (spec 009 §4, resiliencia por fuente).
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string) => {
        if (url.includes('levante-emv.com')) return Promise.resolve({ ok: false, status: 500 });
        return Promise.resolve({ ok: true, text: () => Promise.resolve(RSS_OK) });
      }),
    );

    const res = await handler();
    const body = (await res.json()) as { items: unknown[]; fresh: boolean; fuentesFallidas: string[] };

    expect(res.status).toBe(200);
    expect(body.fresh).toBe(false);
    expect(body.fuentesFallidas).toEqual(['Levante-EMV']);
    expect(body.items.length).toBeGreaterThan(0);
  });

  it('devuelve 200 con fresh:true y sin fuentesFallidas cuando todas las fuentes responden', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve({ ok: true, text: () => Promise.resolve(RSS_OK) })));

    const res = await handler();
    const body = (await res.json()) as { items: unknown[]; fresh: boolean; fuentesFallidas: string[] };

    expect(res.status).toBe(200);
    expect(body.fresh).toBe(true);
    expect(body.items.length).toBeGreaterThan(0);
    expect(body.fuentesFallidas).toEqual([]);
  });
});
