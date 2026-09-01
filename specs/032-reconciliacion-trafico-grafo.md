# 032 — Reconciliación de la capa de tráfico real con el grafo viario

```yaml
id: 032
titulo: "Llevar el estado y el sentido reales de la capa de tráfico (spec 004) a los tramos del grafo (spec 020)"
estado: Draft
tipo: infraestructura
depende_de: [004, 020]
propietario: ""
version: 1
```

## 0. Contexto

Paso 5 (aplazado a spec futura, 2026-09-01) de la revisión del gemelo digital. Las herramientas de cordón (`021`), simulador de cortes (`022`) y el motor de propagación (`031`) razonan hoy **solo sobre el grafo de OSM** (`020`): el sentido de circulación viene del tag `oneway`/`junction`, no del callejero oficial ni del estado real de la vía.

La capa de tráfico en tiempo real (`004`) tiene **412 tramos con estado real** (`fluido`/`denso`/`congestionado`/`cortado`/`sin-datos`), `idtramo` y `denominacion` propios — pero **su geometría está segmentada de forma distinta** a la del grafo, y **no incluye sentido de circulación** (spec `004` §5, limitación ya anotada). Hoy las dos capas viven sin ninguna relación topológica entre sí.

Esta spec reconcilia ambas: un join `TramoTrafico` ↔ `Tramo` del grafo, para que:

- el estado real de tráfico (`cortado`, `congestionado`) se pueda usar como entrada del simulador y del cordón ("ya hay una calle cortada aquí ahora mismo");
- las herramientas puedan mostrar el estado real sobre los mismos tramos que analizan;
- a futuro, el sentido resuelto contra el CDNCV (pendiente en `020` §7) se pueda propagar a la capa de tráfico.

Es el mismo problema de "conciliación segmento-a-segmento" descrito en `docs/investigacion/GEMELO_DIGITAL_SEGURIDAD_PUBLICA_PROPUESTA.md` §6 — no un *snap* punto→línea, sino emparejar dos segmentaciones independientes de la misma calle.

## 1. Problema / motivación

Un mando que usa el cordón o el simulador quiere que la herramienta tenga en cuenta **lo que pasa de verdad ahora mismo** en la calzada (un corte ya activo, una congestión), no solo la topología teórica de OSM. Y quiere ver el estado real sobre el mismo mapa donde planifica los cortes.

## 2. Fuente(s) de datos

Ninguna nueva. Combina:
- `TramoTrafico[]` de spec `004` (`GET /api/trafico/v1/estado`, ya cacheado).
- `Tramo[]` de spec `020` (`/data/red-viaria-rodada.json`, ya cacheado en cliente).
- Opcionalmente, para desempatar por nombre: el nomenclátor CDNCV ya verificado en `020` §2 (resolución aún pendiente).

## 3. Contrato de datos (normalizado)

```typescript
interface EmparejamientoTraficoGrafo {
  idTramoTrafico: string;        // TramoTrafico.id (idtramo del Geoportal)
  idsTramoGrafo: string[];       // uno o varios Tramo.idTramo que cubre ese tramo de tráfico
  metodo: 'nombre+solape' | 'solape' | 'sinEmparejar';
  solapeFraccion: number;        // 0-1, longitud del tramo de tráfico que cae dentro del buffer del grafo
  confianza: 'alta' | 'media' | 'baja';
}

interface EstadoTraficoPorTramoGrafo {
  idTramoGrafo: string;
  estado: TramoTrafico['estado'] | null;   // null si ningún tramo de tráfico lo cubre
  idTramoTraficoOrigen: string | null;
  observedAt: string | null;
}
```

**Algoritmo (borrador, a fijar en implementación)**: para cada `TramoTrafico`, buscar los `Tramo` del grafo cuyo nombre normalizado coincida y cuya geometría solape dentro de un buffer (~15-20 m) por encima de un umbral de fracción de longitud (ej. Hausdorff acotado o % de longitud coincidente). Un tramo de tráfico largo mapea a varios tramos de grafo consecutivos. Los que no llegan al umbral quedan `sinEmparejar` — cobertura parcial es el resultado esperado (el grafo cubre toda la red rodada, la capa de tráfico solo ~412 ejes principales).

## 4. Pipeline (seed → caché → endpoint)

A decidir en implementación. Candidatos:
- **Artefacto pre-calculado** (como el grafo de `020`): el emparejamiento `TramoTrafico.id` ↔ `Tramo.idTramo` es casi estático (cambia solo si cambia el callejero o la segmentación del Geoportal) → `npm run seed:...`, versionado en el repo. El estado en vivo se une en cliente sobre ese mapa fijo.
- El estado de tráfico en sí sigue viniendo del endpoint de `004` con su TTL de 3 min — esta spec no toca esa parte.

## 5. Contrato de capa de mapa

Sin capa nueva propia. Consumidores:
- `021`/`022`/`031`: opción de tratar los `Tramo` con `estado === 'cortado'` como cortes automáticos (marcados como tal, editable — nunca impuesto).
- La capa de tráfico (`004`) podría pasar a pintarse sobre la geometría del grafo (más precisa) en vez de la del Geoportal, y ganar sentido de circulación en su animación de flujo (hoy anota explícitamente que no lo tiene, `004` §5).

## 6. Criterios de aceptación (Definition of Done)

- [ ] Emparejamiento probado con datos reales: % de los ~412 tramos de tráfico conciliados con al menos un `Tramo` del grafo, inspección visual de una muestra, revisión de los tramos con nombre ambiguo/duplicado.
- [ ] Función pura de emparejamiento con tests de fixture (solape total, solape parcial, nombre que coincide pero geometría no, tramo de tráfico que cruza varios tramos de grafo).
- [ ] Documentado el % de cobertura y los casos que quedan `sinEmparejar`, sin forzar emparejamientos de baja confianza.
- [ ] `npm run typecheck` / `npm run test` sin regresiones.

## 7. Riesgos y fuera de alcance

- **Dos segmentaciones que no encajan**: el problema es real y no trivial (mismo que `020` §7 con el CDNCV). Un emparejamiento imperfecto es aceptable si se marca la confianza; lo que no vale es un join silencioso que meta ruido en el cordón.
- **Sentido de circulación**: la capa de tráfico sigue sin traerlo; esta spec puede *heredar* el del grafo hacia la capa de tráfico, no al revés. El sentido definitivo sigue dependiendo de la resolución CDNCV pendiente en `020`.
- **Fuera de alcance**: intensidad numérica continua (dataset de espiras, ver `020`/`GEMELO_DIGITAL` §6), predicción, y cualquier uso del estado real que *ejecute* algo automáticamente (límite de `CLAUDE.md` §4 — "avisa, no actúa": un `cortado` real se ofrece como corte pre-marcado, nunca se aplica solo).

## 8. Historial

| Versión | Fecha | Cambio |
|---|---|---|
| 1 | 2026-09-01 | Creación, `Draft`. Aplazamiento explícito del paso 5 de la revisión del gemelo digital a spec propia. Sin implementar. |
