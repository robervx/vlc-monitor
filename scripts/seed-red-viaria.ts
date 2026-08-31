#!/usr/bin/env -S npx tsx
// Seed de la spec 020 (Fase 0 del gemelo digital — grafo viario rodado).
// Descarga la red viaria rodada de Overpass (OSM) acotada a un bbox holgado
// alrededor de Valencia, construye el grafo de tramos entre intersecciones
// reales (src/services/red-viaria.ts) y lo recorta al término municipal
// resolviendo cada tramo contra la geometría oficial de distritos (spec 000)
// — así se evita depender de un polígono de recorte propio en la consulta
// Overpass. Escribe el resultado como asset estático versionado en
// public/data/red-viaria-rodada.json (servido por el CDN, no por una función:
// pesa ~9 MB, ver spec 020 §7).
//
// Se ejecuta manualmente (la red viaria cambia con muy poca frecuencia).
// Uso: npm run seed:red-viaria
import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { distritosFromGeoJSON, setLoadedDistricts, getDistrictAtCoordinates } from '../src/services/district-geometry';
import { construirRedViaria, type OverpassElement } from '../src/services/red-viaria';
import distritosGeoJSON from '../data/distritos-valencia.json' with { type: 'json' };

const OVERPASS_URL = 'https://overpass-api.de/api/interpreter';

// Bbox holgado (incluye margen de municipios vecinos a propósito) — el
// recorte real al término municipal lo hace getDistrictAtCoordinates sobre
// el punto medio de cada tramo, no este bbox. Ver spec 020 §2.
const BBOX = '39.40,-0.43,39.51,-0.30';

const TIPOS_VIA_QUERY =
  'motorway|motorway_link|trunk|trunk_link|primary|primary_link|secondary|secondary_link|tertiary|tertiary_link|unclassified|residential|living_street';

const OUTPUT_PATH = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public', 'data', 'red-viaria-rodada.json');

async function fetchOverpass(): Promise<OverpassElement[]> {
  const query = `[out:json][timeout:120];(way["highway"~"^(${TIPOS_VIA_QUERY})$"](${BBOX});); out body; >; out skel qt;`;
  const res = await fetch(OVERPASS_URL, {
    method: 'POST',
    body: `data=${encodeURIComponent(query)}`,
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      // Overpass devuelve 406 sin un User-Agent identificable (el por
      // defecto de fetch en Node no vale) — confirmado en vivo 2026-08-25.
      'User-Agent': 'vlc-monitor-seed-script/1.0 (uso interno, generación puntual de red viaria)',
    },
  });
  if (!res.ok) throw new Error(`Overpass API -> HTTP ${res.status}`);
  const data = (await res.json()) as { elements: OverpassElement[] };
  return data.elements;
}

async function main(): Promise<void> {
  const distritos = distritosFromGeoJSON(distritosGeoJSON);
  setLoadedDistricts(distritos);

  console.log('Descargando red viaria rodada de Overpass (bbox Valencia)...');
  const elementos = await fetchOverpass();
  console.log(`  ${elementos.length} elementos OSM recibidos.`);

  const versionGrafo = new Date().toISOString().slice(0, 10);
  const red = construirRedViaria(elementos, {
    resolverDistrito: (lat, lon) => getDistrictAtCoordinates(lat, lon)?.codigo ?? null,
    versionGrafo,
    fuenteGeometria: `overpass-api.de, ${versionGrafo}`,
  });

  console.log(`  ${red.nodos.length} nodos, ${red.tramos.length} tramos tras recortar al término municipal.`);

  await writeFile(OUTPUT_PATH, JSON.stringify(red), 'utf-8');
  console.log(`Escrito en ${OUTPUT_PATH}`);
}

main().catch((err: unknown) => {
  console.error('Fallo generando la red viaria:', err);
  process.exitCode = 1;
});
