import type { Row } from '../../src/infrastructure/db/Database';
import { COL_CONF_MAIL } from '../../src/config/schema';

export function fixtureTables(): Record<string, Row[]> {
  return {
    CLASSI: [
      {
        ID: '5A',
        ANNO: 5,
        INDIRIZZO: 'SCIENTIFICO',
        ARTICOLAZIONE: null,
        RUOLI: '{"SEGRETARIO":"rossi@school.it","TUTOR_ASL":"rossi@school.it,bianchi@school.it"}',
        ATTIVA: true,
        COORD: 'rossi@school.it',
        IRC: 'bianchi@school.it',
        STORICO: '4A,3A',
        MATE: 'rossi@school.it',
        FISI: 'bianchi@school.it'
      },
      {
        ID: '3B',
        ANNO: 3,
        INDIRIZZO: 'ITI',
        ARTICOLAZIONE: null,
        RUOLI: null,
        ATTIVA: false,
        COORD: '',
        MATE: 'bianchi@school.it'
      },
      {
        ID: '1F',
        ANNO: 1,
        INDIRIZZO: 'SCIENTIFICO',
        ATTIVA: true,
        COORD: 'rossi@school.it',
        ARTICOLAZIONE: '{"parent":null,"partner":null,"partners":["1F-LSO","1F-LSS"]}',
        MATE: 'rossi@school.it'
      },
      {
        ID: '1F-LSO',
        ANNO: 1,
        INDIRIZZO: 'SCIENTIFICO',
        ATTIVA: true,
        COORD: 'rossi@school.it',
        ARTICOLAZIONE: '{"parent":"1F","partner":"1F-LSS","partners":null}',
        MATE: 'rossi@school.it',
        FISI: 'bianchi@school.it'
      },
      {
        ID: '1F-LSS',
        ANNO: 1,
        INDIRIZZO: 'LSSA',
        ATTIVA: true,
        COORD: 'rossi@school.it',
        ARTICOLAZIONE: '{"parent":"1F","partner":"1F-LSO","partners":null}',
        MATE: 'rossi@school.it',
        FISI: 'verdi@school.it'
      }
    ],
    DOCENTI: [
      {
        EMAIL: 'rossi@school.it',
        COGNOME: 'ROSSI',
        NOME: 'MARIO',
        GENERE: 'M',
        DIPART: 'SCIENTIFICO_DIP',
        ITP: false
      },
      {
        EMAIL: 'bianchi@school.it',
        COGNOME: 'BIANCHI',
        NOME: 'LUCIA',
        GENERE: 'F',
        DIPART: 'SCIENTIFICO_DIP',
        ITP: false
      },
      {
        EMAIL: 'verdi@school.it',
        COGNOME: 'VERDI',
        NOME: 'GIO',
        GENERE: 'M',
        DIPART: 'LETTERE',
        ITP: true
      }
    ],
    MATERIE: [
      {
        ID: 'MATE',
        NOME: 'Matematica',
        SINTESI: 'Matematica',
        COLORE_1: '#c0392b',
        COLORE_2: '#fdecea',
        SIMBOLO: '📐',
        ESAME_CFG: '{"primaProva":["SCIENTIFICO"],"secondaProva":["LSSA"]}'
      },
      {
        ID: 'FISI',
        NOME: 'Fisica',
        SINTESI: 'Fisica',
        COLORE_1: '#2980b9',
        COLORE_2: '#eaf2fd',
        SIMBOLO: '🔭',
        ESAME_CFG: null
      },
      {
        ID: 'IRC',
        NOME: 'Religione Cattolica',
        SINTESI: 'Religione',
        ESAME_CFG: null,
        IS_RELIGIONE_ALT: true
      },
      {
        ID: 'ALT',
        NOME: 'Attività alternativa',
        SINTESI: 'Alternativa',
        ESAME_CFG: null,
        IS_RELIGIONE_ALT: true
      },
      {
        ID: 'LAB',
        NOME: 'Laboratorio',
        SINTESI: 'Laboratorio',
        ESAME_CFG: null
      },
      {
        ID: 'LAB.GRUPPO_A',
        NOME: 'Laboratorio - Gruppo A',
        SINTESI: 'Lab A',
        ESAME_CFG: null
      },
      {
        ID: 'LAB.GRUPPO_B',
        NOME: 'Laboratorio - Gruppo B',
        SINTESI: 'Lab B',
        ESAME_CFG: null
      },
      // Composite specificità catalog rows (design 2026-07-30-materie-specifica-catalog):
      // base + two dotted MATERIA.SPECIFICA rows, seeded here (not only in
      // teachingSlotFixtureTables) so Task 27's e2e/online checks have this
      // data available by default.
      {
        ID: 'INTERPRET',
        NOME: 'Esecuzione e interpretazione musicale',
        SINTESI: 'Interpretazione',
        ESAME_CFG: null
      },
      {
        ID: 'INTERPRET.CHITARRA',
        NOME: 'Esecuzione e interpretazione musicale - Chitarra',
        SINTESI: 'Chitarra',
        ESAME_CFG: null
      },
      {
        ID: 'INTERPRET.FLAUTO',
        NOME: 'Esecuzione e interpretazione musicale - Flauto',
        SINTESI: 'Flauto',
        ESAME_CFG: null
      }
    ],
    ALUNNI: [
      {
        EMAIL: 'a1@school.it',
        COGNOMENOME: 'VERDI ANNA',
        CLASSE: '5A',
        RELIGIONE: 'IRC',
        ATTIVO: true,
        RIPETENTE: false,
        RAPPR_STUD: true,
        TUTOR_1: 'genitore1@x.it',
        TUTOR_2: '',
        CURRICULUM: '{"INTERP":["CHITARRA","PIANO"]}'
      },
      {
        EMAIL: 'a2@school.it',
        COGNOMENOME: 'NERI PAOLO',
        CLASSE: '5A',
        RELIGIONE: 'NO',
        ATTIVO: false,
        RIPETENTE: true,
        RAPPR_STUD: false,
        TUTOR_1: 'genitore2@x.it',
        TUTOR_2: 'genitore3@x.it',
        CURRICULUM: null
      },
      {
        EMAIL: 'a3@school.it',
        COGNOMENOME: 'BLU CARLA',
        CLASSE: '5A',
        RELIGIONE: 'ALT',
        ATTIVO: false,
        RIPETENTE: false,
        RAPPR_STUD: false,
        TUTOR_1: '',
        TUTOR_2: '',
        CURRICULUM: null
      }
    ],
    CONF_DOC: [
      {
        ID: 'CD1',
        TIPO: 'VERBALE',
        GENERATORE: 'VERBALE_CDC',
        CONDIZIONE: null,
        MODELLI: '{"templateId":"tmpl_verbale"}',
        FILE_NAME: 'Verbale_{{focus.classe.anagrafica.nome}}_{{meta.date.oggi.breve}}',
        PATH_OUT: 'Verbali/{{focus.classe.anagrafica.anno}}',
        DUPLICAZIONE: 'NEGATA',
        PERMESSI: null,
        POST_PROCESSO: null,
        PARAMETRI: null,
        GESTIONE_ARTICOLAZIONE: 'COMPLETA',
        FORMATO: 'GDOC',
        REGISTRA_DOC: '{"classi":"{{focus.classe.anagrafica.nome}}","utenti":"","materie":""}',
        REGISTRA_FOLD: '{}'
      },
      {
        ID: 'CD_ESAME',
        TIPO: 'VERBALE',
        GENERATORE: 'VERBALE_CDC',
        CONDIZIONE: '{{focus.classe.anagrafica.anno}} == 5',
        MODELLI:
          '[{"condizione":"{{focus.classe.anagrafica.anno}} == 5","templateId":"tmpl_esame"},{"condizione":"true","templateId":"tmpl_default"}]',
        FILE_NAME: null,
        PATH_OUT: null,
        DUPLICAZIONE: 'NEGATA',
        PERMESSI: null,
        POST_PROCESSO: null,
        PARAMETRI: null,
        GESTIONE_ARTICOLAZIONE: 'COMPLETA',
        FORMATO: 'GDOC',
        REGISTRA_DOC: '{}',
        REGISTRA_FOLD: '{}'
      },
      {
        ID: 'PIANI_PERSONALIZZATI',
        TIPO: 'PIANO_PERS',
        GENERATORE: 'DOC_PERSONALIZZATO',
        CONDIZIONE: null,
        MODELLI:
          '[{"condizione":"{{focus.piano.tipo}} == \\"PDP_DSA\\"","templateId":"tmpl_pdp_dsa"},{"condizione":"{{focus.piano.tipo}} == \\"PDP_BES\\"","templateId":"tmpl_pdp_bes"},{"condizione":"{{focus.piano.tipo}} == \\"PDP_STRANIERI\\"","templateId":"tmpl_pdp_stranieri"},{"condizione":"{{focus.piano.tipo}} == \\"PEI\\"","templateId":"tmpl_pei"},{"condizione":"{{focus.piano.tipo}} == \\"PFP\\"","templateId":"tmpl_pfp"}]',
        FILE_NAME:
          'Piano_{{focus.piano.tipo}}_{{focus.alunno.anagrafica.nomeCompleto}}',
        PATH_OUT: 'Piani personalizzati/{{focus.classe.anagrafica.nome}}',
        DUPLICAZIONE: 'NEGATA',
        PERMESSI: null,
        POST_PROCESSO: null,
        PARAMETRI: null,
        GESTIONE_ARTICOLAZIONE: 'COMPLETA',
        FORMATO: 'GDOC',
        REGISTRA_DOC:
          '{"classi":"{{focus.classe.anagrafica.nome}}","utenti":"{{focus.alunno.anagrafica.email}}","materie":""}',
        REGISTRA_FOLD: '{}'
      },
      {
        ID: 'CD_ARTICOLATA',
        TIPO: 'VERBALE_ARTICOLATO',
        GENERATORE: 'VERBALE_CDC',
        CONDIZIONE: null,
        MODELLI: '{"templateId":"tmpl_verbale"}',
        FILE_NAME: 'Verbale_{{focus.classe.anagrafica.nome}}_{{meta.date.oggi.breve}}',
        PATH_OUT: 'Verbali/{{focus.classe.anagrafica.anno}}',
        DUPLICAZIONE: 'NEGATA',
        PERMESSI: null,
        POST_PROCESSO: null,
        PARAMETRI: null,
        GESTIONE_ARTICOLAZIONE: 'ARTICOLATA',
        FORMATO: 'GDOC',
        REGISTRA_DOC: '{"classi":"{{focus.classe.anagrafica.nome}}","utenti":"","materie":""}',
        REGISTRA_FOLD: '{}'
      }
    ],
    CONF_MAIL: [
      {
        ID: 'CDC_OTTOBRE',
        OGGETTO: 'Convocazione CdC {{focus.classe.anagrafica.nome}}',
        PROCESSO: 'PER_CDC',
        BOX_CFG:
          '[{"TIPO_BOX":"testo_dinamico","CONTENUTO":"<p>Comunicazione del consiglio di classe.</p>"},{"TIPO_BOX":"carenze"}]',
        TESTO_START: '<p>Gentili colleghi</p>',
        TESTO_END: '',
        RISPONDI_A: '',
        SUPPLENTI: 'ENTRAMBI',
        NOREPLY: true,
        COLORE_HEADER: '',
        CONDIZIONE: null,
        POST_PROCESSO: null,
        [COL_CONF_MAIL.DUPLICAZIONE]: 'NEGATA',
        [COL_CONF_MAIL.GESTIONE_ARTICOLAZIONE]: 'COMPLETA',
        [COL_CONF_MAIL.ALLEGATI]: '[]'
      },
      {
        ID: 'CARENZE_FAM',
        OGGETTO: 'Comunicazione carenze',
        PROCESSO: 'PER_GENITORI_ALUNNO',
        BOX_CFG: null,
        TESTO_START: '',
        TESTO_END: '',
        RISPONDI_A: '',
        SUPPLENTI: 'SOLO_TITOLARI',
        NOREPLY: false,
        COLORE_HEADER: '#ff0000',
        CONDIZIONE: 'carenze > 0',
        POST_PROCESSO: null,
        [COL_CONF_MAIL.DUPLICAZIONE]: 'NEGATA',
        [COL_CONF_MAIL.GESTIONE_ARTICOLAZIONE]: 'COMPLETA',
        [COL_CONF_MAIL.ALLEGATI]: '[]'
      },
      {
        ID: 'CARENZE_NOTIFICA',
        OGGETTO: 'Carenze di {{focus.alunno.anagrafica.nomeCompleto}}',
        PROCESSO: 'PER_CARENZA_GENITORI',
        BOX_CFG:
          '[{"TIPO_BOX":"carenze","TITOLO":"Carenze rilevate"},{"TIPO_BOX":"note","ORDINE":2},{"TIPO_BOX":"assenze","ORDINE":3}]',
        TESTO_START: '<p>Si comunicano le carenze rilevate per la classe {{focus.carenza.classe}}.</p>',
        TESTO_END: '',
        RISPONDI_A: '',
        SUPPLENTI: 'SOLO_TITOLARI',
        NOREPLY: true,
        COLORE_HEADER: '',
        CONDIZIONE: null,
        POST_PROCESSO:
          '[{"tipo":"INSERISCI_TIMESTAMP","tab":"CARENZE","col":"NOTIFICATO","criteri":{"STUDENTE":"{{focus.carenza.studente}}","PROGRESSIVO":"{{focus.carenza.progressivo}}"}}]',
        [COL_CONF_MAIL.DUPLICAZIONE]: 'NEGATA',
        [COL_CONF_MAIL.GESTIONE_ARTICOLAZIONE]: 'COMPLETA',
        [COL_CONF_MAIL.ALLEGATI]: '[]'
      }
    ],
    CONF_IMP: [
      {
        ID: 'IMPORT_ALUNNI',
        TARGET: 'ALUNNI',
        CONFIG:
          '{"searchStrategy":"FILE_SINGOLO","fileId":"sheet_alunni","map":{"A":"EMAIL","B":"COGNOMENOME"},"key":"EMAIL","conflictResolution":"IGNORE"}',
        ATTIVO: true
      },
      { ID: 'IMPORT_DOCENTI', TARGET: 'DOCENTI', CONFIG: null, ATTIVO: false }
    ],
    INDIRIZZI: [
      {
        ID: 'SCIENTIFICO',
        NOME: 'Liceo scientifico',
        NOME_SINTETICO: 'Scientifico',
        TIPO: 'LICEO'
      },
      {
        ID: 'LSSA',
        NOME: 'Liceo scientifico scienze applicate',
        NOME_SINTETICO: 'Scienze applicate',
        TIPO: 'LICEO'
      },
      {
        ID: 'ITI',
        NOME: 'Istituto tecnico industriale',
        NOME_SINTETICO: 'Tecnico industriale',
        TIPO: 'TECNICO'
      }
    ],
    PIANI: [
      { STUDENTE: 'a1@school.it', TIPO: 'PEI', PARAMETRI: '{"gravita":"media"}' },
      { STUDENTE: 'a2@school.it', TIPO: 'PDP_DSA', PARAMETRI: null },
      { STUDENTE: 'a3@school.it', TIPO: 'PFP', PARAMETRI: null }
    ],
    DIPART: [
      {
        ID: 'SCIENTIFICO_DIP',
        NOME: 'Dipartimento scientifico',
        CAPO: 'rossi@school.it',
        MATERIE: 'MATE,FISI'
      },
      { ID: 'LETTERE', NOME: 'Dipartimento di lettere', CAPO: '', MATERIE: 'ITA' }
    ],
    RUOLI: [
      { ID: 'REF_BES', NOME: 'Referente BES', DOCENTE: 'rossi@school.it,bianchi@school.it' },
      { ID: 'AN_DIG', NOME: 'Animatore digitale', DOCENTE: 'bianchi@school.it' }
    ],
    CARENZE: [
      {
        STUDENTE: 'a1@school.it',
        PROGRESSIVO: 1,
        CLASSE: '5A',
        DATA: '2026-02-15',
        NOTIFICATO: '',
        ASSENZE: true,
        MATE: '4.5',
        FISI: 'Studio scarso'
      },
      {
        STUDENTE: 'a1@school.it',
        PROGRESSIVO: 2,
        CLASSE: '5A',
        DATA: '2026-05-20',
        NOTIFICATO: '2026-05-21T10:00:00.000Z',
        ASSENZE: false,
        MATE: '5'
      },
      {
        STUDENTE: 'a2@school.it',
        PROGRESSIVO: 1,
        CLASSE: '5A',
        DATA: '2025-12-01',
        NOTIFICATO: '',
        ASSENZE: false,
        FISI: '3'
      }
    ],
    PROGETTI: [
      {
        CLASSE: '5A',
        TIPO: 'ASL',
        NOME: 'Stage aziendale',
        REFERENTE: 'rossi@school.it',
        ORE: 80,
        ORE_ASL: 70
      },
      {
        CLASSE: '5A',
        TIPO: 'ORIENTAMENTO',
        NOME: 'Open day',
        REFERENTE: 'bianchi@school.it',
        ORE: 10,
        ORE_ASL: 0
      }
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
    SUPPLENZE: [
      // Chain: rossi replaced by bianchi (5A/ITA); bianchi in turn replaced by verdi (same context).
      {
        TITOLARE: 'rossi@school.it',
        SUPPLENTE: 'bianchi@school.it',
        DAL: '2025-11-01',
        AL: '2025-11-30',
        // '4B' is intentionally not in this file's base CLASSI array -- it's added
        // locally by the specific test files that need it (e.g. swap-supplenti.test.ts).
        CLASSI: '5A,4B',
        MATERIE: '*'
      },
      {
        TITOLARE: 'bianchi@school.it',
        SUPPLENTE: 'verdi@school.it',
        DAL: '2025-11-10',
        AL: '2025-11-20',
        CLASSI: '5A',
        MATERIE: 'ITA'
      },
      // Unrelated, expired.
      {
        TITOLARE: 'verdi@school.it',
        SUPPLENTE: 'rossi@school.it',
        DAL: '2025-09-01',
        AL: '2025-09-05',
        CLASSI: '*',
        MATERIE: '*'
      }
    ],
    VARIAZIONI_CATTEDRA: [
      {
        TITOLARE: 'rossi@school.it',
        NUOVO_TITOLARE: 'bianchi@school.it',
        DAL: '2025-10-01',
        CLASSI: '5A',
        MATERIE: 'MATE'
      }
      // A '1F'/FISI row was here (feat(R2d) 03421d8), but CLASSI='1F' — the
      // articulated parent — never legitimately, nominally holds FISI: it's split
      // per-partner (1F-LSO=bianchi, 1F-LSS=verdi; see classe-articolazione.test.ts).
      // TITOLARE='bianchi@school.it' does match 1F-LSO's nominal FISI holder,
      // so retargeting CLASSI to '1F-LSO' would be internally consistent — but the
      // articulated-fixture invariant (bianchi=1F-LSO/FISI, rossi=COMUNE/MATE,
      // verdi=1F-LSS/FISI, all three present with distinct COMUNE/SEPARATO_PRIMO/
      // SEPARATO_SECONDO tags) is relied on verbatim by consiglio-provider.test.ts,
      // cdc-assembler.test.ts, email-notification-service.test.ts and
      // notifica-email.test.ts. Applying the variazione there would collapse bianchi
      // out of the council entirely (replaced by verdi), breaking that invariant
      // across every one of those unrelated suites. Since nothing in the plan
      // depends on this row being active (unlike 5A/MATE, see 64d9db7), it's dropped
      // rather than relocated — it never legitimately applied anywhere in this fixture.
    ],
    MASTER: [
      // Always kept in descending ANNO_SCOLASTICO order: first row = current year.
      {
        ANNO_SCOLASTICO: '2025-2026',
        ID_SPREADSHEET: 'ss_2526',
        ID_CARTELLA_GOOGLE: 'fold_2526',
        DIRIGENTE_SCOLASTICO: 'prof.ssa MARIA BIANCHI',
        SUPERVISORE_EMAIL: 'super@school.it'
      },
      {
        ANNO_SCOLASTICO: '2024-2025',
        ID_SPREADSHEET: 'ss_2425',
        ID_CARTELLA_GOOGLE: 'fold_2425',
        DIRIGENTE_SCOLASTICO: 'prof. LUIGI ROSSI',
        SUPERVISORE_EMAIL: ''
      },
      {
        ANNO_SCOLASTICO: '2023-2024',
        ID_SPREADSHEET: 'ss_2324',
        ID_CARTELLA_GOOGLE: 'fold_2324',
        DIRIGENTE_SCOLASTICO: 'prof. LUIGI ROSSI',
        SUPERVISORE_EMAIL: ''
      }
    ],
    LOG_DOCS: [],
    LOG_FOLD: [],
    LOG_MAIL: []
  };
}

/** Complete first-class teaching-slot matrix used by the GLF assignment-adapter tests. */
export function teachingSlotFixtureTables(): Record<string, Row[]> {
  const tables = fixtureTables();
  const expanded = Object.fromEntries(
    Object.entries(tables).map(([name, rows]) => [name, rows.map((row) => ({ ...row }))])
  );
  const classe5A = expanded.CLASSI!.find((row) => row.ID === '5A')!;
  Object.assign(classe5A, {
    MAT: 'main@school.test',
    'INF.itp': 'itp@school.test',
    'LAB.GRUPPO_A': 'specific-a@school.test',
    'LAB.GRUPPO_B': 'specific-b@school.test',
    'LAB.GRUPPO.A': 'specific-b@school.test',
    'INTERPRET.CHITARRA': 'guitar@school.test',
    IRC: 'irc@school.test',
    ALT: 'alt@school.test'
  });
  expanded.DOCENTI!.push(
    {
      EMAIL: 'main@school.test',
      COGNOME: 'MAIN',
      NOME: 'TEACHER',
      GENERE: 'M',
      DIPART: 'SCIENTIFICO_DIP',
      ITP: false
    },
    {
      EMAIL: 'itp@school.test',
      COGNOME: 'ITP',
      NOME: 'TEACHER',
      GENERE: 'F',
      DIPART: 'SCIENTIFICO_DIP',
      ITP: true
    },
    {
      EMAIL: 'specific-a@school.test',
      COGNOME: 'SPECIFIC',
      NOME: 'A',
      GENERE: 'F',
      DIPART: 'SCIENTIFICO_DIP',
      ITP: false
    },
    {
      EMAIL: 'specific-b@school.test',
      COGNOME: 'SPECIFIC',
      NOME: 'B',
      GENERE: 'M',
      DIPART: 'SCIENTIFICO_DIP',
      ITP: false
    },
    {
      EMAIL: 'guitar@school.test',
      COGNOME: 'GUITAR',
      NOME: 'TEACHER',
      GENERE: 'F',
      DIPART: 'SCIENTIFICO_DIP',
      ITP: false
    },
    {
      EMAIL: 'irc@school.test',
      COGNOME: 'IRC',
      NOME: 'TEACHER',
      GENERE: 'M',
      DIPART: 'LETTERE',
      ITP: false
    },
    {
      EMAIL: 'alt@school.test',
      COGNOME: 'ALT',
      NOME: 'TEACHER',
      GENERE: 'F',
      DIPART: 'LETTERE',
      ITP: false
    }
  );
  expanded.MATERIE!.push(
    { ID: 'MAT', IS_RELIGIONE_ALT: false },
    { ID: 'INF', IS_RELIGIONE_ALT: false },
    { ID: 'LAB', IS_RELIGIONE_ALT: false },
    // Specifica catalog rows (design 2026-07-30-materie-specifica-catalog):
    // every dotted MATERIE.ID used as a SPECIFICA slot must exist as its own row.
    // NOTE: 'INTERPRET' and 'INTERPRET.CHITARRA' are NOT re-pushed here — both
    // are now seeded by the default fixtureTables() MATERIE array (Task 15
    // Step 9 fix); re-adding them would create duplicate-ID rows. Only this
    // fixture's own unique addition (PIANOFORTE) stays here.
    { ID: 'LAB.GRUPPO_A', NOME: 'Laboratorio - Gruppo A', IS_RELIGIONE_ALT: false },
    { ID: 'LAB.GRUPPO_B', NOME: 'Laboratorio - Gruppo B', IS_RELIGIONE_ALT: false },
    { ID: 'LAB.GRUPPO.A', NOME: 'Laboratorio - Gruppo.A', IS_RELIGIONE_ALT: false },
    { ID: 'INTERPRET.PIANOFORTE', NOME: 'Interpretazione - Pianoforte', IS_RELIGIONE_ALT: false }
  );
  return expanded;
}
