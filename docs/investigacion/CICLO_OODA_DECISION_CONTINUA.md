# El ciclo OODA y los sistemas "agentic" de apoyo a la decisión — aplicación a Mirall

**Estado: investigación/marco conceptual, aportado por el usuario el 2026-09-23. No
implementado.** El propio usuario lo enmarcó así: "esto es importante para el proyecto,
cuando tengamos bien definido el modelo de datos vamos a implantar esto" — es una
intención explícita de futuro, no una petición de código en esta sesión. Guardado aquí
siguiendo el mismo patrón que `ESCORRENTIA_HIDROLOGIA_URBANA_VLC.md` (investigación
sustancial que se documenta antes de tener spec, para no perderla).

## 0. Resumen — qué encaja de esto en Mirall y qué no

El modelo de dominio (`docs/04_MODELO_DE_DATOS.md`) ya cerró el gate técnico que este
marco necesita: histórico real en Neon, verificado end-to-end (`047` v3, 2026-09-21). El
propio documento del modelo de datos ya anotaba, en su §13.4 ("Potencial real que este
modelo ya deja abierto"), dos de las piezas que describe el marco OODA de más abajo:

- "Perfil normal por distrito/hora, y detectar cuándo algo se sale de lo normal" — la
  fase de **Orientar** del ciclo OODA aplicada a Mirall.
- "Contexto histórico real para las recomendaciones de `047`" — la fase de **Decidir**
  (proponer, no ejecutar).

Es decir: este marco no es una feature nueva que se añade de fuera, es el **vocabulario
estratégico** para lo que ya estaba anotado como evolución natural de `013` → `024` →
`041` → `045`/`047`. Lo que aporta de nuevo la investigación del usuario es la referencia
a Boyd (1987) y a Tadross y Jonker (2026) sobre sistemas "agentic", que da un marco de
producto más explícito: Mirall no busca sustituir la decisión humana, busca **acortar el
tiempo que tarda una persona en comprender una situación urbana compleja** — que es,
literalmente, la misión ya declarada del proyecto (`CLAUDE.md` §1).

**Límite que no se toca**: cualquier desarrollo futuro sobre este marco sigue sujeto sin
excepciones a `CLAUDE.md` §4 — en particular "avisa, no actúa". Un sistema "agentic" que
"propone posibles cursos de acción" (como describe la investigación) es compatible con
ese límite *solo* mientras la propuesta quede como texto para que la revise una persona,
igual que ya hace `013` (alertas) y `045`/`047` (recomendaciones). Nada de este marco
autoriza que Mirall decida o ejecute una acción sobre una persona, un recurso o un
servicio — eso sigue siendo, explícitamente, un límite duro del proyecto, no una decisión
de diseño a discutir spec a spec.

## 1. El ciclo invisible de cualquier organización

En la década de 1980, el estratega militar John Boyd formuló uno de los modelos más
influyentes para entender cómo se toman decisiones en entornos dinámicos: el ciclo OODA
(Observe–Orient–Decide–Act) (Boyd, 1987).

Según este modelo, cualquier organización que opera en un entorno competitivo pasa
continuamente por cuatro fases:

1. Observar lo que está ocurriendo.
2. Orientar o interpretar esa información.
3. Decidir qué hacer.
4. Actuar en consecuencia.

El elemento clave del modelo no es simplemente completar ese ciclo. La clave está en
completarlo más rápido que el adversario o que el entorno cambiante. Cuando una
organización consigue acelerar ese proceso, empieza a anticiparse a los acontecimientos
en lugar de reaccionar a ellos. Boyd lo describía como "entrar en el ciclo de decisión
del oponente" y desestabilizar su capacidad de respuesta.

Aunque el modelo nació en el ámbito militar, su lógica es aplicable a cualquier sistema
complejo que requiera decisiones continuas: empresas, hospitales, infraestructuras
críticas… y, por supuesto, ciudades.

## 2. La ciudad como sistema complejo

Las ciudades modernas son sistemas extraordinariamente complejos. En ellas interactúan
simultáneamente miles de factores:

- movilidad
- actividad económica
- eventos multitudinarios
- meteorología
- dinámicas sociales
- infraestructuras críticas

Cada día se producen miles de situaciones que requieren decisiones rápidas:

- un accidente de tráfico que altera la movilidad urbana
- un evento que concentra grandes cantidades de personas, como un partido de fútbol
- una zona donde empiezan a producirse conflictos, zonas de fiesta nocturna
- una emergencia que requiere coordinación entre servicios, incendios

Durante décadas, estas situaciones se han gestionado principalmente mediante modelos
reactivos: se detecta el problema, se envía un recurso y se actúa. Este modelo sigue
siendo necesario. Pero a medida que la complejidad urbana aumenta, empieza a resultar
insuficiente. El reto ya no consiste únicamente en responder bien a los incidentes, sino
en comprender antes lo que está ocurriendo.

## 3. El surgimiento de los sistemas "agentic"

En este contexto aparece una nueva generación de sistemas basados en inteligencia
artificial que algunos autores describen como sistemas agentic. A diferencia de los
modelos tradicionales, que se limitan a responder preguntas o generar análisis puntuales,
estos sistemas están diseñados para actuar como asistentes de decisión continuos.

Según Tadross y Jonker (2026), estos sistemas pueden:

- monitorizar múltiples fuentes de información simultáneamente
- detectar patrones emergentes
- generar hipótesis sobre lo que está ocurriendo
- proponer posibles cursos de acción

En el ámbito militar se ha utilizado la metáfora de los "oficiales de estado mayor
digitales", sistemas capaces de procesar grandes volúmenes de información y ayudar a los
mandos a comprender la situación operativa con mayor rapidez. El objetivo no es sustituir
la decisión humana. El objetivo es reducir drásticamente el tiempo necesario para
comprender una situación compleja.

## 4. Dónde encaja cada fase del ciclo OODA en Mirall hoy

Mapeo honesto contra lo que ya existe (`Implemented`), no aspiracional:

| Fase OODA | Pieza de Mirall | Estado |
|---|---|---|
| **Observe** | Capas de datos públicos (tráfico, meteo, aire, eventos, incidencias…), `senal` en Neon (histórico real desde `047` v3) | `Implemented` |
| **Orient** | Motor de insights (`013`), correlación operativa (`024`), Pulso de Distrito (`010`) — interpretan señales crudas, sin modelo estadístico nuevo | `Implemented`. Perfil "normal" por distrito/hora (comparar contra la media histórica, no solo el valor absoluto) — anotado en `docs/04_MODELO_DE_DATOS.md` §13.4, no implementado |
| **Decide** | Panel de apoyo a decisión (`041`), recomendaciones de síntesis IA (`045`/`047` v2) — siempre en condicional, nunca una acción ejecutable | `Implemented`, con contexto histórico real todavía pendiente (la "v4" ya anotada en `047`) |
| **Act** | — | **Deliberadamente fuera de Mirall.** Cualquier acción real sigue el cauce legal normal (policía, protocolo, autorización judicial si aplica), fuera de esta aplicación (`CLAUDE.md` §4) |

## 5. Esquema de funciones "agentic" necesarias — borrador para cuando se retome

Pedido explícito del usuario (2026-09-23): dejar bien definido el esquema a seguir, la
función de cada pieza "agentic", cuáles son realmente necesarias, qué evitar y qué
destacar. Esto sigue siendo un borrador de diseño, no un contrato de spec — se congela
cuando se redacte la spec real siguiendo `CLAUDE.md` §2.

**Principio de partida, y el más importante de todos: no todo lo que "orienta" o "decide"
necesita ser un LLM.** La tentación de meter un modelo generativo en cada fase del ciclo
es exactamente el tipo de sobre-ingeniería que este proyecto evita por norma (ver
instrucciones de sesión). De las cuatro funciones de abajo, **solo una** necesita
generación de lenguaje natural — las otras tres son cálculo determinista sobre el
histórico, más barato, más auditable y sin cuota de API que gestionar.

| # | Función | ¿Necesita LLM? | Qué hace | Evolución de qué spec | Estado |
|---|---|---|---|---|---|
| 1 | **Observador** | No | Ingesta programada de cada fuente pública (seeds/crons ya existentes) | `000`–`044` (ya `Implemented`, uno por capa) | Ya existe, no es una pieza nueva |
| 2 | **Orientador estadístico** | No — media/percentil sobre SQL, no generativo | Compara la lectura actual de una señal contra su histórico real en `senal` (mismo distrito, misma franja horaria) y expone si está dentro o fuera de lo normal | `024` (correlación declarativa) + `docs/04_MODELO_DE_DATOS.md` §13.4 ("perfil normal por distrito/hora") | No implementado — bloqueado por volumen real de histórico, no por diseño |
| 3 | **Correlador** | No — reglas declarativas | Cruza señales de distintos dominios (tráfico + lluvia + evento + incidencia) para detectar conjunciones relevantes | `010` (Pulso de Distrito), `024` (correlación) — ya `Implemented` | Ya existe |
| 4 | **Sintetizador / redactor** | **Sí** — es la única función que necesita generación de lenguaje natural: traducir señales ya clasificadas + precedente histórico a una recomendación legible en condicional | `045`/`047` v2 (ya `Implemented`) — la ampliación pendiente es que el prompt reciba precedente histórico real (`047` v4, ya anotada como futura) | Ya existe; falta enriquecer el contexto que recibe, no crear una pieza nueva |

**No hace falta una quinta pieza "orquestadora" que decida por su cuenta cuándo invocar a
cada una.** El orden Observador → Orientador → Correlador → Sintetizador ya es el pipeline
lineal que sigue el patrón establecido en `CLAUDE.md` §3.3 (seed → caché → endpoint),
disparado por cron o por petición HTTP — no un agente autónomo con bucle propio que decide
su propia cadencia. Esto no es una limitación técnica temporal: es la decisión de diseño
que mantiene el sistema dentro de "avisa, no actúa" (§6 más abajo).

## 6. Aspectos a tener en cuenta para no cometer errores

- **No convertir el pipeline en un agente autónomo con bucle propio.** La arquitectura
  agentic descrita por Tadross y Jonker incluye sistemas que actúan con cierta iniciativa
  propia (qué fuente consultar, cuándo). Mirall **no** implementa eso: cada función de la
  tabla de §5 se invoca desde un cron o un endpoint ya existente, nunca desde un bucle que
  decide por sí mismo cuándo "despertar" o qué hacer a continuación. Es la diferencia entre
  "sistema que ayuda a orientar" y "sistema que actúa" — y solo lo primero es compatible
  con `CLAUDE.md` §4.
- **No usar un LLM donde basta una media o un percentil.** El "perfil de normalidad" (fila 2
  de la tabla) es aritmética sobre filas de `senal`, no un prompt — usar un LLM ahí sería
  más caro, más lento, menos auditable y no aportaría nada que SQL no dé ya.
- **El LLM no debe decidir severidad ni prioridad.** Esas clasificaciones ya las calculan
  reglas deterministas (`010`/`013`/`024`) antes de que el texto llegue al sintetizador —
  el LLM redacta sobre datos ya clasificados, nunca reclasifica por su cuenta (mismo patrón
  de guardrails ya validado en `045`).
- **Trazabilidad de origen obligatoria en cada pieza nueva.** Cualquier señal o
  recomendación debe seguir enlazando su `fuenteId`/`fuenteSpec` real (ya así en `047` v3)
  — nunca una hipótesis generada sin decir de qué datos concretos sale.
- **Distinguir visualmente "detectado por regla" de "interpretado por IA".** Ya existe el
  aviso "generado por IA" de `045` — cualquier salida nueva del sintetizador hereda ese
  mismo aviso, siempre visible, nunca en letra pequeña (`CLAUDE.md` §4).
- **Presupuesto de cuota real, no teórico.** `045` ya encontró en vivo que la cuota
  gratuita de Gemini es más ajustada de lo esperado (~20 peticiones antes de HTTP 429) —
  cualquier nuevo uso de LLM (p. ej. enriquecer el prompt con precedente histórico) compite
  por ese mismo presupuesto; hay que medir el coste marginal antes de ampliar, no asumirlo.
- **El histórico solo crece con información nueva.** `047` ya resolvió esto (escribe por
  cambio de estado, no por ciclo de sondeo, §13.2 del modelo de datos) — cualquier función
  de orientación nueva hereda ese mismo criterio: no llenar la base de filas idénticas.
- **Nunca automatizar una acción derivada de una recomendación.** Enviar una notificación,
  activar un protocolo o avisar a un servicio real queda fuera de este marco por completo
  — eso es la spec `014` (`Planned`, sin fecha), y aun si se implementa algún día, sigue
  siendo "avisar a una persona", nunca "ejecutar" (`CLAUDE.md` §4).
- **No presentar una hipótesis como un hecho verificado.** El "perfil de normalidad" es una
  comparación estadística sobre una ventana de datos limitada (semanas, no años) — debe
  comunicarse como tal ("un 40% peor de lo habitual **según los datos disponibles**"), no
  como una afirmación categórica.

## 7. Aspectos a destacar

- **La combinación precedente histórico + recomendación condicional es la pieza
  diferencial real**, no un dashboard más con más gráficas. Es, literalmente, lo que
  Tadross y Jonker describen como "generar hipótesis" — y es la razón de fondo por la que
  se construyó el histórico en `047` (anotado explícitamente en
  `docs/04_MODELO_DE_DATOS.md` §13.4: "mejorar exponencialmente la capacidad de ofrecer
  recomendaciones").
- **La métrica de valor no es "cuántas alertas genera Mirall"**, es cuánto tiempo le ahorra
  a una persona comprender una situación que hoy exige cruzar varias fuentes a mano — eso
  es literalmente la misión declarada (`CLAUDE.md` §1) y el marco de Boyd (acortar el ciclo
  OODA, no producir más ruido).
- **La transparencia de origen ya es un diferenciador real, no solo cumplimiento legal.**
  Cada capa marca su fuente/licencia (`docs/FUENTES_Y_LICENCIAS.md`), cada síntesis marca
  "generado por IA", cada mock marca "MOCK" — herramientas similares suelen ocultar de
  dónde sale cada dato. Vale la pena mantenerlo como argumento explícito si esto se
  presenta como ejemplo de "sistema agentic responsable", no solo como feature técnica.
- **Coste marginal bajo, argumento de viabilidad real.** Las cuatro funciones de §5 se
  construyen reutilizando specs ya `Implemented` (`010`/`013`/`024`/`041`/`045`/`047`), sin
  pipeline paralelo ni infraestructura nueva — coherente con el análisis de viabilidad
  económica de `docs/01_VIABILIDAD_VISION_Y_PROCESO.md`.
- **"Avisa, no actúa" no es una limitación a superar más adelante — es el argumento de
  confianza del producto.** Un sistema que decide y ejecuta sobre personas reales sin
  supervisión es, precisamente, lo que Boyd describía como desestabilizar al adversario en
  un contexto militar; en un contexto civil y público, la ventaja competitiva de Mirall es
  la contraria: ayudar a comprender más rápido sin quitarle a nadie la decisión.

## 8. Cuándo retomar esto

No hay spec que redactar todavía — el propio usuario lo enmarcó como algo para después.
Candidatos concretos para cuando se retome, todos ya anotados en `docs/04_MODELO_DE_DATOS.md`
§13.4 y en las notas de cierre de `047`:

- Perfil de normalidad por distrito/hora sobre el histórico real de `senal` (necesita
  semanas de datos acumulados desde el 2026-09-21, no está listo todavía por volumen).
- Contexto histórico en el prompt de `sintesis-ia-v2.ts` ("la última vez que pasó algo
  parecido en este distrito, la recomendación fue X") — la razón de fondo por la que se
  construyó el histórico, según el propio usuario.
- Puntuación de fiabilidad por fuente sobre `fuente`/`ingerido_en` vs `observado_en`.

Cuando haya masa de datos histórica suficiente para que el "perfil de normalidad" sea
real (no ruido), esto se convierte en una spec normal siguiendo `CLAUDE.md` §2 — con su
propio número reservado en `specs/INDEX.md` en su momento, no antes.

## Referencias

- Boyd, J. (1987). *A Discourse on Winning and Losing.* (formulación del ciclo OODA).
- Tadross, M. y Jonker, C. (2026). Sobre sistemas "agentic" como asistentes de decisión
  continuos ("oficiales de estado mayor digitales"). Cita aportada por el usuario;
  referencia bibliográfica completa pendiente de localizar si se necesita citarla fuera de
  este repo.
