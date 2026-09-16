import { describe, expect, it } from 'vitest';
import { calcularSugerencias } from './apoyo-decision';
import type { PulsoDistrito, EscenarioActivo } from './pulso-escenarios';

function escenario(overrides: Partial<EscenarioActivo>): EscenarioActivo {
  return {
    id: 'incidencia-sobre-trafico-denso',
    nivel: 'prioritario',
    modo: 'vivo',
    confirmado: true,
    anticipacionMin: null,
    motivo: 'Incidencia "Obra en calzada" en Carrer de Sant Vicent coincide con 3 tramos de tráfico denso en Ciutat Vella.',
    zonas: [],
    centroideAfectado: [-0.3763, 39.4699],
    tramosAfectados: [{ id: 't1', nombre: 'Carrer de Sant Vicent', estado: 'congestionado', puntoMedio: [-0.376, 39.47] }],
    ...overrides,
  };
}

function distrito(overrides: Partial<PulsoDistrito>): PulsoDistrito {
  return {
    distritoCodigo: '01',
    distritoNombre: 'Ciutat Vella',
    nivel: 'prioritario',
    monitorizacion: 'suficiente',
    tramosMonitorizados: 10,
    escenariosActivos: [],
    notaAire: null,
    observedAt: '2026-09-16T10:00:00.000Z',
    fetchedAt: '2026-09-16T10:00:00.000Z',
    source: 'vlc-monitor-pulso',
    ...overrides,
  };
}

const GENERADA_EN = '2026-09-16T10:00:05.000Z';

describe('calcularSugerencias', () => {
  it('genera una sugerencia por escenario vivo y confirmado', () => {
    const distritos = [distrito({ escenariosActivos: [escenario({})] })];
    const sugerencias = calcularSugerencias(distritos, GENERADA_EN);
    expect(sugerencias).toHaveLength(1);
    expect(sugerencias[0]!.id).toBe('01:incidencia-sobre-trafico-denso');
    expect(sugerencias[0]!.distrito).toBe('Ciutat Vella');
    expect(sugerencias[0]!.calle).toBe('Carrer de Sant Vicent');
    expect(sugerencias[0]!.severidad).toBe('prioritario');
    expect(sugerencias[0]!.generadaEn).toBe(GENERADA_EN);
    expect(sugerencias[0]!.centroide).toEqual([-0.3763, 39.4699]);
  });

  it('ignora escenarios en modo sombra (spec 010 §10.3)', () => {
    const distritos = [distrito({ escenariosActivos: [escenario({ modo: 'sombra' })] })];
    expect(calcularSugerencias(distritos, GENERADA_EN)).toEqual([]);
  });

  it('ignora escenarios sin confirmar', () => {
    const distritos = [distrito({ escenariosActivos: [escenario({ confirmado: false })] })];
    expect(calcularSugerencias(distritos, GENERADA_EN)).toEqual([]);
  });

  it('el texto de sugerencia siempre va en condicional, nunca en imperativo', () => {
    const distritos = [
      distrito({
        escenariosActivos: [
          escenario({ id: 'incidencia-sobre-trafico-denso' }),
          escenario({ id: 'fallas-y-trafico', zonaFallas: { nombre: 'Zona X', centroide: [-0.37, 39.47] } }),
          escenario({ id: 'lluvia-inminente-sobre-trafico-denso', nivel: 'seguimiento' }),
        ],
      }),
    ];
    const sugerencias = calcularSugerencias(distritos, GENERADA_EN);
    expect(sugerencias).toHaveLength(3);
    for (const s of sugerencias) {
      expect(s.sugerenciaTexto).toMatch(/^Podría convenir valorar/);
      expect(s.sugerenciaTexto.toLowerCase()).not.toMatch(/\b(enviar|cortar|despachar|ejecutar)\b/);
    }
  });

  it('usa el distrito como localización cuando no hay tramo afectado (sin calle inventada)', () => {
    const distritos = [
      distrito({
        escenariosActivos: [escenario({ id: 'fallas-y-trafico', tramosAfectados: [] })],
      }),
    ];
    const [sugerencia] = calcularSugerencias(distritos, GENERADA_EN);
    expect(sugerencia!.calle).toBeUndefined();
    expect(sugerencia!.distrito).toBe('Ciutat Vella');
    expect(sugerencia!.sugerenciaTexto).toContain('Ciutat Vella');
  });

  it('ordena prioritario antes que seguimiento', () => {
    const distritos = [
      distrito({
        distritoCodigo: '02',
        distritoNombre: 'Extramurs',
        escenariosActivos: [escenario({ id: 'lluvia-inminente-sobre-trafico-denso', nivel: 'seguimiento' })],
      }),
      distrito({
        distritoCodigo: '01',
        distritoNombre: 'Ciutat Vella',
        escenariosActivos: [escenario({ id: 'incidencia-sobre-trafico-denso', nivel: 'prioritario' })],
      }),
    ];
    const sugerencias = calcularSugerencias(distritos, GENERADA_EN);
    expect(sugerencias.map((s) => s.severidad)).toEqual(['prioritario', 'seguimiento']);
  });

  it('cada señal combinada y fuenteSpec es trazable al escenario de origen', () => {
    const distritos = [distrito({ escenariosActivos: [escenario({})] })];
    const [sugerencia] = calcularSugerencias(distritos, GENERADA_EN);
    expect(sugerencia!.señalesCombinadas).toEqual(['incidencia-via-publica', 'trafico-denso']);
    expect(sugerencia!.fuenteSpec).toEqual(['010', '004', '026']);
  });
});
