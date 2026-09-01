import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  calcularSccPrincipal,
  calcularBasePropagacion,
  propagarCorte,
} from './propagacion-corte';
import type { RedViaria, Tramo } from './red-viaria';

// Fixture: núcleo (SCC) + una "avenida" de sentido único que sale de él, con
// una lateral que la realimenta y otra que sale de ella.
//
//   p1 <-> p2 <-> p3 <-> p4 <-> p1        núcleo bidireccional (SCC)
//   p1  ->  A  ->  B  ->  C  ->  D        "Avinguda" (sentido único, hacia D)
//   p2  ->  L1 ->  B                      lateral que ENTRA en la avenida
//                  C  ->  S1              lateral que SALE de la avenida
//   p3  ->  T1  ->  p4                    bucle que pasa por T1 (puede volver al núcleo)
function t(id: string, o: string, d: string, sentido: Tramo['sentido'], nombre: string | null = id): Tramo {
  return {
    idTramo: id,
    nodoOrigenId: o,
    nodoDestinoId: d,
    geometria: { type: 'LineString', coordinates: [[0, 0], [0, 0.001]] },
    longitudM: 100,
    tipoVia: 'residencial',
    sentido,
    nombreCalle: nombre,
    nombreCalleRaw: nombre,
    distrito: '01',
    osmWayId: 1,
    versionGrafo: 'test',
    fuenteGeometria: 'test',
    confianzaTopologica: 'limpiezaAutomatica',
  };
}

function fixture(): Tramo[] {
  return [
    t('nucleo-12', 'p1', 'p2', 'bidireccional'),
    t('nucleo-23', 'p2', 'p3', 'bidireccional'),
    t('nucleo-34', 'p3', 'p4', 'bidireccional'),
    t('nucleo-41', 'p4', 'p1', 'bidireccional'),
    t('av-p1A', 'p1', 'A', 'unidireccional', 'Avinguda'),
    t('av-AB', 'A', 'B', 'unidireccional', 'Avinguda'),
    t('av-BC', 'B', 'C', 'unidireccional', 'Avinguda'),
    t('av-CD', 'C', 'D', 'unidireccional', 'Avinguda'),
    t('lat-p2L1', 'p2', 'L1', 'unidireccional', 'Lateral entra'),
    t('lat-L1B', 'L1', 'B', 'unidireccional', 'Lateral entra'),
    t('lat-CS1', 'C', 'S1', 'unidireccional', 'Lateral sale'),
    t('bucle-p3T1', 'p3', 'T1', 'unidireccional', 'Bucle'),
    t('bucle-T1p4', 'T1', 'p4', 'unidireccional', 'Bucle'),
    t('spur-T1T2', 'T1', 'T2', 'bidireccional', 'Ramal ciego'),
  ];
}

function base(tramos: Tramo[]) {
  const scc = calcularSccPrincipal(tramos);
  return { scc, base: calcularBasePropagacion(tramos, scc) };
}

describe('calcularSccPrincipal', () => {
  it('encuentra el núcleo bidireccional como SCC principal (T1 entra porque cierra ciclo por el núcleo)', () => {
    const scc = calcularSccPrincipal(fixture());
    // p1..p4 más T1 (p3->T1->p4->...->p3) forman un ciclo; A,B,C,D,L1,S1 no.
    expect(scc.has('p1')).toBe(true);
    expect(scc.has('p4')).toBe(true);
    expect(scc.has('T1')).toBe(true);
    expect(scc.has('A')).toBe(false);
    expect(scc.has('S1')).toBe(false);
  });

  it('no usa recursión: no desborda la pila con el grafo real (~9k nodos)', () => {
    const p = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'public', 'data', 'red-viaria-rodada.json');
    const red = JSON.parse(readFileSync(p, 'utf-8')) as RedViaria;
    const scc = calcularSccPrincipal(red.tramos);
    // Verificado 2026-09-01: la SCC principal cubre el 95,4 % de los nodos.
    expect(scc.size).toBeGreaterThan(8000);
  });
});

describe('propagarCorte', () => {
  it('sin cortes: todas las listas vacías', () => {
    const { base: b } = base(fixture());
    const r = propagarCorte(fixture(), new Set(), b);
    expect(r.tramosSinEntrada).toHaveLength(0);
    expect(r.tramosSinSalida).toHaveLength(0);
    expect(r.tramosAislados).toHaveLength(0);
    expect(r.tramosDesvioForzado).toHaveLength(0);
  });

  it('corte en la avenida con lateral que realimenta aguas abajo: la propagación NO llega más allá de la realimentación', () => {
    const tramos = fixture();
    const { base: b } = base(tramos);
    // Cortamos A->B. B sigue alcanzable por p2->L1->B, así que nada queda sin entrada.
    const r = propagarCorte(tramos, new Set(['av-AB']), b);
    expect(r.tramosSinEntrada).toHaveLength(0);
    expect(r.tramosAislados).toHaveLength(0);
  });

  it('corte aguas arriba de la realimentación: se quedan sin entrada la avenida restante y la lateral que sale de ella', () => {
    const tramos = fixture();
    const { base: b } = base(tramos);
    // Cortamos B->C: a C/D/S1 ya no llega nadie (única entrada a C era B->C).
    const r = propagarCorte(tramos, new Set(['av-BC']), b);
    const sinEntrada = r.tramosSinEntrada.map((x) => x.idTramo).sort();
    expect(sinEntrada).toEqual(['av-CD', 'lat-CS1']);
    // "Lateral sale" queda sin entrada; "Lateral entra" (L1->B) NO.
    expect(r.tramosSinEntrada.some((x) => x.nombreCalle === 'Lateral entra')).toBe(false);
  });

  it('marca como desvío forzado las vías abiertas que desembocan en la boca del corte, con sinContinuidad si crea fondo de saco', () => {
    const tramos = fixture();
    const { base: b } = base(tramos);
    const r = propagarCorte(tramos, new Set(['av-BC']), b);
    const desvio = r.tramosDesvioForzado.map((x) => x.idTramo).sort();
    // av-AB (A->B) y lat-L1B (L1->B) desembocan en B, que era la boca del corte.
    expect(desvio).toEqual(['av-AB', 'lat-L1B']);
    // Desde B ya no sale nada (su única salida era B->C) -> fondo de saco.
    expect(r.tramosDesvioForzado.every((x) => x.sinContinuidad)).toBe(true);
    expect(r.tramosDesvioForzado.every((x) => x.nodoConflicto === 'B')).toBe(true);
  });

  it('corte que atrapa una zona: queda sin salida (podía volver al núcleo y ya no)', () => {
    const tramos = fixture();
    const { base: b } = base(tramos);
    // Cortamos T1->p4: al núcleo se sigue llegando a T1 (p3->T1) pero T1 ya no
    // puede volver. T1 sale de la SCC principal.
    const r = propagarCorte(tramos, new Set(['bucle-T1p4']), b);
    expect(r.tramosSinSalida.map((x) => x.idTramo)).toContain('bucle-p3T1');
    expect(r.tramosSinSalida.some((x) => x.motivo === 'sinSalida')).toBe(true);
  });

  it('corte que aísla del todo: sin entrada Y sin salida -> aislado, sin duplicar en las otras listas', () => {
    const tramos = fixture();
    const { base: b } = base(tramos);
    // Cortamos las dos conexiones de T1 con el núcleo: al ramal ciego T1-T2 ya
    // no se llega ni se sale.
    const r = propagarCorte(tramos, new Set(['bucle-p3T1', 'bucle-T1p4']), b);
    const aislados = r.tramosAislados.map((x) => x.idTramo);
    const enOtras = [...r.tramosSinEntrada, ...r.tramosSinSalida].map((x) => x.idTramo);
    expect(aislados).toContain('spur-T1T2');
    for (const id of aislados) expect(enOtras).not.toContain(id);
  });

  it('trabaja por tramo dirigido: cortar un sentido no afecta al opuesto (calzadas dobles)', () => {
    // Dos calzadas de sentido único opuestas entre los mismos nodos.
    const tramos: Tramo[] = [
      t('nucleo-12', 'p1', 'p2', 'bidireccional'),
      t('nucleo-21b', 'p2', 'p1', 'bidireccional'),
      t('calzada-ida', 'p1', 'X', 'unidireccional', 'Avinguda ida'),
      t('calzada-vuelta', 'X', 'p1', 'unidireccional', 'Avinguda vuelta'),
      t('nucleo-2X', 'p2', 'X', 'bidireccional'),
    ];
    const { base: b } = base(tramos);
    const r = propagarCorte(tramos, new Set(['calzada-ida']), b);
    // X sigue alcanzable por p2<->X; nada sin entrada.
    expect(r.tramosSinEntrada).toHaveLength(0);
    expect(r.tramosAislados).toHaveLength(0);
  });
});
