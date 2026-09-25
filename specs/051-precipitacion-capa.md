# Spec 051 — Precipitación como capa de mapa

```yaml
id: 051
titulo: "Precipitación por zona (AVAMET) como capa activable en /mapa"
estado: Implemented
tipo: capa
depende_de: [000, 044]
propietario: ""
version: 3
```

> Origen: petición explícita del usuario (2026-09-24) — quiere la precipitación como capa
> propia en Prioritarias, después de temperatura por zona y zonas ZAS.

## 1. Problema / motivación

Igual que la temperatura (spec 050), la lluvia real por zona ya se calcula (AVAMET, spec 044
v4, y también `044` §lluvia/viento por distrito vía Open-Meteo) pero no existe como capa
visual propia en `/mapa`. Esta spec expone en el mapa un dato que el proyecto ya tiene, sin
fuente nueva.

## 2. Fuente(s) de datos

Ninguna fuente nueva. Misma fuente que spec 050, mismo endpoint ya `Implemented`:

| Fuente | URL | Licencia / condiciones | ¿Requiere API key? | Verificada manualmente el |
|---|---|---|---|---|
| AVAMET — 15 estaciones reales dentro de Valencia ciudad | `mxo-mxo.php?territori=c15` (AVAMET), normalizado por `src/services/avamet-estaciones.ts` | Ya en uso desde spec 039/044 | No | Reutilizada — verificado en esta sesión (2026-09-24) que `GET /api/emergencia/v1/avamet` ya devuelve `precipitacionDiaMm`/`precipitacionMesMm`/`precipitacionAnyMm` por estación en vivo (ej. Carpesa: 0 mm hoy, 90,2 mm este mes) |

## 3. Contrato de datos

Ninguno nuevo — reutiliza `EstacionAvamet` (spec 044) tal cual, en concreto `id`, `nombre`,
`lat`, `lon`, `precipitacionDiaMm`, `observadoEn`. Esta spec no toca ese contrato.

## 4. Pipeline (seed → caché → endpoint)

| Parámetro | Valor |
|---|---|
| Frecuencia de refresco (cron) | Ninguna nueva — reutiliza el polling ya activo de `emergencia/v1/avamet` |
| TTL en caché | El mismo que ya tiene ese endpoint — sin cambios |
| Comportamiento si la fuente falla | El mismo que ya tiene ese endpoint — sin cambios |
| Endpoint interno que sirve el dato | `GET /api/emergencia/v1/avamet` (ya existe, sin cambios) |

## 5. Contrato de capa de mapa

```typescript
{
  key: 'precipitacionZona',
  specId: '051',
  grupo: 'primaria',        // pedido explícito del usuario, 4º lugar (tras agua/temperatura/ZAS)
  renderers: ['deck'],
  zoomMinimo: 0,
  agregacion: 'punto',       // 13-15 estaciones — insignia + valor, igual patrón que temperatura (spec 050)
}
```

**v3 (2026-09-25, petición del usuario)** — mismo cambio de diseño que spec 050 v3, mismo
razonamiento (calcado del mapa embebido de AVAMET, pestaña "Prec dia mm", verificado en vivo):
insignia de color fijo (azul, `COLOR_PRECIPITACION_ZONA`) + el mm exacto como texto encima, en
vez de codificar la cantidad solo con el tamaño del punto (v2). Implementación: dos capas —

- `ScatterplotLayer` de fondo (`id: 'precipitacion-zona'`), `radiusUnits: 'pixels'`,
  `getRadius: RADIO_INSIGNIA_ZONA_PX` (14px fijos, misma constante compartida con spec 050 —
  ambas insignias miden igual en pantalla) + borde blanco.
- `TextLayer` encima (`id: 'precipitacion-zona-valor'`), texto blanco con contorno oscuro; mm
  redondeado a entero a partir de 10mm, con un decimal por debajo (`4.5`, `12`) para no perder
  precisión en lluvias suaves sin desbordar la insignia con lluvias fuertes.

El radio deja de ser la variable visual principal (v2) porque el número la sustituye — 0 mm no
se oculta, sigue siendo información (la insignia se pinta igual, con "0" dentro).

## 6. Criterios de aceptación (Definition of Done)

- [x] Entrada nueva en `LAYER_REGISTRY` (`precipitacionZona`, `grupo: 'primaria'`).
- [x] Checkbox propio en el selector de Prioritarias — orden final: agua, temperatura,
      precipitación (ZAS, spec 049, se insertará entre temperatura y precipitación cuando
      se implemente).
- [x] Insignia (color fijo azul, 14px) + valor en mm encima, con mini-leyenda. v3 — antes
      (v2) el radio codificaba los mm, sin texto.
- [x] Frescura (fecha+hora) y atribución "AVAMET" visibles en la leyenda.
- [x] Verificado con datos reales end-to-end: sin lluvia activa en el momento de la
      verificación (2026-09-24), la leyenda muestra correctamente "Sin lluvia registrada hoy
      en ninguna estación" (rama de `renderPrecipitacionZonaLeyenda` para 0 estaciones con
      lluvia, no una capa vacía/rota) — confirmado en navegador. `typecheck`, 464/464 tests
      y `build` verdes.
- [x] Verificado en navegador (2026-09-25) que activar el checkbox pinta el mapa con tiles y
      la capa deck.gl activa, sin excepciones con la insignia+texto nueva.
- [ ] **Pendiente real, no de esta spec**: verificar con lluvia real activa (rama con
      `conLluvia.length > 0`, cubierta por lectura del código pero no observada en vivo) y
      confirmación visual pixel a pixel de la insignia — mismo bug de renderizado
      intermitente de MapLibre GL v6 ajeno a esta capa, documentado en spec 050 §6.

## 7. Riesgos y fuera de alcance

- **Misma cobertura limitada de 15 puntos** que spec 050 — mismo razonamiento, mismo aviso en
  el glosario.
- **Redundancia aparente con `riesgo-escorrentia` (spec 046)**, que ya usa lluvia por
  distrito (vía Open-Meteo, no AVAMET) para calcular su índice — esta capa es un dato crudo
  (mm reales por estación), no el índice compuesto de 046. Se documenta la diferencia en el
  glosario para que no parezcan la misma capa duplicada.
- **Dos fuentes de lluvia coexistiendo en el proyecto** (Open-Meteo interpolado por distrito
  en 044/046, AVAMET real por estación aquí) — es una discrepancia conocida y aceptada, no un
  bug: son fuentes distintas para preguntas distintas (interpolación de modelo por distrito
  vs. estación real puntual). No se intenta reconciliar ambas en esta spec.
- Sin cambios de pipeline/backend — mismo caso que spec 050, todo el riesgo es de UI.

## 8. Historial

| Versión | Fecha | Cambio |
|---|---|---|
| 1 | 2026-09-24 | Creación — spec ligera, reutiliza sin cambios la fuente y el endpoint ya `Implemented` en spec 044 v4. Contrato de capa propuesto, sin congelar. |
| 2 | 2026-09-24 | Implementada — entrada en `LAYER_REGISTRY`, checkbox en Prioritarias, `ScatterplotLayer` con radio por mm de lluvia, leyenda, `META_CAPAS` (glosario). Fetch/polling compartido con spec 050 (misma fuente). `typecheck`/464 tests/`build` verdes. Verificación con lluvia real activa y confirmación visual pixel a pixel pendientes (ver §6). |
| 3 | 2026-09-25 | Rediseño visual (petición del usuario): insignia (círculo 14px, color fijo) + `TextLayer` con el mm encima, calcado del mapa embebido de AVAMET (verificado en vivo). El radio deja de codificar la cantidad de lluvia. Sin cambios de contrato de datos ni de endpoint. `typecheck`/`build` verdes. |
