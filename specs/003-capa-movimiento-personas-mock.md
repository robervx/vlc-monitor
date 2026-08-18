# 003 — Capa "Movimiento de personas" (mockup / datos sintéticos)

```yaml
id: 003
titulo: "Capa de movimiento/densidad de personas por distrito (mockup)"
estado: Draft
tipo: capa
depende_de: [000]
propietario: ""
version: 1
```

## 1. Problema / motivación

Queremos poder diseñar y probar en el mapa una capa de "densidad/movimiento de personas por zona" (tipo mapa de calor por distrito/barrio) antes de tener una fuente de datos real, para validar UI, interacción y rendimiento del renderer con este tipo de capa.

## 2. Fuente(s) de datos

**No hay fuente real en esta versión — es intencionadamente sintética.**

| Fuente | Estado |
|---|---|
| Generador sintético local (script propio) | Único origen en v1. Distribuye puntos aleatorios ponderados por distrito (se puede ponderar por densidad de población oficial del INE como base de realismo, ya que esa sí es pública y agregada) para simular variación por hora del día. |

### Guardarraíl obligatorio para cualquier fuente real futura

Antes de que esta spec pueda pasar a `Approved` con una fuente real, esa fuente **debe** cumplir todo lo siguiente:

- Dato **agregado**: nunca localización de un dispositivo o persona individual.
- Dato **anonimizado en origen**, antes de llegar a nuestra infraestructura (agregación hecha por el proveedor, no por nosotros a partir de datos en bruto).
- Obtenido mediante **contrato/producto comercial público** del proveedor (ej. un producto de movilidad agregada ya existente en el mercado) — nunca mediante un canal de colaboración con fuerzas de seguridad ni ningún acceso fuera de autorización judicial caso por caso.
- Revisado por una persona responsable de cumplimiento/legal antes de activarse, no solo por el equipo técnico.

Cualquier propuesta de fuente que no cumpla los cuatro puntos anteriores se rechaza en la revisión de la spec, sin excepción.

## 3. Contrato de datos (normalizado)

```typescript
interface DensidadDistritoMock {
  distritoCodigo: string;
  intensidad: number;       // 0-1, normalizado
  horaSimulada: string;     // HH:mm, franja simulada
  esSintetico: true;         // flag obligatorio, siempre true en v1
  generatedAt: string;       // ISO 8601
}
```

La UI **debe** mostrar de forma visible (no en letra pequeña) que la capa usa datos simulados mientras `esSintetico: true` — por ejemplo con una marca de agua o etiqueta "MOCK" persistente sobre la capa, igual que World Monitor marca sus capas "beta".

## 4. Pipeline

| Parámetro | Valor |
|---|---|
| Generación | Script local, determinista por semilla + hora del día, sin llamada a ninguna API externa. |
| Frecuencia | Regenerar cada vez que cambia la "hora simulada" seleccionada en la UI (no hay cron real). |
| Endpoint interno | `GET /api/mock/v1/densidad-personas` |

## 5. Contrato de capa de mapa

```typescript
{
  key: 'movimientoPersonasMock',
  renderers: ['deck'],
  zoomMinimo: 0,
  agregacion: 'choropleth-distrito',
  icono: '',
  badge: 'MOCK',   // distintivo visual obligatorio mientras no haya fuente real aprobada
}
```

## 6. Criterios de aceptación

- [ ] Generador sintético produce valores plausibles (ponderados por población oficial del distrito, no puramente aleatorios).
- [ ] La capa muestra visiblemente el badge "MOCK" en todo momento.
- [ ] El endpoint nunca se conecta a ninguna fuente externa real.
- [ ] El guardarraíl de la sección 2 queda documentado y enlazado desde cualquier spec futura que intente sustituir el mock por datos reales.

## 7. Riesgos y fuera de alcance

- Riesgo: que la capa mock se quede "de facto" en producción y se perciba como dato real por el usuario — mitigado por el badge obligatorio.
- Fuera de alcance de esta spec: cualquier integración con datos de localización de operadoras móviles, individuales o agregados. Eso requeriría una spec nueva, revisada por compliance/legal, con el proveedor y contrato identificados explícitamente.

## 8. Historial

| Versión | Fecha | Cambio |
|---|---|---|
| 1 | 2026-08-17 | Creación — versión mock, sin fuente real |
