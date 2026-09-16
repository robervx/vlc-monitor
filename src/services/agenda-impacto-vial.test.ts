import { describe, expect, it, beforeAll } from 'vitest';
import distritosGeoJSON from '../../data/distritos-valencia.json' with { type: 'json' };
import { setLoadedDistricts, type Distrito } from './district-geometry';
import { resetTablaPatronesGeolocalizacion } from './geolocalizacion-texto';
import {
  inferirAnio,
  construirEventosValenciaCF,
  construirEventosLevante,
  extraerEventosCrudosRoigArena,
  construirEventosRoigArena,
  construirEventosCarrerasFDM,
  type DatoCrudoPartidoVCF,
  type DatoCrudoPartidoLevante,
} from './agenda-impacto-vial';

interface DistritoFeature {
  type: 'Feature';
  geometry: GeoJSON.Polygon | GeoJSON.MultiPolygon;
  properties: Omit<Distrito, 'geometry'>;
}

beforeAll(() => {
  const distritos: Distrito[] = (distritosGeoJSON.features as unknown as DistritoFeature[]).map((feature) => ({
    ...feature.properties,
    geometry: feature.geometry,
  }));
  setLoadedDistricts(distritos);
  resetTablaPatronesGeolocalizacion();
});

describe('inferirAnio', () => {
  const ahora = new Date('2026-09-17T00:00:00.000Z');

  it('mismo año si la fecha cae dentro de los próximos meses', () => {
    expect(inferirAnio(10, 20, ahora)).toBe(2026);
  });

  it('año siguiente si la fecha con el año actual queda muy en el pasado (cruce de temporada)', () => {
    expect(inferirAnio(1, 10, ahora)).toBe(2027);
  });
});

describe('construirEventosValenciaCF (datos reales verificados 2026-09-17, /resultados?range=next)', () => {
  const crudos: DatoCrudoPartidoVCF[] = [
    {
      fechaTexto: 'dom. 20 sep. / Jor. 7 ',
      ubicacion: 'Mestalla',
      equipoIzquierda: 'Valencia CF',
      equipoDerecha: 'Real Sociedad',
      hora: '21:00',
    },
    {
      fechaTexto: 'dom. 11 oct. / Jor. 8 ',
      ubicacion: 'El Sardinero',
      equipoIzquierda: 'Racing de Santander',
      equipoDerecha: 'Valencia CF',
      hora: '21:00',
    },
  ];

  it('solo incluye los partidos en Mestalla (como local)', () => {
    const eventos = construirEventosValenciaCF(crudos, '2026-09-17T00:00:00.000Z', new Date('2026-09-17T00:00:00.000Z'));
    expect(eventos).toHaveLength(1);
    expect(eventos[0]!.titulo).toBe('Valencia CF vs Real Sociedad');
    expect(eventos[0]!.impactoViaPublica).toBe(true);
    expect(eventos[0]!.source).toBe('valencia-cf-scraping');
    expect(eventos[0]!.id).toBe('vcf-jor7-20260920');
  });

  it('ignora tarjetas cuya fecha no se puede parsear (estructura cambiada)', () => {
    const eventos = construirEventosValenciaCF(
      [{ ...crudos[0]!, fechaTexto: 'fecha rara' }],
      '2026-09-17T00:00:00.000Z',
    );
    expect(eventos).toHaveLength(0);
  });
});

describe('construirEventosLevante (datos reales verificados 2026-09-17, /partidos)', () => {
  const crudos: DatoCrudoPartidoLevante[] = [
    {
      id: '59a7601f-047a-47de-8ccc-6b11447d1938',
      homeTeamName: 'Levante UD',
      awayTeamName: 'Real Betis',
      venueName: 'Ciutat de Valencia',
      gameweekName: 'Jornada 3',
      time: '2026-08-29T15:00:00Z',
    },
    {
      id: 'osasuna-away',
      homeTeamName: 'CA Osasuna',
      awayTeamName: 'Levante UD',
      venueName: 'El Sadar',
      gameweekName: 'Jornada 2',
      time: '2026-08-24T17:30:00Z',
    },
    {
      id: 'jornada-10-sin-fecha',
      homeTeamName: 'Real Sociedad',
      awayTeamName: 'Levante UD',
      venueName: 'Anoeta',
      gameweekName: 'Jornada 10',
      time: null,
    },
  ];

  it('solo incluye partidos como local (Ciutat de Valencia) con fecha ya confirmada', () => {
    const eventos = construirEventosLevante(crudos, '2026-09-17T00:00:00.000Z');
    expect(eventos).toHaveLength(1);
    expect(eventos[0]!.titulo).toBe('Levante UD vs Real Betis');
    expect(eventos[0]!.impactoViaPublica).toBe(true);
    expect(eventos[0]!.id).toBe('levante-59a7601f-047a-47de-8ccc-6b11447d1938');
  });
});

describe('extraerEventosCrudosRoigArena + construirEventosRoigArena (payload __NUXT_DATA__ real, 2026-09-17)', () => {
  // Fragmento representativo del payload "devalue" real de roigarena.com/es/eventos/
  // (verificado en vivo): un objeto-descriptor (mapa campo -> índice) seguido de los
  // valores a los que apunta.
  const payload: unknown[] = [
    ['ShallowReactive', 1],
    {},
    ['ShallowReactive', 3],
    {},
    {},
    [6],
    {
      name: 7,
      start: 8,
      end: 9,
      locationName: 10,
      locationAddress: 11,
      id: 12,
      slug: 13,
      category: 14,
    },
    'Hijos de la Ruina Tour',
    '2026-09-18T18:00:00.000Z',
    '2026-09-18T21:59:59.000Z',
    'Roig Arena',
    'C/ del Bomber Ramon Duart, 12, Quatre Carreres, 46013 València',
    'f7a8038f-6edb-4805-bc20-6c26511a60f9',
    'hijos-de-la-ruina-tour-20260918',
    'Música',
  ];

  it('escanea el payload y resuelve los campos de cada evento por índice', () => {
    const crudos = extraerEventosCrudosRoigArena(payload);
    expect(crudos).toHaveLength(1);
    expect(crudos[0]).toMatchObject({
      nombre: 'Hijos de la Ruina Tour',
      inicio: '2026-09-18T18:00:00.000Z',
      ubicacion: 'Roig Arena',
      slug: 'hijos-de-la-ruina-tour-20260918',
      categoria: 'Música',
    });
  });

  it('construye el contrato final marcado como impacto en vía pública', () => {
    const crudos = extraerEventosCrudosRoigArena(payload);
    const eventos = construirEventosRoigArena(crudos, '2026-09-17T00:00:00.000Z');
    expect(eventos).toHaveLength(1);
    expect(eventos[0]).toMatchObject({
      id: 'roigarena-hijos-de-la-ruina-tour-20260918',
      titulo: 'Hijos de la Ruina Tour',
      categoria: 'MÚSICA',
      source: 'roig-arena-scraping',
      impactoViaPublica: true,
      url: 'https://www.roigarena.com/es/event/hijos-de-la-ruina-tour-20260918/',
    });
  });

  it('vacío si el payload no contiene descriptores de evento (estructura cambiada)', () => {
    expect(extraerEventosCrudosRoigArena([{}, { foo: 'bar' }, [1, 2, 3]])).toHaveLength(0);
  });
});

describe('construirEventosCarrerasFDM (datos reales verificados 2026-09-17)', () => {
  const ahora = new Date('2026-09-17T00:00:00.000Z');

  it('incluye carreras futuras y descarta las pasadas (el listado no está ordenado cronológicamente)', () => {
    const eventos = construirEventosCarrerasFDM(
      [
        {
          titulo: 'I Volta a Peu a Campanar Cultural i Solidària',
          url: 'https://www.fdmvalencia.es/es/eventos/i-volta-a-peu-a-campanar-cultural-i-solidaria/',
          fechaTexto: '04 Oct 2026',
          horaTexto: '10:00  - 11:00',
        },
        {
          titulo: 'Carrera ya celebrada',
          url: 'https://www.fdmvalencia.es/es/eventos/pasada/',
          fechaTexto: '01 Ene 2020',
          horaTexto: '10:00',
        },
      ],
      '2026-09-17T00:00:00.000Z',
      ahora,
    );
    expect(eventos).toHaveLength(1);
    expect(eventos[0]!.id).toBe('fdm-i-volta-a-peu-a-campanar-cultural-i-solidaria');
    expect(eventos[0]!.categoria).toBe('CARRERAS');
    expect(eventos[0]!.impactoViaPublica).toBe(true);
  });

  it('ignora filas cuya fecha no se puede parsear', () => {
    const eventos = construirEventosCarrerasFDM(
      [{ titulo: 'x', url: 'https://x', fechaTexto: 'sin fecha', horaTexto: null }],
      '2026-09-17T00:00:00.000Z',
      ahora,
    );
    expect(eventos).toHaveLength(0);
  });
});
