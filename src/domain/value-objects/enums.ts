export enum StatoDocumento {
  GENERATO = 'GENERATO', VERBALIZZATO = 'VERBALIZZATO',
  NOTIFICATO = 'NOTIFICATO', ARCHIVIATO = 'ARCHIVIATO'
}
export enum SchemaSottocartelle {
  UNO_PER_CLASSE = 'UNO PER CLASSE',
  MULTIPLO_PER_CLASSE = 'MULTIPLO PER CLASSE',
  UNO_PER_DOCENTE = 'UNO PER DOCENTE',
  UNO_PER_CLASSE_PER_MATERIA = 'UNO PER CLASSE PER MATERIA',
  UNO_PER_PIANO_PERSONALIZZATO = 'UNO PER PIANO PERSONALIZZATO',
  UNICO_PER_SCUOLA = 'UNICO PER SCUOLA'
}
export enum Genere { M = 'M', F = 'F' }
export enum PermessoACL { SCRITTURA = 'SCRITTURA', LETTURA = 'LETTURA', COMMENTO = 'COMMENTO' }
export enum GestioneArticolazione { ARTICOLATA = 'ARTICOLATA', COMPLETA = 'COMPLETA' }
export enum FormatoOutput { GDOC = 'GDOC', GSHEET = 'GSHEET', PDF = 'PDF', TEXT = 'TEXT' }
export enum TipoIstituto {
  LICEO = 'LICEO', ITS = 'ITS', IEFP = 'IEFP', PROFESSIONALE = 'PROFESSIONALE', TECNICO = 'TECNICO'
}
export enum ReligioneScelta { SI = 'SI', NO = 'NO', ALT = 'ALT' }
export enum TipoPiano {
  PDP_DSA = 'PDP_DSA', PDP_BES = 'PDP_BES', PDP_STRANIERI = 'PDP_STRANIERI', PEI = 'PEI', PFP = 'PFP'
}
export enum TipoProgetto { ASL = 'ASL', ORIENTAMENTO = 'ORIENTAMENTO', ALTRO = 'ALTRO' }
export enum TipoMovimento { IN = 'IN', OUT = 'OUT', CAMBIO = 'CAMBIO' }
export enum ProcessoInvio {
  PER_COORDINATORE = 'PER_COORDINATORE', PER_DOCENTE = 'PER_DOCENTE', PER_CDC = 'PER_CDC',
  PER_ALUNNO = 'PER_ALUNNO', PER_GENITORI_ALUNNO = 'PER_GENITORI_ALUNNO', PER_CARENZA = 'PER_CARENZA'
}
export enum GestioneSupplenti { SOLO_TITOLARI = 'SOLO_TITOLARI', SOLO_SUPPLENTI = 'SOLO_SUPPLENTI', ENTRAMBI = 'ENTRAMBI' }
export enum StatoEmail { SUCCESS = 'SUCCESS', ERROR = 'ERROR', PENDING = 'PENDING' }

export function appellativo(g: Genere): string {
  return g === Genere.M ? 'Prof.' : 'Prof.ssa';
}
