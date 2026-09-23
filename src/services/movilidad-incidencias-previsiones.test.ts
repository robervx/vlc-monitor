import { describe, expect, it } from 'vitest';
import { construirAviso, parsearAvisosMovilidad, resolverLugar } from './movilidad-incidencias-previsiones';

// Fragmento real capturado el 2026-09-23 de
// https://www.valencia.es/cas/movilidad/incidencias-y-previsiones (verificación
// de spec 048 §2) — recortado a 2 ítems por sección, misma estructura exacta
// que la página completa: h3.bloque_subtitulo por sección, span.bloque_enlace
// por ítem, con o sin enlace <a> a un plano adjunto. El timestamp crudo
// (`YYYY-MM-DD HH:MM:SS.0`) es el que trae el HTML sin formatear por el tema
// Liferay — no el "DD-MM-YYYY" que se ve en pantalla tras el JS del navegador.
const HTML_EJEMPLO = `
<div class="row">
	<div class="col-12">
		<h3 class="bloque_subtitulo">Incidencias</h3>
			<p>
			<span class="bloque_enlace">
<!-- 				<i class="icon-caret-right"></i> 			 -->




						2026-09-04 04:00:00.0
						Obras con ocupación de acera, carril bici y carril EMT-Taxi en Doctor Peset Aleixandre con Camino de Montcada (dirección General Avilés).




			</span>

			<p>
			<span class="bloque_enlace">
<!-- 				<i class="icon-caret-right"></i> 			 -->




						2026-09-01 00:00:00.0
						OBRAS PAVASAL: ocupada parcialmente la calzada en la mediana de avenida Blasco Ibáñez con Doctor Moliner.




			</span>
	</div>
</div>
<div class="row">
	<div class="col-12">
		<h3 class="bloque_subtitulo">Previsiones</h3>
			<p>
			<span class="bloque_enlace">
<!-- 				<i class="icon-caret-right"></i> 			 -->


<!-- 						<i class="icon-download-alt"></i> -->
						<a href="https://www.valencia.es/documents/20142/7475319/15k-nocturna_cortes-%28cast%29.jpg/2c90207d-be1f-808d-863c-576cacfef5b0" target="_blank">
							2026-09-23 04:00:00.0
							[SÁBADO 26/09] 15K Nocturna València (22:30-0:30h). Corte ambos sentidos de Ingeniero Manuel Soto, frente al Tinglado 4, a partir de las 13:30h. Consulta recorrido en el plano adjunto.
						</a>






			</span>

			<p>
			<span class="bloque_enlace">
<!-- 				<i class="icon-caret-right"></i> 			 -->


<!-- 						<i class="icon-download-alt"></i> -->
						<a href="https://www.valencia.es/documents/20142/7475319/roig%20arena%20%28cast%29%285%29.jpg/ded23e38-1ecb-5e65-b998-53d9dd68d502" target="_blank">
							2026-09-23 04:00:00.0
							[DOMINGO 27/09] Partido València Basket masculino-Ilerna Lleida (18:00-20:30h) en el Roig Arena. Consulta plano adjunto.
						</a>






			</span>
	</div>
</div>
`;

describe('parsearAvisosMovilidad', () => {
  it('extrae las 2 incidencias y las 2 previsiones del fragmento real', () => {
    const items = parsearAvisosMovilidad(HTML_EJEMPLO);
    expect(items.filter((i) => i.tipo === 'incidencia')).toHaveLength(2);
    expect(items.filter((i) => i.tipo === 'prevision')).toHaveLength(2);
  });

  it('parsea la fecha cruda YYYY-MM-DD y descarta el resto del timestamp', () => {
    const [primero] = parsearAvisosMovilidad(HTML_EJEMPLO);
    expect(primero!.item.fechaTexto).toBe('2026-09-04');
    expect(primero!.item.descripcion).toContain('Obras con ocupación de acera');
  });

  it('extrae planoUrl solo cuando el ítem lleva enlace <a>', () => {
    const items = parsearAvisosMovilidad(HTML_EJEMPLO);
    const incidencia = items.find((i) => i.tipo === 'incidencia')!;
    const prevision = items.find((i) => i.tipo === 'prevision')!;
    expect(incidencia.item.planoUrl).toBeNull();
    expect(prevision.item.planoUrl).toMatch(/^https:\/\/www\.valencia\.es\/documents\//);
  });

  it('devuelve [] si no reconoce ninguna sección (estructura cambiada)', () => {
    expect(parsearAvisosMovilidad('<div>otra cosa</div>')).toEqual([]);
  });

  // La fuente sirve el campo de fecha en dos formatos distintos según qué
  // instancia de aplicación responda (verificado en vivo, spec 048 §2/§4) —
  // ambos deben normalizarse igual, nunca asumir uno solo.
  it('acepta también el formato "DD-MM-YYYY" ya formateado (variante real observada)', () => {
    const html = `
      <h3 class="bloque_subtitulo">Incidencias</h3>
      <span class="bloque_enlace">04-09-2026 Obras con ocupación de acera.</span>
    `;
    const [item] = parsearAvisosMovilidad(html);
    expect(item!.item.fechaTexto).toBe('2026-09-04');
    expect(item!.item.descripcion).toBe('Obras con ocupación de acera.');
  });
});

describe('resolverLugar', () => {
  it('resuelve un venue conocido por su alias', () => {
    const r = resolverLugar('Partido en el Roig Arena esta noche');
    expect(r).toEqual({ lugar: 'Roig Arena', lat: 39.4491041, lon: -0.3643501 });
  });

  it('prioriza la calle concreta sobre el recinto genérico cuando ambos aparecen', () => {
    const r = resolverLugar('Corte de Ingeniero Manuel Soto, frente al Tinglado 4');
    expect(r?.lugar).toBe("Avinguda de l'Enginyer Manuel Soto");
  });

  it('es insensible a acentos y respeta el límite de palabra (sin falso positivo por subcadena)', () => {
    expect(resolverLugar('obras en Doctor Moliner')?.lugar).toBe('Carrer del Doctor Moliner');
    expect(resolverLugar('reunión en el ayuntamiento sin más contexto')).toBeNull();
  });

  it('devuelve null si no hay ningún lugar reconocido', () => {
    expect(resolverLugar('Corte de una calle cualquiera sin lugar conocido')).toBeNull();
  });
});

describe('construirAviso', () => {
  it('ensambla el contrato final con id estable y lugar resuelto', async () => {
    const aviso = await construirAviso(
      'incidencia',
      { fechaTexto: '2026-09-04', descripcion: 'Obras en Doctor Peset Aleixandre con Camino de Montcada', planoUrl: null },
      '2026-09-23T10:00:00.000Z',
    );
    expect(aviso).not.toBeNull();
    expect(aviso!.tipo).toBe('incidencia');
    expect(aviso!.fechaPublicacion).toBe('2026-09-04T00:00:00.000Z');
    expect(aviso!.lugar).toBe('Avinguda Doctor Peset Aleixandre');
    expect(aviso!.source).toBe('ajuntament-valencia-movilidad-incidencias-previsiones');
    expect(aviso!.id).toMatch(/^[0-9a-f]{16}$/);
  });

  it('devuelve null si la fecha no es parseable', async () => {
    const aviso = await construirAviso('prevision', { fechaTexto: 'no-es-fecha', descripcion: 'Algo', planoUrl: null }, '2026-09-23T10:00:00.000Z');
    expect(aviso).toBeNull();
  });
});
