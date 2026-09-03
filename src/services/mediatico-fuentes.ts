/**
 * Registro único de fuentes del contexto mediático (spec 009 §2, v5).
 * Lo consumen `src/server/mediatico-items.ts` y `src/server/mediatico-tendencia.ts`
 * — antes cada endpoint mantenía su propia lista y se desincronizaban.
 *
 * Además, bootstrapea los distritos/barrios (spec 023) que necesita
 * `geolocalizacion-texto.ts` dentro de cada fetcher: los endpoints edge no
 * tienen "origen de página" implícito, así que se cargan del asset estático
 * directamente (mismo patrón que `api/trafico/v1/estado.ts`). Este módulo es
 * server-only — `main.ts` no lo importa.
 */

import {
  fetchLasProvincias,
  fetchValenciaPlaza,
  fetchVeinteMinutos,
  fetchGoogleNewsLevante,
  fetchGoogleNewsSer,
  fetchValenciaSecreta,
  fetchValenciaBonita,
  type ItemMediatico,
} from './mediatico';
import { distritosFromGeoJSON, getLoadedDistricts, setLoadedDistricts } from './district-geometry';
import distritosGeoJSON from '../../data/distritos-valencia.json' with { type: 'json' };

if (getLoadedDistricts().length === 0) {
  setLoadedDistricts(distritosFromGeoJSON(distritosGeoJSON));
}

export interface FuenteMediatica {
  nombre: string;
  cacheKey: string;
  fetcher: () => Promise<ItemMediatico[]>;
}

/**
 * `cacheKey` con sufijo `:v3` — v5 endurece el filtro (§3.1: marcadores fuera de
 * la ciudad, Valencia Plaza deja de auto-confirmarse) y retira GDELT y À Punt.
 * Bumpear la clave descarta la caché `:v2`, que tendría clasificaciones viejas.
 */
export const FUENTES_MEDIATICAS: FuenteMediatica[] = [
  { nombre: 'Las Provincias', cacheKey: 'mediatico:las-provincias:v3', fetcher: fetchLasProvincias },
  { nombre: 'Valencia Plaza', cacheKey: 'mediatico:valencia-plaza:v3', fetcher: fetchValenciaPlaza },
  { nombre: '20minutos', cacheKey: 'mediatico:20minutos:v3', fetcher: fetchVeinteMinutos },
  { nombre: 'Levante-EMV', cacheKey: 'mediatico:gn-levante:v3', fetcher: fetchGoogleNewsLevante },
  { nombre: 'Cadena SER', cacheKey: 'mediatico:gn-ser:v3', fetcher: fetchGoogleNewsSer },
  { nombre: 'Valencia Secreta', cacheKey: 'mediatico:valencia-secreta:v3', fetcher: fetchValenciaSecreta },
  { nombre: 'Valencia Bonita', cacheKey: 'mediatico:valencia-bonita:v3', fetcher: fetchValenciaBonita },
];
