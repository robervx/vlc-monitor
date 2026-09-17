/**
 * Panel de síntesis con IA — spec 045, decisión de producto en
 * `docs/decisiones/ADR-005-panel-sintesis-ia.md`. El modelo (Vercel AI
 * Gateway, `anthropic/claude-haiku-4.5`) consume exclusivamente lo que ya
 * sirven los endpoints internos existentes — nunca una fuente externa
 * directamente (`CLAUDE.md` §3.3). Funciones puras: la llamada real al
 * modelo vive en `src/server/sintesis-ia.ts`.
 */
import { z } from 'zod';

export const SintesisIASchema = z.object({
  resumen: z.string().min(1),
  insights: z.array(
    z.object({
      texto: z.string().min(1),
      severidad: z.enum(['informativo', 'aviso', 'urgente']),
      fuenteSpec: z.array(z.string()).min(1),
    }),
  ),
  recomendaciones: z.array(
    z.object({
      texto: z.string().min(1),
      fuenteSpec: z.array(z.string()).min(1),
    }),
  ),
});

export type SintesisIAModelo = z.infer<typeof SintesisIASchema>;

export interface SintesisIA extends SintesisIAModelo {
  id: string;
  generadaEn: string;
  modelo: string;
  advertencia: string;
}

export const ADVERTENCIA_SINTESIS_IA = 'Generado por IA a partir de señales del producto — puede contener errores, revisar antes de actuar.';

export interface SenalesEntrada {
  insights: unknown;
  sugerencias: unknown;
  pulso: unknown;
  mediatico: unknown;
  avisos: unknown;
}

/**
 * Guardrail de trazabilidad (spec 045 §6, ADR-005): cada insight y cada
 * recomendación debe traer al menos una `fuenteSpec` — si el modelo devuelve
 * una afirmación sin fuente, se rechaza toda la respuesta.
 */
export function validarTrazabilidad(s: SintesisIAModelo): boolean {
  return s.insights.every((i) => i.fuenteSpec.length > 0) && s.recomendaciones.every((r) => r.fuenteSpec.length > 0);
}

export function construirSintesisIA(modeloOutput: SintesisIAModelo, modelo: string, generadaEn: string): SintesisIA {
  return {
    id: 'sintesis-actual',
    generadaEn,
    modelo,
    advertencia: ADVERTENCIA_SINTESIS_IA,
    ...modeloOutput,
  };
}

const INSTRUCCIONES_SISTEMA = `Eres un asistente que resume el estado operativo de la ciudad de Valencia para una
persona que monitoriza el panel "Mirall". Recibes JSON ya calculado por otros sistemas
(insights, sugerencias operativas, Pulso de Distrito, contexto mediático, avisos
oficiales) — nunca datos en bruto de fuentes externas. Reglas estrictas:
- Escribe en español, tono neutro y factual, nunca alarmista.
- Cada insight y cada recomendación DEBE citar en "fuenteSpec" de qué bloque de datos
  sale (ej. "insights", "pulso", "mediatico") — nunca inventes una afirmación sin
  respaldo en los datos recibidos.
- Las recomendaciones son siempre condicionales ("podría valorarse...", "conviene
  revisar..."), nunca una orden ni una acción ejecutable.
- Si no hay nada relevante que destacar, dilo explícitamente en el resumen y deja los
  arrays de insights/recomendaciones vacíos — no inventes contenido para rellenar.`;

/** Construye el prompt de usuario a partir de las señales ya calculadas (JSON, tal cual las sirven los endpoints internos). */
export function construirPrompt(senales: SenalesEntrada): string {
  return [
    'Señales actuales del producto (JSON):',
    `insights: ${JSON.stringify(senales.insights)}`,
    `sugerencias_operativas: ${JSON.stringify(senales.sugerencias)}`,
    `pulso_de_distrito: ${JSON.stringify(senales.pulso)}`,
    `contexto_mediatico: ${JSON.stringify(senales.mediatico)}`,
    `avisos_oficiales: ${JSON.stringify(senales.avisos)}`,
    '',
    'Redacta el resumen, los insights y las recomendaciones según las reglas del sistema.',
  ].join('\n');
}

export { INSTRUCCIONES_SISTEMA };
