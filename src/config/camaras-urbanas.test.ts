import { afterEach, describe, expect, it, vi } from 'vitest';
import { CAMARAS_URBANAS, camarasVisibles } from './camaras-urbanas';

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('camarasVisibles', () => {
  it('sin ninguna variable VITE_PERSONAL_* definida, solo devuelve las cámaras públicas', () => {
    // Fuerza el caso "sin flag" con independencia de .env.local del entorno de
    // quien ejecute los tests (spec 038/ADR-003: la cámara personal se activa
    // ahí para desarrollo, pero el test debe ser determinista).
    vi.stubEnv('VITE_PERSONAL_CAMARA_TURISME_CV', '');
    const visibles = camarasVisibles();
    expect(visibles.every((c) => c.categoria === 'publica')).toBe(true);
    expect(visibles.map((c) => c.id)).toContain('youtube-wolkam-plaza');
  });

  it('activar el flag de las cámaras de Turisme CV las añade', () => {
    vi.stubEnv('VITE_PERSONAL_CAMARA_TURISME_CV', '1');
    const visibles = camarasVisibles();
    expect(visibles.map((c) => c.id)).toContain('turisme-cv-plaza-ayuntamiento');
    expect(visibles.map((c) => c.id)).toContain('turisme-cv-las-arenas');
  });

  it('cada cámara declara su categoría de ADR-003 y, si es personal, su envFlag', () => {
    for (const c of CAMARAS_URBANAS) {
      expect(['publica', 'personal']).toContain(c.categoria);
      if (c.categoria === 'personal') expect(c.envFlag).toBeTruthy();
    }
  });

  it('las cámaras de YouTube usan id de canal (embed de canal en directo), no de vídeo', () => {
    for (const c of CAMARAS_URBANAS) {
      if (c.proveedor === 'youtube-canal') expect(c.youtubeChannelId).toMatch(/^UC/);
    }
  });
});
