import { afterEach, describe, expect, it, vi } from 'vitest';
import { CAMARAS_URBANAS, camarasVisibles } from './camaras-urbanas';

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('camarasVisibles', () => {
  it('sin ninguna variable VITE_PERSONAL_* definida, no hay ninguna cámara visible', () => {
    // v4: la única cámara "pública" (YouTube, canal amateur poco fiable) se
    // retiró a petición del usuario — hoy las dos que quedan son "personales".
    vi.stubEnv('VITE_PERSONAL_CAMARA_TURISME_CV', '');
    expect(camarasVisibles()).toEqual([]);
  });

  it('activar el flag de las cámaras de Turisme CV las añade, con nombres distintos', () => {
    vi.stubEnv('VITE_PERSONAL_CAMARA_TURISME_CV', '1');
    const visibles = camarasVisibles();
    const ids = visibles.map((c) => c.id);
    expect(ids).toContain('turisme-cv-plaza-ayuntamiento');
    expect(ids).toContain('turisme-cv-las-arenas');
    expect(new Set(visibles.map((c) => c.nombre)).size).toBe(visibles.length);
  });

  it('cada cámara declara su categoría de ADR-003 y, si es personal, su envFlag', () => {
    for (const c of CAMARAS_URBANAS) {
      expect(['publica', 'personal']).toContain(c.categoria);
      if (c.categoria === 'personal') expect(c.envFlag).toBeTruthy();
    }
  });

  it('la cámara de la playa no se llama como el complejo Ciutat de les Arts (corrección v4)', () => {
    const playa = CAMARAS_URBANAS.find((c) => c.id === 'turisme-cv-las-arenas');
    expect(playa?.nombre.toLowerCase()).not.toContain('ciutat de les arts');
  });
});
