-- Migración 002 — datos de referencia (dimensiones): distritos y fuentes.
-- Se hace por separado de 001 porque son datos, no esquema — reejecutable
-- con ON CONFLICT sin repetir el DDL.

insert into distrito (codigo, nombre) values
  ('01', 'Ciutat Vella'),
  ('02', 'l''Eixample'),
  ('03', 'Extramurs'),
  ('04', 'Campanar'),
  ('05', 'La Saidia'),
  ('06', 'El Pla del Real'),
  ('07', 'l''Olivereta'),
  ('08', 'Patraix'),
  ('09', 'Jesus'),
  ('10', 'Quatre Carreres'),
  ('11', 'Poblats Maritims'),
  ('12', 'Camins al Grau'),
  ('13', 'Algiros'),
  ('14', 'Benimaclet'),
  ('15', 'Rascanya'),
  ('16', 'Benicalap'),
  ('17', 'Poblats del Nord'),
  ('18', 'Poblats de l''Oest'),
  ('19', 'Poblats del Sud')
on conflict (codigo) do update set nombre = excluded.nombre;

-- Catálogo de fuentes reales — procedencia legal/técnica (distinta de
-- fuenteSpec, que sigue viviendo en `senal.payload` como trazabilidad
-- interna de qué spec de este repo produjo el dato — ver §6 del modelo).
insert into fuente (id, nombre, tipo, licencia, url_base, requiere_api_key, verificado_en) values
  ('ajuntament-valencia-geoportal', 'Geoportal del Ajuntament de València (ArcGIS)', 'oficial-api', 'Reutilización libre (Ley 37/2007 / geoportal municipal)', 'https://geoportal.valencia.es', false, '2026-09-17'),
  ('dgt', 'Dirección General de Tráfico', 'oficial-api', 'Creative Commons Attribution (nap.dgt.es)', 'https://nap.dgt.es', false, '2026-09-17'),
  ('open-meteo', 'Open-Meteo (modelo meteorológico)', 'modelo', 'CC BY 4.0', 'https://api.open-meteo.com', false, '2026-09-01'),
  ('avamet', 'Associació Valenciana de Meteorologia', 'comunitario', 'Sin licencia explícita de reutilización masiva — uso puntual, atribuido', 'https://www.avamet.org', false, '2026-09-17'),
  ('saih-jucar', 'SAIH Júcar (Confederación Hidrográfica del Júcar)', 'oficial-api', 'Datos públicos de organismo de cuenca', 'https://saih.chj.es', false, '2026-09-01'),
  ('gva-emergencias-scraping', 'Generalitat Valenciana — avisos oficiales de emergencias', 'scraping', 'Aviso público oficial', 'https://www.112cv.gva.es', false, '2026-08-01'),
  ('ajuntament-valencia-scraping', 'Agenda de la ciudad — valencia.es', 'scraping', 'robots.txt permite /-/content/', 'https://www.valencia.es', false, '2026-09-16'),
  ('valencia-cf-scraping', 'Valencia CF — calendario oficial', 'scraping', 'Calendario público', 'https://www.valenciacf.com', false, '2026-09-16'),
  ('levante-ud-scraping', 'Levante UD — calendario oficial', 'scraping', 'Calendario público', 'https://www.levanteud.com', false, '2026-09-16'),
  ('roig-arena-scraping', 'Roig Arena — cartelera de eventos', 'scraping', 'Cartelera pública', 'https://www.roigarena.com', false, '2026-09-16'),
  ('fdm-valencia-carreras-scraping', 'Fundación Deportiva Municipal — carreras populares', 'scraping', 'Calendario público', 'https://www.fdmvalencia.es', false, '2026-09-16'),
  ('rss', 'Medios locales (agregación RSS)', 'scraping', 'Feeds RSS públicos por cabecera — ver docs/FUENTES_Y_LICENCIAS.md', null, false, '2026-08-01')
on conflict (id) do update set
  nombre = excluded.nombre,
  tipo = excluded.tipo,
  licencia = excluded.licencia,
  url_base = excluded.url_base,
  requiere_api_key = excluded.requiere_api_key,
  verificado_en = excluded.verificado_en;
