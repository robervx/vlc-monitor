import { describe, expect, it } from 'vitest';
import {
  correlacionarTrafico,
  correlacionarIncidencias,
  correlacionarClima,
  correlacionarEventos,
  correlacionarCamaras,
  enlazarPorDistrito,
  correlacionarSenales,
} from './correlacion-senales';
import type { TramoTrafico } from './trafico';
import type { IncidenciaViaPublica } from './via-publica';
import type { LluviaVientoDistrito } from './meteo-zona';
import type { EventoAgenda } from './agenda-eventos';
import type { CamaraExternaDgt } from './camaras-dgt';

const AHORA = new Date('2026-09-17T12:00:00.000Z');
const FETCHED_AT = AHORA.toISOString();

function tramo(overrides: Partial<TramoTrafico> = {}): TramoTrafico {
  return {
    id: 't1',
    nombre: 'Calle Colón',
    geometry: { type: 'LineString', coordinates: [[-0.376, 39.47], [-0.375, 39.471]] },
    estadoCodigo: 2,
    estado: 'congestionado',
    esPasoInferior: false,
    distrito: '01',
    observedAt: FETCHED_AT,
    fetchedAt: FETCHED_AT,
    source: 'ajuntament-valencia-geoportal',
    ...overrides,
  };
}

describe('correlacionarTrafico', () => {
  it('genera señal para tramos densos/congestionados/cortados, no para fluido/sin-datos', () => {
    const tramos = [
      tramo({ id: 'a', estado: 'fluido' }),
      tramo({ id: 'b', estado: 'sin-datos' }),
      tramo({ id: 'c', estado: 'denso' }),
      tramo({ id: 'd', estado: 'congestionado' }),
      tramo({ id: 'e', estado: 'cortado' }),
    ];
    const senales = correlacionarTrafico(tramos, FETCHED_AT);
    expect(senales.map((s) => s.id)).toEqual(['trafico:c', 'trafico:d', 'trafico:e']);
    expect(senales.find((s) => s.id === 'trafico:e')?.severidad).toBe('urgente');
    expect(senales.find((s) => s.id === 'trafico:d')?.severidad).toBe('aviso');
  });

  it('incluye lat/lon reales derivados de la geometría, no null', () => {
    const [senal] = correlacionarTrafico([tramo()], FETCHED_AT);
    expect(senal!.lat).not.toBeNull();
    expect(senal!.lon).not.toBeNull();
  });
});

function incidencia(overrides: Partial<IncidenciaViaPublica> = {}): IncidenciaViaPublica {
  return {
    id: 'i1',
    descripcion: 'Obra de infraestructuras',
    tipo: 'incidencias',
    calle: 'Avenida del Puerto',
    afectacion: 'ZONA ESTACIONAMIENTO',
    lat: 39.46,
    lon: -0.32,
    distritoCodigo: '11',
    vigenciaDesde: FETCHED_AT,
    vigenciaHasta: FETCHED_AT,
    fetchedAt: FETCHED_AT,
    source: 'ajuntament-valencia-geoportal',
    ...overrides,
  };
}

describe('correlacionarIncidencias', () => {
  it('conserva calle/lat/lon exactos y fuenteSpec', () => {
    const [senal] = correlacionarIncidencias([incidencia()], FETCHED_AT);
    expect(senal!.calle).toBe('Avenida del Puerto');
    expect(senal!.lat).toBe(39.46);
    expect(senal!.fuenteSpec).toEqual(['026']);
  });

  it('deriva severidad de "afectacion" (calzada real), no de "tipo" — verificado con datos reales el 2026-09-17: la mayoría son ocupaciones rutinarias de acera/estacionamiento con `tipo` "incidencias" que no afectan a la calzada', () => {
    expect(correlacionarIncidencias([incidencia({ afectacion: 'ZONA ESTACIONAMIENTO' })], FETCHED_AT)[0]!.severidad).toBe('informativo');
    expect(correlacionarIncidencias([incidencia({ afectacion: 'ACERA' })], FETCHED_AT)[0]!.severidad).toBe('informativo');
    expect(correlacionarIncidencias([incidencia({ afectacion: '1 CARRIL' })], FETCHED_AT)[0]!.severidad).toBe('aviso');
    expect(correlacionarIncidencias([incidencia({ afectacion: '100% CALZADA' })], FETCHED_AT)[0]!.severidad).toBe('urgente');
  });

  it('deduplica incidencias con el mismo id (una obra partida en varias features de la fuente)', () => {
    const base: IncidenciaViaPublica = {
      id: 'dup1',
      descripcion: 'Obra larga',
      tipo: 'obras',
      calle: 'Calle Larga',
      afectacion: 'zona estacionamiento',
      lat: 39.46,
      lon: -0.32,
      distritoCodigo: '01',
      vigenciaDesde: FETCHED_AT,
      vigenciaHasta: FETCHED_AT,
      fetchedAt: FETCHED_AT,
      source: 'ajuntament-valencia-geoportal',
    };
    const senales = correlacionarIncidencias([base, { ...base }, { ...base }], FETCHED_AT);
    expect(senales).toHaveLength(1);
  });
});

describe('correlacionarClima', () => {
  it('solo genera señal por encima de umbral de lluvia/viento', () => {
    const distritos: LluviaVientoDistrito[] = [
      { distritoCodigo: '01', distritoNombre: 'Ciutat Vella', precipitacionMm: 0.5, vientoKmh: 10, rachaKmh: 15, fecha: FETCHED_AT },
      { distritoCodigo: '02', distritoNombre: "L'Eixample", precipitacionMm: 8, vientoKmh: 20, rachaKmh: 25, fecha: FETCHED_AT },
      { distritoCodigo: '03', distritoNombre: 'Extramurs', precipitacionMm: 0, vientoKmh: 60, rachaKmh: 75, fecha: FETCHED_AT },
    ];
    const senales = correlacionarClima(distritos, FETCHED_AT);
    expect(senales.map((s) => s.distritoCodigo)).toEqual(['02', '03']);
    expect(senales.find((s) => s.distritoCodigo === '03')?.severidad).toBe('urgente');
  });
});

describe('correlacionarEventos', () => {
  it('filtra por impactoViaPublica, ventana temporal y baja confianza', () => {
    const eventos: EventoAgenda[] = [
      {
        id: 'e1',
        titulo: 'Partido Valencia CF',
        categoria: 'DEPORTE',
        fechaInicio: '2026-09-17T18:00:00.000Z',
        fechaFin: '2026-09-17T20:00:00.000Z',
        resumen: null,
        url: 'https://example.com/e1',
        distritosMencionados: [
          { distritoCodigo: '07', distritoNombre: 'Quatre Carreres', coincidencia: 'distrito', textoCoincidente: 'Mestalla', bajaConfianza: false },
        ],
        fetchedAt: FETCHED_AT,
        source: 'valencia-cf-scraping',
        impactoViaPublica: true,
      },
      {
        id: 'e2',
        titulo: 'Evento sin impacto vial',
        categoria: 'CULTURA',
        fechaInicio: '2026-09-17T18:00:00.000Z',
        fechaFin: '2026-09-17T20:00:00.000Z',
        resumen: null,
        url: 'https://example.com/e2',
        distritosMencionados: [{ distritoCodigo: '01', distritoNombre: 'Ciutat Vella', coincidencia: 'barrio', textoCoincidente: 'x', bajaConfianza: false }],
        fetchedAt: FETCHED_AT,
        source: 'ajuntament-valencia-scraping',
        impactoViaPublica: false,
      },
      {
        id: 'e3',
        titulo: 'Evento muy lejano',
        categoria: 'DEPORTE',
        fechaInicio: '2026-12-01T18:00:00.000Z',
        fechaFin: '2026-12-01T20:00:00.000Z',
        resumen: null,
        url: 'https://example.com/e3',
        distritosMencionados: [{ distritoCodigo: '01', distritoNombre: 'Ciutat Vella', coincidencia: 'distrito', textoCoincidente: 'x', bajaConfianza: false }],
        fetchedAt: FETCHED_AT,
        source: 'levante-ud-scraping',
        impactoViaPublica: true,
      },
      {
        id: 'e4',
        titulo: 'Mención de distrito de baja confianza',
        categoria: 'DEPORTE',
        fechaInicio: '2026-09-17T18:00:00.000Z',
        fechaFin: '2026-09-17T20:00:00.000Z',
        resumen: null,
        url: 'https://example.com/e4',
        distritosMencionados: [{ distritoCodigo: '09', distritoNombre: 'Jesus', coincidencia: 'distrito', textoCoincidente: 'jesus', bajaConfianza: true }],
        fetchedAt: FETCHED_AT,
        source: 'ajuntament-valencia-scraping',
        impactoViaPublica: true,
      },
    ];
    const senales = correlacionarEventos(eventos, AHORA, FETCHED_AT);
    expect(senales).toHaveLength(1);
    expect(senales[0]!.id).toBe('evento:e1:07');
  });
});

describe('enlazarPorDistrito', () => {
  it('enlaza señales que comparten distrito, no las que no tienen distrito', () => {
    const senales = [
      { id: 'a', distritoCodigo: '01', relacionadas: [] } as any,
      { id: 'b', distritoCodigo: '01', relacionadas: [] } as any,
      { id: 'c', distritoCodigo: '02', relacionadas: [] } as any,
      { id: 'd', distritoCodigo: null, relacionadas: [] } as any,
    ];
    const resultado = enlazarPorDistrito(senales);
    expect(resultado.find((s) => s.id === 'a')?.relacionadas).toEqual(['b']);
    expect(resultado.find((s) => s.id === 'b')?.relacionadas).toEqual(['a']);
    expect(resultado.find((s) => s.id === 'c')?.relacionadas).toEqual([]);
    expect(resultado.find((s) => s.id === 'd')?.relacionadas).toEqual([]);
  });
});

describe('correlacionarCamaras', () => {
  it('solo genera señal si hay algo activo dentro del radio, y referencia esa señal', () => {
    const cerca: CamaraExternaDgt = { id: 'cam1', carretera: 'V-30', pk: '5', sentido: 'creciente', lat: 39.47, lon: -0.376, imagenUrl: 'https://example.com/cam1.jpg' };
    const lejos: CamaraExternaDgt = { id: 'cam2', carretera: 'A-3', pk: '10', sentido: 'creciente', lat: 40.0, lon: -1.0, imagenUrl: 'https://example.com/cam2.jpg' };
    const senalesConDistrito = [
      { id: 'trafico:t1', tipo: 'trafico', distritoCodigo: '01', calle: 'Calle Colón', lat: 39.4701, lon: -0.3761, descripcion: '', severidad: 'aviso', relacionadas: [], observedAt: FETCHED_AT, fetchedAt: FETCHED_AT, fuenteSpec: ['004'] },
    ] as any;
    const senales = correlacionarCamaras([cerca, lejos], senalesConDistrito, FETCHED_AT);
    expect(senales).toHaveLength(1);
    expect(senales[0]!.id).toBe('camara:cam1');
    expect(senales[0]!.relacionadas).toEqual(['trafico:t1']);
  });
});

describe('correlacionarSenales', () => {
  it('orquesta las 4 fuentes correlacionables + cámaras sin lanzar con entradas vacías', () => {
    const senales = correlacionarSenales({ tramos: [], incidencias: [], climaDistritos: [], eventos: [], camaras: [] }, AHORA);
    expect(senales).toEqual([]);
  });

  it('con datos reales, une tráfico e incidencia del mismo distrito en relacionadas', () => {
    const incidencia: IncidenciaViaPublica = {
      id: 'i1',
      descripcion: 'Corte',
      tipo: 'incidencias',
      calle: 'Calle Colón',
      afectacion: 'corte parcial',
      lat: 39.4705,
      lon: -0.3755,
      distritoCodigo: '01',
      vigenciaDesde: FETCHED_AT,
      vigenciaHasta: FETCHED_AT,
      fetchedAt: FETCHED_AT,
      source: 'ajuntament-valencia-geoportal',
    };
    const senales = correlacionarSenales(
      { tramos: [tramo({ estado: 'congestionado' })], incidencias: [incidencia], climaDistritos: [], eventos: [], camaras: [] },
      AHORA,
    );
    const traficoSenal = senales.find((s) => s.tipo === 'trafico')!;
    const incidenciaSenal = senales.find((s) => s.tipo === 'incidencia')!;
    expect(traficoSenal.relacionadas).toContain(incidenciaSenal.id);
    expect(incidenciaSenal.relacionadas).toContain(traficoSenal.id);
  });
});
