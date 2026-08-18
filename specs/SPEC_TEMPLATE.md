# Plantilla de Spec — VLC Monitor

> Copiar este fichero como `NNN-nombre-corto.md` dentro de `specs/`. No borrar specs obsoletas: marcar `Estado: Deprecated` y enlazar la sucesora.

```yaml
id: NNN
titulo: ""
estado: Draft            # Draft | Approved | Implemented | Deprecated
tipo: capa                # capa | indice-compuesto | fundacional | infraestructura
depende_de: []            # ids de specs bloqueantes, ej. [000]
propietario: ""
version: 1
```

## 1. Problema / motivación

¿Qué pregunta del ciudadano/analista responde esta pieza? (una o dos frases, lenguaje llano, no técnico).

## 2. Fuente(s) de datos

| Fuente | URL | Licencia / condiciones | ¿Requiere API key? | Verificada manualmente el ___ |
|---|---|---|---|---|
| | | | | |

Si hay más de una fuente para el mismo fenómeno, indicar cuál es primaria y cuál es de corroboración/fallback (principio de multi-fuente de World Monitor).

## 3. Contrato de datos (normalizado)

Forma final del dato **después** de normalizar, no la respuesta cruda de la fuente. Ejemplo de formato (JSON Schema simplificado):

```typescript
interface <Nombre>Item {
  id: string;
  lat: number;
  lon: number;
  distrito?: string;   // código oficial de distrito si aplica
  // ...campos específicos del dominio
  observedAt: string;  // ISO 8601 — momento del dato en origen
  fetchedAt: string;   // ISO 8601 — momento en que lo cacheamos
  source: string;       // id de la fuente, para atribución en UI
}
```

## 4. Pipeline (seed → caché → endpoint)

| Parámetro | Valor |
|---|---|
| Frecuencia de refresco (cron) | |
| TTL en caché | |
| Comportamiento si la fuente falla | stale-on-error / caché negativa / oculta capa — elegir y justificar |
| Clave de caché | |
| Endpoint interno que sirve el dato | `GET /api/...` |

## 5. Contrato de capa de mapa

```typescript
{
  key: '',
  renderers: ['deck'],       // qué motor(es) la pintan
  zoomMinimo: 0,              // a partir de qué zoom aparece (ciudad/distrito/calle)
  agregacion: 'punto' | 'choropleth-distrito' | 'cluster',
  icono: '',
}
```

## 6. Criterios de aceptación (Definition of Done)

- [ ] Fuente probada con al menos una llamada real (no solo documentación).
- [ ] Endpoint responde con el contrato de datos de la sección 3.
- [ ] Caché con TTL y comportamiento de fallo verificados.
- [ ] Capa visible y legible en los niveles de zoom relevantes.
- [ ] Atribución de fuente y frescura visible en la UI.
- [ ] (Criterios adicionales específicos de esta spec)

## 7. Riesgos y fuera de alcance

Qué puede fallar (rate limits, cambios de formato de la fuente, ausencia de dato en ciertos distritos) y qué se decide explícitamente NO cubrir en esta versión.

## 8. Historial

| Versión | Fecha | Cambio |
|---|---|---|
| 1 | | Creación |
