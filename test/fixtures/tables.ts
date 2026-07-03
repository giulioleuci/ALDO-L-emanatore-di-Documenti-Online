import type { Row } from '../../src/infrastructure/db/Database';

export function fixtureTables(): Record<string, Row[]> {
  return {
    CLASSI: [
      { ID: '5A', ANNO: 5, INDIRIZZO: 'SCIENTIFICO', ARTICOLAZIONE: null, RUOLI: '{"SEGRETARIO":"rossi@school.it"}', ATTIVA: true,
        MATE: 'rossi@school.it', FISI: 'bianchi@school.it' }
    ],
    DOCENTI: [
      { EMAIL: 'rossi@school.it', COGNOME: 'ROSSI', NOME: 'MARIO', GENERE: 'M' },
      { EMAIL: 'bianchi@school.it', COGNOME: 'BIANCHI', NOME: 'LUCIA', GENERE: 'F' }
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
    DIPART: [
      { ID: 'SCIENTIFICO_DIP', NOME: 'Dipartimento scientifico', CAPO: 'rossi@school.it', MATERIE: 'MATE,FISI' },
      { ID: 'LETTERE', NOME: 'Dipartimento di lettere', CAPO: '', MATERIE: 'ITA' }
    ],
    RUOLI: [
      { ID: 'REF_BES', NOME: 'Referente BES', DOCENTE: 'rossi@school.it,bianchi@school.it' },
      { ID: 'AN_DIG', NOME: 'Animatore digitale', DOCENTE: 'bianchi@school.it' }
    ],
    LOG_DOCS: [],
    LOG_FOLD: []
  };
}
