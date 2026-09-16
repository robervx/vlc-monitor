import { describe, expect, it } from 'vitest';
import { PROTOCOLOS_ACTUACION } from './protocolos-actuacion';

describe('PROTOCOLOS_ACTUACION', () => {
  it('cada protocolo tiene id único, título y al menos una medida antes/durante', () => {
    const ids = new Set<string>();
    for (const p of PROTOCOLOS_ACTUACION) {
      expect(p.titulo.length).toBeGreaterThan(0);
      expect(p.antes.length).toBeGreaterThan(0);
      expect(p.durante.length).toBeGreaterThan(0);
      expect(ids.has(p.id)).toBe(false);
      ids.add(p.id);
    }
  });

  it('ultimaRevision es una fecha ISO 8601 válida', () => {
    for (const p of PROTOCOLOS_ACTUACION) {
      expect(() => new Date(p.ultimaRevision).toISOString()).not.toThrow();
      expect(Number.isNaN(new Date(p.ultimaRevision).getTime())).toBe(false);
    }
  });

  it('incluye el protocolo de lluvias intensas (motivador de la spec)', () => {
    expect(PROTOCOLOS_ACTUACION.some((p) => p.id === 'lluvias-intensas')).toBe(true);
  });
});
