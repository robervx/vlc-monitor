import { afterEach, describe, expect, it, vi } from 'vitest';
import { CAMARAS_URBANAS, camarasVisibles } from './camaras-urbanas';

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('camarasVisibles', () => {
  it('sin ninguna variable VITE_PERSONAL_* definida, solo devuelve la cámara pública', () => {
    const visibles = camarasVisibles();
    expect(visibles).toHaveLength(1);
    expect(visibles[0]?.id).toBe('youtube-valencia-directo');
    expect(visibles[0]?.categoria).toBe('publica');
  });

  it('activar el flag de la cámara personal NO la muestra todavía (sin reproductor DASH implementado, spec 038 §7)', () => {
    vi.stubEnv('VITE_PERSONAL_CAMARA_TURISME_CV', '1');
    const visibles = camarasVisibles();
    expect(visibles.map((c) => c.id)).not.toContain('turisme-cv-plaza-ayuntamiento');
  });

  it('cada cámara declara su categoría de ADR-003 y, si es personal, su envFlag', () => {
    for (const c of CAMARAS_URBANAS) {
      expect(['publica', 'personal']).toContain(c.categoria);
      if (c.categoria === 'personal') expect(c.envFlag).toBeTruthy();
    }
  });
});
