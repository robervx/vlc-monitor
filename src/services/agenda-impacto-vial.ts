/**
 * Eventos con impacto en vía pública — spec 027 v4 (specs/027-agenda-eventos-scraping.md
 * §9): fútbol de Valencia CF/Levante UD como local, conciertos/eventos grandes del Roig
 * Arena, carreras populares de la Fundación Deportiva Municipal. Cuatro fuentes nuevas y
 * distintas de valencia.es (v1-v3), todas verificadas en vivo el 2026-09-17: ninguna
 * necesita navegador — HTML plano vía `fetch()` simple, sin WAF ni renderizado JS
 * (a diferencia de valencia.es). El scraping real (fetch, red) vive en
 * `scripts/scrape-agenda-eventos.ts` — este módulo solo transforma lo que el script ya
 * extrajo del HTML/JSON.
 */
import { findDistrictMentions } from './geolocalizacion-texto';
import type { EventoAgenda } from './agenda-eventos';

const LONGITUD_RESUMEN = 300;
function recortar(texto: string): string {
  return texto.length <= LONGITUD_RESUMEN ? texto : `${texto.slice(0, LONGITUD_RESUMEN).trimEnd()}…`;
}

/**
 * Los calendarios de LaLiga (VCF/Levante) no siempre incluyen el año en el texto de
 * fecha. Infiere el año a partir de `ahora`: si la fecha resultante con el año actual
 * queda más de 30 días en el pasado, asume que es del año siguiente (temporada que cruza
 * el cambio de año).
 */
export function inferirAnio(mes: number, dia: number, ahora: Date): number {
  const candidato = new Date(Date.UTC(ahora.getUTCFullYear(), mes - 1, dia));
  const diffDias = (ahora.getTime() - candidato.getTime()) / 86_400_000;
  return diffDias > 30 ? ahora.getUTCFullYear() + 1 : ahora.getUTCFullYear();
}

// ---------------------------------------------------------------------------
// Valencia CF — https://www.valenciacf.com/resultados?range=next
// Verificado en vivo 2026-09-17: HTML servido a `fetch` simple (curl), sin JS.
// robots.txt sin ningún Disallow. Selectores: `card-game__date__date` ("dom. 20 sep. /
// Jor. 7"), `card-game__date__location` ("Mestalla" en los partidos como local),
// `card-game__teams__name--left/right`, `card-game__teams__time` ("21:00").
// ---------------------------------------------------------------------------

const MESES_ABREV_ES: Record<string, number> = {
  ene: 1,
  feb: 2,
  mar: 3,
  abr: 4,
  may: 5,
  jun: 6,
  jul: 7,
  ago: 8,
  sep: 9,
  oct: 10,
  nov: 11,
  dic: 12,
};

export interface DatoCrudoPartidoVCF {
  fechaTexto: string; // "dom. 20 sep. / Jor. 7 " (card-game__date__date, tal cual)
  ubicacion: string; // "Mestalla" | "El Sardinero" | ... (card-game__date__location)
  equipoIzquierda: string;
  equipoDerecha: string;
  hora: string; // "21:00" (card-game__teams__time, unidos los dos <span>)
}

const ESTADIO_MESTALLA = 'Mestalla';

/** Filtra a los partidos como local (ubicacion === "Mestalla") y normaliza al contrato. */
export function construirEventosValenciaCF(crudos: DatoCrudoPartidoVCF[], fetchedAt: string, ahora = new Date()): EventoAgenda[] {
  const eventos: EventoAgenda[] = [];
  for (const crudo of crudos) {
    if (crudo.ubicacion.trim() !== ESTADIO_MESTALLA) continue; // solo como local
    const m = crudo.fechaTexto.match(/(\d{1,2})\s+([a-zé]{3})\.?\s*\/\s*Jor\.\s*(\d+)/i);
    if (!m) continue; // estructura cambiada
    const [, diaStr, mesAbrev, jornada] = m;
    const mes = MESES_ABREV_ES[mesAbrev!.toLowerCase()];
    if (!mes) continue;
    const dia = Number(diaStr);
    const anio = inferirAnio(mes, dia, ahora);
    const horaMatch = crudo.hora.match(/(\d{1,2}):(\d{2})/);
    const [hh, mm] = horaMatch ? [horaMatch[1]!, horaMatch[2]!] : ['21', '00'];
    const fechaIso = new Date(Date.UTC(anio, mes - 1, dia, Number(hh) - 1, Number(mm))).toISOString(); // hora local ES ~ UTC+1/+2, se aproxima a CET
    const rival = crudo.equipoIzquierda === 'Valencia CF' ? crudo.equipoDerecha : crudo.equipoIzquierda;
    const titulo = `Valencia CF vs ${rival}`;
    const resumen = recortar(`Jornada ${jornada} de LaLiga en Mestalla. Valencia CF - ${rival}, ${hh}:${mm}h.`);
    eventos.push({
      id: `vcf-jor${jornada}-${anio}${String(mes).padStart(2, '0')}${String(dia).padStart(2, '0')}`,
      titulo,
      categoria: 'FÚTBOL',
      fechaInicio: fechaIso,
      fechaFin: fechaIso,
      resumen,
      url: 'https://www.valenciacf.com/resultados',
      distritosMencionados: findDistrictMentions(`${titulo} Mestalla`),
      fetchedAt,
      source: 'valencia-cf-scraping',
      impactoViaPublica: true,
    });
  }
  return eventos;
}

// ---------------------------------------------------------------------------
// Levante UD — https://www.levanteud.com/partidos
// Verificado en vivo 2026-09-17: HTML servido a `fetch` simple, sin JS. robots.txt
// (`User-agent: *`) excluye solo /api/, /preview/, /_next/ — /partidos no está
// restringido. El HTML incluye un bloque `<script id="__NEXT_DATA__">` con la
// temporada completa (38 jornadas) en JSON estructurado: `venue.name`,
// `homeTeam`/`awayTeam`, `time` (ISO, null si aún no está confirmada por LaLiga).
// ---------------------------------------------------------------------------

const ESTADI_CIUTAT_DE_VALENCIA = 'Ciutat de Valencia';

export interface DatoCrudoPartidoLevante {
  id: string;
  homeTeamName: string;
  awayTeamName: string;
  venueName: string | null;
  gameweekName: string | null; // "Jornada 8"
  time: string | null; // ISO 8601, null si sin confirmar
}

/** Filtra a los partidos como local con fecha ya confirmada por LaLiga. */
export function construirEventosLevante(crudos: DatoCrudoPartidoLevante[], fetchedAt: string): EventoAgenda[] {
  const eventos: EventoAgenda[] = [];
  for (const crudo of crudos) {
    if (crudo.venueName !== ESTADI_CIUTAT_DE_VALENCIA) continue; // solo como local
    if (!crudo.time) continue; // LaLiga no ha confirmado fecha/hora todavía
    const fecha = new Date(crudo.time);
    if (Number.isNaN(fecha.getTime())) continue;
    const titulo = `Levante UD vs ${crudo.awayTeamName}`;
    const jornadaTxt = crudo.gameweekName ?? 'LaLiga';
    const hora = fecha.toISOString().slice(11, 16);
    const resumen = recortar(`${jornadaTxt} de LaLiga en el Ciutat de València. Levante UD - ${crudo.awayTeamName}, ${hora}h.`);
    eventos.push({
      id: `levante-${crudo.id}`,
      titulo,
      categoria: 'FÚTBOL',
      fechaInicio: fecha.toISOString(),
      fechaFin: fecha.toISOString(),
      resumen,
      url: 'https://www.levanteud.com/partidos',
      distritosMencionados: findDistrictMentions(`${titulo} Ciutat de Valencia`),
      fetchedAt,
      source: 'levante-ud-scraping',
      impactoViaPublica: true,
    });
  }
  return eventos;
}

// ---------------------------------------------------------------------------
// Roig Arena — https://www.roigarena.com/es/eventos/
// Verificado en vivo 2026-09-17: HTML servido a `fetch` simple (Nuxt SSR), sin JS.
// robots.txt fully abierto. El HTML incluye un `<script id="__NUXT_DATA__">` con un
// payload "devalue" (array plano con referencias por índice) — en vez de decodificarlo
// genéricamente, se escanea el array buscando objetos con la forma de un evento
// (name/start/locationName/slug/category), resolviendo cada campo por su índice.
// ---------------------------------------------------------------------------

interface DescriptorEventoRoigArena {
  name: unknown;
  start: unknown;
  end: unknown;
  locationName: unknown;
  slug: unknown;
  category: unknown;
  id: unknown;
}

function esDescriptorEvento(v: unknown): v is DescriptorEventoRoigArena {
  if (typeof v !== 'object' || v === null) return false;
  const d = v as Record<string, unknown>;
  return (
    typeof d.start === 'number' &&
    typeof d.locationName === 'number' &&
    typeof d.slug === 'number' &&
    typeof d.category === 'number' &&
    typeof d.name === 'number'
  );
}

/** Resuelve el valor apuntado por un índice del payload "devalue" de Nuxt. */
function resolverIndice(payload: unknown[], idx: unknown): unknown {
  if (typeof idx !== 'number' || idx < 0 || idx >= payload.length) return null;
  const v = payload[idx];
  if (Array.isArray(v) && v.length === 1 && typeof v[0] === 'number') return payload[v[0]];
  return v;
}

export interface DatoCrudoEventoRoigArena {
  nombre: string;
  inicio: string;
  fin: string | null;
  ubicacion: string;
  slug: string;
  categoria: string;
  id: string;
}

/** Escanea el payload `__NUXT_DATA__` (ya parseado con `JSON.parse`) y extrae los eventos. */
export function extraerEventosCrudosRoigArena(payload: unknown[]): DatoCrudoEventoRoigArena[] {
  const resultado: DatoCrudoEventoRoigArena[] = [];
  const vistos = new Set<string>();
  for (const item of payload) {
    if (!esDescriptorEvento(item)) continue;
    const nombre = resolverIndice(payload, item.name);
    const inicio = resolverIndice(payload, item.start);
    const ubicacion = resolverIndice(payload, item.locationName);
    const slug = resolverIndice(payload, item.slug);
    const categoria = resolverIndice(payload, item.category);
    const id = resolverIndice(payload, item.id);
    const fin = resolverIndice(payload, item.end);
    if (
      typeof nombre !== 'string' ||
      typeof inicio !== 'string' ||
      typeof ubicacion !== 'string' ||
      typeof slug !== 'string' ||
      typeof categoria !== 'string' ||
      typeof id !== 'string'
    ) {
      continue;
    }
    if (vistos.has(id)) continue;
    vistos.add(id);
    resultado.push({ nombre, inicio, fin: typeof fin === 'string' ? fin : null, ubicacion, slug, categoria, id });
  }
  return resultado;
}

export function construirEventosRoigArena(crudos: DatoCrudoEventoRoigArena[], fetchedAt: string): EventoAgenda[] {
  const eventos: EventoAgenda[] = [];
  for (const crudo of crudos) {
    const inicio = new Date(crudo.inicio);
    if (Number.isNaN(inicio.getTime())) continue;
    const fin = crudo.fin ? new Date(crudo.fin) : inicio;
    const resumen = recortar(`${crudo.categoria} en ${crudo.ubicacion}.`);
    eventos.push({
      id: `roigarena-${crudo.slug}`,
      titulo: crudo.nombre,
      categoria: crudo.categoria.toUpperCase(),
      fechaInicio: inicio.toISOString(),
      fechaFin: Number.isNaN(fin.getTime()) ? inicio.toISOString() : fin.toISOString(),
      resumen,
      url: `https://www.roigarena.com/es/event/${crudo.slug}/`,
      distritosMencionados: findDistrictMentions(`${crudo.nombre} Roig Arena Quatre Carreres`),
      fetchedAt,
      source: 'roig-arena-scraping',
      impactoViaPublica: true,
    });
  }
  return eventos;
}

// ---------------------------------------------------------------------------
// Fundación Deportiva Municipal (FDM) — carreras populares
// https://www.fdmvalencia.es/es/tipos-eventos/carrera-populares/page/N/
// Verificado en vivo 2026-09-17: WordPress + plugin Events Manager, HTML plano, sin
// JS. robots.txt solo excluye /wp-admin/. Estructura: `.event-title a` (título + url),
// `.event-time` (dos spans: "DD Mon YYYY" y "HH:MM - HH:MM").
// ---------------------------------------------------------------------------

const MESES_CORTOS_ES: Record<string, number> = {
  Ene: 1,
  Feb: 2,
  Mar: 3,
  Abr: 4,
  May: 5,
  Jun: 6,
  Jul: 7,
  Ago: 8,
  Sep: 9,
  Oct: 10,
  Nov: 11,
  Dic: 12,
};

export interface DatoCrudoCarreraFDM {
  titulo: string;
  url: string;
  fechaTexto: string; // "04 Oct 2026"
  horaTexto: string | null; // "10:00  - 11:00"
}

/** Solo carreras con fecha futura respecto a `ahora` (la categoría del sitio mezcla pasadas y futuras, sin orden cronológico). */
export function construirEventosCarrerasFDM(crudos: DatoCrudoCarreraFDM[], fetchedAt: string, ahora = new Date()): EventoAgenda[] {
  const eventos: EventoAgenda[] = [];
  for (const crudo of crudos) {
    const m = crudo.fechaTexto.match(/(\d{1,2})\s+([A-Za-zé]{3})\s+(\d{4})/);
    if (!m) continue;
    const [, diaStr, mesAbrev, anioStr] = m;
    const mes = MESES_CORTOS_ES[mesAbrev!.slice(0, 1).toUpperCase() + mesAbrev!.slice(1, 3).toLowerCase()];
    if (!mes) continue;
    const dia = Number(diaStr);
    const anio = Number(anioStr);
    const horaMatch = crudo.horaTexto?.match(/(\d{1,2}):(\d{2})/);
    const [hh, mm] = horaMatch ? [horaMatch[1]!, horaMatch[2]!] : ['09', '00'];
    const fecha = new Date(Date.UTC(anio, mes - 1, dia, Number(hh) - 1, Number(mm)));
    if (Number.isNaN(fecha.getTime())) continue;
    if (fecha.getTime() < ahora.getTime() - 86_400_000) continue; // ya pasó, salvo margen de un día
    const slug = crudo.url.split('/').filter(Boolean).pop() ?? crudo.titulo;
    const resumen = recortar(`Carrera popular organizada por la Fundación Deportiva Municipal de València.`);
    eventos.push({
      id: `fdm-${slug}`,
      titulo: crudo.titulo,
      categoria: 'CARRERAS',
      fechaInicio: fecha.toISOString(),
      fechaFin: fecha.toISOString(),
      resumen,
      url: crudo.url,
      distritosMencionados: findDistrictMentions(crudo.titulo),
      fetchedAt,
      source: 'fdm-valencia-carreras-scraping',
      impactoViaPublica: true,
    });
  }
  return eventos;
}
