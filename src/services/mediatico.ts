/**
 * Contrato y normalización de la spec 009 (specs/009-contexto-mediatico.md).
 *
 * v4: además de los RSS de Las Provincias / Valencia Plaza y de GDELT, se
 * agregan 20minutos (RSS), feeds de Google News por medio (Levante-EMV, À Punt,
 * Cadena SER — única vía tras la retirada de sus RSS por sección) y dos medios
 * temáticos de ocio de la ciudad. **El filtro Valencia-ciudad (§3.1) se aplica
 * ahora a TODAS las fuentes**, no solo a GDELT — ver `filtro-ambito-ciudad.ts`.
 * Reddit sigue pendiente de credenciales del usuario (spec 009 §2).
 */

import { findDistrictMentions, type DistritoMencion } from './geolocalizacion-texto';
import {
  clasificarAmbitoCiudad,
  type AmbitoCiudad,
  type CategoriaMediatica,
} from './filtro-ambito-ciudad';

export type { AmbitoCiudad, CategoriaMediatica };

/** De dónde viene el ítem — para atribución y para el aviso de "intermediario" en la UI. */
export type FuenteTipo = 'rss-nativo' | 'google-news' | 'gdelt';

export interface ItemMediaticoNucleo {
  id: string;
  titulo: string;
  resumen: string | null;
  url: string;
  /** Nombre del medio para atribución (v3 era una unión cerrada). */
  fuente: string;
  fuenteTipo: FuenteTipo;
  imagenUrl: string | null;
  publicadoEn: string;
  fetchedAt: string;
  /** Se mantiene por compatibilidad con la spec 025; 'google-news' cuenta como 'rss'. */
  source: 'rss' | 'gdelt';
}

export interface ItemMediaticoConDistrito extends ItemMediaticoNucleo {
  /** Spec 023 — [] si no menciona ningún distrito/barrio explícito. */
  distritosMencionados: DistritoMencion[];
}

export interface ItemMediatico extends ItemMediaticoConDistrito {
  /** Resultado del filtro §3.1 — nunca 'excluido' aquí (se descarta antes de servir). */
  ambitoCiudad: Exclude<AmbitoCiudad, 'excluido'>;
  categoria: CategoriaMediatica;
  /** Traza legible del filtro — para tests/logs, no se muestra en la UI. */
  motivoAmbito: string;
}

interface FiltroFuenteConfig {
  /** true si la fuente cubre exclusivamente la ciudad (ej. Valencia Plaza). */
  cityOnly: boolean;
  categoriaFuente?: 'ocio';
}

/** Spec 023 §4: menciones de distrito/barrio, antes de cachear. */
function enrichWithDistricts(items: ItemMediaticoNucleo[]): ItemMediaticoConDistrito[] {
  return items.map((item) => ({
    ...item,
    distritosMencionados: findDistrictMentions(`${item.titulo} ${item.resumen ?? ''}`),
  }));
}

/** Spec 009 §3.1: clasifica cada ítem y descarta los de fuera de la ciudad. */
function clasificarYFiltrar(
  items: ItemMediaticoConDistrito[],
  cfg: FiltroFuenteConfig,
): ItemMediatico[] {
  const salida: ItemMediatico[] = [];
  for (const item of items) {
    const clasificacion = clasificarAmbitoCiudad({
      titulo: item.titulo,
      resumen: item.resumen,
      distritosMencionados: item.distritosMencionados,
      fuenteCityOnly: cfg.cityOnly,
      categoriaFuente: cfg.categoriaFuente,
    });
    if (clasificacion.ambito === 'excluido') continue;
    salida.push({
      ...item,
      ambitoCiudad: clasificacion.ambito,
      categoria: clasificacion.categoria,
      motivoAmbito: clasificacion.motivo,
    });
  }
  return salida;
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
  // Tolera espacios/saltos de línea entre <tag>, el CDATA y </tag> (20minutos los mete).
  const conCdata = new RegExp(
    `<${tag}[^>]*>\\s*<!\\[CDATA\\[([\\s\\S]*?)\\]\\]>\\s*</${tag}>`,
    'i',
  ).exec(bloque);
  if (conCdata?.[1] !== undefined) return decodeEntities(conCdata[1].trim());
  const plano = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, 'i').exec(bloque);
  if (plano?.[1] !== undefined) return decodeEntities(plano[1].trim());
  return null;
}

function extraerImagenMedia(bloque: string): string | null {
  const m = /<media:content[^>]*\burl="([^"]+)"/i.exec(bloque);
  return m?.[1] ?? null;
}

/** Parser RSS 2.0 minimalista por regex — suficiente para feeds bien formados. */
export function parsearRss(
  xml: string,
  fuente: string,
  fetchedAt: string,
  fuenteTipo: FuenteTipo = 'rss-nativo',
): ItemMediaticoConDistrito[] {
  const bloques = xml.match(/<item>[\s\S]*?<\/item>/g) ?? [];

  const items = bloques
    .map((bloque): ItemMediaticoNucleo | null => {
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
        fuenteTipo,
        imagenUrl: extraerImagenMedia(bloque),
        publicadoEn: publicadoEnDate.toISOString(),
        fetchedAt,
        source: 'rss',
      };
    })
    .filter((item): item is ItemMediaticoNucleo => item !== null);

  return enrichWithDistricts(items);
}

function extraerFuenteGoogleNews(bloque: string): string | null {
  const m = /<source[^>]*>([\s\S]*?)<\/source>/i.exec(bloque);
  return m?.[1] ? decodeEntities(m[1].trim()) : null;
}

/** Google News añade " - <Medio>" al final del título — se recorta para dejar el titular limpio. */
function quitarSufijoFuente(titulo: string, medio: string): string {
  if (medio && titulo.endsWith(` - ${medio}`)) {
    return titulo.slice(0, titulo.length - medio.length - 3).trim();
  }
  const idx = titulo.lastIndexOf(' - ');
  return idx > 20 ? titulo.slice(0, idx).trim() : titulo;
}

/** Parser del RSS de búsqueda de Google News (spec 009 §2.2). */
export function parsearGoogleNews(
  xml: string,
  fetchedAt: string,
  etiquetaFallback: string,
): ItemMediaticoConDistrito[] {
  const bloques = xml.match(/<item>[\s\S]*?<\/item>/g) ?? [];

  const items = bloques
    .map((bloque): ItemMediaticoNucleo | null => {
      const tituloRaw = extraerTag(bloque, 'title');
      const url = extraerTag(bloque, 'link');
      const pubDate = extraerTag(bloque, 'pubDate');
      if (!tituloRaw || !url || !pubDate) return null;

      const publicadoEnDate = new Date(pubDate);
      if (Number.isNaN(publicadoEnDate.getTime())) return null;

      const medio = extraerFuenteGoogleNews(bloque) ?? etiquetaFallback;
      return {
        id: url,
        titulo: quitarSufijoFuente(tituloRaw, medio),
        resumen: null,
        url, // URL de redirección de news.google.com — se sirve tal cual (spec 009 §2.2)
        fuente: medio,
        fuenteTipo: 'google-news',
        imagenUrl: null,
        publicadoEn: publicadoEnDate.toISOString(),
        fetchedAt,
        source: 'rss',
      };
    })
    .filter((item): item is ItemMediaticoNucleo => item !== null);

  return enrichWithDistricts(items);
}

async function fetchRssFuente(
  url: string,
  fuente: string,
  cfg: FiltroFuenteConfig,
): Promise<ItemMediatico[]> {
  const res = await fetch(url, { headers: HEADERS });
  if (!res.ok) {
    throw new Error(`RSS ${fuente} respondió HTTP ${res.status}`);
  }
  const xml = await res.text();
  return clasificarYFiltrar(parsearRss(xml, fuente, new Date().toISOString()), cfg);
}

const GOOGLE_NEWS_BASE = 'https://news.google.com/rss/search';

function googleNewsUrl(query: string): string {
  return `${GOOGLE_NEWS_BASE}?q=${encodeURIComponent(query)}&hl=es&gl=ES&ceid=ES:es`;
}

async function fetchGoogleNewsFuente(
  query: string,
  etiqueta: string,
  cfg: FiltroFuenteConfig,
): Promise<ItemMediatico[]> {
  const res = await fetch(googleNewsUrl(query), { headers: HEADERS });
  if (!res.ok) {
    throw new Error(`Google News (${etiqueta}) respondió HTTP ${res.status}`);
  }
  const xml = await res.text();
  return clasificarYFiltrar(parsearGoogleNews(xml, new Date().toISOString(), etiqueta), cfg);
}

export function fetchLasProvincias(): Promise<ItemMediatico[]> {
  return fetchRssFuente(
    'https://www.lasprovincias.es/rss/2.0/?section=valencia',
    'Las Provincias',
    { cityOnly: false },
  );
}

export function fetchValenciaPlaza(): Promise<ItemMediatico[]> {
  return fetchRssFuente('https://valenciaplaza.com/feed', 'Valencia Plaza', { cityOnly: true });
}

export function fetchVeinteMinutos(): Promise<ItemMediatico[]> {
  return fetchRssFuente(
    'https://www.20minutos.es/rss/comunidad-valenciana/valencia/',
    '20minutos',
    { cityOnly: false },
  );
}

export function fetchValenciaSecreta(): Promise<ItemMediatico[]> {
  return fetchRssFuente('https://valenciasecreta.com/feed/', 'Valencia Secreta', {
    cityOnly: true,
    categoriaFuente: 'ocio',
  });
}

export function fetchValenciaBonita(): Promise<ItemMediatico[]> {
  return fetchRssFuente('https://www.valenciabonita.es/feed/', 'Valencia Bonita', {
    cityOnly: true,
    categoriaFuente: 'ocio',
  });
}

export function fetchGoogleNewsLevante(): Promise<ItemMediatico[]> {
  return fetchGoogleNewsFuente('València site:levante-emv.com when:2d', 'Levante-EMV', {
    cityOnly: false,
  });
}

export function fetchGoogleNewsApunt(): Promise<ItemMediatico[]> {
  return fetchGoogleNewsFuente('València site:apuntmedia.es when:3d', 'À Punt', { cityOnly: false });
}

export function fetchGoogleNewsSer(): Promise<ItemMediatico[]> {
  return fetchGoogleNewsFuente('València site:cadenaser.com when:2d', 'Cadena SER', {
    cityOnly: false,
  });
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

export async function fetchGdeltValencia(): Promise<ItemMediatico[]> {
  const url =
    'https://api.gdeltproject.org/api/v2/doc/doc?query=Valencia%20sourcecountry:Spain&mode=artlist&maxrecords=20&format=json&sort=datedesc';
  const res = await fetch(url, { headers: HEADERS });
  if (!res.ok) {
    throw new Error(`GDELT respondió HTTP ${res.status}`);
  }
  const body = (await res.json()) as GdeltResponse;
  const fetchedAt = new Date().toISOString();

  const nucleo = (body.articles ?? [])
    .map((a): ItemMediaticoNucleo | null => {
      const publicadoEn = normalizarFechaGdelt(a.seendate);
      if (!publicadoEn) return null;
      return {
        id: a.url,
        titulo: a.title,
        resumen: null,
        url: a.url,
        fuente: 'GDELT',
        fuenteTipo: 'gdelt',
        imagenUrl: a.socialimage ?? null,
        publicadoEn,
        fetchedAt,
        source: 'gdelt',
      };
    })
    .filter((item): item is ItemMediaticoNucleo => item !== null);

  // GDELT trae ruido ("Valencia" de pasada, Valencia de Venezuela): el filtro
  // §3.1 lo descarta igual que a cualquier otra fuente (cityOnly: false).
  return clasificarYFiltrar(enrichWithDistricts(nucleo), { cityOnly: false });
}
