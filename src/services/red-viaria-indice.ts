/**
 * Índice espacial ligero sobre el grafo viario — spec 020 §3. R-tree
 * (`rbush`) sobre la caja envolvente de cada tramo, para resolver "tramo
 * más cercano a un punto" sin recorrer los 13k+ tramos uno a uno. Se
 * decidió explícitamente no usar H3 aquí (pensado para agregar densidad
 * por celda, problema de una fase distinta) — ver spec 020 §3 y §8.
 */
import RBush from 'rbush';
import { distanciaPuntoALinea, type Coordenada } from './proximidad';
import type { Tramo } from './red-viaria';

interface ItemIndice {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  tramo: Tramo;
}

export interface ResultadoSnap {
  tramo: Tramo;
  distanciaMetros: number;
}

export interface IndiceRedViaria {
  tramoMasCercano(punto: Coordenada, radioMetrosInicial?: number): ResultadoSnap | null;
}

const METROS_POR_GRADO_LAT = 111_320;

/** Construye el índice a partir de los tramos ya generados (spec 020). */
export function construirIndiceEspacial(tramos: Tramo[]): IndiceRedViaria {
  const tree = new RBush<ItemIndice>();
  const items: ItemIndice[] = tramos.map((tramo) => {
    const coords = tramo.geometria.coordinates as Coordenada[];
    const lons = coords.map((c) => c[0]);
    const lats = coords.map((c) => c[1]);
    return {
      minX: Math.min(...lons),
      minY: Math.min(...lats),
      maxX: Math.max(...lons),
      maxY: Math.max(...lats),
      tramo,
    };
  });
  tree.load(items);

  return {
    tramoMasCercano(punto, radioMetrosInicial = 250) {
      // Se amplía el radio de búsqueda si la primera caja no da candidatos
      // (zonas con red más dispersa) — hasta un límite razonable.
      let radio = radioMetrosInicial;
      for (let intento = 0; intento < 4; intento++) {
        const gradosLat = radio / METROS_POR_GRADO_LAT;
        const gradosLon = radio / (METROS_POR_GRADO_LAT * Math.cos((punto[1] * Math.PI) / 180));
        const candidatos = tree.search({
          minX: punto[0] - gradosLon,
          minY: punto[1] - gradosLat,
          maxX: punto[0] + gradosLon,
          maxY: punto[1] + gradosLat,
        });

        if (candidatos.length > 0) {
          let mejor: ResultadoSnap | null = null;
          for (const candidato of candidatos) {
            const distanciaMetros = distanciaPuntoALinea(punto, candidato.tramo.geometria);
            if (!mejor || distanciaMetros < mejor.distanciaMetros) {
              mejor = { tramo: candidato.tramo, distanciaMetros };
            }
          }
          return mejor;
        }
        radio *= 4; // radio insuficiente, se reintenta más amplio
      }
      return null;
    },
  };
}
