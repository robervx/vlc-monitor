import { describe, expect, it } from 'vitest';
import { clasificarAmbitoCiudad, type EntradaClasificacion } from './filtro-ambito-ciudad';

function entrada(over: Partial<EntradaClasificacion> = {}): EntradaClasificacion {
  return {
    titulo: '',
    resumen: null,
    distritosMencionados: [],
    fuenteCityOnly: false,
    ...over,
  };
}

describe('clasificarAmbitoCiudad — señales positivas fuertes', () => {
  it('un barrio de la spec 023 confirma aunque el titular nombre otro municipio', () => {
    const c = clasificarAmbitoCiudad(
      entrada({
        titulo: 'Obras en Russafa que afectan también a Torrent',
        distritosMencionados: [{ distritoNombre: 'Russafa' }],
      }),
    );
    expect(c.ambito).toBe('confirmado');
    expect(c.motivo).toContain('Russafa');
  });

  it('un hito de ciudad gana sobre un marcador regional', () => {
    const c = clasificarAmbitoCiudad(
      entrada({ titulo: 'La Generalitat rehabilita el Mercado Central de València' }),
    );
    expect(c.ambito).toBe('confirmado');
    expect(c.motivo).toContain('hito');
  });

  it('"Ayuntamiento de València" es señal de institución de ciudad', () => {
    const c = clasificarAmbitoCiudad(
      entrada({ titulo: 'El Ayuntamiento de València y la Generalitat firman un convenio' }),
    );
    expect(c.ambito).toBe('confirmado');
  });

  it('el puerto y el aeropuerto de Manises cuentan como infraestructura de ciudad', () => {
    expect(clasificarAmbitoCiudad(entrada({ titulo: 'Récord de cruceros en el Puerto de València' })).ambito).toBe(
      'confirmado',
    );
    expect(
      clasificarAmbitoCiudad(entrada({ titulo: 'Cancelaciones en el aeropuerto de Manises por la niebla' })).ambito,
    ).toBe('confirmado');
  });
});

describe('clasificarAmbitoCiudad — municipios de la província (ejemplos reales del feed de Las Provincias)', () => {
  const casos = [
    'La Pobla de Farnals instala videovigilancia en los accesos del polígono industrial',
    'Torrent instala 35 avisadores acústicos en los semáforos',
    'El alcalde de Gandia inicia el nuevo curso político',
    'Paiporta incorpora 12 funcionarios más a la Policía Local',
  ];
  for (const titulo of casos) {
    it(`descarta: "${titulo.slice(0, 40)}…"`, () => {
      const c = clasificarAmbitoCiudad(entrada({ titulo }));
      expect(c.ambito).toBe('excluido');
      expect(c.motivo).toContain('municipio ajeno');
    });
  }

  it('un nombre ambiguo (Silla) solo descarta si va tras preposición locativa', () => {
    expect(clasificarAmbitoCiudad(entrada({ titulo: 'Detenido tras un robo en Silla' })).ambito).toBe('excluido');
    // "una silla" no es el municipio
    const c = clasificarAmbitoCiudad(entrada({ titulo: 'Roban una silla de valor del museo de València' }));
    expect(c.ambito).not.toBe('excluido');
  });
});

describe('clasificarAmbitoCiudad — marcadores regionales y desambiguación', () => {
  it('descarta ámbito Comunitat / Generalitat / provincia', () => {
    expect(clasificarAmbitoCiudad(entrada({ titulo: 'La Generalitat Valenciana aprueba nuevas ayudas' })).ambito).toBe(
      'excluido',
    );
    expect(
      clasificarAmbitoCiudad(
        entrada({ titulo: 'Poblaciones del área metropolitana de València sufren alzas de precio' }),
      ).ambito,
    ).toBe('excluido');
  });

  it('descarta Valencia (Venezuela)', () => {
    const c = clasificarAmbitoCiudad(entrada({ titulo: 'Tiroteo en Valencia, estado Carabobo' }));
    expect(c.ambito).toBe('excluido');
    expect(c.motivo).toContain('desambiguación');
  });
});

describe('clasificarAmbitoCiudad — deporte', () => {
  it('la crónica / mercado de fichajes se descarta', () => {
    const c = clasificarAmbitoCiudad(entrada({ titulo: 'El Valencia CF cierra el fichaje de un central' }));
    expect(c.ambito).toBe('excluido');
    expect(c.categoria).toBe('deporte');
  });

  it('lo logístico (dispositivo + Mestalla) se mantiene como deporte confirmado', () => {
    const c = clasificarAmbitoCiudad(
      entrada({ titulo: 'Dispositivo especial de tráfico por el partido en Mestalla' }),
    );
    expect(c.ambito).toBe('confirmado');
    expect(c.categoria).toBe('deporte');
  });
});

describe('clasificarAmbitoCiudad — bucket general y fuentes', () => {
  it('menciona València sin barrio ni hito -> general', () => {
    const c = clasificarAmbitoCiudad(
      entrada({ titulo: 'Un herido leve en un accidente en una calle de València' }),
    );
    expect(c.ambito).toBe('general');
  });

  it('una fuente 100% ciudad confirma aunque el titular no dé señales', () => {
    const titulo = 'El tiempo mejora este fin de semana';
    expect(clasificarAmbitoCiudad(entrada({ titulo })).ambito).toBe('excluido');
    expect(clasificarAmbitoCiudad(entrada({ titulo, fuenteCityOnly: true })).ambito).toBe('confirmado');
  });

  it('la fuente de ocio etiqueta la categoría', () => {
    const c = clasificarAmbitoCiudad(
      entrada({ titulo: 'Nueva exposición en el IVAM', fuenteCityOnly: true, categoriaFuente: 'ocio' }),
    );
    expect(c.ambito).toBe('confirmado');
    expect(c.categoria).toBe('ocio');
  });
});
