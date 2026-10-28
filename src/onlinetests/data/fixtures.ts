/** Dataset condiviso online test (design 2026-08-10 Sez. 1). */
export const INDIRIZZO_CLASSICO = 'IND_CLASSICO';
export const INDIRIZZO_SCIENTIFICO = 'IND_SCIENTIFICO';
export const INDIRIZZO_SCIENTIFICO_APPLICATE = 'IND_SCIENTIFICO_APPLICATE';

export const INDIRIZZI = [
  INDIRIZZO_CLASSICO,
  INDIRIZZO_SCIENTIFICO,
  INDIRIZZO_SCIENTIFICO_APPLICATE
] as const;

export const ALL_CLASSI = [
  '1A',
  '2A',
  '4A',
  '1B',
  '2B',
  '5B',
  '5B-S',
  '5B-C',
  '3C',
  '3C-S',
  '3C-C',
  '4D',
  '5E'
] as const;

/** Address lookup kept separate from the seeder-compatible class layouts. */
export const CLASS_ADDRESS_BY_CLASS: Record<string, string> = {
  '1A': INDIRIZZO_CLASSICO,
  '2A': INDIRIZZO_CLASSICO,
  '4A': INDIRIZZO_CLASSICO,
  // The brief has no distinct scienze-umane identifier; retain the declared
  // compatibility identifier until the domain schema introduces one.
  '1B': INDIRIZZO_SCIENTIFICO_APPLICATE,
  '2B': INDIRIZZO_SCIENTIFICO_APPLICATE,
  '5B': INDIRIZZO_SCIENTIFICO_APPLICATE,
  '5B-S': INDIRIZZO_SCIENTIFICO_APPLICATE,
  '5B-C': INDIRIZZO_SCIENTIFICO_APPLICATE,
  '3C': INDIRIZZO_SCIENTIFICO,
  '3C-S': INDIRIZZO_SCIENTIFICO,
  '3C-C': INDIRIZZO_CLASSICO,
  '4D': INDIRIZZO_SCIENTIFICO,
  '5E': INDIRIZZO_SCIENTIFICO
};

export interface FixtureClasseLayout {
  id: string;
  studentStart: number;
  count: number;
  coordIndex: number;
  articolazione: string;
  studentRepCount: number;
  parentRepCount: number;
  religionExceptions: Array<{ index: number; scelta: string }>;
}

const layout = (
  id: string,
  studentStart: number,
  count: number,
  coordIndex: number,
  articolazione = '{}',
  representativeCounts: { studenti: number; genitori: number } = { studenti: 2, genitori: 2 }
): FixtureClasseLayout => ({
  id,
  studentStart,
  count,
  coordIndex,
  articolazione,
  studentRepCount: representativeCounts.studenti,
  parentRepCount: representativeCounts.genitori,
  religionExceptions:
    id === '1A'
      ? [
          { index: 0, scelta: 'NO' },
          { index: 3, scelta: 'ALT' }
        ]
      : id === '2B'
        ? [{ index: 0, scelta: 'NO' }]
        : id === '3C-S'
          ? [{ index: 2, scelta: 'ALT' }]
          : [
              { index: 0, scelta: 'NO' },
              { index: 1, scelta: 'ALT' }
            ]
});

export const CLASS_LAYOUTS: FixtureClasseLayout[] = [
  // Stable focal ranges are deliberately non-negotiable: online import and
  // personalized-plan checks address these exact student identities.
  layout('1A', 1, 20, 1, '{}', { studenti: 0, genitori: 0 }),
  layout('2A', 61, 22, 2),
  layout('4A', 83, 22, 3),
  layout('1B', 105, 22, 1),
  layout('2B', 21, 20, 1, '{}', { studenti: 1, genitori: 1 }),
  layout('5B', 127, 11, 5),
  layout('5B-S', 139, 22, 5, '{"parent":"5B","partner":"5B-C"}'),
  layout('5B-C', 161, 22, 5, '{"parent":"5B","partner":"5B-S"}'),
  layout('3C', 138, 1, 6, '{}', { studenti: 0, genitori: 0 }),
  layout('3C-S', 41, 8, 3, '{"parent":"3C","partner":"3C-C"}', {
    studenti: 2,
    genitori: 1
  }),
  layout('3C-C', 49, 12, 7, '{"parent":"3C","partner":"3C-S"}', {
    studenti: 1,
    genitori: 2
  }),
  layout('4D', 183, 19, 7),
  layout('5E', 202, 19, 8)
];

const MATERIE_BASE = ['MAT', 'ITA', 'ING', 'STO', 'IRC', 'ALT'];
export const MATERIE_PUNTATE = [
  'LAB.GRUPPO_A',
  'LAB.SEMINARIO_POMERIDIANO',
  'INTERPRET.CHITARRA',
  'INTERPRET.FLAUTO'
];

export const MATERIE_PER_INDIRIZZO = {
  [INDIRIZZO_CLASSICO]: [...MATERIE_BASE, 'GRECO', 'LATINO', 'FILOSOFIA'],
  [INDIRIZZO_SCIENTIFICO]: [...MATERIE_BASE, 'SCIENZE', 'FISICA', 'INF'],
  [INDIRIZZO_SCIENTIFICO_APPLICATE]: [...MATERIE_BASE, 'PSICOLOGIA', 'SCIUMANE', 'DIRECON']
} as const;

/**
 * Feature 4: MATERIE.<INDIRIZZO_ID> — the years of course (1-5) in which a
 * subject is mandatory for that address. Absent entry = empty cell = "not
 * applicable for this address". Derived from MATERIE_PER_INDIRIZZO so the
 * fixture cannot drift from the class layouts.
 */
export const MATERIE_ANNI_PER_INDIRIZZO: Record<
  string,
  Record<string, number[]>
> = Object.fromEntries(
  Object.entries(MATERIE_PER_INDIRIZZO).map(([indirizzo, materie]) => [
    indirizzo,
    Object.fromEntries(materie.map((sigla) => [sigla, [1, 2, 3, 4, 5]]))
  ])
);

export const STUDENT_TOTALE = 220;

export const ANNI_PRECEDENTI = ['2025-2026', '2024-2025'] as const;

export const CONF_DOC_JOBRUNNER = 'JOBRUNNER_DOC';
export const CONF_DOC_TABELLE = 'E2E_DOC_TABELLE';
export const CONF_DOC_DUPLICAZIONE_PERMESSA = 'E2E_DOC_DUPLICAZIONE_PERMESSA';
export const CONF_DOC_STORICO = 'E2E_DOC_STORICO';
export const CONF_DOC_DOTTED = 'E2E_DOC_DOTTED';
/** Source-document generator for CERCA_DOCUMENTI (12 §3): shared with `CONF_IMP_CERCA_DOCUMENTI`'s `idGen`. */
export const CONF_DOC_CERCA_DOCUMENTI_SOURCE = 'E2E_DOC_SOURCE_IMPORT';
export const CONF_IMP_ASL_CARTELLE = 'E2E_IMP_ASL_CARTELLE';
export const CONF_IMP_CERCA_DOCUMENTI = 'E2E_IMP_CERCA_DOCUMENTI';
export const CONF_IMP_CHUNKED = 'E2E_IMP_CHUNKED';
export const CONF_IMP_IGNORE = 'E2E_IMP_IGNORE';
export const CONF_IMP_TIMESTAMP = 'E2E_IMP_TIMESTAMP';
export const CONF_IMP_TIMESTAMP_FALLBACK = 'E2E_IMP_TIMESTAMP_FALLBACK';
export const CONF_IMP_DISABLED = 'E2E_IMP_DISABLED';
export const CONF_IMP_NOHEADER = 'E2E_IMP_NOHEADER';
export const CONF_IMP_MISSING_FILE = 'E2E_IMP_MISSING_FILE';
export const CONF_IMP_MISSING_FOLDER = 'E2E_IMP_MISSING_FOLDER';
export const CONF_IMP_MISSING_IDGEN = 'E2E_IMP_MISSING_IDGEN';
export const CONF_IMP_BAD_STRATEGY = 'E2E_IMP_BAD_STRATEGY';
export const CONF_MAIL_JOBRUNNER = 'E2E_MAIL_JOBRUNNER';
export const CONF_MAIL_STORICO = 'E2E_MAIL_STORICO';
export const CONF_MAIL_ELENCO_MATERIE = 'ELENCO_MATERIE';

export const JOBRUNNER_DOC = CONF_DOC_JOBRUNNER;

export const EMAIL_TEST_SAFE = 'sgsa-onlinetests@onlinetest.aldo.local';

export function e2eDocenteEmail(i: number): string {
  return `e2edocente${i}@onlinetest.aldo.local`;
}

export function e2eAlunnoEmail(i: number): string {
  return `e2ealunno${i}@onlinetest.aldo.local`;
}

/** date deterministiche (MISSING_TESTS: niente valori dipendenti da clock) */
export const ASSIGNMENT_DATE = new Date('2026-07-15T09:00:00Z');
export const SUPPLENZA_INIZIO = new Date('2026-09-01T00:00:00Z');
export const SUPPLENZA_FINE = new Date('2026-10-15T00:00:00Z');
