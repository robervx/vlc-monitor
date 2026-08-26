import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { construirIndiceEspacial } from './red-viaria-indice';
import type { RedViaria } from './red-viaria';

// Lectura directa del fichero (no import estático) para no meter el JSON de
// ~8MB en el pipeline de transform de Vite/esbuild — evita que este único
// test file dispare el tiempo de `npm run test` completo (~16s -> ~43s
// medido con import estático; con readFileSync vuelve al tiempo normal).
const RED_REAL_PATH = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'data', 'red-viaria-rodada.json');
const redReal = JSON.parse(readFileSync(RED_REAL_PATH, 'utf-8')) as RedViaria;

// Fixture pequeño y determinista para los casos de borde.
const TRAMO_BASE = {
  idTramo: 't1',
  nodoOrigenId: 'n:39.47000:-0.37700',
  nodoDestinoId: 'n:39.47100:-0.37600',
  longitudM: 140,
  tipoVia: 'residencial' as const,
  sentido: 'bidireccional' as const,
  nombreCalle: 'Calle Test',
  nombreCalleRaw: 'Calle Test',
  distrito: '01',
  osmWayId: 1,
  versionGrafo: 'test',
  fuenteGeometria: 'test',
  confianzaTopologica: 'limpiezaAutomatica' as const,
};

describe('construirIndiceEspacial — fixture sintético', () => {
  it('encuentra el tramo más cercano a un punto sobre su propia geometría', () => {
    const indice = construirIndiceEspacial([
      { ...TRAMO_BASE, geometria: { type: 'LineString', coordinates: [[-0.377, 39.47], [-0.376, 39.471]] } },
    ]);
    const resultado = indice.tramoMasCercano([-0.3765, 39.4705]);
    expect(resultado?.tramo.idTramo).toBe('t1');
    expect(resultado?.distanciaMetros).toBeLessThan(50);
  });

  it('devuelve null si no hay ningún tramo (grafo vacío)', () => {
    const indice = construirIndiceEspacial([]);
    expect(indice.tramoMasCercano([-0.3765, 39.4705])).toBeNull();
  });

  it('amplía el radio de búsqueda si el primer intento no encuentra candidatos', () => {
    const indice = construirIndiceEspacial([
      { ...TRAMO_BASE, geometria: { type: 'LineString', coordinates: [[-0.377, 39.47], [-0.376, 39.471]] } },
    ]);
    // Punto lejos (~5km) del único tramo — con radio inicial pequeño no
    // aparece a la primera, pero el reintento ampliado debe encontrarlo.
    const resultado = indice.tramoMasCercano([-0.42, 39.47], 100);
    expect(resultado?.tramo.idTramo).toBe('t1');
  });

  it('elige el tramo correcto entre varios candidatos según distancia real', () => {
    const lejano = { ...TRAMO_BASE, idTramo: 'lejano', geometria: { type: 'LineString', coordinates: [[-0.40, 39.47], [-0.399, 39.471]] } as GeoJSON.LineString };
    const cercano = { ...TRAMO_BASE, idTramo: 'cercano', geometria: { type: 'LineString', coordinates: [[-0.3765, 39.4699], [-0.3763, 39.4700]] } as GeoJSON.LineString };
    const indice = construirIndiceEspacial([lejano, cercano]);
    const resultado = indice.tramoMasCercano([-0.3764, 39.4699]);
    expect(resultado?.tramo.idTramo).toBe('cercano');
  });
});

// DoD de spec 020 §6: snap verificado contra 5 ubicaciones reales conocidas
// de Valencia, sobre el grafo real generado por scripts/seed-red-viaria.ts
// (no un fixture) — resultados comprobados manualmente el 2026-08-25.
describe('construirIndiceEspacial — 5 ubicaciones reales conocidas (DoD spec 020)', () => {
  const indice = construirIndiceEspacial(redReal.tramos);

  it.each([
    ['Plaza del Ayuntamiento', [-0.3763, 39.4699], "Plaça de l'Ajuntament", 100],
    ['Ciudad de las Artes y las Ciencias', [-0.3543, 39.4544], 'Carrer de Ricardo Muñoz Suay', 50],
    ['Estación del Norte', [-0.3775, 39.4657], "Carrer d'Alacant", 100],
    ['Mercado Central', [-0.3789, 39.4729], 'Carrer de les Carabasses', 50],
    ['Torres de Serranos', [-0.3757, 39.4784], 'Plaça dels Furs', 100],
  ] as [string, [number, number], string, number][])(
    '%s -> tramo esperado dentro de %dm',
    (_nombre, punto, nombreEsperado, distanciaMaxima) => {
      const resultado = indice.tramoMasCercano(punto);
      expect(resultado).not.toBeNull();
      expect(resultado?.tramo.nombreCalle).toBe(nombreEsperado);
      expect(resultado?.distanciaMetros).toBeLessThan(distanciaMaxima);
    },
  );
});
