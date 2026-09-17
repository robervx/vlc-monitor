import { describe, expect, it } from 'vitest';
import { normalizarEstacionesAvamet, type EstacionAvametCruda } from './avamet-estaciones';

// Datos reales capturados en la verificación en vivo del 2026-09-17
// (avamet.org/mxo-mxo.php?territori=c15).
const crudas: EstacionAvametCruda[] = [
  {
    esta: 'c15m250e39',
    muni: 'Val&egrave;ncia',
    dess: ' Alqueries del Pelut',
    ptda: 'Carpesa',
    msnm: '18',
    lati: '39.52588618',
    logi: '-0.37801261',
    temp: '23,6',
    temp_min: '17,4',
    temp_max: '23,9',
    hrel: '67,0',
    vent: '10,0',
    vent_dir: 'E',
    vent_max: '24,6',
    prec: '4,2',
    prec_mes: '86,0',
    prec_any: '243,4',
    data_ini: '17/09/2026 16:00',
  },
  {
    esta: 'c15m250e27',
    muni: 'Val&egrave;ncia',
    dess: "l&#039;Albufera/Rac&oacute; de l&#039;Olla (Centre d&#039;Informaci&oacute;)",
    ptda: '',
    msnm: '1',
    lati: '39.34036100',
    logi: '-0.32016100',
    temp: '25,6',
    temp_min: '17,8',
    temp_max: '25,6',
    hrel: '73,0',
    vent: '16,1',
    vent_dir: 'NE',
    vent_max: '30,6',
    prec: '6,4',
    prec_mes: '39,8',
    prec_any: '237,6',
    data_ini: '17/09/2026 15:56',
  },
  {
    // coordenada rota (defensa, no visto de verdad pero se cubre)
    esta: 'x',
    muni: 'Val&egrave;ncia',
    dess: 'Sin coordenada',
    ptda: '',
    msnm: '0',
    lati: '0',
    logi: '0',
    temp: '0',
    temp_min: '0',
    temp_max: '0',
    hrel: '0',
    vent: '0',
    vent_dir: '',
    vent_max: '0',
    prec: '0',
    prec_mes: '0',
    prec_any: '0',
    data_ini: '',
  },
];

describe('normalizarEstacionesAvamet', () => {
  it('decodifica entidades HTML y compone el nombre con la partida cuando existe', () => {
    const resultado = normalizarEstacionesAvamet(crudas);
    expect(resultado[0]).toMatchObject({ id: 'c15m250e39', nombre: 'Carpesa — Alqueries del Pelut' });
  });

  it('usa solo dess cuando no hay partida, decodificando apóstrofes y acentos', () => {
    const resultado = normalizarEstacionesAvamet(crudas);
    expect(resultado[1]!.nombre).toBe("l'Albufera/Racó de l'Olla (Centre d'Informació)");
  });

  it('convierte comas decimales a número y lat/lon a float', () => {
    const resultado = normalizarEstacionesAvamet(crudas);
    expect(resultado[0]).toMatchObject({
      lat: 39.52588618,
      lon: -0.37801261,
      temperaturaC: 23.6,
      precipitacionDiaMm: 4.2,
    });
  });

  it('parsea la fecha de observación a ISO 8601', () => {
    const resultado = normalizarEstacionesAvamet(crudas);
    expect(resultado[0]!.observadoEn).toBe(new Date('2026-09-17T16:00:00').toISOString());
  });

  it('descarta estaciones sin coordenada válida', () => {
    const resultado = normalizarEstacionesAvamet(crudas);
    expect(resultado.find((e) => e.id === 'x')).toBeUndefined();
    expect(resultado).toHaveLength(2);
  });
});
