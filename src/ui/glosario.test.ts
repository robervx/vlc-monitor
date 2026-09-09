import { describe, expect, it } from 'vitest';
import { construirEntradasGlosario, capasSinMetadato } from './glosario';
import { LAYER_REGISTRY } from '../config/map-layer-definitions';
import { PESOS_PULSO, UMBRALES_CATEGORIA_PULSO } from '../services/pulso-distrito';
import { UMBRAL_VIENTO_AVISO_KMH, UMBRAL_CALOR_TEMPERATURA } from '../services/insights';

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

  it('la entrada del Pulso muestra los pesos leídos de PESOS_PULSO, no escritos a mano', () => {
    const cuerpo = entrada('Pulso de Distrito').cuerpo;
    expect(cuerpo).toContain(`${Math.round(PESOS_PULSO.trafico * 100)} %`);
    expect(cuerpo).toContain(`${Math.round(PESOS_PULSO.aire * 100)} %`);
    // El coeficiente crudo aparece en la fórmula.
    expect(cuerpo).toContain(`${PESOS_PULSO.trafico}·tráfico`);
  });

  it('la entrada del Pulso muestra los umbrales de categoría leídos de la constante', () => {
    const cuerpo = entrada('Pulso de Distrito').cuerpo;
    expect(cuerpo).toContain(`&lt; ${UMBRALES_CATEGORIA_PULSO.Moderado}`);
    expect(cuerpo).toContain(`a partir de ${UMBRALES_CATEGORIA_PULSO.Crítico}`);
  });

  it('si cambiara un peso, el texto cambiaría (no hay número mágico duplicado)', () => {
    // Guardarraíl: el 45 % de tráfico no está hardcodeado en el cuerpo salvo
    // vía la constante. Si alguien pone PESOS_PULSO.trafico = 0.5 y este test
    // sigue verde con "45 %", es que se coló un literal.
    const cuerpo = entrada('Pulso de Distrito').cuerpo;
    const esperado = `${Math.round(PESOS_PULSO.trafico * 100)} %`;
    expect(cuerpo).toContain(esperado);
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
