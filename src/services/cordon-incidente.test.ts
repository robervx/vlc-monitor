import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { proponerCordon, type Incidente } from './cordon-incidente';
import { construirIndiceEspacial } from './red-viaria-indice';
import type { RedViaria, Tramo } from './red-viaria';

const RED_REAL_PATH = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'data', 'red-viaria-rodada.json');
const redReal = JSON.parse(readFileSync(RED_REAL_PATH, 'utf-8')) as RedViaria;
const indiceReal = construirIndiceEspacial(redReal.tramos);

function tramoFixture(parcial: Partial<Tramo> & Pick<Tramo, 'idTramo' | 'nodoOrigenId' | 'nodoDestinoId' | 'longitudM' | 'geometria'>): Tramo {
  return {
    tipoVia: 'residencial',
    sentido: 'bidireccional',
    nombreCalle: null,
    nombreCalleRaw: null,
    distrito: '01',
    osmWayId: 1,
    versionGrafo: 'test',
    fuenteGeometria: 'test',
    confianzaTopologica: 'limpiezaAutomatica',
    ...parcial,
  };
}

function incidenteFixture(parcial: Partial<Incidente> = {}): Incidente {
  return {
    idIncidente: 'inc-1',
    tipo: 'incendio',
    subtipo: 'vivienda',
    ubicacion: { lat: 39.47, lon: -0.38 },
    necesidadDesalojo: false,
    intensidad: 'conato',
    creadoEn: new Date().toISOString(),
    ...parcial,
  };
}

describe('proponerCordon — fixture sintético "río"', () => {
  // a1 --- a2 ======(puente, 500m)====== b2 --- b1
  // El incidente está en a1. b1/b2 están geográficamente muy cerca de a1 en
  // línea recta, pero solo se puede llegar por un puente lejano — deben
  // quedar excluidos de la propuesta pese a la cercanía euclídea.
  const a1: [number, number] = [-0.38, 39.47];
  const a2: [number, number] = [-0.38, 39.4705]; // ~55m al norte de a1
  const b1: [number, number] = [-0.3795, 39.47]; // ~43m al este de a1 en línea recta
  const b2: [number, number] = [-0.3795, 39.4705];

  const tramoA = tramoFixture({
    idTramo: 'tramoA',
    nodoOrigenId: 'a1',
    nodoDestinoId: 'a2',
    longitudM: 55,
    geometria: { type: 'LineString', coordinates: [a1, a2] },
  });
  const tramoPuente = tramoFixture({
    idTramo: 'tramoPuente',
    nodoOrigenId: 'a2',
    nodoDestinoId: 'b2',
    longitudM: 500,
    geometria: { type: 'LineString', coordinates: [a2, b2] },
  });
  const tramoB = tramoFixture({
    idTramo: 'tramoB',
    nodoOrigenId: 'b1',
    nodoDestinoId: 'b2',
    longitudM: 55,
    geometria: { type: 'LineString', coordinates: [b1, b2] },
  });

  const tramos = [tramoA, tramoPuente, tramoB];
  const indice = construirIndiceEspacial(tramos);

  it('incluye el tramo del incidente (distancia de red 0)', () => {
    const resultado = proponerCordon(incidenteFixture({ ubicacion: { lat: a1[1], lon: a1[0] } }), tramos, indice);
    expect(resultado.ok).toBe(true);
    if (!resultado.ok) return;
    expect(resultado.propuesta.tramosCerrados).toContain('tramoA');
  });

  it('EXCLUYE un tramo euclídeamente cercano (43m) si la distancia de red real es mucho mayor (>500m vía el puente)', () => {
    const resultado = proponerCordon(incidenteFixture({ ubicacion: { lat: a1[1], lon: a1[0] } }), tramos, indice);
    expect(resultado.ok).toBe(true);
    if (!resultado.ok) return;
    const todosLosIncluidos = [
      ...resultado.propuesta.tramosCerrados,
      ...resultado.propuesta.tramosCorte,
      ...resultado.propuesta.tramosDesvioSugerido,
    ];
    expect(todosLosIncluidos).not.toContain('tramoB');
  });

  it('devuelve error si no hay regla para la combinación subtipo/intensidad (defensivo, no debería ocurrir con el enum actual)', () => {
    const resultado = proponerCordon(
      // @ts-expect-error — forzamos un valor fuera del enum para probar el guard
      incidenteFixture({ subtipo: 'noExiste' }),
      tramos,
      indice,
    );
    expect(resultado.ok).toBe(false);
  });

  it('devuelve error si no hay ningún tramo cerca del incidente', () => {
    const resultado = proponerCordon(incidenteFixture({ ubicacion: { lat: 0, lon: 0 } }), tramos, indice);
    expect(resultado.ok).toBe(false);
  });

  it('genera geometrías de polígono válidas para ambas áreas', () => {
    const resultado = proponerCordon(incidenteFixture({ ubicacion: { lat: a1[1], lon: a1[0] } }), tramos, indice);
    expect(resultado.ok).toBe(true);
    if (!resultado.ok) return;
    expect(resultado.propuesta.geometriaAreaIntervencion.type).toBe('Polygon');
    expect(resultado.propuesta.geometriaAreaSocorro.type).toBe('Polygon');
  });

  it('la propuesta empieza siempre con editadaManualmente=false', () => {
    const resultado = proponerCordon(incidenteFixture({ ubicacion: { lat: a1[1], lon: a1[0] } }), tramos, indice);
    expect(resultado.ok).toBe(true);
    if (!resultado.ok) return;
    expect(resultado.propuesta.editadaManualmente).toBe(false);
  });
});

// DoD spec 021 §6: verificado con al menos 3 ubicaciones reales de Valencia.
// El caso "zona con el Turia de por medio" se prueba arriba con un fixture
// sintético controlado — con los radios reales de la tabla de reglas
// (máximo ~100m + 150m de margen) no se encontró un cruce real del Turia lo
// bastante estrecho para ejercitar la propiedad de forma determinista contra
// datos reales; el fixture sintético prueba exactamente el mismo mecanismo
// (distancia de red vs. euclídea) sin depender de encontrar el hueco exacto
// en el grafo real. Documentado aquí en vez de forzar un ejemplo real que no
// llegara a demostrar nada.
describe('proponerCordon — el propio tramo del incidente nunca queda mal clasificado en un tramo largo', () => {
  // Incidente exactamente en el punto medio de un tramo de 150m, con un
  // radio de Área de Intervención muy pequeño (10m, 'conato'). Antes de la
  // corrección, el tramo propio se clasificaba por distancia a sus nodos
  // (75m a cada extremo) y quedaba fuera de "cerrados" pese a que el
  // incidente está literalmente encima.
  it('incluye el tramo propio en tramosCerrados aunque el radio sea menor que medio tramo', () => {
    const origen: [number, number] = [-0.39, 39.47];
    const destino: [number, number] = [-0.39, 39.4713]; // ~150m al norte
    const medio: [number, number] = [-0.39, 39.47065]; // punto medio aprox.

    const tramoLargo = tramoFixture({
      idTramo: 'tramoLargo',
      nodoOrigenId: 'o',
      nodoDestinoId: 'd',
      longitudM: 150,
      geometria: { type: 'LineString', coordinates: [origen, destino] },
    });

    const indice = construirIndiceEspacial([tramoLargo]);
    const resultado = proponerCordon(
      incidenteFixture({ subtipo: 'vivienda', intensidad: 'conato', ubicacion: { lat: medio[1], lon: medio[0] } }),
      [tramoLargo],
      indice,
    );

    expect(resultado.ok).toBe(true);
    if (!resultado.ok) return;
    expect(resultado.propuesta.tramosCerrados).toContain('tramoLargo');
  });
});

describe('proponerCordon — ubicaciones reales de Valencia (DoD spec 021 §6)', () => {
  it('Gran Vía (avenida ancha) — genera una propuesta con tramos cerrados en la propia avenida', () => {
    const incidente = incidenteFixture({
      subtipo: 'edificio',
      intensidad: 'incendioControlado',
      ubicacion: { lat: 39.468, lon: -0.366 },
    });
    const resultado = proponerCordon(incidente, redReal.tramos, indiceReal);
    expect(resultado.ok).toBe(true);
    if (!resultado.ok) return;
    expect(resultado.propuesta.tramosCerrados.length).toBeGreaterThan(0);
    const nombres = resultado.propuesta.tramosCerrados
      .map((id) => redReal.tramos.find((t) => t.idTramo === id)?.nombreCalle)
      .filter(Boolean);
    expect(nombres.some((n) => n?.includes('Gran Via'))).toBe(true);
  });

  it('calle estrecha de Ciutat Vella — genera una propuesta acotada a las calles del entorno inmediato', () => {
    const incidente = incidenteFixture({
      subtipo: 'vivienda',
      intensidad: 'conato',
      ubicacion: { lat: 39.4762, lon: -0.3775 },
    });
    const resultado = proponerCordon(incidente, redReal.tramos, indiceReal);
    expect(resultado.ok).toBe(true);
    if (!resultado.ok) return;
    expect(resultado.propuesta.tramosCerrados.length).toBeGreaterThan(0);
    // Radio de conato es pequeño (10m) — no debería "escaparse" a avenidas
    // lejanas del entorno de Ciutat Vella.
    const idsCerrados = new Set(resultado.propuesta.tramosCerrados);
    const tramosCerrados = redReal.tramos.filter((t) => idsCerrados.has(t.idTramo));
    expect(tramosCerrados.every((t) => t.distrito === '01')).toBe(true);
  });
});
