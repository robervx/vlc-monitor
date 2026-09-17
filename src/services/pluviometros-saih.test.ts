import { describe, expect, it } from 'vitest';
import { normalizarPluviometrosSaih, type EstacionSaihCruda } from './pluviometros-saih';

// Datos reales capturados en la verificación en vivo del 2026-09-17
// (saih.chj.es/mapa-lluvias).
const crudas: EstacionSaihCruda[] = [
  {
    idEstacionRemota: '241',
    fldTNombre: 'VALENCIA',
    fldTPoblacion: 'Valencia',
    fldTProvincia: 'Valencia',
    fldNCoordGPSLat: 727259.535981726,
    fldNCoordGPSLon: 4372971.936624126,
    lluvia_1h: 0,
    lluvia_4h: 0,
    lluvia_12h: 3.199996999999996,
    lluvia_24h: 64.19999899999999,
    fecha_24h: '2026-09-17T10:30:00.000Z',
  },
  {
    idEstacionRemota: '802',
    fldTNombre: 'TANCAT DE LA PIPA',
    fldTPoblacion: 'Valencia',
    fldTProvincia: 'Valencia',
    fldNCoordGPSLat: 728585.4040088308,
    fldNCoordGPSLon: 4360134.870698724,
    lluvia_1h: 0.2,
    lluvia_4h: 0.2,
    lluvia_12h: 0.2,
    lluvia_24h: 0.2,
    fecha_24h: '2026-09-17T10:30:00.000Z',
  },
  {
    // Muy lejos (Alicante) — fuera de radio
    idEstacionRemota: '339',
    fldTNombre: 'ALACANT',
    fldTPoblacion: 'Alacant',
    fldTProvincia: 'Alicante',
    fldNCoordGPSLat: 717396.974631832,
    fldNCoordGPSLon: 4245551.963617865,
    lluvia_1h: 0,
    lluvia_4h: 0,
    lluvia_12h: 0,
    lluvia_24h: 0,
    fecha_24h: '2026-09-17T10:30:00.000Z',
  },
  {
    // Sin dato de lluvia (ej. estación de caudal/embalse pura)
    idEstacionRemota: '999',
    fldTNombre: 'EMBALSE X',
    fldTPoblacion: 'Valencia',
    fldTProvincia: 'Valencia',
    fldNCoordGPSLat: 727259.535981726,
    fldNCoordGPSLon: 4372971.936624126,
    lluvia_24h: null,
  },
];

describe('normalizarPluviometrosSaih', () => {
  it('incluye estaciones con dato de lluvia dentro del radio, convirtiendo UTM a lat/lon', () => {
    const resultado = normalizarPluviometrosSaih(crudas);
    expect(resultado.map((e) => e.id)).toEqual(['241', '802']);
    expect(resultado[0]).toMatchObject({ nombre: 'VALENCIA', litrosM2_24h: 64.19999899999999 });
    expect(resultado[0]!.lat).toBeCloseTo(39.4763, 3);
  });

  it('descarta estaciones fuera del radio alrededor de Valencia', () => {
    expect(normalizarPluviometrosSaih(crudas).find((e) => e.id === '339')).toBeUndefined();
  });

  it('descarta estaciones sin dato de lluvia', () => {
    expect(normalizarPluviometrosSaih(crudas).find((e) => e.id === '999')).toBeUndefined();
  });

  it('ordena de mayor a menor acumulado de 24h', () => {
    const resultado = normalizarPluviometrosSaih(crudas);
    expect(resultado[0]!.id).toBe('241'); // 64.2 mm > 0.2 mm
  });
});
