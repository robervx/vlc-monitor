# Spec 050 — Temperatura por zona como capa de mapa

```yaml
id: 050
titulo: "Temperatura por zona (AVAMET) como capa activable en /mapa"
estado: Implemented
tipo: capa
depende_de: [000, 044]
propietario: ""
version: 3
```

> Origen: petición explícita del usuario (2026-09-24) — quiere la temperatura por zonas de
> Valencia como capa propia en Prioritarias, justo después de riesgo de acumulación de agua.

## 1. Problema / motivación

La temperatura real por zona de la ciudad (no un único dato puntual del centro) ya se
calcula y se muestra como texto en `/inteligencia` desde la spec 044 v4 (bloque AVAMET de
`#meteo-zona-panel`), pero no existe como capa visual en `/mapa`. Esta spec no añade ninguna
fuente de datos nueva — solo expone en el mapa un dato que el proyecto ya tiene.

## 2. Fuente(s) de datos

Ninguna fuente nueva. Reutiliza tal cual la ya `Implemented` en spec 044 v4:

| Fuente | URL | Licencia / condiciones | ¿Requiere API key? | Verificada manualmente el |
|---|---|---|---|---|
| AVAMET — 15 estaciones reales dentro de Valencia ciudad | `mxo-mxo.php?territori=c15` (AVAMET), normalizado por `src/services/avamet-estaciones.ts` | Ya en uso desde spec 039/044 | No | Reutilizada — verificado en esta sesión (2026-09-24) que el endpoint interno ya existente `GET /api/emergencia/v1/avamet` devuelve `temperaturaC` real con `lat`/`lon` por estación (ej. Carpesa — Alqueries del Pelut: 27 °C, `observadoEn` en vivo) |

## 3. Contrato de datos

Ninguno nuevo — reutiliza `EstacionAvamet` (`src/services/avamet-estaciones.ts`, spec 044) tal
cual, en concreto los campos `id`, `nombre`, `lat`, `lon`, `temperaturaC`, `observadoEn`. Esta
spec no toca ese contrato.

## 4. Pipeline (seed → caché → endpoint)

| Parámetro | Valor |
|---|---|
| Frecuencia de refresco (cron) | Ninguna nueva — reutiliza el polling ya activo del endpoint `emergencia/v1/avamet` (spec 044) |
| TTL en caché | El mismo que ya tiene ese endpoint — sin cambios |
| Comportamiento si la fuente falla | El mismo que ya tiene ese endpoint — sin cambios |
| Endpoint interno que sirve el dato | `GET /api/emergencia/v1/avamet` (ya existe, sin cambios) |

## 5. Contrato de capa de mapa

```typescript
{
  key: 'temperaturaZona',
  specId: '050',
  grupo: 'primaria',        // pedido explícito del usuario, 2º lugar tras riesgo de agua
  renderers: ['deck'],
  zoomMinimo: 0,
  agregacion: 'punto',       // 13-15 estaciones — insignia + valor, igual patrón que precipitación (spec 051)
}
```

**v3 (2026-09-25, petición del usuario)** — cambio de diseño visual, sin tocar el contrato de
datos: pasa de un `ScatterplotLayer` plano (un punto de color, sin texto) a una **insignia con
el valor numérico legible encima**, calcada del mapa embebido de AVAMET
(`avamet.org/mxo-mxo.php?territori=c15`, pestaña "Temp actual °C" — verificado en vivo en esta
sesión: círculo de color fijo en pantalla con el número en blanco centrado dentro, mismo tamaño
a cualquier zoom). Implementación: dos capas por estación —

- `ScatterplotLayer` de fondo (`id: 'temperatura-zona'`), `radiusUnits: 'pixels'`,
  `getRadius: RADIO_INSIGNIA_ZONA_PX` (14px fijos — no crece/encoge con el zoom, igual que la
  insignia real de AVAMET), color por gradiente frío→cálido sobre `temperaturaC`
  (`colorTemperaturaZona`, sin cambios respecto a v2) + borde blanco para que se distinga del
  fondo del mapa.
- `TextLayer` encima (`id: 'temperatura-zona-valor'`), `getText: (e) => \`${Math.round(e.temperaturaC)}°\``,
  texto blanco centrado (`getTextAnchor:'middle'`, `getAlignmentBaseline:'center'`) con contorno
  oscuro (`outlineWidth`/`outlineColor`) para legibilidad sobre cualquier color de fondo del mapa.

El color por gradiente (v2) se mantiene como codificación redundante — la insignia sigue
comunicando "frío/cálido" de un vistazo aunque no se lea el número, no se ha perdido esa señal
al añadir el texto.

## 6. Criterios de aceptación (Definition of Done)

- [x] Entrada nueva en `LAYER_REGISTRY` (`temperaturaZona`, `grupo: 'primaria'`).
- [x] Checkbox propio en el selector de Prioritarias, justo después de "Riesgo de acumulación
      de agua" (orden pedido por el usuario).
- [x] Insignia (círculo de color fijo en pantalla, 14px) + valor numérico ("23°") encima,
      color por `temperaturaC` (gradiente azul→rojo, 10-35°C), con mini-leyenda (más
      cálida/más fría, calculadas de los datos reales). v3 — antes (v2) era un punto de color
      sin texto.
- [x] Frescura (fecha+hora) y atribución "AVAMET" visibles en la leyenda.
- [x] Verificado con datos reales end-to-end: `estacionesAvamet` se llena con las 13
      estaciones activas del endpoint (`GET /api/emergencia/v1/avamet`, ya `Implemented`),
      la leyenda calcula correctamente la más cálida/fría reales (verificado en navegador:
      "Colegio Diocesano San Juan Bosco (27.8°C)" / "el Saler — Platja de la Garrofera
      (24.9°C)"). `typecheck`, 464/464 tests y `build` verdes.
- [x] Verificado en navegador (2026-09-25) que activar el checkbox pinta el mapa con tiles y
      la capa deck.gl activa — confirma que `renderLayers()` no lanza excepción con la
      insignia+texto nueva. La confirmación pixel a pixel del círculo/número exactos sigue
      intermitentemente bloqueada por el mismo bug de renderizado de MapLibre GL v6 ya
      documentado (condición de carrera no determinista, solo en `npm run dev`, ajena a esta
      capa — afecta por igual al mapa base y a capas ya `Implemented` como Valenbisi). No se
      ha tocado ese bug (CLAUDE.md, aviso de la sesión).

## 7. Riesgos y fuera de alcance

- **Cobertura de solo 15 puntos** — no hay interpolación de superficie (isotermas); el mapa
  muestra la temperatura real en 15 ubicaciones concretas, no una estimación continua para
  toda la ciudad. Se documenta así en el glosario, coherente con `CLAUDE.md` §4 (no presentar
  una estimación como si fuera más precisa de lo que es).
- **Redundancia aparente con la capa `meteo` (spec 001)** — `meteo` es meteorología puntual
  genérica (icono de cielo/viento) en un punto central de referencia; esta capa es
  específicamente temperatura real multi-zona. Se diferencian claramente en nombre y leyenda
  para no confundir al usuario con dos capas de "tiempo".
- Sin cambios de pipeline/backend — todo el riesgo de esta spec es de UI, no de datos.

## 8. Historial

| Versión | Fecha | Cambio |
|---|---|---|
| 1 | 2026-09-24 | Creación — spec ligera, reutiliza sin cambios la fuente y el endpoint ya `Implemented` en spec 044 v4. Contrato de capa propuesto, sin congelar. |
| 2 | 2026-09-24 | Implementada — entrada en `LAYER_REGISTRY`, checkbox en Prioritarias, `ScatterplotLayer` con color por temperatura, leyenda, `META_CAPAS` (glosario). Fetch/polling compartido con spec 051 (misma fuente). `typecheck`/464 tests/`build` verdes. Verificación visual pixel a pixel pendiente por un bug de render de MapLibre ajeno a esta capa (ver §6). |
| 3 | 2026-09-25 | Rediseño visual (petición del usuario): insignia (círculo 14px, color fijo) + `TextLayer` con el valor en °C encima, calcado del mapa embebido de AVAMET (verificado en vivo). Sin cambios de contrato de datos ni de endpoint. `typecheck`/`build` verdes. |
