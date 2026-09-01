/**
 * Filtro Valencia-ciudad de la spec 009 §3.1 (v4). Determinista, sin IA, sin
 * llamadas externas: dado el titular + resumen de un ítem mediático (y las
 * menciones de distrito ya calculadas por la spec 023), decide si la noticia es
 * de la **ciudad** de València (`confirmado`), una mención genérica a València
 * sin barrio/hito (`general`, bucket visible) o algo de fuera (`excluido`, se
 * descarta antes de cachear).
 *
 * Se busca sobre el texto normalizado (NFD, sin acentos, minúsculas, separadores
 * colapsados a un espacio) por **palabra/frase completa** — no `normalizeForSearch`
 * de la spec 023, que elimina los espacios y abre la puerta a falsos positivos de
 * substring ("turia" dentro de "asturias").
 */

import lexico from '../../data/lexico-ambito-ciudad.json' with { type: 'json' };
import municipiosData from '../../data/municipios-provincia-valencia.json' with { type: 'json' };

export type AmbitoCiudad = 'confirmado' | 'general' | 'excluido';
export type CategoriaMediatica = 'general' | 'ocio' | 'deporte';

export interface ClasificacionAmbito {
  ambito: AmbitoCiudad;
  categoria: CategoriaMediatica;
  /** Traza legible del porqué — para tests y logs, no se muestra en la UI. */
  motivo: string;
}

export interface EntradaClasificacion {
  titulo: string;
  resumen: string | null;
  /** spec 023 — solo se usa `length > 0` y el nombre para el motivo. */
  distritosMencionados: ReadonlyArray<{ distritoNombre: string; coincidencia?: string }>;
  /** true si la fuente cubre exclusivamente la ciudad (ej. Valencia Plaza). */
  fuenteCityOnly: boolean;
  /** 'ocio' si la fuente es un medio temático de ocio/cultura de la ciudad. */
  categoriaFuente?: 'ocio';
}

function normalizar(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function escaparRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Lista de expresiones ya normalizadas (una sola vez al cargar el módulo). */
function preparar(lista: readonly string[]): string[] {
  return [...new Set(lista.map(normalizar).filter((s) => s.length > 0))];
}

const HITOS = preparar(lexico.hitosCiudad);
const INSTITUCION = preparar(lexico.marcadoresInstitucionCiudad);
const INFRA = preparar(lexico.infraAsociada);
const REGIONALES = preparar(lexico.marcadoresRegionales);
const DESAMBIGUACION = preparar(lexico.desambiguacion);
const DEPORTE_CRONICA = preparar(lexico.deporteCronica);
const DEPORTE_LOGISTICO = preparar(lexico.deporteLogistico);
const PREPOSICIONES = preparar(lexico.preposicionesLocativas);

interface MunicipioNorm {
  etiqueta: string;
  patrones: string[];
  ambiguo: boolean;
}

const MUNICIPIOS: MunicipioNorm[] = municipiosData.municipios.map((m) => ({
  etiqueta: m.nombre,
  patrones: preparar([m.nombre, ...(m.alias ?? [])]),
  ambiguo: (m as { ambiguo?: boolean }).ambiguo === true,
}));

const RE_PREPOSICION = new RegExp(`(?:^| )(?:${PREPOSICIONES.join('|')}) $`);

/** ¿Aparece `expr` (ya normalizada) como palabra/frase completa en el texto? */
function contiene(textoPad: string, expr: string): boolean {
  return textoPad.includes(` ${expr} `);
}

function primeraCoincidencia(textoPad: string, exprs: readonly string[]): string | null {
  for (const expr of exprs) {
    if (contiene(textoPad, expr)) return expr;
  }
  return null;
}

/** Un nombre `ambiguo` (silla, oliva...) solo cuenta si va tras preposición locativa. */
function coincideAmbiguo(textoNorm: string, patron: string): boolean {
  const re = new RegExp(`(?:^| )${escaparRegex(patron)}(?: |$)`, 'g');
  for (let m = re.exec(textoNorm); m !== null; m = re.exec(textoNorm)) {
    const prefijo = textoNorm.slice(0, m.index + 1); // incluye el espacio inicial capturado
    if (RE_PREPOSICION.test(prefijo)) return true;
  }
  return false;
}

function municipioMencionado(textoNorm: string, textoPad: string): string | null {
  for (const municipio of MUNICIPIOS) {
    for (const patron of municipio.patrones) {
      const hit = municipio.ambiguo
        ? coincideAmbiguo(textoNorm, patron)
        : contiene(textoPad, patron);
      if (hit) return municipio.etiqueta;
    }
  }
  return null;
}

function mencionaValencia(textoPad: string): boolean {
  return contiene(textoPad, 'valencia') || contiene(textoPad, 'valencia ciutat') || contiene(textoPad, 'valencia capital');
}

/**
 * spec 009 §3.1 — orden de evaluación:
 *   señal positiva fuerte  -> confirmado (gana sobre cualquier negativa)
 *   desambiguación / municipio ajeno / marcador regional -> excluido
 *   deporte solo-crónica (sin componente logístico) -> excluido
 *   fuente 100% ciudad -> confirmado
 *   menciona València -> general (bucket visible)
 *   nada -> excluido
 */
export function clasificarAmbitoCiudad(entrada: EntradaClasificacion): ClasificacionAmbito {
  const textoNorm = normalizar(`${entrada.titulo} ${entrada.resumen ?? ''}`);
  const textoPad = ` ${textoNorm} `;

  const hitLogistico = primeraCoincidencia(textoPad, DEPORTE_LOGISTICO);
  const hitCronica = primeraCoincidencia(textoPad, DEPORTE_CRONICA);
  const esDeporte = hitLogistico !== null || hitCronica !== null;
  const soloCronica = hitCronica !== null && hitLogistico === null;

  const categoria: CategoriaMediatica = esDeporte
    ? 'deporte'
    : entrada.categoriaFuente === 'ocio'
      ? 'ocio'
      : 'general';

  // 1. Señales positivas fuertes.
  if (entrada.distritosMencionados.length > 0) {
    const nombres = entrada.distritosMencionados.map((d) => d.distritoNombre).join(', ');
    return { ambito: 'confirmado', categoria, motivo: `distrito/barrio: ${nombres}` };
  }
  const hito = primeraCoincidencia(textoPad, HITOS);
  if (hito) return { ambito: 'confirmado', categoria, motivo: `hito de ciudad: ${hito}` };
  const institucion = primeraCoincidencia(textoPad, INSTITUCION);
  if (institucion) return { ambito: 'confirmado', categoria, motivo: `institución de ciudad: ${institucion}` };
  const infra = primeraCoincidencia(textoPad, INFRA);
  if (infra) return { ambito: 'confirmado', categoria, motivo: `infraestructura asociada: ${infra}` };

  // 2. Señales negativas.
  const desambiguacion = primeraCoincidencia(textoPad, DESAMBIGUACION);
  if (desambiguacion) return { ambito: 'excluido', categoria, motivo: `desambiguación: ${desambiguacion}` };
  const municipio = municipioMencionado(textoNorm, textoPad);
  if (municipio) return { ambito: 'excluido', categoria, motivo: `municipio ajeno: ${municipio}` };
  const regional = primeraCoincidencia(textoPad, REGIONALES);
  if (regional) return { ambito: 'excluido', categoria, motivo: `ámbito regional: ${regional}` };

  // 3. Deporte de pura crónica (sin componente logístico de ciudad).
  if (soloCronica) {
    return { ambito: 'excluido', categoria, motivo: `deporte (crónica): ${hitCronica}` };
  }

  // 4. Fuente que solo cubre la ciudad.
  if (entrada.fuenteCityOnly) {
    return { ambito: 'confirmado', categoria, motivo: 'fuente 100% ciudad' };
  }

  // 5. Mención genérica a València.
  if (mencionaValencia(textoPad)) {
    return { ambito: 'general', categoria, motivo: 'menciona València, sin barrio ni hito' };
  }

  return { ambito: 'excluido', categoria, motivo: 'sin señal de Valencia ciudad' };
}
