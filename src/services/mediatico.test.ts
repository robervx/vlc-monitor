import { describe, expect, it } from 'vitest';
import { parsearRss } from './mediatico';

const RSS_EJEMPLO = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
<channel>
<title>Ejemplo</title>
<item>
<guid isPermalink="true">https://example.com/noticia-1</guid>
<title>Rescatan a dos senderistas en el Montgó</title>
<link>https://example.com/noticia-1</link>
<description>Los dos hombres presentaban síntomas de agotamiento</description>
<pubDate>Tue, 18 Aug 2026 19:31:06 +0200</pubDate>
<media:content url="https://example.com/foto.jpg" type="image/jpeg" medium="image"/>
</item>
<item>
<title><![CDATA[El Ayuntamiento concede licencia para 164 viviendas]]></title>
<link><![CDATA[https://example.com/noticia-2]]></link>
<description><![CDATA[Tras concluir las obras de urbanizaci&oacute;n]]></description>
<pubDate>Tue, 18 Aug 2026 12:15:08 +0200</pubDate>
</item>
</channel>
</rss>`;

describe('parsearRss', () => {
  it('extrae los items con título, url, resumen, imagen y fecha ISO', () => {
    const items = parsearRss(RSS_EJEMPLO, 'Las Provincias', '2026-08-18T20:00:00.000Z');

    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({
      id: 'https://example.com/noticia-1',
      titulo: 'Rescatan a dos senderistas en el Montgó',
      url: 'https://example.com/noticia-1',
      fuente: 'Las Provincias',
      imagenUrl: 'https://example.com/foto.jpg',
      source: 'rss',
    });
    expect(items[0]?.publicadoEn).toBe('2026-08-18T17:31:06.000Z');
  });

  it('decodifica entidades HTML del CDATA y deja imagenUrl null si no hay media:content', () => {
    const items = parsearRss(RSS_EJEMPLO, 'Valencia Plaza', '2026-08-18T20:00:00.000Z');
    expect(items[1]?.titulo).toBe('El Ayuntamiento concede licencia para 164 viviendas');
    expect(items[1]?.resumen).toBe('Tras concluir las obras de urbanización');
    expect(items[1]?.imagenUrl).toBeNull();
  });

  it('devuelve array vacío si no hay <item>', () => {
    expect(parsearRss('<rss><channel></channel></rss>', 'Las Provincias', '2026-08-18T20:00:00.000Z')).toEqual([]);
  });

  it('limpia el HTML embebido en <description> (evita "href"/"https" en la tendencia)', () => {
    const xml = `<rss><channel><item>
      <title>Titular</title>
      <link>https://example.com/x</link>
      <pubDate>Tue, 18 Aug 2026 12:00:00 +0200</pubDate>
      <description><![CDATA[<p>Un resumen con <a href="https://example.com/x">enlace</a>.</p>]]></description>
    </item></channel></rss>`;
    const items = parsearRss(xml, 'Valencia Bonita', '2026-08-18T20:00:00.000Z');
    expect(items[0]?.resumen).toBe('Un resumen con enlace .');
  });

  it('recorta la coletilla de WordPress ("The post ... appeared first on ...")', () => {
    const xml = `<rss><channel><item>
      <title>Titular</title>
      <link>https://example.com/y</link>
      <pubDate>Tue, 18 Aug 2026 12:00:00 +0200</pubDate>
      <description><![CDATA[Nueva exposición en el centro. The post Nueva exposición appeared first on Valenciabonita.]]></description>
    </item></channel></rss>`;
    const items = parsearRss(xml, 'Valencia Bonita', '2026-08-18T20:00:00.000Z');
    expect(items[0]?.resumen).toBe('Nueva exposición en el centro.');
  });
});
