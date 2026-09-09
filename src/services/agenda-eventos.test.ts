import { describe, expect, it, beforeAll } from 'vitest';
import distritosGeoJSON from '../../data/distritos-valencia.json' with { type: 'json' };
import { setLoadedDistricts, type Distrito } from './district-geometry';
import { resetTablaPatronesGeolocalizacion } from './geolocalizacion-texto';
import {
  parseFechaListado,
  parseFechaFicha,
  parseRangoFechas,
  slugDeUrlFicha,
  recortarResumen,
  normalizarEvento,
  construirSnapshot,
  SNAPSHOT_AGENDA_VACIO,
  type EventoAgendaCrudo,
  type SnapshotAgenda,
} from './agenda-eventos';

interface DistritoFeature {
  type: 'Feature';
  geometry: GeoJSON.Polygon | GeoJSON.MultiPolygon;
  properties: Omit<Distrito, 'geometry'>;
}

beforeAll(() => {
  const distritos: Distrito[] = (distritosGeoJSON.features as unknown as DistritoFeature[]).map(
    (feature) => ({ ...feature.properties, geometry: feature.geometry }),
  );
  setLoadedDistricts(distritos);
  resetTablaPatronesGeolocalizacion();
});

const FETCHED = '2026-09-10T04:00:00.000Z';

describe('parseFechaListado (DD/MM/YYYY)', () => {
  it('parsea una fecha del listado', () => {
    expect(parseFechaListado('23/09/2026')).toBe('2026-09-23');
    expect(parseFechaListado(' 01/12/2026 ')).toBe('2026-12-01');
  });
  it('rechaza texto sin fecha o fecha imposible', () => {
    expect(parseFechaListado('próximamente')).toBeNull();
    expect(parseFechaListado('32/01/2026')).toBeNull();
    expect(parseFechaListado('29/02/2027')).toBeNull(); // no bisiesto
  });
});

describe('parseFechaFicha (DD mmm YYYY)', () => {
  it('parsea mes abreviado y completo en español', () => {
    expect(parseFechaFicha('16 sep 2026')).toBe('2026-09-16');
    expect(parseFechaFicha('16 sept 2026')).toBe('2026-09-16');
    expect(parseFechaFicha('1 enero 2027')).toBe('2027-01-01');
    expect(parseFechaFicha('3 DIC 2026')).toBe('2026-12-03');
  });
  it('rechaza mes desconocido', () => {
    expect(parseFechaFicha('16 xxx 2026')).toBeNull();
  });
});

describe('parseRangoFechas', () => {
  it('separa "X - Y"', () => {
    expect(parseRangoFechas('23/09/2026 - 27/09/2026', parseFechaListado)).toEqual({
      inicio: '2026-09-23',
      fin: '2026-09-27',
    });
  });
  it('quita el prefijo "FECHA:" de la ficha y admite guion largo', () => {
    expect(parseRangoFechas('FECHA: 16 sep 2026 – 27 sep 2026', parseFechaFicha)).toEqual({
      inicio: '2026-09-16',
      fin: '2026-09-27',
    });
  });
  it('tolera el texto real de la ficha (saltos de línea, tabs y coletilla HORARIO/PRECIO)', () => {
    const real =
      'FECHA: \n\n\n                \t09 sep 2026\n                 - \n\n\n                \t27 sep 2026\n\n\n' +
      '                    HORARIO: De martes a sábado de 10:00 a 14:00 horas.\n                    PRECIO: Gratuito';
    expect(parseRangoFechas(real, parseFechaFicha)).toEqual({ inicio: '2026-09-09', fin: '2026-09-27' });
  });

  it('una sola fecha → inicio y fin iguales', () => {
    expect(parseRangoFechas('05/10/2026', parseFechaListado)).toEqual({
      inicio: '2026-10-05',
      fin: '2026-10-05',
    });
  });
  it('vacío → nulls', () => {
    expect(parseRangoFechas(null, parseFechaListado)).toEqual({ inicio: null, fin: null });
  });
});

describe('slugDeUrlFicha', () => {
  it('coge el último segmento', () => {
    expect(slugDeUrlFicha('https://www.valencia.es/cas/agenda-de-la-ciudad/-/content/xvi-russafa-escenica')).toBe(
      'xvi-russafa-escenica',
    );
    expect(slugDeUrlFicha('/cas/agenda-de-la-ciudad/-/content/mi-evento?foo=1#x')).toBe('mi-evento');
  });
});

describe('recortarResumen', () => {
  it('colapsa espacios y deja el texto corto tal cual', () => {
    expect(recortarResumen('  hola   mundo \n ')).toBe('hola mundo');
  });
  it('recorta en límite de palabra con elipsis', () => {
    const largo = 'palabra '.repeat(60);
    const r = recortarResumen(largo, 50)!;
    expect(r.length).toBeLessThanOrEqual(51);
    expect(r.endsWith('…')).toBe(true);
    expect(r).not.toMatch(/palabr…$/); // no corta a mitad de palabra
  });
  it('null/vacío → null', () => {
    expect(recortarResumen(null)).toBeNull();
    expect(recortarResumen('   ')).toBeNull();
  });
});

describe('normalizarEvento', () => {
  const base: EventoAgendaCrudo = {
    url: 'https://www.valencia.es/cas/agenda-de-la-ciudad/-/content/concierto-en-benimaclet',
    titulo: 'Concierto gratuito en Benimaclet',
    categoria: 'música',
    fechasListado: '16/09/2026 - 16/09/2026',
    descripcion: 'Un concierto al aire libre en la plaza del pueblo de Benimaclet.',
  };

  it('normaliza al contrato de §3 y geolocaliza por texto (spec 023)', () => {
    const e = normalizarEvento(base, FETCHED)!;
    expect(e).toMatchObject({
      id: 'concierto-en-benimaclet',
      titulo: 'Concierto gratuito en Benimaclet',
      categoria: 'MÚSICA',
      fechaInicio: '2026-09-16',
      fechaFin: '2026-09-16',
      source: 'ajuntament-valencia-scraping',
      fetchedAt: FETCHED,
    });
    expect(e.distritosMencionados.length).toBeGreaterThan(0);
    expect(e.distritosMencionados[0]).toMatchObject({ coincidencia: 'barrio' });
  });

  it('prefiere las fechas de la ficha si las hay', () => {
    const e = normalizarEvento({ ...base, fechasFicha: 'FECHA: 20 oct 2026 - 25 oct 2026' }, FETCHED)!;
    expect(e.fechaInicio).toBe('2026-10-20');
    expect(e.fechaFin).toBe('2026-10-25');
  });

  it('devuelve null si falta título o fecha', () => {
    expect(normalizarEvento({ ...base, titulo: '' }, FETCHED)).toBeNull();
    expect(normalizarEvento({ ...base, fechasListado: null, fechasFicha: null }, FETCHED)).toBeNull();
  });

  it('tolera categoría/fechas no parseables sin descartar el evento', () => {
    const e = normalizarEvento({ ...base, categoria: null, fechasListado: 'sin definir', fechasFicha: null }, FETCHED)!;
    expect(e.categoria).toBe('');
    expect(e.fechaInicio).toBeNull();
  });
});

describe('construirSnapshot — resiliencia (spec 027 §4)', () => {
  const opts = { generadoEn: FETCHED, paginasLeidas: 4 };
  const crudo = (slug: string): EventoAgendaCrudo => ({
    url: `https://www.valencia.es/cas/agenda-de-la-ciudad/-/content/${slug}`,
    titulo: `Evento ${slug}`,
    categoria: 'TEATRO',
    fechasListado: '10/09/2026 - 12/09/2026',
  });
  const previoConEventos: SnapshotAgenda = {
    eventos: [normalizarEvento(crudo('viejo-1'), '2026-09-09T04:00:00.000Z')!],
    generadoEn: '2026-09-09T04:00:00.000Z',
    paginasLeidas: 4,
    estructuraSospechosa: false,
  };

  it('caso normal: snapshot nuevo con los eventos ordenados por fecha', () => {
    const snap = construirSnapshot([crudo('b'), crudo('a')], SNAPSHOT_AGENDA_VACIO, opts);
    expect(snap.estructuraSospechosa).toBe(false);
    expect(snap.eventos.map((e) => e.id)).toEqual(['a', 'b']);
    expect(snap.generadoEn).toBe(FETCHED);
  });

  it('0 crudos con snapshot previo no vacío → conserva los viejos y marca sospechoso', () => {
    const snap = construirSnapshot([], previoConEventos, opts);
    expect(snap.estructuraSospechosa).toBe(true);
    expect(snap.eventos).toEqual(previoConEventos.eventos);
    expect(snap.generadoEn).toBe(FETCHED); // pero el sello se actualiza
  });

  it('0 crudos sin snapshot previo → snapshot vacío no sospechoso (primera ejecución)', () => {
    const snap = construirSnapshot([], SNAPSHOT_AGENDA_VACIO, opts);
    expect(snap).toMatchObject({ eventos: [], estructuraSospechosa: false });
  });

  it('demasiados crudos sin título/fecha → sospechoso, conserva el previo', () => {
    const rotos: EventoAgendaCrudo[] = [
      crudo('ok-1'),
      { url: 'https://www.valencia.es/cas/agenda-de-la-ciudad/-/content/roto-1' },
      { url: 'https://www.valencia.es/cas/agenda-de-la-ciudad/-/content/roto-2' },
      { url: 'https://www.valencia.es/cas/agenda-de-la-ciudad/-/content/roto-3' },
    ];
    const snap = construirSnapshot(rotos, previoConEventos, opts);
    expect(snap.estructuraSospechosa).toBe(true);
    expect(snap.eventos).toEqual(previoConEventos.eventos);
  });

  it('deduplica slugs repetidos entre páginas', () => {
    const snap = construirSnapshot([crudo('x'), crudo('x'), crudo('y')], SNAPSHOT_AGENDA_VACIO, opts);
    expect(snap.eventos.map((e) => e.id)).toEqual(['x', 'y']);
  });
});
