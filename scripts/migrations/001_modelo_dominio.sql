-- Migración 001 — esquema inicial del modelo de dominio de Mirall.
-- Fuente de verdad conceptual: docs/04_MODELO_DE_DATOS.md §10 (revisado en
-- §13 tras la revisión senior del 2026-09-17 — UNIQUE corregido para no
-- colapsar el histórico, columna es_sintetico añadida por CLAUDE.md §4).
-- Aplicada con scripts/aplicar-migracion.ts.

create table if not exists fuente (
  id text primary key,
  nombre text not null,
  tipo text not null,           -- 'oficial-api' | 'scraping' | 'modelo' | 'comunitario'
  licencia text,
  url_base text,
  requiere_api_key boolean not null default false,
  verificado_en date
);

create table if not exists distrito (
  codigo text primary key,
  nombre text not null
  -- geom geography(MultiPolygon, 4326) -- si se adopta PostGIS (§4 del modelo, decidido que NO por ahora)
);

create table if not exists senal (
  id uuid primary key default gen_random_uuid(),
  fuente_id text not null references fuente(id),
  id_origen text not null,
  dominio text not null,          -- 'trafico' | 'incidencia' | 'clima' | 'evento' | 'camara' | ...
  distrito_codigo text references distrito(codigo),
  calle text,
  lat double precision,
  lon double precision,
  severidad text not null,        -- 'informativo' | 'aviso' | 'urgente'
  descripcion text not null,
  payload jsonb not null default '{}',
  es_sintetico boolean not null default false,
  observado_en timestamptz not null,
  ingerido_en timestamptz not null default now(),
  unique (fuente_id, id_origen, observado_en)
);
create index if not exists senal_distrito_tiempo_idx on senal (distrito_codigo, observado_en);
create index if not exists senal_calle_tiempo_idx on senal (calle, observado_en);
create index if not exists senal_dominio_severidad_tiempo_idx on senal (dominio, severidad, observado_en);
create index if not exists senal_ultima_por_entidad_idx on senal (fuente_id, id_origen, observado_en desc);

create table if not exists asociacion (
  senal_id uuid not null references senal(id) on delete cascade,
  asociada_id uuid not null references senal(id) on delete cascade,
  criterio text not null,          -- 'mismo-distrito' | 'proximidad' | 'ventana-temporal'
  distancia_metros numeric,
  primary key (senal_id, asociada_id, criterio)
);

create table if not exists recomendacion (
  id uuid primary key default gen_random_uuid(),
  distrito_codigo text references distrito(codigo),
  zona text not null,
  texto text not null,
  tipo_actuacion text not null,
  modelo text not null,
  generado_en timestamptz not null default now()
);

create table if not exists recomendacion_senal (
  recomendacion_id uuid not null references recomendacion(id) on delete cascade,
  senal_id uuid not null references senal(id) on delete cascade,
  primary key (recomendacion_id, senal_id)
);

create table if not exists evento_programado (
  id text primary key,            -- slug de la ficha, ya estable
  fuente_id text not null references fuente(id),
  titulo text not null,
  categoria text,
  fecha_inicio timestamptz not null,
  fecha_fin timestamptz not null,
  impacto_via_publica boolean not null default false,
  url text
);

create table if not exists evento_distrito (
  evento_id text not null references evento_programado(id) on delete cascade,
  distrito_codigo text not null references distrito(codigo),
  coincidencia text not null,      -- 'distrito' | 'barrio'
  baja_confianza boolean not null default false,
  primary key (evento_id, distrito_codigo)
);
