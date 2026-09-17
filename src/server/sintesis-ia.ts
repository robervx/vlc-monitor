// GET /api/sintesis/v1/actual — spec 045, decisión de producto en
// docs/decisiones/ADR-005-panel-sintesis-ia.md. Consume exclusivamente los
// endpoints internos ya existentes (nunca una fuente externa directamente,
// CLAUDE.md §3.3) — se invocan como funciones en el mismo proceso (no HTTP:
// el router los reescribe con un origen ficticio, `_router-src.ts`, así que
// un `fetch` interno no resolvería) y de paso reutilizan la caché propia de
// cada uno. Vercel AI Gateway (paquete `ai`) con `anthropic/claude-haiku-4.5`
// — modelo barato, cadencia baja (TTL 20 min, ver ADR-005).
import { generateObject } from 'ai';
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
const TTL_MS = 20 * 60 * 1000; // fuente más cara del producto — cadencia baja a propósito (ADR-005)
const MODELO = 'anthropic/claude-haiku-4.5';

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
    model: MODELO,
    schema: SintesisIASchema,
    system: INSTRUCCIONES_SISTEMA,
    prompt: construirPrompt(senales),
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
