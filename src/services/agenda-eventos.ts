/**
 * Agenda general de eventos culturales — spec 027.
 *
 * Núcleo puro y sin red: normaliza lo que el scraper de Playwright
 * (`scripts/scrape-agenda-eventos.ts`, corre en GitHub Actions) extrae de
 * `valencia.es/cas/agenda-de-la-ciudad`, y decide cuándo un snapshot es
 * sospechoso de estructura rota (spec 027 §4). El endpoint
 * `GET /api/agenda/v1/eventos` solo sirve el snapshot ya cacheado; nunca
 * lanza el navegador.
 *
 * Contrato de datos en spec 027 §3; contrato técnico verificado (selectores,
 * formatos de fecha) en spec 027 §2.1.
 */

import { findDistrictMentions, type DistritoMencion } from './geolocalizacion-texto';

export interface EventoAgenda {
  /** Slug de la URL de ficha (`/-/content/<slug>`), estable entre refrescos. */
  id: string;
  titulo: string;
  /** Categoría tal cual la sirve la web (mayúsculas): "EXPOSICIONES", "CIRCO"… */
  categoria: string;
  /** ISO 8601 (fecha, sin hora). null si no se pudo parsear. */
  fechaInicio: string | null;
  fechaFin: string | null;
  /** Primeros ~300 car. de la descripción de la ficha — nunca el texto íntegro (spec 027 §7). */
  resumen: string | null;
  /** Enlace a la ficha oficial; se abre en el Ayuntamiento, no se reproduce el resto. */
  url: string;
  /** Spec 023 — [] si no menciona ningún distrito/barrio explícito. */
  distritosMencionados: DistritoMencion[];
  fetchedAt: string;
  source: 'ajuntament-valencia-scraping';
}

/** Lo que el scraper extrae antes de normalizar. Campos opcionales = "no se encontró en el DOM". */
export interface EventoAgendaCrudo {
  url: string;
  titulo?: string | null;
  categoria?: string | null;
  /** Texto crudo del rango de fechas del listado ("DD/MM/YYYY - DD/MM/YYYY"). */
  fechasListado?: string | null;
  /** Texto crudo del rango de fechas de la ficha ("FECHA: DD mmm YYYY - DD mmm YYYY"). */
  fechasFicha?: string | null;
  /** Texto ya unido de los párrafos de descripción de la ficha. */
  descripcion?: string | null;
}

export interface SnapshotAgenda {
  eventos: EventoAgenda[];
  /** ISO — cuándo terminó el scraping que produjo este snapshot. */
  generadoEn: string;
  /** Nº de páginas del listado que el scraper recorrió. */
  paginasLeidas: number;
  /**
   * true si el scraping respondió pero la estructura parece haber cambiado
   * (0 eventos con snapshot previo no vacío, o demasiados sin título/fecha).
   * La UI lo refleja en vez de mostrar datos viejos como recientes (spec 027 §4/§6).
   */
  estructuraSospechosa: boolean;
}

export const SNAPSHOT_AGENDA_VACIO: SnapshotAgenda = {
  eventos: [],
  generadoEn: '1970-01-01T00:00:00.000Z',
  paginasLeidas: 0,
  estructuraSospechosa: false,
};

const LONGITUD_RESUMEN = 300;

/** Proporción de crudos sin título o sin fecha por encima de la cual el snapshot es sospechoso. */
const UMBRAL_CRUDOS_INVALIDOS = 0.3;

const MESES_ES: Record<string, number> = {
  ene: 1, enero: 1,
  feb: 2, febrero: 2,
  mar: 3, marzo: 3,
  abr: 4, abril: 4,
  may: 5, mayo: 5,
  jun: 6, junio: 6,
  jul: 7, julio: 7,
  ago: 8, agosto: 8,
  sep: 9, sept: 9, septiembre: 9,
  oct: 10, octubre: 10,
  nov: 11, noviembre: 11,
  dic: 12, diciembre: 12,
};

function iso(anio: number, mes: number, dia: number): string | null {
  if (mes < 1 || mes > 12 || dia < 1 || dia > 31) return null;
  const mm = String(mes).padStart(2, '0');
  const dd = String(dia).padStart(2, '0');
  const fecha = new Date(`${anio}-${mm}-${dd}T00:00:00Z`);
  if (Number.isNaN(fecha.getTime()) || fecha.getUTCDate() !== dia) return null;
  return `${anio}-${mm}-${dd}`;
}

/** "DD/MM/YYYY" (formato del listado) → "YYYY-MM-DD". */
export function parseFechaListado(texto: string): string | null {
  const m = texto.trim().match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (!m) return null;
  return iso(Number(m[3]), Number(m[2]), Number(m[1]));
}

/** "DD mmm YYYY" con mes abreviado o completo en español (formato de la ficha) → "YYYY-MM-DD". */
export function parseFechaFicha(texto: string): string | null {
  const m = texto
    .trim()
    .toLowerCase()
    .match(/(\d{1,2})\s+([a-záéíóú]+)\.?\s+(\d{4})/);
  if (!m) return null;
  const mes = MESES_ES[m[2]!];
  if (!mes) return null;
  return iso(Number(m[3]), mes, Number(m[1]!));
}

/**
 * Parte un texto de rango ("X - Y", "X – Y", o un solo valor) y aplica `parse`
 * a cada extremo. Si solo hay una fecha, inicio y fin son la misma.
 */
export function parseRangoFechas(
  texto: string | null | undefined,
  parse: (s: string) => string | null,
): { inicio: string | null; fin: string | null } {
  if (!texto) return { inicio: null, fin: null };
  const limpio = texto.replace(/^\s*FECHA:\s*/i, '').trim();
  const partes = limpio.split(/\s+[-–—]\s+/);
  const inicio = parse(partes[0] ?? '');
  const fin = partes[1] != null ? parse(partes[1]) : inicio;
  return { inicio, fin };
}

/** Slug estable = último segmento no vacío de la URL de ficha. */
export function slugDeUrlFicha(url: string): string {
  const sinQuery = url.split(/[?#]/)[0] ?? url;
  const segmentos = sinQuery.split('/').filter(Boolean);
  return segmentos[segmentos.length - 1] ?? sinQuery;
}

/** Colapsa espacios y recorta a `max` caracteres en un límite de palabra, con "…". */
export function recortarResumen(texto: string | null | undefined, max = LONGITUD_RESUMEN): string | null {
  if (!texto) return null;
  const limpio = texto.replace(/\s+/g, ' ').trim();
  if (!limpio) return null;
  if (limpio.length <= max) return limpio;
  const cortado = limpio.slice(0, max);
  const ultimoEspacio = cortado.lastIndexOf(' ');
  return `${(ultimoEspacio > max * 0.6 ? cortado.slice(0, ultimoEspacio) : cortado).trimEnd()}…`;
}

function crudoEsUtilizable(crudo: EventoAgendaCrudo): boolean {
  const tieneTitulo = !!crudo.titulo && crudo.titulo.trim().length > 0;
  const tieneFecha = !!crudo.fechasListado || !!crudo.fechasFicha;
  return tieneTitulo && tieneFecha;
}

/** Normaliza un crudo del scraper al contrato de §3. Devuelve null si no es utilizable. */
export function normalizarEvento(crudo: EventoAgendaCrudo, fetchedAt: string): EventoAgenda | null {
  if (!crudoEsUtilizable(crudo)) return null;

  // El listado da "DD/MM/YYYY"; la ficha "DD mmm YYYY". Se prefiere el que haya.
  const { inicio, fin } = crudo.fechasFicha
    ? parseRangoFechas(crudo.fechasFicha, parseFechaFicha)
    : parseRangoFechas(crudo.fechasListado, parseFechaListado);

  const titulo = crudo.titulo!.replace(/\s+/g, ' ').trim();
  const resumen = recortarResumen(crudo.descripcion);

  return {
    id: slugDeUrlFicha(crudo.url),
    titulo,
    categoria: (crudo.categoria ?? '').replace(/\s+/g, ' ').trim().toUpperCase(),
    fechaInicio: inicio,
    fechaFin: fin,
    resumen,
    url: crudo.url,
    distritosMencionados: findDistrictMentions(`${titulo} ${resumen ?? ''}`),
    fetchedAt,
    source: 'ajuntament-valencia-scraping',
  };
}

/**
 * Construye el snapshot a partir de los crudos del scraper y el snapshot previo.
 * Reglas de resiliencia (spec 027 §4):
 *  - 0 crudos y el previo tenía eventos → NO se sobrescribe: se conservan los
 *    eventos viejos y se marca `estructuraSospechosa`.
 *  - crudos presentes pero > `UMBRAL_CRUDOS_INVALIDOS` sin título/fecha → sospechoso
 *    (los selectores probablemente cambiaron), se conserva el previo si lo hay.
 *  - caso normal → snapshot nuevo con los eventos normalizados.
 */
export function construirSnapshot(
  crudos: EventoAgendaCrudo[],
  previo: SnapshotAgenda,
  opciones: { generadoEn: string; paginasLeidas: number },
): SnapshotAgenda {
  const { generadoEn, paginasLeidas } = opciones;
  const previoTieneEventos = previo.eventos.length > 0;

  if (crudos.length === 0) {
    return previoTieneEventos
      ? { ...previo, generadoEn, paginasLeidas, estructuraSospechosa: true }
      : { eventos: [], generadoEn, paginasLeidas, estructuraSospechosa: false };
  }

  const invalidos = crudos.filter((c) => !crudoEsUtilizable(c)).length;
  const proporcionInvalidos = invalidos / crudos.length;

  const eventos = crudos
    .map((c) => normalizarEvento(c, generadoEn))
    .filter((e): e is EventoAgenda => e !== null)
    // Un slug duplicado (mismo evento en dos páginas por reordenación entre clics) → el primero gana.
    .filter((e, i, arr) => arr.findIndex((o) => o.id === e.id) === i)
    .sort((a, b) => (a.fechaInicio ?? '').localeCompare(b.fechaInicio ?? '') || a.titulo.localeCompare(b.titulo));

  if (proporcionInvalidos > UMBRAL_CRUDOS_INVALIDOS) {
    return previoTieneEventos
      ? { ...previo, generadoEn, paginasLeidas, estructuraSospechosa: true }
      : { eventos, generadoEn, paginasLeidas, estructuraSospechosa: true };
  }

  return { eventos, generadoEn, paginasLeidas, estructuraSospechosa: false };
}
