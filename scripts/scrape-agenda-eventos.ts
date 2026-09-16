#!/usr/bin/env -S npx tsx
// Scraping de la agenda de eventos — spec 027 (specs/027-agenda-eventos-scraping.md
// §2, §2.1, §4). Pensado para ejecutarse por GitHub Actions cada 6h (ver
// .github/workflows/agenda-eventos-cron.yml) — necesita un navegador con
// JavaScript de verdad (la web bloquea `fetch` simple con su WAF, §2.1), así
// que corre con Playwright, no como función edge de Vercel (mismo patrón que
// spec 017 usa GitHub Actions en vez de Vercel para su cron).
//
// robots.txt de valencia.es (verificado en navegador el 2026-09-16):
//   Disallow: /-/          Allow: /-/content/
// El listado (`/cas/agenda-de-la-ciudad`) no empieza por `/-/`, sin restricción.
// Las fichas (`/-/content/<slug>`) están explícitamente permitidas.
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { chromium, type Page } from 'playwright';
import {
  construirEventoAgenda,
  detectarEstructuraSospechosa,
  type EventoAgenda,
  type SnapshotAgenda,
  type DatoCrudoListado,
} from '../src/services/agenda-eventos';
import { setLoadedDistricts, type Distrito } from '../src/services/district-geometry';
import distritosGeoJSON from '../data/distritos-valencia.json' with { type: 'json' };

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const SNAPSHOT_PATH = path.join(ROOT, 'data', 'agenda-eventos.json');
const BASE_URL = 'https://www.valencia.es';
const LISTADO_URL = `${BASE_URL}/cas/agenda-de-la-ciudad`;
const USER_AGENT = 'vlc-monitor-agenda-bot/1.0 (+https://github.com/robervx/vlc-monitor)';

interface DistritoFeature {
  type: 'Feature';
  geometry: GeoJSON.Polygon | GeoJSON.MultiPolygon;
  properties: Omit<Distrito, 'geometry'>;
}

function cargarDistritos(): void {
  const distritos: Distrito[] = (distritosGeoJSON.features as unknown as DistritoFeature[]).map((feature) => ({
    ...feature.properties,
    geometry: feature.geometry,
  }));
  setLoadedDistricts(distritos);
}

async function leerSnapshotPrevio(): Promise<SnapshotAgenda | null> {
  try {
    return JSON.parse(await readFile(SNAPSHOT_PATH, 'utf-8')) as SnapshotAgenda;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw err;
  }
}

/** Rechaza cookies no esenciales si aparece el banner — el contenido carga igual sin aceptarlas (verificado en navegador). */
async function rechazarCookiesNoEsenciales(page: Page): Promise<void> {
  const configurar = page.getByRole('button', { name: 'Configurar' });
  if (await configurar.isVisible({ timeout: 5000 }).catch(() => false)) {
    await configurar.click();
    const guardar = page.getByRole('button', { name: 'Guardar mis preferencias' });
    await guardar.click({ timeout: 5000 }).catch(() => undefined);
  }
}

/** Extrae los ítems visibles del listado en la página actual — selectores verificados en navegador el 2026-09-16 (spec 027 §2.1). */
async function extraerListadoPagina(page: Page, baseUrl: string): Promise<DatoCrudoListado[]> {
  return page.$$eval(
    'a.a-actualidad',
    (elementos, base) =>
      elementos
        .map((el) => {
          const href = el.getAttribute('href');
          if (!href) return null;
          const titulo = el.querySelector('p.label-title-agenda')?.textContent?.trim() ?? '';
          const rangoFechaTexto = el.querySelector('p.label-fecha-actualidad')?.textContent?.trim() ?? '';
          const categoria = el.querySelector('p.label-categoria-actualidad span')?.textContent?.trim() ?? '';
          const id = href.split('/').filter(Boolean).pop() ?? '';
          return { id, titulo, categoria, rangoFechaTexto, url: `${base}${href}` };
        })
        .filter((x): x is NonNullable<typeof x> => x !== null && x.id.length > 0 && x.titulo.length > 0),
    baseUrl,
  );
}

/**
 * Paginación: `paginationjs` (verificado en navegador el 2026-09-16, sustituye
 * al portlet Liferay/insuit documentado en la primera verificación de spec 027
 * §2.1 — el sitio cambió de librería de paginación entre medias, misma
 * mecánica de fondo: números de página sin `href` real, cableados por JS). Se
 * hace clic en cada número y se espera a que cambie el primer `href` del
 * listado antes de extraer.
 */
async function numerosDePagina(page: Page): Promise<number> {
  const textos = await page.$$eval('li.paginationjs-page', (els) => els.map((el) => el.textContent?.trim() ?? ''));
  const numeros = textos.map(Number).filter((n) => Number.isFinite(n) && n > 0);
  return numeros.length > 0 ? Math.max(...numeros) : 1;
}

async function irAPagina(page: Page, numero: number): Promise<void> {
  const primerHrefAntes = await page.$eval('a.a-actualidad', (el) => el.getAttribute('href')).catch(() => null);
  const enlacePagina = page.locator('li.paginationjs-page', { hasText: new RegExp(`^${numero}$`) }).locator('a');
  await enlacePagina.click();
  await page.waitForFunction(
    (anterior) => document.querySelector('a.a-actualidad')?.getAttribute('href') !== anterior,
    primerHrefAntes,
    { timeout: 10_000 },
  );
}

/** Ficha de evento (`/-/content/<slug>`) — selectores verificados en navegador el 2026-09-16 (spec 027 §2.1). */
async function extraerFicha(page: Page, url: string): Promise<string[] | null> {
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20_000 });
  const contenedor = await page.$('div.container-agenda-ciudad');
  if (!contenedor) return null;
  return page.$$eval('p.bloque_texto:not(.fecha)', (els) => els.map((el) => el.textContent?.trim() ?? ''));
}

async function main(): Promise<void> {
  cargarDistritos();
  const snapshotPrevio = await leerSnapshotPrevio();
  const eventosPrevios = snapshotPrevio?.eventos ?? [];

  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ userAgent: USER_AGENT });
    await page.goto(LISTADO_URL, { waitUntil: 'domcontentloaded', timeout: 30_000 });
    await rechazarCookiesNoEsenciales(page);
    await page.waitForSelector('a.a-actualidad', { timeout: 15_000 });

    const totalPaginas = await numerosDePagina(page);
    const crudos: DatoCrudoListado[] = [];
    for (let pagina = 1; pagina <= totalPaginas; pagina++) {
      if (pagina > 1) await irAPagina(page, pagina);
      crudos.push(...(await extraerListadoPagina(page, BASE_URL)));
    }
    console.log(`Listado: ${totalPaginas} página(s), ${crudos.length} eventos brutos.`);

    const fetchedAt = new Date().toISOString();
    const eventos: EventoAgenda[] = [];
    for (const crudo of crudos) {
      const parrafos = await extraerFicha(page, crudo.url).catch((err: unknown) => {
        console.warn(`Ficha "${crudo.id}" no se pudo leer: ${(err as Error).message}`);
        return null;
      });
      const evento = construirEventoAgenda(crudo, parrafos ? { parrafos } : null, fetchedAt);
      if (evento) eventos.push(evento);
    }

    const estructuraSospechosa = detectarEstructuraSospechosa(eventos, eventosPrevios);
    const snapshotNuevo: SnapshotAgenda = { eventos, fetchedAt, estructuraSospechosa };

    if (estructuraSospechosa) {
      // No se sobrescribe el snapshot bueno con uno vacío (spec 027 §4) — se
      // conserva el anterior pero marcado como sospechoso, para que la UI lo
      // refleje sin fingir que sigue actualizado.
      const conservado: SnapshotAgenda = { ...snapshotPrevio!, estructuraSospechosa: true, fetchedAt };
      await writeFile(SNAPSHOT_PATH, `${JSON.stringify(conservado, null, 2)}\n`);
      console.error(
        '⚠ estructuraSospechosa: 0 eventos extraídos pero el snapshot anterior tenía eventos — probable cambio de estructura del sitio. Se conserva el snapshot anterior, revisar el scraper.',
      );
      process.exitCode = 1;
      return;
    }

    await writeFile(SNAPSHOT_PATH, `${JSON.stringify(snapshotNuevo, null, 2)}\n`);
    console.log(`Snapshot ${fetchedAt}: ${eventos.length} eventos escritos en ${path.relative(ROOT, SNAPSHOT_PATH)}.`);
  } finally {
    await browser.close();
  }
}

main().catch((err: unknown) => {
  console.error('Fallo al escrapear la agenda de eventos:', err);
  process.exitCode = 1;
});
