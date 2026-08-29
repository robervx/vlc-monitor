/**
 * Lista de stopwords ES/VA para la spec 025 (specs/025-tendencia-terminos-mediaticos.md §6).
 * Dato versionado, no lógica — se amplía según se observe ruido en producción
 * (ver spec 025 §7), nunca sustituida por un modelo de lenguaje.
 *
 * Solo hace falta cubrir palabras de 4+ caracteres: el conteo de frecuencia
 * (src/services/tendencia-terminos.ts) ya descarta las más cortas por defecto
 * (artículos/preposiciones como "el", "la", "de", "en", "y").
 */
export const STOPWORDS_MEDIATICO: readonly string[] = [
  // Español
  'para', 'este', 'esta', 'estos', 'estas', 'pero', 'como', 'desde', 'hasta',
  'también', 'segun', 'según', 'informo', 'informó', 'declaro', 'declaró',
  'durante', 'hacia', 'sobre', 'entre', 'puede', 'pueden', 'podria', 'podría',
  'tras', 'todos', 'todas', 'cada', 'otro', 'otra', 'otros', 'otras', 'cuando',
  'donde', 'quien', 'quienes', 'porque', 'aunque', 'mientras', 'ademas',
  'además', 'incluso', 'tanto', 'sido', 'fueron', 'sera', 'será', 'seran',
  'serán', 'estan', 'están', 'estara', 'estará', 'tiene', 'tienen', 'hace',
  'hizo', 'años', 'ano', 'año', 'unos', 'unas', 'esos', 'esas', 'aqui', 'aquí',
  'alli', 'allí', 'solo', 'sólo', 'asi', 'así', 'esto', 'eso', 'esa', 'ese',
  'mas', 'más', 'menos', 'esta', 'estan',

  // Valencià/català
  'aquest', 'aquesta', 'aquests', 'aquestes', 'pero', 'però', 'des', 'fins',
  'tambe', 'també', 'segons', 'durant', 'sobre', 'entre', 'pot', 'poden',
  'podria', 'podría', 'tots', 'totes', 'cada', 'altre', 'altra', 'altres',
  'quan', 'perque', 'perquè', 'encara', 'mentre', 'tant', 'estat', 'seran',
  'estan', 'estara', 'estarà', 'tenen', 'anys', 'any', 'unes', 'eixos',
  'eixes', 'aci', 'ací', 'alla', 'allà', 'molt', 'nomes', 'només', 'aixo',
  'això', 'aço', 'açò',

  // Términos estructurales del dominio — aparecerían en el 100% de los ítems,
  // no aportan señal de tendencia (spec 025 §3).
  'valencia', 'valència', 'ayuntamiento', 'ajuntament', 'noticia', 'noticias',
  'titular',
] as const;
