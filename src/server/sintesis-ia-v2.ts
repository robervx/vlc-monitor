// GET /api/sintesis/v2/actual — spec 047. Dos piezas separadas en una sola
// respuesta: `senales` (correlación determinista, sin IA — nunca depende de
// la disponibilidad del modelo) y `recomendaciones` (generateObject, degrada
// a [] si el modelo falla, sin romper el resto del endpoint).
//
// v1 (045, /api/sintesis/v1/actual) sigue intacto mientras esta versión se
// verifica (spec 047 §4/§6) — no se toca `sintesis-ia.ts`.
//
// Aviso de coste real: esto añade una SEGUNDA llamada a `gemini-3-flash-preview`
// con la misma cadencia (TTL 90 min) que ya usa v1 — dobla el consumo de la
// cuota gratuita de Gemini mientras ambas convivan. Si la cuota se agota,
// `recomendaciones` degrada a `[]` (ver `generarRecomendaciones`), nunca
// rompe `senales`.
import { generateObject } from 'ai';
import { google } from '@ai-sdk/google';
import { getOrFetch } from './_shared/cache';
import {
  correlacionarSenales,
  type SenalCorrelacionada,
} from '../services/correlacion-senales';
import type { TramoTrafico } from '../services/trafico';
import type { IncidenciaViaPublica } from '../services/via-publica';
import type { LluviaVientoDistrito } from '../services/meteo-zona';
import type { SnapshotAgenda } from '../services/agenda-eventos';
import type { CamaraExternaDgt } from '../services/camaras-dgt';
import {
  RecomendacionesSchema,
  construirPromptRecomendaciones,
  INSTRUCCIONES_SISTEMA_RECOMENDACIONES,
  filtrarRecomendacionesValidas,
  ADVERTENCIA_RECOMENDACION,
  type RecomendacionActuacion,
} from '../services/sintesis-ia-v2';
import traficoHandler from './trafico-estado';
import incidenciasHandler from './via-publica-incidencias';
import meteoZonaHandler from './meteo-zona';
import agendaHandler from './agenda-eventos';
import camarasDgtValencia from '../../data/camaras-dgt-valencia.json' with { type: 'json' };

export const config = { runtime: 'edge' };

const CACHE_KEY = 'sintesis-ia:v2:actual';
const TTL_MS = 90 * 60 * 1000; // mismo TTL que v1 (045) — misma cuota compartida de Gemini
const MODELO = 'gemini-3-flash-preview';

async function leerJson<T>(handler: () => Promise<Response>): Promise<T | null> {
  try {
    const res = await handler();
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch (err) {
    console.error('Fuente de correlación de señales no disponible:', err);
    return null;
  }
}

async function construirSenales(): Promise<SenalCorrelacionada[]> {
  const [trafico, incidencias, meteoZona, agenda] = await Promise.all([
    leerJson<{ tramos: TramoTrafico[] }>(traficoHandler),
    leerJson<{ incidencias: IncidenciaViaPublica[] }>(incidenciasHandler),
    leerJson<{ distritos: LluviaVientoDistrito[] }>(meteoZonaHandler),
    leerJson<SnapshotAgenda>(agendaHandler),
  ]);
  return correlacionarSenales({
    tramos: trafico?.tramos ?? [],
    incidencias: incidencias?.incidencias ?? [],
    climaDistritos: meteoZona?.distritos ?? [],
    eventos: agenda?.eventos ?? [],
    camaras: camarasDgtValencia as CamaraExternaDgt[],
  });
}

/** Nunca lanza — si el modelo falla o la cuota está agotada, degrada a `[]` sin romper `senales`. */
async function generarRecomendaciones(senales: SenalCorrelacionada[]): Promise<RecomendacionActuacion[]> {
  const hayAlgoQueRecomendar = senales.some((s) => s.severidad !== 'informativo');
  if (!hayAlgoQueRecomendar) return [];
  try {
    const { object } = await generateObject({
      model: google(MODELO),
      schema: RecomendacionesSchema,
      system: INSTRUCCIONES_SISTEMA_RECOMENDACIONES,
      prompt: construirPromptRecomendaciones(senales),
      temperature: 0.3,
      // Verificado en vivo el 2026-09-17: incluso con los topes de
      // `construirPromptRecomendaciones` (máx. 8 distritos), una
      // recomendación completa por distrito puede superar 1024 tokens de
      // salida real (sin razonamiento interno de por medio — ver el
      // `thinkingBudget: 0` de abajo) y el JSON sale cortado
      // (`finishReason: 'length'`, `NoObjectGeneratedError`). 4096 da margen
      // de sobra para 8 recomendaciones completas.
      maxOutputTokens: 4096,
      // mismo fix que v1 (045) — sin esto, gemini-3-flash-preview agota
      // maxOutputTokens en tokens de "pensamiento" interno antes del JSON.
      providerOptions: { google: { thinkingConfig: { thinkingBudget: 0 } } },
      maxRetries: 1,
    });
    const senalesPorId = new Map(senales.map((s) => [s.id, s]));
    const validas = filtrarRecomendacionesValidas(object.recomendaciones, senalesPorId);
    return validas.map((r, i) => ({
      ...r,
      id: `recomendacion:${r.distritoCodigo ?? 'ciudad'}:${i}`,
      fuenteSpec: Array.from(new Set(r.situacionAsociada.flatMap((id) => senalesPorId.get(id)?.fuenteSpec ?? []))),
      advertencia: ADVERTENCIA_RECOMENDACION,
    }));
  } catch (err) {
    console.error('Fallo al generar recomendaciones de actuación (degradando a lista vacía):', err);
    return [];
  }
}

interface SintesisV2 {
  senales: SenalCorrelacionada[];
  recomendaciones: RecomendacionActuacion[];
  generadaEn: string;
  modelo: string;
}

async function fetchSintesisV2(): Promise<SintesisV2> {
  const senales = await construirSenales();
  const recomendaciones = await generarRecomendaciones(senales);
  return { senales, recomendaciones, generadaEn: new Date().toISOString(), modelo: MODELO };
}

export default async function handler(): Promise<Response> {
  try {
    const { value, fresh } = await getOrFetch(CACHE_KEY, TTL_MS, fetchSintesisV2);
    return new Response(JSON.stringify({ ...value, fresh }), {
      status: 200,
      headers: {
        'content-type': 'application/json; charset=utf-8',
        'cache-control': 'public, max-age=300, stale-while-revalidate=900',
      },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : String(err) }), {
      status: 502,
      headers: { 'content-type': 'application/json; charset=utf-8' },
    });
  }
}
