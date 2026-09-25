#!/usr/bin/env -S npx tsx
// Seed de la spec 049 (specs/049-zonas-acusticamente-saturadas.md §2/§4) —
// polígonos de Zonas Acústicamente Saturadas (ZAS) ya declaradas. Fuente:
// geoportal municipal (ArcGIS Server, carpeta OPENDATA, capa "Zones ZAS" —
// `.../SociedadBienestar/MapServer/5`), CC BY 4.0 — verificado en vivo el
// 2026-09-24: 5 features (Carmen, Xúquer ×2, Woody, Juan Llorens). `f=geojson`
// ya reproyecta a WGS84 (no hace falta convertir desde EPSG:25830).
//
// Dato de declaración administrativa (no cambia salvo nueva ordenanza) — se
// ejecuta manualmente, igual que seed-altimetria.ts. Russafa (la ZAS más
// reciente, en vigor desde el 20/05/2026) TODAVÍA NO está en esta capa — ver
// spec 049 §2/§7, no es un fallo de este script.
// Uso: npm run seed:zonas-zas
import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { normalizarZonasZas } from '../src/services/zas';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUTPUT_PATH = path.join(ROOT, 'data', 'zonas-zas.json');

const QUERY_URL =
  'https://geoportal.valencia.es/server/rest/services/OPENDATA/SociedadBienestar/MapServer/5/query?where=1=1&outFields=*&f=geojson';

async function main(): Promise<void> {
  console.log('Descargando polígonos ZAS del geoportal...');
  const res = await fetch(QUERY_URL);
  if (!res.ok) throw new Error(`Geoportal (ZAS) respondió HTTP ${res.status}`);
  const body = (await res.json()) as { features: Parameters<typeof normalizarZonasZas>[0] };

  if (!body.features || body.features.length === 0) {
    throw new Error('0 features en la capa ZAS del geoportal — probable cambio en el servicio, no se escribe el fichero.');
  }

  const fetchedAt = new Date().toISOString();
  const zonas = normalizarZonasZas(body.features, fetchedAt);
  await writeFile(OUTPUT_PATH, `${JSON.stringify(zonas, null, 2)}\n`);
  console.log(
    `${zonas.length} zonas ZAS (${[...new Set(zonas.map((z) => z.nombre))].join(', ')}) escritas en ${path.relative(ROOT, OUTPUT_PATH)}.`,
  );
  console.log('Aviso: Russafa (ZAS en vigor desde el 20/05/2026) no está todavía en esta capa del geoportal — ver spec 049 §2/§7.');
}

main().catch((err: unknown) => {
  console.error('Fallo al seedear zonas ZAS:', err);
  process.exitCode = 1;
});
