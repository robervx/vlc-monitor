# VLC Monitor — Señal humana de la ciudad: qué fuentes existen, cuáles son gratis de verdad, y dónde trazo la línea ética

**Fecha:** 2026-08-17
**Pregunta que responde:** más allá de sensores de infraestructura (tráfico, meteo, aire), ¿cómo captamos "dónde está la gente y qué está pasando" en Valencia ahora mismo, aprovechando al máximo medios de comunicación, X/Twitter si aporta algo gratis, y cualquier otra fuente OSINT — sin salirnos de lo gratuito ni de lo legal/ético?

---

## 0. Antes de la lista de fuentes: la línea que no cruzamos

Como responsable de producto de esto, dejo esto por escrito porque condiciona todo lo que viene después: **"saber qué está pasando en la ciudad" no es lo mismo que "saber qué está haciendo una persona concreta".** El objetivo legítimo (y el único que persigue este proyecto) es la **actividad agregada y anónima** — cuánta gente se mueve por una zona, si hay una aglomeración, si hay un evento en curso — nunca el rastreo de individuos identificables.

Con esa frontera, quedan **fuera de alcance de forma permanente**, aunque técnicamente serían "posibles":

- Geolocalizar o hacer scraping de publicaciones de redes sociales de personas concretas.
- Reconocimiento facial o de personas sobre cámaras de tráfico/webcams.
- Comprar o solicitar datos de localización a operadoras móviles fuera de sus publicaciones estadísticas oficiales agregadas.
- Cualquier fuente que identifique a una persona física de forma directa o indirecta (esto es LOPD-GDD/RGPD, no solo criterio interno).

Todo lo que propongo abajo respeta esa frontera: son señales **agregadas** (cuántos, no quién) o **de intención pública explícita** (una agenda de eventos publicada para que la gente vaya, una noticia publicada para ser leída).

---

## 1. El veredicto sobre X/Twitter, con números reales de hoy

Lo he comprobado directamente en la documentación de pricing vigente: **X ya no tiene un tier gratuito de lectura**. La API de pago funciona por consumo: del orden de **0,005 $ por post leído** (≈5-10 $ por cada 1.000 tweets recuperados), con un tope duro de 3 millones de posts/mes incluso pagando. No hay forma realista de montar un monitor continuo de menciones de "Valencia" gratis con la API oficial — cualquier búsqueda periódica (cada 15 min, por ejemplo) generaría un gasto recurrente, pequeño al principio pero real y creciente.

**Decisión:** no lo incluyo en el núcleo gratuito del producto. Si en el futuro queréis activarlo puntualmente para un evento concreto (Fallas, una emergencia) como gasto excepcional y acotado, es una decisión de negocio a tomar entonces — no algo que construyamos como dependencia estructural del MVP.

---

## 2. Catálogo de señal "pulso humano" — organizado por qué pregunta responde

### 2.1 "¿Cuánta gente se mueve y por dónde?" (proxies agregados de movilidad)

| Fuente | Qué mide | ¿Gratis? | Frescura | Notas |
|---|---|---|---|---|
| Tráfico en tiempo real (ya en roadmap) | Densidad de vehículos por vía | Sí | Minutos | Ya cubierto en spec futura. |
| Ocupación Valenbisi (ya en roadmap) | Bicis disponibles/huecos por estación | Sí | Minutos | Proxy de movimiento activo por zona. |
| EMT València — frecuencia/ocupación de líneas de bus | Uso de transporte público | Probable, a verificar | Minutos-horas | A confirmar si hay feed GTFS-RT público; si no, la frecuencia programada (GTFS estático) ya es indicativa. |
| Vuelos Aeropuerto de Valencia (OpenSky Network) | Tráfico aéreo en/desde VLC | Sí, sin key | Minutos | Mismo patrón que la capa `flights` de World Monitor, pero acotada a Valencia. |
| AIS Puerto de Valencia (AISHub u otro agregador comunitario) | Tráfico marítimo/mercante en el puerto | Sí (feeds comunitarios básicos) o de pago según volumen | Minutos | Verificar límites del proveedor comunitario elegido antes de comprometer la spec. |
| **INE — Estadística Experimental de Movilidad** (datos de posicionamiento móvil, agregados y anonimizados por el operador antes de llegar al INE) | Flujos de población entre zonas/ciudades | Sí | **No es tiempo real** — publicaciones periódicas/piloto, no continuas | Es la fuente más directamente "dónde está la gente" que existe de forma legal y agregada en España. No sirve como capa en vivo, pero sí como **capa de contexto histórico** ("así se mueve Valencia un día laborable típico"). Formato: descarga ZIP + visor ArcGIS, sin API continua. |

### 2.2 "¿Qué está pasando / va a pasar?" (eventos programados — el mejor predictor legal de aglomeraciones)

Esta es, en mi opinión como PM, **la fuente más infravalorada y más útil**: en vez de intentar detectar aglomeraciones a posteriori vía redes sociales, las **anticipamos** sabiendo qué está programado.

| Fuente | Qué aporta | ¿Gratis? |
|---|---|---|
| Agenda cultural del Ayuntamiento (conciertos, Fallas, fiestas de barrio) | Eventos con lugar y hora — predictor directo de afluencia | Probable, a verificar como dataset abierto |
| Calendario de partidos (Valencia CF / Mestalla, Levante UD) | Picos de tráfico/aforo previsibles con horas exactas | Sí, calendarios públicos de las competiciones |
| Feria Valencia — calendario de ferias/congresos | Aforo puntual elevado en zona norte | Público en su web |
| Avisos de cortes de tráfico por eventos (policía local / DGT) | Confirma el impacto real en movilidad | A verificar si hay feed, o solo web |

### 2.3 "¿De qué se habla sobre Valencia?" (señal mediática, sin tocar redes sociales de pago)

| Fuente | Qué aporta | ¿Gratis? | Matiz |
|---|---|---|---|
| RSS de medios locales (ya en roadmap: Levante-EMV, Las Provincias, Valencia Plaza...) | Noticias con marca temporal y geolocalización implícita | Sí | Ya contemplado. |
| **GDELT 2.0 DOC API** | Indexa medios de todo el mundo (incluida prensa nacional/local española) y permite **filtrar por menciones geográficas + tono emocional**, exactamente el patrón que usa World Monitor a escala global | Sí, sin API key | Consulta acotada a `"Valencia" + España`, últimas 24-72h; sirve para detectar picos de cobertura mediática sobre algo que está pasando en la ciudad, sin necesidad de redes sociales. |
| **Reddit API** (`r/valencia`, `r/vlc`) | Conversación pública de la comunidad local | Sí, límites generosos en uso no comercial | Hay que respetar sus términos de uso (atribución, no reventa de datos) y es un volumen mucho menor que Twitter — útil como señal complementaria, no como pilar. |
| Google Trends | Interés de búsqueda por término/región | Técnicamente sí, pero **sin API oficial** — solo librerías no oficiales que Google puede romper sin aviso | Lo marco como "explorable, no fiable como dependencia" — no lo pondría en el camino crítico del producto. |

### 2.4 "¿Hay una emergencia o incidencia activa?" (la fuente más legítima de todas para 'qué está pasando')

| Fuente | Qué aporta | ¿Gratis? |
|---|---|---|
| 112 Comunitat Valenciana | Incidencias de emergencia oficiales | A verificar si publican feed/dataset, o solo redes propias |
| Policía Local de València | Avisos de tráfico/seguridad | A verificar canal — si solo lo publican en redes sociales, no en web/RSS, entonces sí tocaría plantearse una integración puntual con la cuenta oficial (que es contenido público institucional, no de una persona privada — matiz ético distinto al de rastrear usuarios) |
| AEMET — avisos por fenómenos adversos (ya en roadmap) | Contexto de por qué hay una alteración de la normalidad | Sí |

---

## 3. Lo que esto cambia en el roadmap

Añado una fase intermedia, porque "eventos programados" es tan valioso y tan barato de construir que no tiene sentido dejarlo para el final:

| Fase | Contenido | Cambio respecto al roadmap anterior |
|---|---|---|
| F3.5 — **Agenda y Aglomeraciones previsibles** (nueva) | Agenda cultural + calendario deportivo + ferias, cruzado espacialmente con distritos | Se adelanta porque es 100% gratis, sin ambigüedad ética, y de alto valor predictivo — más que cualquier señal social. |
| F4 — Contexto mediático (ya existía, se amplía) | RSS + **GDELT filtrado por Valencia** + Reddit como señal secundaria | Se mantiene la decisión de excluir X/Twitter del núcleo. |
| Nueva capa de contexto, no en vivo | INE Movilidad como overlay "histórico/comparativo" | No es una capa de tiempo real — se plantea como vista secundaria tipo "así se mueve Valencia normalmente", útil para dar contexto a picos anómalos detectados por otras capas. |

---

## 4. Próximo paso

Si te parece bien este enfoque, el siguiente paso operativo es escribir las specs concretas de **F3.5 (agenda/aglomeraciones)** y de la ampliación de **F4 (GDELT + Reddit)** siguiendo la plantilla ya creada — son las dos piezas nuevas de mayor valor y coste cero que salen de este análisis. Dime si quieres que las redacte ya, o si primero cerramos la verificación manual pendiente de la spec 000 (distritos) para no acumular deuda de "pendiente de confirmar".
