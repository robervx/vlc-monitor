import { describe, expect, it } from 'vitest';
import { construirEntradasGlosario, capasSinMetadato } from './glosario';
import { LAYER_REGISTRY } from '../config/map-layer-definitions';
import {
  UMBRAL_VIENTO_AVISO_KMH,
  UMBRAL_CALOR_TEMPERATURA,
  UMBRAL_TRAFICO_CONCENTRADO_AVISO,
  UMBRAL_TRAFICO_CONCENTRADO_URGENTE,
} from '../services/insights';

const entrada = (termino: string) => {
  const e = construirEntradasGlosario().find((x) => x.termino === termino);
  if (!e) throw new Error(`Falta la entrada "${termino}"`);
  return e;
};

describe('construirEntradasGlosario', () => {
  it('incluye las 8 entradas de la spec 037 §3', () => {
    const terminos = construirEntradasGlosario().map((e) => e.termino);
    expect(terminos).toEqual([
      'Pulso de Distrito',
      'Capas del mapa',
      'Prioritarias vs. Contexto',
      '"En vivo" y "no actualizado"',
      'Alertas e insights',
      'MOCK',
      'Foco de distrito',
      'Fuentes y licencias',
    ]);
  });

  it('la entrada del Pulso (v4) cita los umbrales de tráfico leídos de insights.ts, no escritos a mano', () => {
    const cuerpo = entrada('Pulso de Distrito').cuerpo;
    expect(cuerpo).toContain(String(UMBRAL_TRAFICO_CONCENTRADO_AVISO));
    expect(cuerpo).toContain(String(UMBRAL_TRAFICO_CONCENTRADO_URGENTE));
  });

  it('la entrada del Pulso describe los tres escenarios de conjunción de v4', () => {
    const cuerpo = entrada('Pulso de Distrito').cuerpo;
    expect(cuerpo).toContain('Incidencia + tráfico denso');
    expect(cuerpo).toContain('Fallas + tráfico denso');
    expect(cuerpo).toContain('Lluvia inminente');
  });

  it('la entrada de alertas cita los umbrales exportados de insights.ts', () => {
    const cuerpo = entrada('Alertas e insights').cuerpo;
    expect(cuerpo).toContain(`${UMBRAL_VIENTO_AVISO_KMH} km/h`);
    expect(cuerpo).toContain(`${UMBRAL_CALOR_TEMPERATURA} °C`);
  });

  it('la entrada de alertas recoge el principio "avisa, no actúa"', () => {
    expect(entrada('Alertas e insights').cuerpo).toContain('Avisa, no actúa');
  });

  it('la lista de capas cubre todas las de LAYER_REGISTRY', () => {
    const cuerpo = entrada('Capas del mapa').cuerpo;
    for (const key of Object.keys(LAYER_REGISTRY)) {
      // cada capa tiene metadato → aparece su nombre legible (no la key)
      expect(capasSinMetadato()).not.toContain(key);
    }
    expect(cuerpo).toContain('Tráfico');
    expect(cuerpo).toContain('MOCK');
  });

  it('no queda ninguna capa del registro sin metadato', () => {
    expect(capasSinMetadato()).toEqual([]);
  });

  it('la entrada de fuentes enlaza a docs/FUENTES_Y_LICENCIAS.md', () => {
    expect(entrada('Fuentes y licencias').cuerpo).toContain('docs/FUENTES_Y_LICENCIAS.md');
  });
});
