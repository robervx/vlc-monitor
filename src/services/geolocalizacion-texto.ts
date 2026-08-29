/**
 * Contrato y matching de la spec 023 (specs/023-geolocalizacion-contexto-mediatico.md §3).
 * Matching de texto determinista contra distritos/barrios ya cargados — sin NER,
 * sin modelo de lenguaje, sin llamadas externas. Ver spec §2 para la revisión de
 * ambigüedad y §3 para las reglas de matching exactas.
 */

import { getLoadedDistricts, normalizeForSearch } from './district-geometry';

export interface DistritoMencion {
  distritoCodigo: string;
  distritoNombre: string;
  coincidencia: 'distrito' | 'barrio';
  textoCoincidente: string;
  bajaConfianza: boolean;
}

interface Patron {
  normalizado: string;
  distritoCodigo: string;
  distritoNombre: string;
  tipo: 'distrito' | 'barrio';
  textoOriginal: string;
  ambiguo: boolean;
}

/** Marcadores geográficos que habilitan un match de un nombre `ambiguo` — spec 023 §3. */
const MARCADORES_CONTEXTO = [
  'barrio de',
  'districte de',
  'distrito de',
  'zona de',
  'vecinos de',
  'residentes de',
].map(normalizeForSearch);

let tablaPatrones: Patron[] | null = null;

function construirTablaPatrones(): Patron[] {
  const patrones: Patron[] = [];

  for (const distrito of getLoadedDistricts()) {
    patrones.push({
      normalizado: normalizeForSearch(distrito.nombre),
      distritoCodigo: distrito.codigo,
      distritoNombre: distrito.nombre,
      tipo: 'distrito',
      textoOriginal: distrito.nombre,
      ambiguo: distrito.ambiguo === true,
    });

    for (const barrio of distrito.barrios) {
      for (const texto of [barrio.nombre, ...barrio.alias]) {
        patrones.push({
          normalizado: normalizeForSearch(texto),
          distritoCodigo: distrito.codigo,
          distritoNombre: distrito.nombre,
          tipo: 'barrio',
          textoOriginal: texto,
          ambiguo: barrio.ambiguo,
        });
      }
    }
  }

  // Patrones más largos primero: prioriza coincidencias más específicas cuando
  // un patrón corto es substring de uno más largo (spec 023 §3).
  return patrones
    .filter((p) => p.normalizado.length > 0)
    .sort((a, b) => b.normalizado.length - a.normalizado.length);
}

function getTablaPatrones(): Patron[] {
  if (!tablaPatrones) {
    tablaPatrones = construirTablaPatrones();
  }
  return tablaPatrones;
}

/** Fuerza reconstruir la tabla en el siguiente uso — para tests que cambian los distritos cargados. */
export function resetTablaPatronesGeolocalizacion(): void {
  tablaPatrones = null;
}

function tieneMarcadorContextoAntesDe(textoNormalizado: string, index: number): boolean {
  const prefijo = textoNormalizado.slice(0, index);
  return MARCADORES_CONTEXTO.some((marcador) => prefijo.endsWith(marcador));
}

/**
 * Busca menciones de distrito/barrio en un texto libre (título + resumen de una
 * noticia, por ejemplo). Determinista, sin llamadas externas — spec 023 §3.
 */
export function findDistrictMentions(texto: string): DistritoMencion[] {
  const normalizado = normalizeForSearch(texto);
  if (!normalizado) return [];

  const porDistrito = new Map<string, DistritoMencion>();

  for (const patron of getTablaPatrones()) {
    const index = normalizado.indexOf(patron.normalizado);
    if (index === -1) continue;

    let bajaConfianza = false;
    if (patron.ambiguo) {
      if (!tieneMarcadorContextoAntesDe(normalizado, index)) continue;
      bajaConfianza = true;
    }

    const existente = porDistrito.get(patron.distritoCodigo);
    // Dedup spec 023 §3: un match de 'barrio' ya registrado no lo pisa un match
    // de 'distrito' más genérico para el mismo distrito.
    if (existente?.coincidencia === 'barrio' && patron.tipo === 'distrito') continue;

    porDistrito.set(patron.distritoCodigo, {
      distritoCodigo: patron.distritoCodigo,
      distritoNombre: patron.distritoNombre,
      coincidencia: patron.tipo,
      textoCoincidente: patron.textoOriginal,
      bajaConfianza,
    });
  }

  return [...porDistrito.values()];
}
