/**
 * Avisos oficiales de movilidad — incidencias (obras) y previsiones (eventos
 * con corte de tráfico) — spec 048 (specs/048-avisos-movilidad-incidencias-previsiones.md).
 *
 * Fuente verificada el 2026-09-23 con `curl` real: HTML servido completo en
 * la respuesta inicial (Liferay, portlet `FrontMovilidadIncidenciasPrevisiones`),
 * sin JavaScript — a diferencia de la agenda general de spec 027. El mismo
 * `User-Agent` identificable que ya usa `avisos-meteo.ts` (spec 001) basta;
 * un `curl` con UA vacío/por defecto es rechazado por un WAF (HTTP 503),
 * mitigación básica de bots, no un bloqueo real (ver spec §2).
 */

import lugaresMovilidad from '../../data/lugares-movilidad-valencia.json' with { type: 'json' };

export type TipoAvisoMovilidad = 'incidencia' | 'prevision';

export interface AvisoMovilidad {
  id: string;
  tipo: TipoAvisoMovilidad;
  fechaPublicacion: string; // ISO 8601
  descripcion: string;
  planoUrl: string | null;
  lugar: string | null;
  lat: number | null;
  lon: number | null;
  fetchedAt: string;
  source: 'ajuntament-valencia-movilidad-incidencias-previsiones';
}

export interface SnapshotAvisosMovilidad {
  avisos: AvisoMovilidad[];
  fetchedAt: string;
}

const HEADERS = { 'User-Agent': 'vlc-monitor/1.0 (+https://github.com/)' };
export const URL_FUENTE_AVISOS_MOVILIDAD = 'https://www.valencia.es/cas/movilidad/incidencias-y-previsiones';

interface LugarMovilidad {
  alias: string[];
  lugar: string;
  lat: number;
  lon: number;
}

const LUGARES = lugaresMovilidad as LugarMovilidad[];

interface ItemCrudo {
  fechaTexto: string; // YYYY-MM-DD (formato del HTML crudo, ver RE_FECHA más abajo)
  descripcion: string;
  planoUrl: string | null;
}

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
};

function decodeEntities(texto: string): string {
  return texto
    .replace(/&#(\d+);/g, (_, dec: string) => String.fromCharCode(Number(dec)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex: string) => String.fromCharCode(parseInt(hex, 16)))
    .replace(/&([a-zA-Z]+);/g, (match, nombre: string) => ENTIDADES_HTML[nombre] ?? match);
}

function limpiarHtml(texto: string): string {
  return decodeEntities(texto.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ')).trim();
}

const TIPO_POR_TITULO: Record<string, TipoAvisoMovilidad> = {
  Incidencias: 'incidencia',
  Previsiones: 'prevision',
};

/** Divide una sección en sus ítems (`<span class="bloque_enlace">...</span>`). */
function trocearItems(seccionHtml: string): string[] {
  return seccionHtml.split('<span class="bloque_enlace">').slice(1);
}

// La fuente es inconsistente entre peticiones: verificado en vivo el
// 2026-09-23 con dos clientes HTTP distintos contra la misma URL en la misma
// ventana de minutos — uno recibió el timestamp sin formatear del HTML crudo
// (`YYYY-MM-DD HH:MM:SS.0`) y el otro el mismo campo ya formateado como lo ve
// una persona en pantalla (`DD-MM-YYYY`), probablemente instancias de
// aplicación no sincronizadas detrás del balanceador. Se aceptan ambos
// formatos explícitamente, nunca se asume uno solo (spec 048 §2).
const RE_FECHA = /(?:(\d{4})-(\d{2})-(\d{2})(?:\s+\d{2}:\d{2}:\d{2}(?:\.\d+)?)?|(\d{2})-(\d{2})-(\d{4}))/;

function extraerFecha(textoBruto: string): { fechaTexto: string; fin: number } | null {
  const m = RE_FECHA.exec(textoBruto);
  if (!m) return null;
  const fechaTexto = m[1] ? `${m[1]}-${m[2]}-${m[3]}` : `${m[6]}-${m[5]}-${m[4]}`; // siempre YYYY-MM-DD
  return { fechaTexto, fin: m.index + m[0].length };
}

function parsearItem(bloque: string): ItemCrudo | null {
  const enlace = /<a href="([^"]+)"[^>]*target="_blank">([\s\S]*?)<\/a>/i.exec(bloque);
  const textoBruto = enlace ? enlace[2]! : bloque.split('</span>')[0]!;
  const planoUrl = enlace ? decodeEntities(enlace[1]!.trim()) : null;

  const fecha = extraerFecha(textoBruto);
  if (!fecha) return null;
  const descripcion = limpiarHtml(textoBruto.slice(fecha.fin));
  if (!descripcion) return null;

  return { fechaTexto: fecha.fechaTexto, descripcion, planoUrl };
}

/**
 * Parser por regex de las dos secciones — mismo estilo minimalista que
 * `avisos-meteo.ts`/`agenda-eventos.ts`. Cada sección es
 * `<h3 class="bloque_subtitulo">Incidencias|Previsiones</h3>` seguido de sus
 * ítems hasta el siguiente `<h3>` o el final del documento (verificado en
 * vivo — no delimitar por un cierre de `</div>` genérico, que aparece
 * repetido dentro de la propia sección y corta antes de tiempo).
 */
export function parsearAvisosMovilidad(html: string): { tipo: TipoAvisoMovilidad; item: ItemCrudo }[] {
  const resultado: { tipo: TipoAvisoMovilidad; item: ItemCrudo }[] = [];
  const partes = html.split(/<h3 class="bloque_subtitulo">([^<]+)<\/h3>/);
  for (let i = 1; i < partes.length; i += 2) {
    const tipo = TIPO_POR_TITULO[partes[i]!.trim()];
    if (!tipo) continue;
    for (const bloque of trocearItems(partes[i + 1] ?? '')) {
      const item = parsearItem(bloque);
      if (item) resultado.push({ tipo, item });
    }
  }
  return resultado;
}

function parsearFechaPublicacion(fechaTexto: string): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(fechaTexto);
  if (!m) return null;
  const fecha = new Date(`${m[1]}-${m[2]}-${m[3]}T00:00:00.000Z`);
  return Number.isNaN(fecha.getTime()) ? null : fecha.toISOString();
}

function normalizar(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();
}

/**
 * Resuelve `lugar`/`lat`/`lon` contra el lookup curado (spec 048 §3.1) —
 * primer alias que coincide como palabra completa, en el orden del propio
 * fichero (los más específicos van antes que los genéricos, ej. una calle
 * concreta antes que la instalación que la rodea). `null` si no hay ninguno.
 * Los alias se normalizan igual que el texto de entrada — el fichero puede
 * escribirse con o sin acentos indistintamente.
 */
export function resolverLugar(descripcion: string): { lugar: string; lat: number; lon: number } | null {
  const texto = normalizar(descripcion);
  for (const candidato of LUGARES) {
    for (const alias of candidato.alias) {
      const aliasNormalizado = normalizar(alias).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const patron = new RegExp(`\\b${aliasNormalizado}\\b`);
      if (patron.test(texto)) {
        return { lugar: candidato.lugar, lat: candidato.lat, lon: candidato.lon };
      }
    }
  }
  return null;
}

async function construirId(tipo: TipoAvisoMovilidad, fechaPublicacion: string, descripcion: string): Promise<string> {
  const datos = new TextEncoder().encode(`${tipo}|${fechaPublicacion}|${descripcion}`);
  const hash = await crypto.subtle.digest('SHA-1', datos);
  return [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, '0')).join('').slice(0, 16);
}

/** Ensambla el contrato final a partir de un ítem ya troceado. */
export async function construirAviso(
  tipo: TipoAvisoMovilidad,
  item: ItemCrudo,
  fetchedAt: string,
): Promise<AvisoMovilidad | null> {
  const fechaPublicacion = parsearFechaPublicacion(item.fechaTexto);
  if (!fechaPublicacion) return null;

  const lugarResuelto = resolverLugar(item.descripcion);

  return {
    id: await construirId(tipo, fechaPublicacion, item.descripcion),
    tipo,
    fechaPublicacion,
    descripcion: item.descripcion,
    planoUrl: item.planoUrl,
    lugar: lugarResuelto?.lugar ?? null,
    lat: lugarResuelto?.lat ?? null,
    lon: lugarResuelto?.lon ?? null,
    fetchedAt,
    source: 'ajuntament-valencia-movilidad-incidencias-previsiones',
  };
}

export async function fetchAvisosMovilidad(): Promise<SnapshotAvisosMovilidad> {
  const res = await fetch(URL_FUENTE_AVISOS_MOVILIDAD, { headers: HEADERS });
  if (!res.ok) {
    throw new Error(`valencia.es (incidencias y previsiones) respondió HTTP ${res.status}`);
  }
  const html = await res.text();
  const fetchedAt = new Date().toISOString();

  const crudos = parsearAvisosMovilidad(html);
  if (crudos.length === 0) {
    throw new Error('Sin ítems reconocidos en incidencias-y-previsiones — posible cambio de estructura de la fuente');
  }

  const avisos = (await Promise.all(crudos.map(({ tipo, item }) => construirAviso(tipo, item, fetchedAt))))
    .filter((a): a is AvisoMovilidad => a !== null)
    .sort((a, b) => b.fechaPublicacion.localeCompare(a.fechaPublicacion));

  return { avisos, fetchedAt };
}
