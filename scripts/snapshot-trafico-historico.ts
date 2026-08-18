#!/usr/bin/env -S npx tsx
// Snapshot horario de la spec 017 (specs/017-historico-trafico.md §0, §4).
// Pensado para ejecutarse por GitHub Actions cada 60 min (ver
// .github/workflows/trafico-historico-cron.yml), pero también localmente
// para verificarlo (`npm run snapshot:trafico-historico`).
//
// No usa caché de proceso (a diferencia de los endpoints api/): cada
// ejecución es un proceso nuevo de todos modos, así que llama a la fuente
// directamente.
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { fetchEstadoTrafico } from '../src/services/trafico';
import {
  distritosFromGeoJSON,
  setLoadedDistricts,
  getDistrictAtCoordinates,
} from '../src/services/district-geometry';
import {
  agregarSnapshotPorDistrito,
  compactarSnapshotsAntiguos,
  type RollupDiario,
  type SnapshotHorario,
} from '../src/services/trafico-historico';
import distritosGeoJSON from '../data/distritos-valencia.json' with { type: 'json' };

const DATA_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'data');
const SNAPSHOTS_PATH = path.join(DATA_DIR, 'trafico-historico.json');
const ROLLUPS_PATH = path.join(DATA_DIR, 'trafico-historico-diario.json');

async function leerJsonOVacio<T>(rutaFichero: string): Promise<T[]> {
  try {
    return JSON.parse(await readFile(rutaFichero, 'utf-8')) as T[];
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw err;
  }
}

async function main(): Promise<void> {
  const distritos = distritosFromGeoJSON(distritosGeoJSON);
  const distritosBasicos = distritos.map((d) => ({ codigo: d.codigo }));
  setLoadedDistricts(distritos);

  const tramos = await fetchEstadoTrafico((lat, lon) => getDistrictAtCoordinates(lat, lon)?.codigo ?? null);
  const nuevoSnapshot = agregarSnapshotPorDistrito(tramos, distritosBasicos, new Date().toISOString());

  const snapshotsExistentes = await leerJsonOVacio<SnapshotHorario>(SNAPSHOTS_PATH);
  const rollupsExistentes = await leerJsonOVacio<RollupDiario>(ROLLUPS_PATH);

  const { snapshotsRecientes, rollupsActualizados } = compactarSnapshotsAntiguos(
    [...snapshotsExistentes, nuevoSnapshot],
    rollupsExistentes,
    new Date(),
  );

  await writeFile(SNAPSHOTS_PATH, `${JSON.stringify(snapshotsRecientes, null, 2)}\n`);
  await writeFile(ROLLUPS_PATH, `${JSON.stringify(rollupsActualizados, null, 2)}\n`);

  const totalMuestras = nuevoSnapshot.distritos.reduce((acc, d) => acc + d.muestras, 0);
  console.log(
    `Snapshot ${nuevoSnapshot.timestamp}: ${nuevoSnapshot.distritos.length} distritos, ${totalMuestras} tramos con dato. ` +
      `Histórico: ${snapshotsRecientes.length} snapshots horarios, ${rollupsActualizados.length} días compactados.`,
  );
}

main().catch((err: unknown) => {
  console.error('Fallo al generar el snapshot de tráfico histórico:', err);
  process.exitCode = 1;
});
