import { describe, expect, it } from 'vitest';
import { ENTIDADES_REDES } from './entidades-redes';

describe('ENTIDADES_REDES', () => {
  it('cada entidad tiene id único, nombre y al menos un canal (X o Facebook)', () => {
    const ids = new Set<string>();
    for (const e of ENTIDADES_REDES) {
      expect(e.nombre.length).toBeGreaterThan(0);
      expect(e.xHandle || e.facebookPageUrl).toBeTruthy();
      expect(ids.has(e.id)).toBe(false);
      ids.add(e.id);
    }
  });

  it('los handles de X no incluyen "@" (se añade solo al construir la URL/etiqueta)', () => {
    for (const e of ENTIDADES_REDES) {
      if (e.xHandle) expect(e.xHandle.startsWith('@')).toBe(false);
    }
  });

  it('las URLs de Facebook son enlaces https a facebook.com', () => {
    for (const e of ENTIDADES_REDES) {
      if (e.facebookPageUrl) expect(e.facebookPageUrl).toMatch(/^https:\/\/www\.facebook\.com\//);
    }
  });

  it('incluye el primer lote verificado en spec 039 (13 entidades)', () => {
    expect(ENTIDADES_REDES).toHaveLength(13);
  });
});
