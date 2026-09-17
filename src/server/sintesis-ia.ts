// GET /api/sintesis/v1/actual — spec 045, decisión de producto en
// docs/decisiones/ADR-005-panel-sintesis-ia.md (v2: Google Gemini gratuito,
// no Vercel AI Gateway — ver historial del ADR). Consume exclusivamente los
// endpoints internos ya existentes (nunca una fuente externa directamente,
// CLAUDE.md §3.3) — se invocan como funciones en el mismo proceso (no HTTP:
// el router los reescribe con un origen ficticio, `_router-src.ts`, así que
// un `fetch` interno no resolvería) y de paso reutilizan la caché propia de
// cada uno. Google Generative AI directo (paquete `@ai-sdk/google`, no el
// gateway de Vercel — así el uso cae dentro de la cuota gratuita real de la
// cuenta de Google del usuario, no de créditos de pago de Vercel) con
// `gemini-3.8-flash`, cadencia baja (TTL 20 min).
import { generateObject } from 'ai';
import { google } from '@ai-sdk/google';
import { getOrFetch } from './_shared/cache';
import {
  SintesisIASchema,
  validarTrazabilidad,
  construirSintesisIA,
  construirPrompt,
  INSTRUCCIONES_SISTEMA,
  type SintesisIA,
  type SenalesEntrada,
} from '../services/sintesis-ia';
import insightsHandler from './insights-actual';
import decisionHandler from './decision-sugerencias';
import pulsoHandler from './pulso-distrito';
import mediaticoHandler from './mediatico-items';
import avisosHandler from './avisos-meteo';

export const config = { runtime: 'edge' };

const CACHE_KEY = 'sintesis-ia:actual:v1';
const TTL_MS = 20 * 60 * 1000; // fuente más cara del producto — cadencia baja a propósito, además de que la cuota gratuita de Gemini es limitada por día (ADR-005)
const MODELO = 'gemini-3.8-flash';

async function leerJson(handler: () => Promise<Response>): Promise<unknown> {
  try {
    const res = await handler();
    if (!res.ok) return null;
    return await res.json();
  } catch (err) {
    console.error('Fuente de síntesis IA no disponible:', err);
    return null;
  }
}

async function recolectarSenales(): Promise<SenalesEntrada> {
  const [insights, sugerencias, pulso, mediatico, avisos] = await Promise.all([
    leerJson(insightsHandler),
    leerJson(decisionHandler),
    leerJson(pulsoHandler),
    leerJson(mediaticoHandler),
    leerJson(avisosHandler),
  ]);
  return { insights, sugerencias, pulso, mediatico, avisos };
}

async function fetchSintesisIA(): Promise<SintesisIA> {
  const senales = await recolectarSenales();
  const { object } = await generateObject({
    model: google(MODELO),
    schema: SintesisIASchema,
    system: INSTRUCCIONES_SISTEMA,
    prompt: construirPrompt(senales),
    // Parámetros de actuación (ADR-005 v2): temperatura baja porque esto es
    // síntesis factual sobre datos ya calculados, no redacción creativa —
    // menos variación entre llamadas consecutivas con las mismas señales.
    // Tope de salida generoso mismo para el resumen+insights+recomendaciones
    // completos, pero acotado (ni el prompt ni la respuesta necesitan más,
    // y limita coste/latencia por si el modelo se desvía).
    temperature: 0.3,
    maxOutputTokens: 1024,
  });
  if (!validarTrazabilidad(object)) {
    throw new Error('Guardrail de trazabilidad no superado: el modelo devolvió un insight o recomendación sin fuenteSpec (ADR-005)');
  }
  return construirSintesisIA(object, MODELO, new Date().toISOString());
}

export default async function handler(): Promise<Response> {
  try {
    const { value: sintesis, fresh } = await getOrFetch(CACHE_KEY, TTL_MS, fetchSintesisIA);
    return new Response(JSON.stringify({ sintesis, fresh }), {
      status: 200,
      headers: {
        'content-type': 'application/json; charset=utf-8',
        'cache-control': 'public, max-age=300, stale-while-revalidate=3600',
      },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : String(err) }), {
      status: 502,
      headers: { 'content-type': 'application/json; charset=utf-8' },
    });
  }
}
