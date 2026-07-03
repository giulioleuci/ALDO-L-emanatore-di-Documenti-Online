import type { Row } from '../../src/infrastructure/db/Database';

export function fixtureTables(): Record<string, Row[]> {
  return {
    CLASSI: [
      { ID: '5A', ANNO: 5, INDIRIZZO: 'SCIENTIFICO', ARTICOLAZIONE: null, RUOLI: '{"SEGRETARIO":"rossi@school.it","TUTOR_ASL":"rossi@school.it,bianchi@school.it"}',
        ATTIVA: true, COORD: 'rossi@school.it', IRC: 'bianchi@school.it', STORICO: '4A,3A',
        MATE: 'rossi@school.it', FISI: 'bianchi@school.it' },
      { ID: '3B', ANNO: 3, INDIRIZZO: 'ITI', ARTICOLAZIONE: null, RUOLI: null, ATTIVA: false,
        COORD: '', MATE: 'bianchi@school.it' },
      { ID: '1F', ANNO: 1, INDIRIZZO: 'SCIENTIFICO', ATTIVA: true, COORD: 'rossi@school.it',
        ARTICOLAZIONE: '{"parent":null,"partner":null,"partners":"1F-LSO,1F-LSS"}', MATE: 'rossi@school.it' },
      { ID: '1F-LSO', ANNO: 1, INDIRIZZO: 'SCIENTIFICO', ATTIVA: true, COORD: 'rossi@school.it',
        ARTICOLAZIONE: '{"parent":"1F","partner":"1F-LSS","partners":null}', MATE: 'rossi@school.it', FISI: 'bianchi@school.it' },
      { ID: '1F-LSS', ANNO: 1, INDIRIZZO: 'LSSA', ATTIVA: true, COORD: 'rossi@school.it',
        ARTICOLAZIONE: '{"parent":"1F","partner":"1F-LSO","partners":null}', MATE: 'rossi@school.it', FISI: 'verdi@school.it' }
    ],
    DOCENTI: [
      { EMAIL: 'rossi@school.it', COGNOME: 'ROSSI', NOME: 'MARIO', GENERE: 'M', DIPART: 'SCIENTIFICO_DIP', ITP: false },
      { EMAIL: 'bianchi@school.it', COGNOME: 'BIANCHI', NOME: 'LUCIA', GENERE: 'F', DIPART: 'SCIENTIFICO_DIP', ITP: false },
      { EMAIL: 'verdi@school.it', COGNOME: 'VERDI', NOME: 'GIO', GENERE: 'M', DIPART: 'LETTERE', ITP: true }
    ],
    MATERIE: [
      { ID: 'MATE', NOME: 'Matematica', SINTESI: 'Matematica', ESAME_CFG: '{"prima_prova":["SCIENTIFICO"],"seconda_prova":["LSSA"]}' },
      { ID: 'FISI', NOME: 'Fisica', SINTESI: 'Fisica', ESAME_CFG: null }
    ],
    ALUNNI: [
      { EMAIL: 'a1@school.it', COGNOMENOME: 'VERDI ANNA', CLASSE: '5A', RELIGIONE: 'SI', ATTIVO: true,
        RIPETENTE: false, RAPPR_STUD: true, TUTOR_1: 'genitore1@x.it', TUTOR_2: '',
        CURRICULUM: '{"INTERP":["CHITARRA","PIANO"]}' },
      { EMAIL: 'a2@school.it', COGNOMENOME: 'NERI PAOLO', CLASSE: '5A', RELIGIONE: 'NO', ATTIVO: false,
        RIPETENTE: true, RAPPR_STUD: false, TUTOR_1: 'genitore2@x.it', TUTOR_2: 'genitore3@x.it', CURRICULUM: null },
      { EMAIL: 'a3@school.it', COGNOMENOME: 'BLU CARLA', CLASSE: '5A', RELIGIONE: 'ALT', ATTIVO: false,
        RIPETENTE: false, RAPPR_STUD: false, TUTOR_1: '', TUTOR_2: '', CURRICULUM: null }
    ],
    CONF_DOC: [
      { ID: 'CD1', TIPO: 'VERBALE', GENERATORE: 'VERBALE_CDC', CONDIZIONE: null,
        MODELLI: '{"templateId":"tmpl_verbale"}', FILE_NAME: 'Verbale_{{focus.classe.anagrafica.nome}}_{{meta.date.oggi.breve}}',
        PATH_OUT: 'Verbali/{{focus.classe.anagrafica.anno}}', PATH_OUT_SOTTOCARTELLE: null,
        SCHEMA_SOTTOCARTELLE: 'UNO PER CLASSE', PERMESSI: null, POST_PROCESSO: null,
        PARAMETRI: null, GESTIONE_ARTICOLAZIONE: 'COMPLETA', FORMATO: 'GDOC' }
    ],
    INDIRIZZI: [
      { ID: 'SCIENTIFICO', NOME: 'Liceo scientifico', NOME_SINTETICO: 'Scientifico', TIPO: 'LICEO' },
      { ID: 'LSSA', NOME: 'Liceo scientifico scienze applicate', NOME_SINTETICO: 'Scienze applicate', TIPO: 'LICEO' },
      { ID: 'ITI', NOME: 'Istituto tecnico industriale', NOME_SINTETICO: 'Tecnico industriale', TIPO: 'TECNICO' }
    ],
    PIANI: [
      { STUDENTE: 'a1@school.it', TIPO: 'PEI', PARAMETRI: '{"gravita":"media"}' },
      { STUDENTE: 'a2@school.it', TIPO: 'PDP_DSA', PARAMETRI: null },
      { STUDENTE: 'a3@school.it', TIPO: 'PFP', PARAMETRI: null }
    ],
    DIPART: [
      { ID: 'SCIENTIFICO_DIP', NOME: 'Dipartimento scientifico', CAPO: 'rossi@school.it', MATERIE: 'MATE,FISI' },
      { ID: 'LETTERE', NOME: 'Dipartimento di lettere', CAPO: '', MATERIE: 'ITA' }
    ],
    RUOLI: [
      { ID: 'REF_BES', NOME: 'Referente BES', DOCENTE: 'rossi@school.it,bianchi@school.it' },
      { ID: 'AN_DIG', NOME: 'Animatore digitale', DOCENTE: 'bianchi@school.it' }
    ],
    CARENZE: [
      { STUDENTE: 'a1@school.it', PROGRESSIVO: 1, CLASSE: '5A', DATA: '2026-02-15', NOTIFICATO: '',
        ASSENZE: true, MATE: '4.5', FISI: 'Studio scarso' },
      { STUDENTE: 'a1@school.it', PROGRESSIVO: 2, CLASSE: '5A', DATA: '2026-05-20',
        NOTIFICATO: '2026-05-21T10:00:00.000Z', ASSENZE: false, MATE: '5' },
      { STUDENTE: 'a2@school.it', PROGRESSIVO: 1, CLASSE: '5A', DATA: '2025-12-01', NOTIFICATO: '',
        ASSENZE: false, FISI: '3' }
    ],
    PROGETTI: [
      { CLASSE: '5A', TIPO: 'ASL', NOME: 'Stage aziendale', REFERENTE: 'rossi@school.it', ORE: 80, ORE_ASL: 70 },
      { CLASSE: '5A', TIPO: 'ORIENTAMENTO', NOME: 'Open day', REFERENTE: 'bianchi@school.it', ORE: 10, ORE_ASL: 0 }
    ],
    MOV_ALUNNI: [
      { STUDENTE: 'a2@school.it', TIPO: 'IN', DATA: '2025-09-15', DA: 'ALTRO ISTITUTO', A: '5A' },
      { STUDENTE: 'a2@school.it', TIPO: 'CAMBIO', DATA: '2026-01-10', DA: '5A', A: '5B' },
      { STUDENTE: 'a3@school.it', TIPO: 'OUT', DATA: '2026-03-01', DA: '5A', A: 'RITIRO' }
    ],
    ASL: [
      { STUDENTE: 'a1@school.it', ANNO: '2024-2025', ORE: 40 },
      { STUDENTE: 'a1@school.it', ANNO: '2025-2026', ORE: 60 },
      { STUDENTE: 'a2@school.it', ANNO: '2025-2026', ORE: 30 }
    ],
    LOG_DOCS: [],
    LOG_FOLD: []
  };
}
