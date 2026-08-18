# VLC Monitor

Mapa en tiempo real de la ciudad de Valencia: movilidad, meteorología, calidad del aire, eventos e incidencias, agregados en un único panel a partir de fuentes públicas y gratuitas.

Este proyecto se desarrolla con **Spec-Driven Development**: ninguna capa o endpoint se escribe sin una spec previa en `specs/`. Si vas a trabajar en este repo con Claude Code, **lee primero `CLAUDE.md`** — define las reglas del proyecto, sus límites de alcance y sus límites éticos/legales, que son innegociables.

## Empezar

```bash
npm install
npm run dev
```

## Dónde está cada cosa

| Quiero... | Voy a... |
|---|---|
| Entender el producto y por qué existe | `docs/01_VIABILIDAD_VISION_Y_PROCESO.md` |
| Ver de dónde salen los patrones técnicos | `docs/investigacion/WORLDMONITOR_TEARDOWN_VLC_PROPUESTA.md` |
| Ver el catálogo de fuentes de "actividad humana" y el límite ético aplicado | `docs/investigacion/PULSO_HUMANO_FUENTES_OSINT.md` |
| Saber en qué fase estamos y qué toca ahora | `ROADMAP.md` |
| Saber el estado de cada pieza concreta | `specs/INDEX.md` |
| Escribir una spec nueva | Copiar `specs/SPEC_TEMPLATE.md` |
| Reglas del proyecto para cualquier sesión de Claude Code | `CLAUDE.md` |

## Estado actual

Fase **F0 (Cimientos)** en curso — ver `specs/000-mapa-base-distritos.md`. Hay un prototipo paralelo de capa con datos sintéticos (`specs/003-capa-movimiento-personas-mock.md`) para validar la UI de choropleth antes de tener ninguna fuente real de movilidad agregada.

## Licencia y datos

Todas las fuentes de datos usadas son de acceso público/gratuito — ver la tabla de fuentes en `docs/investigacion/PULSO_HUMANO_FUENTES_OSINT.md` y en cada spec individual. Ninguna capa usa datos de localización individual (ver `CLAUDE.md` §4).
