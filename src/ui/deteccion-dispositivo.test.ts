import { describe, expect, it } from 'vitest';
import { resolverLayout } from './deteccion-dispositivo';

describe('resolverLayout', () => {
  it('sin override, sigue al medio (matchMedia)', () => {
    expect(resolverLayout(null, true)).toBe('movil');
    expect(resolverLayout(null, false)).toBe('escritorio');
  });

  it('el override manual gana sobre el medio', () => {
    expect(resolverLayout('escritorio', true)).toBe('escritorio');
    expect(resolverLayout('movil', false)).toBe('movil');
  });

  it('un override inválido se ignora (cae al medio)', () => {
    // @ts-expect-error — probamos un valor fuera del tipo, como el que podría
    // devolver un localStorage manipulado
    expect(resolverLayout('tablet', true)).toBe('movil');
  });
});
