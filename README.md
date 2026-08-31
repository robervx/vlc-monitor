# Intelligent City Monitor

Mapa en tiempo real de la ciudad de **València**: movilidad, meteorología, calidad
del aire, eventos e incidencias, agregados en un único panel a partir de fuentes
de datos **abiertas y gratuitas** (Ajuntament de València, AEMET, Open-Meteo,
GDELT, medios locales).

Proyecto abierto ([MIT](LICENSE)). Puedes desplegarlo tal cual, o partir de él
para tu propia herramienta. No tiene relación con ningún organismo oficial.

## Empezar

```bash
npm install
npm run dev
```

Abre `http://localhost:3000`. No hace falta configurar nada: todas las fuentes
son públicas y el frontend solo habla con endpoints internos (`/api/*`) que
cachean los datos.

```bash
npm run build     # bundle de producción en dist/
npm run preview    # sirve dist/ en local
npm run typecheck
npm run test
```

## Desplegar

Cualquier host de estáticos + funciones sirve. En **Vercel** (Vite se detecta
solo): importa el repo y despliega. Sin variables de entorno, la app queda
**abierta** (modo demo).

### Despliegue privado con acceso restringido (opcional)

Para servir la app tras un login de usuario + PIN, define dos variables de
entorno (`middleware.ts` activa el gate solo si existen):

1. Secreto de firma de sesión:

   ```bash
   openssl rand -hex 32          # -> AUTH_SECRET
   ```

2. Una entrada por cada acceso (persona o turno):

   ```bash
   npm run auth:hash -- alicia    # pide el PIN por consola, sin eco
   ```

   Imprime un objeto `{u,h,s}` (PIN hasheado con PBKDF2). Junta todas las
   entradas en un array JSON:

   ```
   APP_USERS=[{"u":"alicia","h":"…","s":"…"},{"u":"turno-noche","h":"…","s":"…"}]
   ```

3. Añade `AUTH_SECRET` y `APP_USERS` a las variables de entorno del despliegue.
   Alta/baja de un acceso = editar `APP_USERS` y volver a desplegar.

En local, crea un `.env` (git-ignored) con esas dos variables para probar el
gate; sin `.env`, `npm run dev` va abierto.

## PWA (instalable en el móvil)

La app es una PWA: **Android/Chrome** → "Añadir a pantalla de inicio";
**iOS/Safari** → Compartir → "Añadir a pantalla de inicio". Abre a pantalla
completa y tolera red mala (sirve los últimos datos cacheados, marcados como no
en vivo). Cuando hay una versión nueva desplegada aparece un aviso
"Nueva versión · Actualizar" — nunca se recarga sola.

El logo es un **placeholder neutro** generado (`npm run marca`, Node puro).
Sustituye `public/assets/logo.png` por el tuyo (PNG cuadrado, transparente) y
vuelve a lanzar `npm run marca` para regenerar los iconos.

## Escritorio / móvil

La misma app se adapta sola: en móvil (pantalla ≤ 640 px + táctil) la cabecera
se compacta, el sidebar pasa a hoja a pantalla completa y los paneles a un
bottom sheet arrastrable. En escritorio no cambia. El pie del sidebar tiene un
enlace "Ver versión de escritorio / móvil" para forzar uno.

## Cómo está hecho

**Spec-Driven Development**: ninguna capa o endpoint se escribe sin una spec
previa en `specs/`. Si vas a contribuir, **lee `CLAUDE.md`** — define las reglas
del proyecto, sus límites de alcance y su **límite ético/legal** (§4), que son
innegociables: ningún dato de localización individual, ninguna fuente fuera de
cauce legal, "avisa no actúa", y toda capa simulada marcada de forma visible.

| Quiero… | Voy a… |
|---|---|
| Estado de cada pieza | `specs/INDEX.md` |
| Fases del producto | `ROADMAP.md` |
| Por qué existe y cómo se decide | `docs/01_VIABILIDAD_VISION_Y_PROCESO.md` |
| Patrones técnicos (inspiración World Monitor) | `docs/investigacion/WORLDMONITOR_TEARDOWN_VLC_PROPUESTA.md` |
| Decisiones de producto | `docs/decisiones/` (ADR-001, ADR-002) |
| Reglas para sesiones de Claude Code | `CLAUDE.md` |

Stack: TypeScript · Vite · MapLibre GL + deck.gl (2D) · funciones edge para el
caché. Tiles de OpenFreeMap. Sin globo 3D, sin backend con estado propio más
allá del caché.

## Datos y licencia

Código bajo [MIT](LICENSE). Todas las fuentes de datos son de acceso
público/gratuito — ver cada spec y `docs/investigacion/PULSO_HUMANO_FUENTES_OSINT.md`.
Ninguna capa usa datos de localización individual (`CLAUDE.md` §4).
