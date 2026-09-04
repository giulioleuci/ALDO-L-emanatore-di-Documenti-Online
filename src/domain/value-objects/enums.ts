export enum StatoDocumento {
  GENERATO = 'GENERATO',
  VERBALIZZATO = 'VERBALIZZATO',
  NOTIFICATO = 'NOTIFICATO',
  ARCHIVIATO = 'ARCHIVIATO'
}
export enum DuplicazioneDocumento {
  PERMESSA = 'PERMESSA',
  NEGATA = 'NEGATA'
}
export enum Genere {
  M = 'M',
  F = 'F'
}
export enum PermessoACL {
  SCRITTURA = 'SCRITTURA',
  LETTURA = 'LETTURA',
  COMMENTO = 'COMMENTO'
}
export enum GestioneArticolazione {
  ARTICOLATA = 'ARTICOLATA',
  COMPLETA = 'COMPLETA'
}
export enum GeneratoreAxis {
  CLASSE = 'CLASSE',
  DOCENTE = 'DOCENTE',
  PIANO_PERSONALIZZATO = 'PIANO_PERSONALIZZATO',
  CLASSE_MATERIA = 'CLASSE_MATERIA',
  CLASSE_DOCENTE = 'CLASSE_DOCENTE',
  CLASSE_DOCENTE_MATERIA = 'CLASSE_DOCENTE_MATERIA',
  DIPARTIMENTO = 'DIPARTIMENTO',
  ALUNNO = 'ALUNNO'
}
export enum FormatoOutput {
  GDOC = 'GDOC',
  GSHEET = 'GSHEET',
  PDF = 'PDF',
  TEXT = 'TEXT'
}
export enum ReligioneScelta {
  IRC = 'IRC',
  ALT = 'ALT',
  NO = 'NO'
}
export enum TipoPiano {
  PDP_DSA = 'PDP_DSA',
  PDP_BES = 'PDP_BES',
  PDP_STRANIERI = 'PDP_STRANIERI',
  PEI = 'PEI',
  PFP = 'PFP'
}
export enum TipoProgetto {
  ASL = 'ASL',
  ORIENTAMENTO = 'ORIENTAMENTO',
  ALTRO = 'ALTRO'
}
export enum TipoMovimento {
  IN = 'IN',
  OUT = 'OUT',
  RITIRATO = 'RITIRATO',
  CAMBIO = 'CAMBIO'
}
export enum ProcessoInvio {
  PER_COORDINATORE = 'PER_COORDINATORE',
  PER_DOCENTE = 'PER_DOCENTE',
  PER_CDC = 'PER_CDC',
  PER_ALUNNO = 'PER_ALUNNO',
  PER_GENITORI_ALUNNO = 'PER_GENITORI_ALUNNO',
  PER_CARENZA_GENITORI = 'PER_CARENZA_GENITORI',
  PER_CARENZA_GENITORI_E_ALUNNO = 'PER_CARENZA_GENITORI_E_ALUNNO',
  PER_CARENZA_GENITORI_E_COORD = 'PER_CARENZA_GENITORI_E_COORD',
  PER_CAPO_DIPARTIMENTO = 'PER_CAPO_DIPARTIMENTO',
  PER_DIPARTIMENTO = 'PER_DIPARTIMENTO'
}
export enum GestioneSupplenti {
  SOLO_TITOLARI = 'SOLO_TITOLARI',
  SOLO_SUPPLENTI = 'SOLO_SUPPLENTI',
  ENTRAMBI = 'ENTRAMBI'
}
export enum StatoEmail {
  SUCCESS = 'SUCCESS',
  ERROR = 'ERROR',
  PENDING = 'PENDING'
}

export function appellativo(g: Genere): string {
  return g === Genere.M ? 'Prof.' : 'Prof.ssa';
}
