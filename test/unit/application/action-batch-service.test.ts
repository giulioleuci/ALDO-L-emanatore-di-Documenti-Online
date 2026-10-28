import {
  ActionBatchService,
  JOB_TYPE_ESECUZIONE_AZIONI
} from '../../../src/application/services/ActionBatchService';
import type { AzioniCheckpoint } from '../../../src/application/services/ActionBatchService';
import { FakeDatabase } from '../../fakes/FakeDatabase';
import { fixtureTables } from '../../fixtures/tables';
import { FakeDriveFacade } from '../../fakes/FakeDriveFacade';
import { FakeTemplateEngine } from '../../fakes/FakeTemplateEngine';
import { ClasseRepository } from '../../../src/infrastructure/repositories/ClasseRepository';
import { AlunnoRepository } from '../../../src/infrastructure/repositories/AlunnoRepository';
import { DipartimentoRepository } from '../../../src/infrastructure/repositories/DipartimentoRepository';
import { composeContextBuilder } from '../../../src/config/ApplicationComposition';
import { StatoJob } from '../../../src/domain/value-objects/enums';
import { ConfigurationError } from '../../../src/domain/errors/DomainError';
import type {
  ILogJobRepository,
  LogJobEntryInput
} from '../../../src/domain/repositories/ILogJobRepository';
import type { ITeachingAssignmentResolver } from '../../../src/application/ports/ITeachingAssignmentResolver';
import type { StoricoDatabaseProvider } from '../../../src/application/storico/StoricoDatabaseProvider';

// No offline unit test can construct a real historical-year DatabaseService
// (see test/unit/application/context-engine/recipes-e2e.test.ts) — CONF_AZIONI
// recipes here never set includiStorico:true, so a no-op backing provider is
// behaviorally identical to the real one.
function noHistory(): StoricoDatabaseProvider {
  return { anniStorici: () => [] };
}

const NOW = new Date('2026-09-13T08:00:00.000Z');

function fakeLogJob(): { logJob: ILogJobRepository; entries: LogJobEntryInput[] } {
  const entries: LogJobEntryInput[] = [];
  return {
    entries,
    logJob: {
      append: (entry) => {
        entries.push(entry);
        return entry as unknown as ReturnType<ILogJobRepository['append']>;
      },
      listByType: () => [],
      getById: () => [],
      getFailuresSince: () => []
    }
  };
}

const noopTeachingAssignments = {
  resolveConsiglio: () => [],
  resolveMateria: () => null
} as unknown as ITeachingAssignmentResolver;

function wire(
  azioni: Array<Record<string, unknown>>,
  options: { condizione?: boolean; logger?: LoggerService } = {}
) {
  const tables = fixtureTables();
  tables['CONF_AZIONI'] = azioni;
  // Deviation from the brief: patch the fixture's own rossi@school.it row in
  // place instead of replacing the whole DOCENTI table — CLASSE_COMPLETA's
  // real 'consiglio'/'tutor' providers (now wired via composeContextBuilder,
  // see below) resolve teaching assignments against fixtureTables()'s
  // CLASSI/SUPPLENZE/VARIAZIONI_CATTEDRA rows, which reference rossi@school.it
  // and bianchi@school.it by email; a wholesale DOCENTI replacement made those
  // lookups throw "Assignment actor not found".
  tables['DOCENTI'] = tables['DOCENTI']!.map((row) =>
    row['EMAIL'] === 'rossi@school.it' ? { ...row, COGNOME: '  rossi  ', NOME: 'mario' } : row
  );
  const db = new FakeDatabase(tables);
  const classi = new ClasseRepository(db);
  const { logJob, entries } = fakeLogJob();
  // Deviation from the task brief (pre-authorized, task-6-brief.md Step 5):
  // ContextEngineFactory.create's stub deps (`{ findAll: () => [] } as never`)
  // don't satisfy the real provider calls (e.g. SchoolProvider needs
  // `ruoli.findAllCached`, not `findAll`) — CLASSE_COMPLETA alone runs 14
  // providers. Reusing the existing `composeContextBuilder` test convenience
  // (already used by recipes-e2e.test.ts) wires a real, fully-working
  // ContextBuilder over the same FakeDatabase instead of hand-satisfying every
  // repository interface with bespoke stubs; the assertions below are about
  // iteration/gating/LOG_JOB/resume, not CDU content, so real CDU content is a
  // strict improvement over faked content, not a risk.
  const contextBuilder = composeContextBuilder(db, undefined, undefined, noHistory());
  const service = new ActionBatchService({
    db,
    contextBuilder,
    expressionEngine: { evaluateBoolean: () => options.condizione ?? true },
    templates: new FakeTemplateEngine(),
    drive: new FakeDriveFacade(),
    roles: { risolvi: () => [] },
    classi,
    alunni: new AlunnoRepository(db),
    dipartimenti: new DipartimentoRepository(db),
    teachingAssignments: noopTeachingAssignments,
    now: NOW,
    ...(options.logger !== undefined ? { logger: options.logger } : {}),
    logJob,
    activeUser: { getEmail: () => 'admin@school.it' }
  });
  return { service, db, entries };
}

function drain(generator: Generator<AzioniCheckpoint, unknown, void>): AzioniCheckpoint[] {
  const checkpoints: AzioniCheckpoint[] = [];
  let step = generator.next();
  while (!step.done) {
    checkpoints.push(step.value);
    step = generator.next();
  }
  return checkpoints;
}

const SANIFICA = {
  ID: 'SANIFICA_TRIM',
  TIPO: 'MANUTENZIONE',
  ASSE: 'SINGOLA',
  CONDIZIONE: '',
  ATTIVO: true,
  AZIONI: JSON.stringify([
    { tipo: 'TRASFORMA_CAMPO', tab: 'DOCENTI', col: 'COGNOME', operazione: 'TRIM' }
  ]),
  PERIODICITA: ''
};

test.each([
  ['rossi@school.it', 1],
  ['assente@school.it', 0]
])('logs action names, affected count and duration for target %s', (email, updated) => {
  const logger = new LoggerService();
  const summary = jest.spyOn(logger, 'logSummary').mockReturnThis();
  const { service } = wire(
    [
      {
        ...SANIFICA,
        AZIONI: JSON.stringify([
          {
            tipo: 'AGGIORNA_CAMPO',
            tab: 'DOCENTI',
            col: 'NOME',
            valore: 'MARIO',
            criteri: { EMAIL: email }
          }
        ])
      }
    ],
    { logger }
  );

  drain(service.batchAzioniHandler({ azioneIds: ['SANIFICA_TRIM'], jobId: 'job' }));

  expect(summary).toHaveBeenCalledTimes(1);
  expect(summary).toHaveBeenCalledWith(
    '✅ Actions completed',
    expect.any(Number),
    { Actions: ['AGGIORNA_CAMPO'], Updated: updated },
    { depth: 1, isLast: true, ancestorHasNext: [false] }
  );
});

test('logs a failed target with its reason and keeps the failure in LOG_JOB', () => {
  const logger = new LoggerService();
  const summary = jest.spyOn(logger, 'logSummary').mockReturnThis();
  const { service, db, entries } = wire([SANIFICA], { logger });
  jest.spyOn(db, 'save').mockImplementation(() => {
    throw new Error('Salvataggio fallito');
  });

  drain(service.batchAzioniHandler({ azioneIds: ['SANIFICA_TRIM'], jobId: 'job' }));

  expect(summary).toHaveBeenCalledTimes(1);
  expect(summary).toHaveBeenCalledWith(
    '❌ Actions failed',
    expect.any(Number),
    expect.stringContaining('Salvataggio fallito'),
    { depth: 1, isLast: true, ancestorHasNext: [false] }
  );
  expect(entries[0]).toMatchObject({ stato: StatoJob.COMPLETATO_CON_ERRORI, falliti: 1 });
});

test('ASSE=SINGOLA runs the action exactly once and applies it', () => {
  const { service, db, entries } = wire([SANIFICA]);
  const checkpoints = drain(
    service.batchAzioniHandler({ azioneIds: ['SANIFICA_TRIM'], jobId: 'azioni_SANIFICA_TRIM' })
  );

  expect(checkpoints).toHaveLength(1);
  expect(db.tables['DOCENTI']!.getAllRows()[0]!['COGNOME']).toBe('rossi');
  expect(entries).toHaveLength(1);
  expect(entries[0]).toMatchObject({
    tipo: JOB_TYPE_ESECUZIONE_AZIONI,
    idConfig: 'SANIFICA_TRIM',
    nomeConfig: 'MANUTENZIONE',
    stato: StatoJob.COMPLETATO,
    totaleTask: 1,
    completatiOk: 1,
    falliti: 0,
    eseguitoDa: 'admin@school.it'
  });
});

test('ASSE=CLASSE yields one checkpoint per active class', () => {
  const { service } = wire([{ ...SANIFICA, ID: 'PER_CLASSE', ASSE: 'CLASSE' }]);
  const checkpoints = drain(
    service.batchAzioniHandler({ azioneIds: ['PER_CLASSE'], jobId: 'job' })
  );
  expect(checkpoints.length).toBeGreaterThan(1);
  expect(checkpoints[checkpoints.length - 1]!.percentage).toBe(100);
});

test('a false CONDIZIONE skips the action and writes no LOG_JOB row', () => {
  // Deviation from the brief: SANIFICA.CONDIZIONE is '' (blank), and
  // ActionBatchService — matching the documentSteps.ts/emailSteps.ts
  // convention — only calls evaluateBoolean when CONDIZIONE is non-blank
  // (blank means "no gate, always run"); a blank CONDIZIONE would never reach
  // the mocked evaluator this test relies on, so it needs a non-blank one.
  const { service, db, entries } = wire([{ ...SANIFICA, CONDIZIONE: 'sempreFalsa' }], {
    condizione: false
  });
  drain(service.batchAzioniHandler({ azioneIds: ['SANIFICA_TRIM'], jobId: 'job' }));
  expect(entries).toEqual([]);
  expect(db.tables['DOCENTI']!.getAllRows()[0]!['COGNOME']).toBe('  rossi  ');
});

test('an unknown ASSE fails the job with a ConfigurationError and a FALLITO row', () => {
  const { service, entries } = wire([{ ...SANIFICA, ASSE: 'GALASSIA' }]);
  expect(() =>
    drain(service.batchAzioniHandler({ azioneIds: ['SANIFICA_TRIM'], jobId: 'job' }))
  ).toThrow(ConfigurationError);
  expect(entries[0]).toMatchObject({ stato: StatoJob.FALLITO });
});

test('malformed AZIONI JSON fails fast with a single FALLITO row, not one COMPLETATO_CON_ERRORI per target', () => {
  const { service, entries } = wire([
    { ...SANIFICA, ID: 'PER_CLASSE', ASSE: 'CLASSE', AZIONI: '{ non valido' }
  ]);
  expect(() =>
    drain(service.batchAzioniHandler({ azioneIds: ['PER_CLASSE'], jobId: 'job' }))
  ).toThrow(ConfigurationError);
  // One FALLITO row for the whole action, logged before any of the (multiple,
  // per the ASSE=CLASSE test above) targets were touched — not N
  // COMPLETATO_CON_ERRORI-with-listaFallimenti rows, one per class.
  expect(entries).toHaveLength(1);
  expect(entries[0]).toMatchObject({
    stato: StatoJob.FALLITO,
    idConfig: 'PER_CLASSE',
    totaleTask: 0
  });
});

test('a missing CONF_AZIONI id fails the job', () => {
  const { service } = wire([SANIFICA]);
  expect(() =>
    drain(service.batchAzioniHandler({ azioneIds: ['NON_ESISTE'], jobId: 'job' }))
  ).toThrow(/NON_ESISTE/);
});

test('a failing target is recorded in LISTA_FALLIMENTI and the run continues', () => {
  const azione = {
    ...SANIFICA,
    ID: 'PER_CLASSE',
    ASSE: 'CLASSE',
    // Deviation from the brief: azioniInfra.ts's AGGIORNA_PERMESSI resolves
    // `destinatari` first and returns early (0, no error) when it's empty —
    // an `emails` entry is needed to reach the `su` validation this test
    // means to exercise (ConfigurationError: "su" deve essere LOG_DOCS o LOG_FOLD).
    AZIONI: JSON.stringify([
      { tipo: 'AGGIORNA_PERMESSI', su: 'TABELLA_INESISTENTE', emails: ['x@school.it'] }
    ])
  };
  const { service, entries } = wire([azione]);
  const checkpoints = drain(
    service.batchAzioniHandler({ azioneIds: ['PER_CLASSE'], jobId: 'job' })
  );
  expect(checkpoints.length).toBeGreaterThan(0);
  expect(entries[0]).toMatchObject({ stato: StatoJob.COMPLETATO_CON_ERRORI });
  expect(entries[0]!.listaFallimenti.length).toBe(entries[0]!.falliti);
  expect(entries[0]!.listaFallimenti[0]).toMatch(/: /);
});

test('resuming from a checkpoint restarts at the persisted index and keeps the job id', () => {
  const { service } = wire([{ ...SANIFICA, ID: 'PER_CLASSE', ASSE: 'CLASSE' }]);
  const first = drain(service.batchAzioniHandler({ azioneIds: ['PER_CLASSE'], jobId: 'job' }));
  const halfway = first[0]!;

  const { service: ripreso, entries } = wire([{ ...SANIFICA, ID: 'PER_CLASSE', ASSE: 'CLASSE' }]);
  const checkpoints = drain(ripreso.batchAzioniHandler({ resumeState: halfway }));

  expect(checkpoints[0]!.nextIndex).toBe(halfway.nextIndex + 1);
  // The suspended execution is backfilled as SOSPESO_TEMPO before the final row.
  expect(entries.map((e) => e.stato)).toEqual([StatoJob.SOSPESO_TEMPO, StatoJob.COMPLETATO]);
  expect(entries.every((e) => e.idJob === 'job')).toBe(true);
});

test('running several actions in one job writes one LOG_JOB row per action', () => {
  const seconda = {
    ...SANIFICA,
    ID: 'SANIFICA_UPPER',
    AZIONI: JSON.stringify([
      { tipo: 'TRASFORMA_CAMPO', tab: 'DOCENTI', col: 'NOME', operazione: 'UPPER' }
    ])
  };
  const { service, db, entries } = wire([SANIFICA, seconda]);
  drain(
    service.batchAzioniHandler({
      azioneIds: ['SANIFICA_TRIM', 'SANIFICA_UPPER'],
      jobId: 'azioni_TUTTE'
    })
  );
  expect(entries.map((e) => e.idConfig)).toEqual(['SANIFICA_TRIM', 'SANIFICA_UPPER']);
  expect(db.tables['DOCENTI']!.getAllRows()[0]!['NOME']).toBe('MARIO');
});

test('a malformed CONF_AZIONI row is skipped without breaking elencoAttive/findAzione for other rows', () => {
  // Invalid ASSE ('' is not in the ASSI_AZIONE dictionary) — the constructor
  // throws ConfigurationError, e.g. an in-progress edit where ID was typed
  // before ASSE was filled in.
  const rotta = { ...SANIFICA, ID: 'ROTTA', ASSE: '' };
  const { service } = wire([SANIFICA, rotta]);
  expect(service.elencoAttive()).toEqual([{ id: 'SANIFICA_TRIM', tipo: 'MANUTENZIONE' }]);
  expect(service.findAzione('SANIFICA_TRIM')).not.toBeNull();
  expect(service.findAzione('ROTTA')).toBeNull();
});

test('elencoAttive lists only the enabled actions', () => {
  const { service } = wire([SANIFICA, { ...SANIFICA, ID: 'DISATTIVA', ATTIVO: false }]);
  expect(service.elencoAttive()).toEqual([{ id: 'SANIFICA_TRIM', tipo: 'MANUTENZIONE' }]);
});
