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
    'Paiporta incorpora 12 funcionarios más a la gestión municipal',
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

describe('clasificarAmbitoCiudad — fuera de la ciudad (nacional / internacional), spec 009 v5', () => {
  const casos = [
    'Feijóo pregunta a Sánchez por qué tiene miedo a Marruecos',
    'El Gobierno promete a Ceuta 100 millones más de ayudas',
    'Casual Hoteles llega a República Dominicana con su primera incursión',
    'Directo: Pedro Sánchez comparece en el Congreso de los Diputados',
  ];
  for (const titulo of casos) {
    it(`descarta política nacional / internacional: "${titulo.slice(0, 38)}…"`, () => {
      const c = clasificarAmbitoCiudad(entrada({ titulo, fuenteCityOnly: true }));
      expect(c.ambito).toBe('excluido');
      expect(c.motivo).toContain('fuera de la ciudad');
    });
  }

  it('una señal positiva de ciudad gana: "Sánchez visita el Ayuntamiento de València"', () => {
    const c = clasificarAmbitoCiudad(
      entrada({ titulo: 'Pedro Sánchez visita el Ayuntamiento de València' }),
    );
    expect(c.ambito).toBe('confirmado');
  });

  it('Valencia Plaza ya no auto-confirma: titular sin señal de ciudad se descarta', () => {
    // v5: fuenteCityOnly pasa a false para Valencia Plaza (se prueba aquí el efecto).
    const c = clasificarAmbitoCiudad(
      entrada({ titulo: 'Ni tener grado de inversión logra frenar la caída en bolsa', fuenteCityOnly: false }),
    );
    expect(c.ambito).toBe('excluido');
  });
});

describe('clasificarAmbitoCiudad — deporte (v6: solo interesa el fútbol)', () => {
  it('la crónica de fútbol (Valencia CF) ya NO se descarta — antes de v6 sí', () => {
    const c = clasificarAmbitoCiudad(entrada({ titulo: 'El Valencia CF cierra el fichaje de un central' }));
    expect(c.ambito).not.toBe('excluido');
    expect(c.categoria).toBe('deporte');
  });

  it('lo logístico de fútbol (dispositivo + Mestalla) se mantiene como deporte confirmado', () => {
    const c = clasificarAmbitoCiudad(
      entrada({ titulo: 'Dispositivo especial de tráfico por el partido en Mestalla' }),
    );
    expect(c.ambito).toBe('confirmado');
    expect(c.categoria).toBe('deporte');
  });

  it('la crónica de baloncesto (Valencia Basket) se descarta — no es fútbol', () => {
    const c = clasificarAmbitoCiudad(entrada({ titulo: 'El Valencia Basket ficha a un nuevo pívot' }));
    expect(c.ambito).toBe('excluido');
    expect(c.motivo).toContain('deporte no-fútbol');
  });

  it('lo logístico de otro deporte se descarta igualmente, aunque mencione un distrito', () => {
    // Decisión explícita del usuario: el filtro de "solo fútbol" gana incluso
    // sobre una señal positiva de ciudad (distrito/hito) — a diferencia del
    // resto de exclusiones, que las señales positivas sí superan.
    const c = clasificarAmbitoCiudad(
      entrada({
        titulo: 'Operativo especial de tráfico en Benimaclem por el partido de baloncesto',
        distritosMencionados: [{ distritoNombre: 'Benimaclem' }],
      }),
    );
    expect(c.ambito).toBe('excluido');
    expect(c.motivo).toContain('deporte no-fútbol');
  });

  it('tenis/motor/ciclismo se descartan igual que cualquier otro deporte no-fútbol', () => {
    for (const titulo of ['València sigue el Wimbledon con atención', 'El Gran Premio de MotoGP hace parada en la ciudad']) {
      expect(clasificarAmbitoCiudad(entrada({ titulo })).ambito).toBe('excluido');
    }
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

  it('una fuente temática de ocio/cultura ya no tiene categoría propia (v6) — es "general" como cualquier otra', () => {
    const c = clasificarAmbitoCiudad(entrada({ titulo: 'Nueva exposición en el IVAM', fuenteCityOnly: true }));
    expect(c.ambito).toBe('confirmado');
    expect(c.categoria).toBe('general');
  });
});
