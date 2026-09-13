/**
 * Registro de entidades del panel de actualidad institucional — spec 039.
 * Cuentas verificadas por búsqueda dirigida el 2026-09-14 (spec 039 §2); antes
 * de dar por buena una fila nueva, confirmar visualmente en el navegador que
 * el perfil carga y es público (X/Facebook bloquean scraping no autenticado,
 * no hay forma de automatizar esa última comprobación).
 */

export type CategoriaEntidadRed = 'institucional' | 'medio' | 'persona';

export interface EntidadRed {
  id: string;
  nombre: string;
  categoria: CategoriaEntidadRed;
  xHandle?: string;
  facebookPageUrl?: string;
}

export const ENTIDADES_REDES: EntidadRed[] = [
  {
    id: 'transit-valencia',
    nombre: 'Centre de Gestió de Trànsit',
    categoria: 'institucional',
    xHandle: 'TransitValencia',
    facebookPageUrl: 'https://www.facebook.com/TransitVLC',
  },
  {
    id: 'gva112',
    nombre: 'Emergències 112 CV',
    categoria: 'institucional',
    xHandle: 'GVA112',
  },
  {
    id: 'bomberos-vlc',
    nombre: 'Bombers Ajuntament València',
    categoria: 'institucional',
    xHandle: 'bomberosvlc',
  },
  {
    id: 'ajuntament-vlc',
    nombre: 'Ajuntament de València',
    categoria: 'institucional',
    xHandle: 'AjuntamentVLC',
  },
  {
    id: 'alcaldesa-catala',
    nombre: 'María José Catalá (alcaldesa)',
    categoria: 'persona',
    xHandle: 'mjosecatala',
    facebookPageUrl: 'https://www.facebook.com/mjcatalaverdet',
  },
  {
    id: 'avamet',
    nombre: 'AVAMET (meteorología)',
    categoria: 'medio',
    xHandle: 'avamet',
    facebookPageUrl: 'https://www.facebook.com/avametassociacio',
  },
  {
    id: 'apunt-noticies',
    nombre: 'À Punt Notícies',
    categoria: 'medio',
    xHandle: 'apuntnoticies',
    facebookPageUrl: 'https://www.facebook.com/apuntnoticies',
  },
  {
    id: 'mobilitat-vlc',
    nombre: 'Mobilitat València',
    categoria: 'institucional',
    xHandle: 'VlcMobilitat',
  },
  {
    id: 'festes-vlc',
    nombre: 'Festes de València (Junta Central Fallera)',
    categoria: 'institucional',
    xHandle: 'JCF_Valencia',
    facebookPageUrl: 'https://www.facebook.com/JCFValencia',
  },
  {
    id: 'levante-emv',
    nombre: 'Levante-EMV',
    categoria: 'medio',
    xHandle: 'levante_emv',
  },
  {
    id: 'elpais-cv',
    nombre: 'El País — Comunitat Valenciana',
    categoria: 'medio',
    xHandle: 'elpais_valencia',
  },
  {
    id: 'emt-valencia',
    nombre: 'EMT València',
    categoria: 'institucional',
    xHandle: 'emtvalencia',
  },
  {
    id: 'metrovalencia',
    nombre: 'Metrovalencia (FGV)',
    categoria: 'institucional',
    xHandle: 'metrovalencia',
  },
];
