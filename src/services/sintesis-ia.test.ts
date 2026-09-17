import { describe, expect, it } from 'vitest';
import {
  SintesisIASchema,
  validarTrazabilidad,
  construirSintesisIA,
  construirPrompt,
  ADVERTENCIA_SINTESIS_IA,
  type SintesisIAModelo,
} from './sintesis-ia';

function modeloValido(): SintesisIAModelo {
  return {
    resumen: 'Todo tranquilo en la ciudad ahora mismo.',
    insights: [{ texto: 'Tráfico denso en Blasco Ibáñez.', severidad: 'aviso', fuenteSpec: ['insights'] }],
    recomendaciones: [{ texto: 'Podría valorarse desviar tráfico por rutas alternativas.', fuenteSpec: ['insights', 'pulso'] }],
  };
}

describe('SintesisIASchema', () => {
  it('acepta una respuesta bien formada', () => {
    expect(SintesisIASchema.safeParse(modeloValido()).success).toBe(true);
  });

  it('rechaza severidad fuera del enum (guardrail de estructura)', () => {
    const malo = { ...modeloValido(), insights: [{ texto: 'x', severidad: 'catastrofico', fuenteSpec: ['insights'] }] };
    expect(SintesisIASchema.safeParse(malo).success).toBe(false);
  });

  it('rechaza un insight sin fuenteSpec (array vacío)', () => {
    const malo = { ...modeloValido(), insights: [{ texto: 'x', severidad: 'aviso', fuenteSpec: [] }] };
    expect(SintesisIASchema.safeParse(malo).success).toBe(false);
  });
});

describe('validarTrazabilidad', () => {
  it('true si todo insight y recomendación tiene fuenteSpec', () => {
    expect(validarTrazabilidad(modeloValido())).toBe(true);
  });

  it('false si alguna recomendación no tiene fuenteSpec (defensa en profundidad, aunque el schema ya lo bloquea)', () => {
    const s = modeloValido();
    s.recomendaciones[0]!.fuenteSpec = [];
    expect(validarTrazabilidad(s)).toBe(false);
  });
});

describe('construirSintesisIA', () => {
  it('añade metadatos fijos (advertencia, modelo, id) al resultado del modelo', () => {
    const r = construirSintesisIA(modeloValido(), 'anthropic/claude-haiku-4.5', '2026-09-17T12:00:00.000Z');
    expect(r).toMatchObject({
      id: 'sintesis-actual',
      modelo: 'anthropic/claude-haiku-4.5',
      generadaEn: '2026-09-17T12:00:00.000Z',
      advertencia: ADVERTENCIA_SINTESIS_IA,
    });
    expect(r.resumen).toBe(modeloValido().resumen);
  });
});

describe('construirPrompt', () => {
  it('incluye las 5 señales como JSON', () => {
    const prompt = construirPrompt({
      insights: { a: 1 },
      sugerencias: [],
      pulso: null,
      mediatico: { items: [] },
      avisos: [],
    });
    expect(prompt).toContain('insights: {"a":1}');
    expect(prompt).toContain('sugerencias_operativas: []');
    expect(prompt).toContain('pulso_de_distrito: null');
  });
});
