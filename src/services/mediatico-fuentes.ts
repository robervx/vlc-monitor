/**
 * Registro único de fuentes del contexto mediático (spec 009 §2, v4).
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
  fetchGoogleNewsApunt,
  fetchGoogleNewsSer,
  fetchGdeltValencia,
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
 * `cacheKey` con sufijo `:v2` — el contrato de `ItemMediatico` cambió en v4
 * (nuevos campos, `fuente` pasa a string), invalida la caché `:v1`.
 */
export const FUENTES_MEDIATICAS: FuenteMediatica[] = [
  { nombre: 'Las Provincias', cacheKey: 'mediatico:las-provincias:v2', fetcher: fetchLasProvincias },
  { nombre: 'Valencia Plaza', cacheKey: 'mediatico:valencia-plaza:v2', fetcher: fetchValenciaPlaza },
  { nombre: '20minutos', cacheKey: 'mediatico:20minutos:v2', fetcher: fetchVeinteMinutos },
  { nombre: 'Levante-EMV', cacheKey: 'mediatico:gn-levante:v2', fetcher: fetchGoogleNewsLevante },
  { nombre: 'À Punt', cacheKey: 'mediatico:gn-apunt:v2', fetcher: fetchGoogleNewsApunt },
  { nombre: 'Cadena SER', cacheKey: 'mediatico:gn-ser:v2', fetcher: fetchGoogleNewsSer },
  { nombre: 'GDELT', cacheKey: 'mediatico:gdelt:v2', fetcher: fetchGdeltValencia },
  { nombre: 'Valencia Secreta', cacheKey: 'mediatico:valencia-secreta:v2', fetcher: fetchValenciaSecreta },
  { nombre: 'Valencia Bonita', cacheKey: 'mediatico:valencia-bonita:v2', fetcher: fetchValenciaBonita },
];
