/**
 * Deduplicación de titulares para `GET /api/mediatico/v1/items` (spec 009 §4).
 *
 * Tres pasadas, sobre una lista ya ordenada por fecha desc (se queda el primero
 * -> el más reciente):
 *   1. URL exacta.
 *   2. Titular normalizado idéntico (misma noticia por dos fuentes distintas).
 *   3. **Cross-idioma del mismo medio**: Levante-EMV (y antes À Punt) publica cada
 *      noticia en valenciano y en castellano con URLs y titulares distintos pero
 *      con los mismos nombres propios / palabras clave, que en VA/ES suelen ser
 *      cognados ("Mercat/Mercado Central", "climatització/climatización"). Se
 *      comparan los tokens significativos con un match difuso por prefijo /
 *      distancia de edición corta; determinista, sin modelo de traducción.
 */

import type { ItemMediatico } from './mediatico';

const STOPWORDS = new Set([
  'de', 'del', 'dels', 'la', 'el', 'els', 'les', 'lo', 'los', 'las', 'un', 'una', 'uns', 'unes',
  'y', 'i', 'o', 'en', 'a', 'al', 'als', 'con', 'amb', 'per', 'por', 'para', 'que', 'se', 'su',
  'sus', 'the', 'of', 'and', 'este', 'esta', 'estos', 'estas', 'aquest', 'aquesta', 'more',
]);

/** Ventana temporal dentro de la que dos titulares del mismo medio pueden ser el mismo. */
const VENTANA_MISMA_NOTICIA_MS = 36 * 60 * 60 * 1000;

export function normalizarTitulo(titulo: string): string {
  return titulo
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function tokensSignificativos(titulo: string): string[] {
  return normalizarTitulo(titulo)
    .split(' ')
    .filter((t) => t.length >= 5 && !STOPWORDS.has(t));
}

/** Distancia de Levenshtein acotada — devuelve `limite + 1` si se pasa. */
function distanciaAcotada(a: string, b: string, limite: number): number {
  if (Math.abs(a.length - b.length) > limite) return limite + 1;
  const fila = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let prev = fila[0]!;
    fila[0] = i;
    let minFila = fila[0];
    for (let j = 1; j <= b.length; j++) {
      const actual = fila[j]!;
      fila[j] = Math.min(
        fila[j]! + 1,
        fila[j - 1]! + 1,
        prev + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
      prev = actual;
      if (fila[j]! < minFila) minFila = fila[j]!;
    }
    if (minFila > limite) return limite + 1;
  }
  return fila[b.length]!;
}

/** Dos tokens "iguales" salvo variación morfológica VA/ES (climatització ~ climatización). */
function tokenSimilar(a: string, b: string): boolean {
  if (a === b) return true;
  if (Math.min(a.length, b.length) < 5) return false;
  const pref = 5;
  if (a.slice(0, pref) === b.slice(0, pref) && Math.abs(a.length - b.length) <= 3) return true;
  return distanciaAcotada(a, b, 2) <= 2;
}

/** ¿`a` y `b` son la misma noticia en dos idiomas del mismo medio? */
export function esMismaNoticiaCrossIdioma(a: ItemMediatico, b: ItemMediatico): boolean {
  if (a.fuente !== b.fuente) return false;
  const dt = Math.abs(new Date(a.publicadoEn).getTime() - new Date(b.publicadoEn).getTime());
  if (Number.isNaN(dt) || dt > VENTANA_MISMA_NOTICIA_MS) return false;

  const ta = tokensSignificativos(a.titulo);
  const tb = tokensSignificativos(b.titulo);
  if (ta.length < 3 || tb.length < 3) return false;

  const usados = new Set<number>();
  let compartidos = 0;
  for (const x of ta) {
    for (let j = 0; j < tb.length; j++) {
      if (usados.has(j)) continue;
      if (tokenSimilar(x, tb[j]!)) {
        usados.add(j);
        compartidos += 1;
        break;
      }
    }
  }
  return compartidos >= 3 && compartidos / Math.min(ta.length, tb.length) >= 0.6;
}

/** Marcadores léxicos inequívocos de valenciano — para preferir la versión en castellano. */
const MARCADORES_VA = [
  ' amb ', " l'", " d'", ' dels ', ' això ', ' aquest ', ' aquesta ', ' estes ', ' està ',
  ' què ', ' països ', ' ciutat ', ' avís ', ' groc ', ' dona ', ' vistiplau ', ' més ',
  ' fins ', ' este dijous ', ' este dimarts ',
];

function puntuaValenciano(titulo: string): number {
  const t = ` ${titulo.toLowerCase()} `;
  return MARCADORES_VA.reduce((n, m) => n + (t.includes(m) ? 1 : 0), 0);
}

export function deduplicarNoticias(items: ItemMediatico[]): ItemMediatico[] {
  const vistasUrl = new Set<string>();
  const vistasTitulo = new Set<string>();
  const salida: ItemMediatico[] = [];

  for (const item of items) {
    if (vistasUrl.has(item.url)) continue;
    const clave = normalizarTitulo(item.titulo);
    if (clave.length > 0 && vistasTitulo.has(clave)) continue;

    const idxDup = salida.findIndex((kept) => esMismaNoticiaCrossIdioma(kept, item));
    if (idxDup !== -1) {
      // Ya está la noticia; si la guardada es en valenciano y esta en castellano, se cambia.
      if (puntuaValenciano(salida[idxDup]!.titulo) > puntuaValenciano(item.titulo)) {
        salida[idxDup] = item;
        vistasUrl.add(item.url);
        if (clave.length > 0) vistasTitulo.add(clave);
      }
      continue;
    }

    vistasUrl.add(item.url);
    if (clave.length > 0) vistasTitulo.add(clave);
    salida.push(item);
  }
  return salida;
}
