#!/usr/bin/env -S npx tsx
// Verificación puntual de spec 032 (specs/032-reconciliacion-trafico-grafo.md
// §6) contra datos reales: % de cobertura del emparejamiento tráfico↔grafo,
// desglose por confianza y una muestra de los tramos que quedan sin
// emparejar. No es un seed ni un cron — es una comprobación manual, se
// ejecuta a mano cuando hace falta reverificar (ver DoD).
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { fetchEstadoTrafico } from '../src/services/trafico';
import {
  distritosFromGeoJSON,
  setLoadedDistricts,
  getDistrictAtCoordinates,
} from '../src/services/district-geometry';
import { emparejarTraficoConGrafo } from '../src/services/reconciliacion-trafico-grafo';
import type { RedViaria } from '../src/services/red-viaria';
import distritosGeoJSON from '../data/distritos-valencia.json' with { type: 'json' };

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

async function main(): Promise<void> {
  setLoadedDistricts(distritosFromGeoJSON(distritosGeoJSON));

  const [redViaria, tramosTrafico] = await Promise.all([
    readFile(path.join(ROOT, 'public/data/red-viaria-rodada.json'), 'utf-8').then(
      (raw) => JSON.parse(raw) as RedViaria,
    ),
    fetchEstadoTrafico((lat, lon) => getDistrictAtCoordinates(lat, lon)?.codigo ?? null),
  ]);

  console.log(`Grafo: ${redViaria.tramos.length} tramos. Tráfico: ${tramosTrafico.length} tramos.`);

  const emparejamientos = emparejarTraficoConGrafo(tramosTrafico, redViaria.tramos);

  const sinEmparejar = emparejamientos.filter((e) => e.metodo === 'sinEmparejar');
  const conMetodo = emparejamientos.filter((e) => e.metodo !== 'sinEmparejar');
  const porConfianza = { alta: 0, media: 0, baja: 0 };
  for (const e of conMetodo) porConfianza[e.confianza]++;
  const conNombre = conMetodo.filter((e) => e.metodo === 'nombre+solape').length;

  const pct = (n: number) => `${((n / emparejamientos.length) * 100).toFixed(1)}%`;

  console.log(`\nCobertura: ${conMetodo.length}/${emparejamientos.length} emparejados (${pct(conMetodo.length)})`);
  console.log(`  sin emparejar: ${sinEmparejar.length} (${pct(sinEmparejar.length)})`);
  console.log(`  método nombre+solape: ${conNombre} (${pct(conNombre)})`);
  console.log(`  método solo-solape: ${conMetodo.length - conNombre} (${pct(conMetodo.length - conNombre)})`);
  console.log(
    `  confianza: alta=${porConfianza.alta} (${pct(porConfianza.alta)}) · media=${porConfianza.media} (${pct(porConfianza.media)}) · baja=${porConfianza.baja} (${pct(porConfianza.baja)})`,
  );

  const tramoPorId = new Map(tramosTrafico.map((t) => [t.id, t]));
  console.log('\nMuestra de 10 tramos sin emparejar (nombre, distrito):');
  for (const e of sinEmparejar.slice(0, 10)) {
    const t = tramoPorId.get(e.idTramoTrafico);
    console.log(`  - ${t?.nombre ?? '(sin nombre)'} · distrito ${t?.distrito ?? '?'}`);
  }

  console.log('\nMuestra de 10 emparejamientos de confianza baja (revisión manual):');
  for (const e of conMetodo.filter((x) => x.confianza === 'baja').slice(0, 10)) {
    const t = tramoPorId.get(e.idTramoTrafico);
    console.log(
      `  - ${t?.nombre ?? '(sin nombre)'} → grafo [${e.idsTramoGrafo.join(', ')}] · solape ${(e.solapeFraccion * 100).toFixed(0)}% · método ${e.metodo}`,
    );
  }
}

main().catch((err: unknown) => {
  console.error('Fallo al verificar la reconciliación tráfico-grafo:', err);
  process.exitCode = 1;
});
