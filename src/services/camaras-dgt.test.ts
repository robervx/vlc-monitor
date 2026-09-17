import { describe, expect, it } from 'vitest';
import { normalizarCamarasDgt, agruparPorCarretera, type CamaraCrudaDgt } from './camaras-dgt';

// Fixtures con datos reales capturados en la verificación en vivo del
// 2026-09-17 (dgt.es/.content/.assets/json/camaras.json), incluidas las
// entradas mal formateadas encontradas de verdad en el feed.
const crudas: CamaraCrudaDgt[] = [
  {
    id: '116',
    carretera: 'A-3',
    pk: '351.6',
    sentido: '-',
    latitud: '39.4699',
    longitud: '-0.3763',
    imagen: 'https://etraffic.dgt.es/camarasEtraffic/116.jpg',
    provincia: '46',
  },
  {
    // mismo bug real de formato (coma inicial) que la cámara 178572 del feed,
    // con coordenadas reubicadas dentro del radio para poder probar el
    // parseo y el filtro de radio de forma independiente
    id: '178572',
    carretera: 'A-3',
    pk: '345.0',
    sentido: '+',
    latitud: '39.4600000',
    longitud: ',-0.4100000', // coma inicial real, encontrada en el feed
    provincia: '46',
    imagen: 'https://etraffic.dgt.es/camarasEtraffic/178572.jpg',
  },
  {
    // mismo bug real (coma como separador decimal) que la cámara 186129 del feed
    id: '186129',
    carretera: 'A-3',
    pk: '348,5',
    sentido: '-',
    latitud: '39,4500000',
    longitud: '-0,4000000',
    provincia: '46',
    imagen: 'https://etraffic.dgt.es/camarasEtraffic/186129.jpg',
  },
  {
    id: '181924',
    carretera: 'N-340',
    pk: '1013,77',
    sentido: '-',
    latitud: '40,23368', // muy lejos de Valencia (~85 km) — fuera de radio
    longitud: '0.22099',
    provincia: '46',
    imagen: 'https://etraffic.dgt.es/camarasEtraffic/181924.jpg',
  },
  {
    id: '2',
    carretera: 'A-62',
    pk: '57.9',
    sentido: '-',
    latitud: '42.0676', // provincia distinta (Valladolid) — descartada
    longitud: '-4.2227',
    provincia: '34',
    imagen: 'https://etraffic.dgt.es/camarasEtraffic/2.jpg',
  },
];

describe('normalizarCamarasDgt', () => {
  it('incluye las cámaras de la provincia de Valencia dentro del radio, normalizando coordenadas con formato roto', () => {
    const resultado = normalizarCamarasDgt(crudas);
    expect(resultado.map((c) => c.id)).toEqual(['116', '178572', '186129']);
    expect(resultado[1]).toMatchObject({ lat: 39.46, lon: -0.41 });
    expect(resultado[2]).toMatchObject({ lat: 39.45, lon: -0.4 });
  });

  it('descarta cámaras de otra provincia', () => {
    const resultado = normalizarCamarasDgt(crudas);
    expect(resultado.find((c) => c.id === '2')).toBeUndefined();
  });

  it('descarta cámaras fuera del radio alrededor de Valencia aunque sean de la misma provincia', () => {
    const resultado = normalizarCamarasDgt(crudas);
    expect(resultado.find((c) => c.id === '181924')).toBeUndefined();
  });

  it('descarta coordenadas que no se pueden parsear en absoluto', () => {
    const resultado = normalizarCamarasDgt([
      { id: 'x', carretera: 'A-3', pk: '1', sentido: '+', latitud: 'nan', longitud: 'nan', provincia: '46', imagen: 'https://x' },
    ]);
    expect(resultado).toHaveLength(0);
  });
});

describe('agruparPorCarretera', () => {
  it('agrupa por carretera (alfabético) y ordena cada grupo por punto kilométrico', () => {
    const normalizadas = normalizarCamarasDgt(crudas);
    const grupos = agruparPorCarretera(normalizadas);
    expect(grupos).toHaveLength(1);
    expect(grupos[0]!.carretera).toBe('A-3');
    // pk 318,05 < 318,98 < 351.6
    expect(grupos[0]!.camaras.map((c) => c.id)).toEqual(['178572', '186129', '116']);
  });
});
