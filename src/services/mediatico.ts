/**
 * Contrato y normalización de la spec 009 (specs/009-contexto-mediatico.md §3).
 * Fuentes: RSS de Las Provincias y Valencia Plaza (sin key) + GDELT DOC 2.0 API
 * (sin key, rate limit documentado de 1 petición/5s). Reddit queda pendiente
 * de credenciales del usuario — ver spec 009 §2, no se implementa aquí.
 */

export type FuenteMediatica = 'Las Provincias' | 'Valencia Plaza' | 'GDELT';

export interface ItemMediatico {
  id: string;
  titulo: string;
  resumen: string | null;
  url: string;
  fuente: FuenteMediatica;
  imagenUrl: string | null;
  publicadoEn: string;
  fetchedAt: string;
  source: 'rss' | 'gdelt';
}

const HEADERS = { 'User-Agent': 'vlc-monitor/1.0 (+https://github.com/)' };

const ENTIDADES_HTML: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  oacute: 'ó',
  Oacute: 'Ó',
  eacute: 'é',
  Eacute: 'É',
  aacute: 'á',
  Aacute: 'Á',
  iacute: 'í',
  Iacute: 'Í',
  uacute: 'ú',
  Uacute: 'Ú',
  ntilde: 'ñ',
  Ntilde: 'Ñ',
  uuml: 'ü',
  egrave: 'è',
  Egrave: 'È',
  agrave: 'à',
  ccedil: 'ç',
  lsquo: '‘',
  rsquo: '’',
  ldquo: '“',
  rdquo: '”',
  sup2: '²',
};

function decodeEntities(texto: string): string {
  return texto
    .replace(/&#(\d+);/g, (_, dec: string) => String.fromCharCode(Number(dec)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex: string) => String.fromCharCode(parseInt(hex, 16)))
    .replace(/&([a-zA-Z]+);/g, (match, nombre: string) => ENTIDADES_HTML[nombre] ?? match);
}

function extraerTag(bloque: string, tag: string): string | null {
  const conCdata = new RegExp(`<${tag}[^>]*><!\\[CDATA\\[([\\s\\S]*?)\\]\\]></${tag}>`, 'i').exec(bloque);
  if (conCdata?.[1] !== undefined) return decodeEntities(conCdata[1].trim());
  const plano = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, 'i').exec(bloque);
  if (plano?.[1] !== undefined) return decodeEntities(plano[1].trim());
  return null;
}

function extraerImagenMedia(bloque: string): string | null {
  const m = /<media:content[^>]*\burl="([^"]+)"/i.exec(bloque);
  return m?.[1] ?? null;
}

/** Parser RSS 2.0 minimalista por regex — suficiente para feeds bien formados, sin dependencia de un parser XML completo. */
export function parsearRss(xml: string, fuente: FuenteMediatica, fetchedAt: string): ItemMediatico[] {
  const bloques = xml.match(/<item>[\s\S]*?<\/item>/g) ?? [];

  return bloques
    .map((bloque): ItemMediatico | null => {
      const titulo = extraerTag(bloque, 'title');
      const url = extraerTag(bloque, 'link');
      const pubDate = extraerTag(bloque, 'pubDate');
      if (!titulo || !url || !pubDate) return null;

      const publicadoEnDate = new Date(pubDate);
      if (Number.isNaN(publicadoEnDate.getTime())) return null;

      return {
        id: url,
        titulo,
        resumen: extraerTag(bloque, 'description'),
        url,
        fuente,
        imagenUrl: extraerImagenMedia(bloque),
        publicadoEn: publicadoEnDate.toISOString(),
        fetchedAt,
        source: 'rss',
      };
    })
    .filter((item): item is ItemMediatico => item !== null);
}

async function fetchRss(url: string, fuente: FuenteMediatica): Promise<ItemMediatico[]> {
  const res = await fetch(url, { headers: HEADERS });
  if (!res.ok) {
    throw new Error(`RSS ${fuente} respondió HTTP ${res.status}`);
  }
  const xml = await res.text();
  return parsearRss(xml, fuente, new Date().toISOString());
}

export async function fetchLasProvincias(): Promise<ItemMediatico[]> {
  return fetchRss('https://www.lasprovincias.es/rss/2.0/?section=valencia', 'Las Provincias');
}

export async function fetchValenciaPlaza(): Promise<ItemMediatico[]> {
  return fetchRss('https://valenciaplaza.com/feed', 'Valencia Plaza');
}

interface GdeltArticle {
  url: string;
  title: string;
  seendate: string;
  socialimage?: string;
  domain: string;
}

interface GdeltResponse {
  articles?: GdeltArticle[];
}

/** "20260818T171500Z" (GDELT) -> "2026-08-18T17:15:00Z" (ISO 8601). */
function normalizarFechaGdelt(seendate: string): string | null {
  const m = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/.exec(seendate);
  if (!m) return null;
  const [, y, mo, d, h, mi, s] = m;
  return `${y}-${mo}-${d}T${h}:${mi}:${s}Z`;
}

function mencionaValencia(titulo: string): boolean {
  const normalizado = titulo
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
  return normalizado.includes('valencia');
}

export async function fetchGdeltValencia(): Promise<ItemMediatico[]> {
  const url =
    'https://api.gdeltproject.org/api/v2/doc/doc?query=Valencia%20sourcecountry:Spain&mode=artlist&maxrecords=20&format=json&sort=datedesc';
  const res = await fetch(url, { headers: HEADERS });
  if (!res.ok) {
    throw new Error(`GDELT respondió HTTP ${res.status}`);
  }
  const body = (await res.json()) as GdeltResponse;
  const fetchedAt = new Date().toISOString();

  return (body.articles ?? [])
    .filter((a) => mencionaValencia(a.title))
    .map((a): ItemMediatico | null => {
      const publicadoEn = normalizarFechaGdelt(a.seendate);
      if (!publicadoEn) return null;
      return {
        id: a.url,
        titulo: a.title,
        resumen: null,
        url: a.url,
        fuente: 'GDELT',
        imagenUrl: a.socialimage ?? null,
        publicadoEn,
        fetchedAt,
        source: 'gdelt',
      };
    })
    .filter((item): item is ItemMediatico => item !== null);
}
