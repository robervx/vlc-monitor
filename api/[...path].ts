// Router único de la API — spec 020 v3 / deploy.
//
// Vercel Hobby limita a 12 el número de funciones por despliegue. En vez de
// una función por endpoint (~18), se despliega ESTE único catch-all que
// delega en los handlers, que viven en directorios `api/_<dominio>/` (el
// prefijo `_` hace que Vercel no los trate como funciones). Las URLs públicas
// no cambian: siguen siendo `/api/<dominio>/v1/<recurso>`.
//
// Runtime Node (no edge): al empaquetar todos los handlers + sus datos
// (distritos, histórico) el bundle supera el límite de 1 MB del edge en Hobby.
// El límite de body de 4,5 MB no aplica aquí (ninguna respuesta se acerca).

import meteoActual from './_meteo/v1/actual';
import meteoPrediccion from './_meteo/v1/prediccion-corto-plazo';
import aireActual from './_aire/v1/actual';
import traficoEstado from './_trafico/v1/estado';
import traficoHistorico from './_trafico/v1/historico';
import valenbisiEstaciones from './_valenbisi/v1/estaciones';
import aparcamientoEstado from './_aparcamiento/v1/estado';
import pulsoDistrito from './_pulso/v1/distrito';
import insightsActual from './_insights/v1/actual';
import fallasActual from './_fallas/v1/actual';
import mediaticoItems from './_mediatico/v1/items';
import mediaticoTendencia from './_mediatico/v1/tendencia';
import viaPublicaIncidencias from './_via-publica/v1/incidencias';
import geoDistritos from './_geo/v1/distritos';
import mockDensidad from './_mock/v1/densidad-personas';
import authLogin from './_auth/v1/login';
import authLogout from './_auth/v1/logout';
import authEstado from './_auth/v1/estado';

type Handler = (req: Request) => Promise<Response>;

const RUTAS: Record<string, Handler> = {
  'meteo/v1/actual': meteoActual,
  'meteo/v1/prediccion-corto-plazo': meteoPrediccion,
  'aire/v1/actual': aireActual,
  'trafico/v1/estado': traficoEstado,
  'trafico/v1/historico': traficoHistorico,
  'valenbisi/v1/estaciones': valenbisiEstaciones,
  'aparcamiento/v1/estado': aparcamientoEstado,
  'pulso/v1/distrito': pulsoDistrito,
  'insights/v1/actual': insightsActual,
  'fallas/v1/actual': fallasActual,
  'mediatico/v1/items': mediaticoItems,
  'mediatico/v1/tendencia': mediaticoTendencia,
  'via-publica/v1/incidencias': viaPublicaIncidencias,
  'geo/v1/distritos': geoDistritos,
  'mock/v1/densidad-personas': mockDensidad,
  'auth/v1/login': authLogin,
  'auth/v1/logout': authLogout,
  'auth/v1/estado': authEstado,
};

export default async function handler(req: Request): Promise<Response> {
  const ruta = new URL(req.url).pathname.replace(/^\/api\//, '').replace(/\/+$/, '');
  const h = RUTAS[ruta];
  if (!h) {
    return new Response(JSON.stringify({ error: `Ruta de API no encontrada: ${ruta}` }), {
      status: 404,
      headers: { 'content-type': 'application/json; charset=utf-8' },
    });
  }
  return h(req);
}
