#!/usr/bin/env -S npx tsx
// Seed de la spec 046 (specs/046-escorrentia-hidrologia-urbana.md §2/§4) —
// densidad de imbornales/sumideros por distrito. Fuente: geoportal municipal
// (ArcGIS Server, carpeta OPENDATA, capa "Embornals/Imbornales" —
// `.../MapServer/221`), Ley 37/2007 de reutilización de la información del
// sector público — verificado en vivo el 2026-09-17: 68.152 puntos, sin API
// key, `f=geojson` ya reproyecta a WGS84 (no hace falta convertir desde
// EPSG:25830).
//
// Dato estático (los imbornales no cambian en tiempo real) — se ejecuta
// manualmente, igual que `seed-altimetria.ts`. `maxRecordCount` del servicio
// es 2000, así que se pagina con `resultOffset`.
// Uso: npm run seed:imbornales
import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import {
  distritosFromGeoJSON,
  setLoadedDistricts,
  getDistrictAtCoordinates,
  getLoadedDistricts,
} from '../src/services/district-geometry';
import { areaDistritoKm2, resumenImbornalesPorDistrito, type PuntoImbornal } from '../src/services/riesgo-escorrentia';
import distritosGeoJSON from '../data/distritos-valencia.json' with { type: 'json' };

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUTPUT_PATH = path.join(ROOT, 'data', 'imbornales-distrito.json');

const QUERY_URL =
  'https://geoportal.valencia.es/server/rest/services/OPENDATA/UrbanismoEInfraestructuras/MapServer/221/query';
const PAGE_SIZE = 2000;

interface GeoJSONFeatureCollection {
  features: Array<{ geometry: { type: 'Point'; coordinates: [number, number] } }>;
  exceededTransferLimit?: boolean;
}

async function consultarPagina(offset: number): Promise<GeoJSONFeatureCollection> {
  const url =
    `${QUERY_URL}?where=1=1&outFields=objectid&returnGeometry=true` +
    `&resultOffset=${offset}&resultRecordCount=${PAGE_SIZE}&f=geojson`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Geoportal (imbornales) respondió HTTP ${res.status} en offset ${offset}`);
  return (await res.json()) as GeoJSONFeatureCollection;
}

async function descargarTodosLosPuntos(): Promise<PuntoImbornal[]> {
  const puntos: PuntoImbornal[] = [];
  let offset = 0;
  for (;;) {
    const pagina = await consultarPagina(offset);
    for (const f of pagina.features) {
      const [lon, lat] = f.geometry.coordinates;
      puntos.push({ lon, lat });
    }
    console.log(`  offset ${offset}: ${pagina.features.length} puntos (${puntos.length} acumulados)...`);
    if (pagina.features.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }
  return puntos;
}

async function main(): Promise<void> {
  const distritos = distritosFromGeoJSON(distritosGeoJSON);
  setLoadedDistricts(distritos);
  const nombrePorCodigo = new Map(getLoadedDistricts().map((d) => [d.codigo, d.nombre]));
  const areasPorDistrito = new Map(getLoadedDistricts().map((d) => [d.codigo, areaDistritoKm2(d.geometry)]));

  console.log('Descargando imbornales del geoportal (paginado, maxRecordCount=2000)...');
  const puntos = await descargarTodosLosPuntos();
  console.log(`${puntos.length} imbornales descargados. Asignando a distrito (point-in-polygon)...`);

  const puntosPorDistrito = new Map<string, number>();
  let sinDistrito = 0;
  for (const p of puntos) {
    const distrito = getDistrictAtCoordinates(p.lat, p.lon);
    if (!distrito) {
      sinDistrito++;
      continue;
    }
    puntosPorDistrito.set(distrito.codigo, (puntosPorDistrito.get(distrito.codigo) ?? 0) + 1);
  }
  console.log(`${sinDistrito} puntos fuera de cualquier distrito (margen del término municipal) — descartados.`);

  if (puntosPorDistrito.size === 0) {
    throw new Error('0 imbornales asignados a ningún distrito — probable cambio en el servicio del geoportal, no se escribe el fichero.');
  }

  const resumen = resumenImbornalesPorDistrito(puntosPorDistrito, areasPorDistrito, nombrePorCodigo);
  await writeFile(OUTPUT_PATH, `${JSON.stringify(resumen, null, 2)}\n`);
  console.log(
    `${resumen.length} distritos, ${puntos.length - sinDistrito} imbornales asignados escritos en ${path.relative(ROOT, OUTPUT_PATH)}.`,
  );
}

main().catch((err: unknown) => {
  console.error('Fallo al seedear imbornales por distrito:', err);
  process.exitCode = 1;
});
