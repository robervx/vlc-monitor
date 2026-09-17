/**
 * Recomendaciones de actuación — spec 047 §3-§4. Segunda caja del panel de
 * síntesis: a diferencia de las señales (`correlacion-senales.ts`,
 * deterministas), esto sí llama al modelo — pero solo para redactar, nunca
 * para decidir qué está relacionado con qué (eso ya viene calculado en
 * `SenalCorrelacionada.relacionadas`).
 *
 * Guardrails no negociables (`CLAUDE.md` §4, reforzado explícitamente para
 * esta spec por el encargo "actuación policial"):
 * - Toda recomendación debe ser condicional (`esTextoCondicional`) — si el
 *   modelo redacta algo imperativo, se descarta, no se reformula.
 * - Ninguna recomendación puede mencionar un identificador de persona/
 *   vehículo (`contieneIdentificadorPersonal`) — nuestros propios contratos
 *   de datos no tienen ese campo, así que solo protege contra una
 *   alucinación del modelo, pero se comprueba igualmente.
 * - `situacionAsociada` debe referenciar ids de señales realmente
 *   correlacionadas — si el modelo inventa un id que no le dimos, se
 *   descarta esa recomendación entera.
 */
import { z } from 'zod';
import type { SenalCorrelacionada, Severidad } from './correlacion-senales';

export const RecomendacionActuacionSchema = z.object({
  distritoCodigo: z.string().nullable(),
  zona: z.string().min(1),
  situacionAsociada: z.array(z.string()).min(1),
  texto: z.string().min(1),
  tipoActuacionSugerida: z.enum(['informativa', 'coordinacion-protocolo', 'revision-tecnica', 'refuerzo-preventivo']),
});

export const RecomendacionesSchema = z.object({
  recomendaciones: z.array(RecomendacionActuacionSchema),
});

export type RecomendacionActuacionModelo = z.infer<typeof RecomendacionActuacionSchema>;

export interface RecomendacionActuacion extends RecomendacionActuacionModelo {
  id: string;
  fuenteSpec: string[];
  advertencia: string;
}

export const ADVERTENCIA_RECOMENDACION =
  'Generado por IA a partir de señales del producto — no sustituye al criterio profesional ni autoriza ninguna actuación por sí sola.';

export const INSTRUCCIONES_SISTEMA_RECOMENDACIONES = `Eres un asistente de síntesis para un panel de inteligencia urbana de Valencia
(proyecto Mirall). Recibes señales ya correlacionadas (tráfico, incidencias, clima,
eventos, cámaras) agrupadas por distrito. Tu única tarea es redactar, para cada
distrito con señales relevantes, una recomendación de actuación breve.

Reglas estrictas, sin excepción:
1. El texto de cada recomendación debe estar SIEMPRE en condicional — usa fórmulas
   como "podría valorarse", "conviene monitorizar", "cabría revisar". Nunca una
   orden ("hay que", "debe", "cortar", "enviar").
2. Nunca menciones a una persona, vehículo, matrícula o identificador individual.
   Todas las señales son de infraestructura pública (calles, distritos, eventos
   programados) — la recomendación también debe quedarse en ese nivel.
3. En "situacionAsociada" usa EXCLUSIVAMENTE los ids de señal que se te han dado,
   tal cual. No inventes relaciones ni ids nuevos.
4. Si un distrito no tiene ninguna señal de severidad "aviso" o "urgente", no le
   generes ninguna recomendación.
5. Máximo una recomendación por distrito.`;

function etiquetaSeveridad(s: Severidad): string {
  return s === 'urgente' ? 'URGENTE' : s === 'aviso' ? 'aviso' : 'informativo';
}

const ORDEN_SEVERIDAD: Record<Severidad, number> = { urgente: 0, aviso: 1, informativo: 2 };
// Datos reales de vía pública pueden acumular decenas de incidencias por
// distrito (obras largas partidas en varios permisos) — verificado en vivo
// el 2026-09-17 (un solo distrito generó un prompt de 60 KB sin este tope,
// y el modelo devolvió 503 "high demand" de forma persistente). Se acota a
// las más severas por distrito; el resto se resume como recuento, nunca se
// omite silenciosamente.
const MAX_SENALES_POR_DISTRITO_EN_PROMPT = 8;
// Verificado en vivo el 2026-09-17: incluso con el tope de arriba, Valencia
// puede tener obra activa simultánea en 12+ distritos — con `maxOutputTokens`
// razonable (ver sintesis-ia-v2.ts) el modelo se queda sin espacio para
// escribir una recomendación completa por cada uno y el JSON sale cortado
// (`finishReason: 'length'`). Se acota también el Nº de distritos, priorizando
// los que tienen alguna señal `urgente`.
const MAX_DISTRITOS_EN_PROMPT = 8;

function severidadMaxima(lista: SenalCorrelacionada[]): number {
  return Math.min(...lista.map((s) => ORDEN_SEVERIDAD[s.severidad]));
}

/** Agrupa por distrito y solo incluye los que tienen al menos una señal aviso/urgente — evita gastar cuota/tokens en distritos sin nada que recomendar. Las cámaras no entran (son corroboración visual, no aportan al razonamiento). */
export function construirPromptRecomendaciones(senales: SenalCorrelacionada[]): string {
  const porDistrito = new Map<string, SenalCorrelacionada[]>();
  for (const s of senales) {
    if (!s.distritoCodigo || s.tipo === 'camara') continue;
    const lista = porDistrito.get(s.distritoCodigo) ?? [];
    lista.push(s);
    porDistrito.set(s.distritoCodigo, lista);
  }
  const distritosConRelevancia = [...porDistrito.entries()]
    .map(([distrito, lista]) => ({ distrito, lista, relevantes: lista.filter((s) => s.severidad !== 'informativo') }))
    .filter((d) => d.relevantes.length > 0)
    .sort((a, b) => severidadMaxima(a.relevantes) - severidadMaxima(b.relevantes));
  const distritosOmitidos = distritosConRelevancia.length - MAX_DISTRITOS_EN_PROMPT;

  const bloques: string[] = [];
  for (const { distrito, relevantes } of distritosConRelevancia.slice(0, MAX_DISTRITOS_EN_PROMPT)) {
    const ordenadas = relevantes.sort((a, b) => ORDEN_SEVERIDAD[a.severidad] - ORDEN_SEVERIDAD[b.severidad]);
    const incluidas = ordenadas.slice(0, MAX_SENALES_POR_DISTRITO_EN_PROMPT);
    const restantes = ordenadas.length - incluidas.length;
    const lineas = incluidas.map((s) => `  - [${s.id}] (${etiquetaSeveridad(s.severidad)}) ${s.descripcion}`).join('\n');
    const nota = restantes > 0 ? `\n  (+ ${restantes} señal(es) más de severidad aviso/urgente en este distrito, no mostradas aquí)` : '';
    bloques.push(`Distrito ${distrito}:\n${lineas}${nota}`);
  }
  if (bloques.length === 0) {
    return 'No hay señales de severidad aviso/urgente en ningún distrito ahora mismo. Devuelve "recomendaciones": [].';
  }
  const notaDistritos =
    distritosOmitidos > 0
      ? `\n\n(Hay ${distritosOmitidos} distrito(s) adicional(es) con señales de severidad aviso/urgente no incluidos aquí por espacio — prioriza los mostrados, no los inventes.)`
      : '';
  return `Señales correlacionadas por distrito:\n\n${bloques.join('\n\n')}${notaDistritos}\n\nGenera las recomendaciones siguiendo las reglas del sistema.`;
}

const MARCADORES_CONDICIONALES = ['podría', 'podrían', 'conviene', 'convendría', 'cabría', 'valorar'];

export function esTextoCondicional(texto: string): boolean {
  const normalizado = texto.toLowerCase();
  return MARCADORES_CONDICIONALES.some((m) => normalizado.includes(m));
}

// Matrícula española (formato 2000+: 4 dígitos + 3 consonantes sin vocales/Ñ/Q)
// y DNI/NIE-like (8 dígitos + letra) — defensivo: nuestros contratos de datos no
// tienen estos campos, esto solo protege contra una alucinación del modelo.
const PATRON_MATRICULA = /\b\d{4}[ -]?[BCDFGHJKLMNPRSTVWXYZ]{3}\b/i;
const PATRON_DNI = /\b\d{8}[ -]?[A-Z]\b/i;

export function contieneIdentificadorPersonal(texto: string): boolean {
  return PATRON_MATRICULA.test(texto) || PATRON_DNI.test(texto);
}

/** Descarta recomendaciones que no cumplan los guardrails — nunca las reformula, solo las quita (spec 047 §6/§7). */
export function filtrarRecomendacionesValidas(
  recomendaciones: RecomendacionActuacionModelo[],
  senalesPorId: Map<string, SenalCorrelacionada>,
): RecomendacionActuacionModelo[] {
  return recomendaciones.filter((r) => {
    if (!esTextoCondicional(r.texto)) return false;
    if (contieneIdentificadorPersonal(r.texto)) return false;
    if (r.situacionAsociada.length === 0) return false;
    if (!r.situacionAsociada.every((id) => senalesPorId.has(id))) return false;
    return true;
  });
}
