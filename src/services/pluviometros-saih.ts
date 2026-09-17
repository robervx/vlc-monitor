/**
 * Pluviómetros reales cerca de Valencia — spec 044 §2/§3. Fuente: SAIH Júcar
 * (Confederación Hidrográfica del Júcar, organismo público), mapa de lluvias
 * `saih.chj.es/mapa-lluvias`. El array `estaciones` viene embebido en el HTML
 * de esa página (verificado en vivo el 2026-09-17, sin autenticación) con
 * litros/m² acumulados en 1h/4h/12h/24h por estación — dato real medido, no
 * modelo, a diferencia de Open-Meteo (spec 001/016).
 *
 * Coordenadas del feed en UTM ETRS89 huso 30N (EPSG:25830) — se convierten a
 * lat/lon con `utmToLatLon` (verificado contra dos estaciones reales).
 */
import { utmToLatLon } from './utm';

export interface EstacionSaihCruda {
  idEstacionRemota: string;
  fldTNombre: string;
  fldTPoblacion: string;
  fldTProvincia: string;
  fldNCoordGPSLat: number; // easting UTM, pese al nombre del campo en el feed original
  fldNCoordGPSLon: number; // northing UTM
  lluvia_1h?: number | null;
  lluvia_4h?: number | null;
  lluvia_12h?: number | null;
  lluvia_24h?: number | null;
  fecha_24h?: string;
}

export interface PluviometroSaih {
  id: string;
  nombre: string;
  poblacion: string;
  lat: number;
  lon: number;
  litrosM2_1h: number;
  litrosM2_4h: number;
  litrosM2_12h: number;
  litrosM2_24h: number;
  fecha: string;
}

const VALENCIA_LAT = 39.4699;
const VALENCIA_LON = -0.3763;
/** Mismo criterio que spec 043 (cámaras DGT) — cubre l'Horta metropolitana sin extenderse a toda la cuenca del Júcar. */
const RADIO_KM = 20;

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(lat2 - lat1);
  const dLon = rad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

/** Filtra a estaciones activas dentro del radio alrededor de Valencia, convirtiendo sus coordenadas UTM. */
export function normalizarPluviometrosSaih(crudas: EstacionSaihCruda[]): PluviometroSaih[] {
  const resultado: PluviometroSaih[] = [];
  for (const c of crudas) {
    const { lat, lon } = utmToLatLon(c.fldNCoordGPSLat, c.fldNCoordGPSLon);
    if (haversineKm(VALENCIA_LAT, VALENCIA_LON, lat, lon) > RADIO_KM) continue;
    if (c.lluvia_24h == null) continue; // estación sin dato de lluvia (ej. solo mide caudal/embalse)
    resultado.push({
      id: c.idEstacionRemota,
      nombre: c.fldTNombre,
      poblacion: c.fldTPoblacion,
      lat,
      lon,
      litrosM2_1h: c.lluvia_1h ?? 0,
      litrosM2_4h: c.lluvia_4h ?? 0,
      litrosM2_12h: c.lluvia_12h ?? 0,
      litrosM2_24h: c.lluvia_24h,
      fecha: c.fecha_24h ?? '',
    });
  }
  return resultado.sort((a, b) => b.litrosM2_24h - a.litrosM2_24h);
}
