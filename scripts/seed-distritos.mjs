#!/usr/bin/env node
// Seed de la spec 000 (specs/000-mapa-base-distritos.md §2 y §4).
// Descarga la geometría oficial de distritos del Geoportal ArcGIS del
// Ayuntamiento de Valencia, la normaliza al contrato de datos de la spec, y
// la escribe como asset estático versionado en data/distritos-valencia.geojson.
//
// Se ejecuta manualmente o por cron (baja frecuencia — geometría administrativa
// casi no cambia). Nunca se llama a esta fuente en caliente desde el endpoint.
//
// Uso: node scripts/seed-distritos.mjs

import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const SOURCE_URL =
  'https://geoportal.valencia.es/server/rest/services/OPENDATA/UrbanismoEInfraestructuras/MapServer/225/query?where=1=1&outFields=*&f=geojson';

// Extensión .json (no .geojson) a propósito: así tsc (resolveJsonModule) y el
// bundler de Vite lo importan como módulo JSON tipado sin plugins adicionales,
// tanto en dev como en el build de las funciones edge de api/. El contenido
// sigue siendo GeoJSON válido (FeatureCollection).
const OUTPUT_PATH = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  'data',
  'distritos-valencia.json',
);

const LOWERCASE_PARTICLES = new Set(['de', 'del', 'la', 'les', 'al', "l'", 'els']);

function toTitleCase(nombreMayusculas) {
  return nombreMayusculas
    .toLowerCase()
    .split(' ')
    .map((palabra, i) => {
      if (i > 0 && LOWERCASE_PARTICLES.has(palabra)) return palabra;
      if (palabra.includes("'")) {
        const [prefijo, resto] = palabra.split("'");
        return `${prefijo}'${resto.charAt(0).toUpperCase()}${resto.slice(1)}`;
      }
      return palabra.charAt(0).toUpperCase() + palabra.slice(1);
    })
    .join(' ');
}

// Área con signo (shoelace) de un anillo — usada para centroide ponderado por área.
function ringSignedArea(ring) {
  let area = 0;
  for (let i = 0; i < ring.length - 1; i++) {
    const [x1, y1] = ring[i];
    const [x2, y2] = ring[i + 1];
    area += x1 * y2 - x2 * y1;
  }
  return area / 2;
}

function ringCentroid(ring) {
  let cx = 0;
  let cy = 0;
  const area = ringSignedArea(ring);
  if (area === 0) {
    const n = ring.length - 1;
    for (const [x, y] of ring.slice(0, -1)) {
      cx += x;
      cy += y;
    }
    return { x: cx / n, y: cy / n, area: 0 };
  }
  for (let i = 0; i < ring.length - 1; i++) {
    const [x1, y1] = ring[i];
    const [x2, y2] = ring[i + 1];
    const cross = x1 * y2 - x2 * y1;
    cx += (x1 + x2) * cross;
    cy += (y1 + y2) * cross;
  }
  const factor = 1 / (6 * area);
  return { x: cx * factor, y: cy * factor, area: Math.abs(area) };
}

// Centroide del polígono a partir del anillo exterior (índice 0) de cada parte,
// ponderado por área — suficiente para "ir a distrito X", no para cálculos geodésicos.
function polygonCentroid(coordinates) {
  const outerRing = coordinates[0];
  return ringCentroid(outerRing);
}

function multiPolygonCentroid(polygons) {
  let sumX = 0;
  let sumY = 0;
  let sumArea = 0;
  for (const coordinates of polygons) {
    const { x, y, area } = polygonCentroid(coordinates);
    sumX += x * area;
    sumY += y * area;
    sumArea += area;
  }
  if (sumArea === 0) {
    // fallback: promedio simple si algún anillo degenerado tiene área 0
    return polygonCentroid(polygons[0]);
  }
  return [sumX / sumArea, sumY / sumArea];
}

function extendBbox(bbox, coordinates) {
  for (const ring of coordinates) {
    for (const [x, y] of ring) {
      if (x < bbox[0]) bbox[0] = x;
      if (y < bbox[1]) bbox[1] = y;
      if (x > bbox[2]) bbox[2] = x;
      if (y > bbox[3]) bbox[3] = y;
    }
  }
}

async function main() {
  console.log(`Descargando ${SOURCE_URL} ...`);
  const res = await fetch(SOURCE_URL, {
    headers: { 'User-Agent': 'vlc-monitor-seed/1.0 (+https://github.com/)' },
  });
  if (!res.ok) {
    throw new Error(`Geoportal respondió HTTP ${res.status}`);
  }
  const raw = await res.json();
  if (raw.type !== 'FeatureCollection' || !Array.isArray(raw.features)) {
    throw new Error('Respuesta inesperada: no es un FeatureCollection de GeoJSON');
  }

  // Agrupar por código de distrito — el distrito 17 llega partido en varias
  // features/polígonos disjuntos (pedanías) que hay que fusionar en un MultiPolygon.
  const porCodigo = new Map();
  for (const feature of raw.features) {
    const codigoOrigen = String(feature.properties.coddistrit);
    if (!porCodigo.has(codigoOrigen)) {
      porCodigo.set(codigoOrigen, {
        codigoOrigen,
        nombre: feature.properties.nombre,
        polygons: [],
      });
    }
    const entry = porCodigo.get(codigoOrigen);
    const geom = feature.geometry;
    if (geom.type === 'Polygon') {
      entry.polygons.push(geom.coordinates);
    } else if (geom.type === 'MultiPolygon') {
      entry.polygons.push(...geom.coordinates);
    } else {
      throw new Error(`Tipo de geometría inesperado para distrito ${codigoOrigen}: ${geom.type}`);
    }
  }

  if (porCodigo.size !== 19) {
    throw new Error(`Se esperaban 19 distritos, se obtuvieron ${porCodigo.size}`);
  }

  const fetchedAt = new Date().toISOString();
  const features = [...porCodigo.values()]
    .sort((a, b) => Number(a.codigoOrigen) - Number(b.codigoOrigen))
    .map(({ codigoOrigen, nombre, polygons }) => {
      const codigo = codigoOrigen.padStart(2, '0');
      const geometry =
        polygons.length === 1
          ? { type: 'Polygon', coordinates: polygons[0] }
          : { type: 'MultiPolygon', coordinates: polygons };

      const bbox = [Infinity, Infinity, -Infinity, -Infinity];
      for (const coordinates of polygons) extendBbox(bbox, coordinates);

      const centroide = multiPolygonCentroid(polygons);

      return {
        type: 'Feature',
        geometry,
        properties: {
          codigo,
          nombre: toTitleCase(nombre),
          centroide,
          bbox,
          barrios: [], // pospuesto — ver specs/000-mapa-base-distritos.md §7
          fetchedAt,
          source: 'ajuntament-valencia-geoportal',
        },
      };
    });

  const output = { type: 'FeatureCollection', features };
  await writeFile(OUTPUT_PATH, `${JSON.stringify(output, null, 2)}\n`, 'utf-8');
  console.log(`Escrito ${features.length} distritos en ${OUTPUT_PATH}`);
}

main().catch((err) => {
  console.error('Fallo el seed de distritos:', err);
  process.exitCode = 1;
});
