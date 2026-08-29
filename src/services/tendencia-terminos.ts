/**
 * Contrato y cálculo de la spec 025 (specs/025-tendencia-terminos-mediaticos.md §3).
 * Conteo de frecuencia de términos, determinista, sin modelo de lenguaje — ver
 * spec §1. Reutiliza `ItemMediatico[]` ya cacheado por la spec 009; el campo
 * `distritosMencionados` de cada ítem viene de la spec 023.
 */

import type { ItemMediatico } from './mediatico';
import { STOPWORDS_MEDIATICO } from '../data/stopwords-mediatico';

export type VentanaTiempo = 'hora' | 'dia';

export interface TerminoTendencia {
  termino: string;
  formaOriginal: string;
  frecuencia: number;
  distritosAsociados: string[];
}

export interface VentanaTendencia {
  ventana: VentanaTiempo;
  desde: string;
  hasta: string;
  terminos: TerminoTendencia[];
  totalItems: number;
  fetchedAt: string;
}

const DURACION_VENTANA_MS: Record<VentanaTiempo, number> = {
  hora: 60 * 60 * 1000,
  dia: 24 * 60 * 60 * 1000,
};

const LONGITUD_MINIMA_TERMINO = 4;
const TOP_N_TERMINOS = 20;

const STOPWORDS = new Set(STOPWORDS_MEDIATICO);

// Mismo rango de diacríticos combinantes que normalizeForSearch en district-geometry.ts.
const RANGO_DIACRITICOS_COMBINANTES = /[̀-ͯ]/g;

function normalizarPalabra(palabra: string): string {
  return palabra.normalize('NFD').replace(RANGO_DIACRITICOS_COMBINANTES, '').toLowerCase();
}

/** Divide por cualquier carácter que no sea letra (incluye acentuadas) — conserva palabras, no las glue como normalizeForSearch. */
function tokenizarConOriginal(texto: string): { normalizado: string; original: string }[] {
  return (texto.match(/\p{L}+/gu) ?? [])
    .map((original) => ({ original, normalizado: normalizarPalabra(original) }))
    .filter((t) => t.normalizado.length >= LONGITUD_MINIMA_TERMINO && !STOPWORDS.has(t.normalizado));
}

export function calcularTendenciaTerminos(
  items: ItemMediatico[],
  ventana: VentanaTiempo,
  ahora: Date = new Date(),
): VentanaTendencia {
  const desdeMs = ahora.getTime() - DURACION_VENTANA_MS[ventana];

  const itemsEnVentana = items.filter((item) => {
    const t = new Date(item.publicadoEn).getTime();
    return t >= desdeMs && t <= ahora.getTime();
  });

  interface Acumulado {
    formaOriginal: string;
    frecuencia: number;
    distritos: Set<string>;
  }
  const acumulado = new Map<string, Acumulado>();

  for (const item of itemsEnVentana) {
    const tokens = tokenizarConOriginal(`${item.titulo} ${item.resumen ?? ''}`);
    const vistosEnEsteItem = new Set<string>(); // spec §3: cuenta 1 vez por ítem, no por aparición

    for (const { normalizado, original } of tokens) {
      if (vistosEnEsteItem.has(normalizado)) continue;
      vistosEnEsteItem.add(normalizado);

      const entry = acumulado.get(normalizado) ?? { formaOriginal: original, frecuencia: 0, distritos: new Set<string>() };
      entry.frecuencia += 1;
      for (const mencion of item.distritosMencionados) entry.distritos.add(mencion.distritoCodigo);
      acumulado.set(normalizado, entry);
    }
  }

  const terminos: TerminoTendencia[] = [...acumulado.entries()]
    .map(([termino, entry]) => ({
      termino,
      formaOriginal: entry.formaOriginal,
      frecuencia: entry.frecuencia,
      distritosAsociados: [...entry.distritos],
    }))
    .sort((a, b) => b.frecuencia - a.frecuencia || a.termino.localeCompare(b.termino))
    .slice(0, TOP_N_TERMINOS);

  return {
    ventana,
    desde: new Date(desdeMs).toISOString(),
    hasta: ahora.toISOString(),
    terminos,
    totalItems: itemsEnVentana.length,
    fetchedAt: new Date().toISOString(),
  };
}
