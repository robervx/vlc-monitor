/**
 * Grafo de la red viaria rodada — Fase 0 del gemelo digital (spec 020).
 * Función pura de construcción del grafo a partir de elementos crudos de
 * Overpass (OSM): sin red, sin DOM. El fetch real vive en
 * scripts/seed-red-viaria.ts — este módulo solo transforma.
 *
 * Simplificaciones deliberadas de v1 (documentadas en spec 020 §7, no
 * ocultas): solo red rodada (la peatonal queda para una iteración
 * posterior), sin colapso de rotondas a nodo compuesto, `nombreCalle`
 * tomado del tag `name` de OSM sin resolver todavía contra el nomenclátor
 * oficial (CDNCV, ver spec 020 §2 — fuente ya verificada, resolución
 * pendiente), y `oneway=-1` (sentido invertido) tratado como bidireccional
 * en vez de invertir el sentido — ninguna de las tres bloquea tener un
 * grafo topológicamente correcto para el resto del gemelo digital.
 */
import { distanciaMetros, type Coordenada } from './proximidad';

export interface OverpassNodeElement {
  type: 'node';
  id: number;
  lat: number;
  lon: number;
}

export interface OverpassWayElement {
  type: 'way';
  id: number;
  nodes: number[];
  tags?: Record<string, string>;
}

export type OverpassElement = OverpassNodeElement | OverpassWayElement | { type: string };

export type TipoVia = 'primaria' | 'secundaria' | 'residencial' | 'peatonal';

export interface Nodo {
  idNodo: string;
  lat: number;
  lon: number;
  tipoNodo: 'interseccion' | 'finalVia'; // 'rotondaColapsada' diferido, ver spec 020 §7
  grado: number;
}

export interface Tramo {
  idTramo: string;
  nodoOrigenId: string;
  nodoDestinoId: string;
  geometria: GeoJSON.LineString;
  longitudM: number;
  tipoVia: TipoVia;
  sentido: 'unidireccional' | 'bidireccional';
  nombreCalle: string | null; // v1: igual a nombreCalleRaw, ver cabecera del módulo
  nombreCalleRaw: string | null;
  distrito: string | null;
  osmWayId: number;
  versionGrafo: string;
  fuenteGeometria: string;
  confianzaTopologica: 'validadoManual' | 'limpiezaAutomatica';
}

export interface RedViaria {
  versionGrafo: string;
  generadoEn: string;
  nodos: Nodo[];
  tramos: Tramo[];
}

// highway=* que cuentan como red rodada para el grafo — excluye
// service/track/driveway/parking_aisle (ruido, no red viaria principal).
// Mapeo a TipoVia (bucket más simple que el tag crudo de OSM, decisión
// explícita de la spec 020 para no exponer las 13 variantes de OSM).
const TIPO_VIA_POR_HIGHWAY: Record<string, TipoVia> = {
  motorway: 'primaria',
  motorway_link: 'primaria',
  trunk: 'primaria',
  trunk_link: 'primaria',
  primary: 'primaria',
  primary_link: 'primaria',
  secondary: 'secundaria',
  secondary_link: 'secundaria',
  tertiary: 'residencial',
  tertiary_link: 'residencial',
  unclassified: 'residencial',
  residential: 'residencial',
  living_street: 'residencial',
};

function idNodoDeterminista(lat: number, lon: number): string {
  return `n:${lat.toFixed(5)}:${lon.toFixed(5)}`;
}

export function construirRedViaria(
  elementos: OverpassElement[],
  opciones: {
    resolverDistrito: (lat: number, lon: number) => string | null;
    versionGrafo: string;
    fuenteGeometria: string;
  },
): RedViaria {
  const coordPorNodoOsm = new Map<number, Coordenada>();
  for (const el of elementos) {
    if (el.type === 'node') {
      const n = el as OverpassNodeElement;
      coordPorNodoOsm.set(n.id, [n.lon, n.lat]);
    }
  }

  const ways = elementos.filter((el): el is OverpassWayElement => el.type === 'way');

  // Un nodo es intersección real si más de un way pasa por él.
  const usoPorNodoOsm = new Map<number, number>();
  for (const way of ways) {
    if (!way.tags?.highway || !(way.tags.highway in TIPO_VIA_POR_HIGHWAY)) continue;
    for (const nodoId of new Set(way.nodes)) {
      usoPorNodoOsm.set(nodoId, (usoPorNodoOsm.get(nodoId) ?? 0) + 1);
    }
  }

  const nodosCoord = new Map<string, { lat: number; lon: number }>();
  const gradoPorNodo = new Map<string, number>();
  const tramos: Tramo[] = [];
  const idsTramoUsados = new Set<string>();

  function registrarNodo(coord: Coordenada): string {
    const [lon, lat] = coord;
    const id = idNodoDeterminista(lat, lon);
    if (!nodosCoord.has(id)) nodosCoord.set(id, { lat, lon });
    gradoPorNodo.set(id, (gradoPorNodo.get(id) ?? 0) + 1);
    return id;
  }

  function idTramoUnico(base: string): string {
    if (!idsTramoUsados.has(base)) {
      idsTramoUsados.add(base);
      return base;
    }
    let i = 2;
    while (idsTramoUsados.has(`${base}:${i}`)) i++;
    const id = `${base}:${i}`;
    idsTramoUsados.add(id);
    return id;
  }

  for (const way of ways) {
    const highway = way.tags?.highway;
    const tipoVia = highway ? TIPO_VIA_POR_HIGHWAY[highway] : undefined;
    if (!tipoVia) continue;

    const coords = way.nodes.map((n) => coordPorNodoOsm.get(n));
    if (coords.some((c) => c === undefined)) continue; // way con nodo no resuelto, se descarta

    // Puntos de corte: extremos del way, o cualquier nodo compartido con otro way.
    const cortes: number[] = [];
    way.nodes.forEach((nodoId, i) => {
      if (i === 0 || i === way.nodes.length - 1 || (usoPorNodoOsm.get(nodoId) ?? 0) > 1) {
        cortes.push(i);
      }
    });

    for (let c = 0; c < cortes.length - 1; c++) {
      const inicio = cortes[c]!;
      const fin = cortes[c + 1]!;
      if (fin === inicio) continue;
      const segmentoCoords = coords.slice(inicio, fin + 1) as Coordenada[];
      if (segmentoCoords.length < 2) continue;

      const primero = segmentoCoords[0]!;
      const ultimo = segmentoCoords[segmentoCoords.length - 1]!;
      const [lonMedio, latMedio] = segmentoCoords[Math.floor(segmentoCoords.length / 2)]!;

      const distrito = opciones.resolverDistrito(latMedio, lonMedio);
      if (distrito === null) continue; // fuera del término municipal — se descarta, ver spec 020 §5

      const nodoOrigenId = registrarNodo(primero);
      const nodoDestinoId = registrarNodo(ultimo);

      let longitudM = 0;
      for (let i = 0; i < segmentoCoords.length - 1; i++) {
        longitudM += distanciaMetros(segmentoCoords[i]!, segmentoCoords[i + 1]!);
      }

      const sentido: Tramo['sentido'] =
        way.tags?.oneway === 'yes' || way.tags?.oneway === '1' ? 'unidireccional' : 'bidireccional';
      const nombre = way.tags?.name ?? null;

      tramos.push({
        idTramo: idTramoUnico(`t:rodada:${nodoOrigenId}:${nodoDestinoId}`),
        nodoOrigenId,
        nodoDestinoId,
        geometria: { type: 'LineString', coordinates: segmentoCoords },
        longitudM,
        tipoVia,
        sentido,
        nombreCalle: nombre,
        nombreCalleRaw: nombre,
        distrito,
        osmWayId: way.id,
        versionGrafo: opciones.versionGrafo,
        fuenteGeometria: opciones.fuenteGeometria,
        confianzaTopologica: 'limpiezaAutomatica',
      });
    }
  }

  const nodos: Nodo[] = [...nodosCoord.entries()].map(([id, { lat, lon }]) => {
    const grado = gradoPorNodo.get(id) ?? 0;
    return { idNodo: id, lat, lon, tipoNodo: grado <= 1 ? 'finalVia' : 'interseccion', grado };
  });

  return {
    versionGrafo: opciones.versionGrafo,
    generadoEn: new Date().toISOString(),
    nodos,
    tramos,
  };
}
