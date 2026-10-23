import {
  DocumentBatchService,
  JOB_TYPE_GENERAZIONE_DOCUMENTI
} from '../../../src/application/services/DocumentBatchService';
import type { BatchCheckpoint } from '../../../src/application/services/DocumentBatchService';
import { ClasseRepository } from '../../../src/infrastructure/repositories/ClasseRepository';
import { AlunnoRepository } from '../../../src/infrastructure/repositories/AlunnoRepository';
import { ConfigurazioneDocumentoRepository } from '../../../src/infrastructure/repositories/ConfigurazioneDocumentoRepository';
import type { DocumentGenerationService } from '../../../src/application/services/DocumentGenerationService';
import type { ClasseId } from '../../../src/domain/value-objects/ClasseId';
import { FakeDatabase } from '../../fakes/FakeDatabase';
import { fixtureTables } from '../../fixtures/tables';
import { FakeProcessMonitor } from '../../fakes/FakeProcessMonitor';
import { Alunno } from '../../../src/domain/entities/Alunno';
import { Piano } from '../../../src/domain/entities/Piano';
import { ConfigurazioneDocumento } from '../../../src/domain/entities/ConfigurazioneDocumento';
import { GeneratoreAxis, TipoPiano } from '../../../src/domain/value-objects/enums';
import { ConfigurationError } from '../../../src/domain/errors/DomainError';
import type { IClasseRepository } from '../../../src/domain/repositories/IClasseRepository';
import type { IAlunnoRepository } from '../../../src/domain/repositories/IAlunnoRepository';
import type { IDipartimentoRepository } from '../../../src/domain/repositories/IDipartimentoRepository';
import { Dipartimento } from '../../../src/domain/entities/Dipartimento';
import type {
  ITeachingAssignmentResolver,
  TeachingAssignment
} from '../../../src/application/ports/ITeachingAssignmentResolver';
import type { Classe } from '../../../src/domain/entities/Classe';
import { Docente } from '../../../src/domain/entities/Docente';
import { MateriaId } from '../../../src/domain/value-objects/MateriaId';
import type {
  ILogJobRepository,
  LogJobEntryInput
} from '../../../src/domain/repositories/ILogJobRepository';
import type { IActiveUserFacade } from '../../../src/infrastructure/facades/ActiveUserFacade';
import { StatoJob } from '../../../src/domain/value-objects/enums';

/** Collects every LOG_JOB row appended during a test, in order. */
function fakeLogJob(): { logJob: ILogJobRepository; entries: LogJobEntryInput[] } {
  const entries: LogJobEntryInput[] = [];
  const logJob: ILogJobRepository = {
    append: (entry) => {
      entries.push(entry);
      return entry as unknown as ReturnType<ILogJobRepository['append']>;
    },
    listByType: () => [],
    getById: () => [],
    getFailuresSince: () => []
  };
  return { logJob, entries };
}

// The generator contract is what JobRunnerLib executes: it yields a resumable
// checkpoint per class and fast-forwards from params.resumeState after a
// suspension. The trigger/state machinery itself is the library's (tested in
// the GasLibraryFactory monorepo and online).

/** Injected clock shared by every wire*() factory below — the batch service's role-resolution call must be deterministic, not the system clock. */
const FIXED_NOW = new Date('2026-07-01T09:00:00Z');

/** Stub resolver for suites that don't exercise generateDocentiClasseMateria (generateClassi/generatePiani never call it). */
const noopTeachingAssignments = {
  resolveConsiglio: () => [],
  resolveMateria: () => []
} as unknown as ITeachingAssignmentResolver;

/** Stub repository for suites that don't exercise generateDipartimenti (generateClassi/generatePiani/generateDocentiClasseMateria never call it). */
const noopDipartimenti = {
  findAll: () => [],
  findByMateria: () => null
} as unknown as IDipartimentoRepository;

function wire(
  options: {
    failFor?: string;
    monitor?: FakeProcessMonitor;
    logger?: LoggerService;
    resultStatus?: 'GENERATO' | 'SKIPPED';
    resultDurationMs?: number;
    logJob?: ILogJobRepository;
    activeUser?: IActiveUserFacade;
  } = {}
) {
  const db = new FakeDatabase(fixtureTables());
  const classi = new ClasseRepository(db);
  const generated: string[] = [];
  const documenti = {
    generateForClasse: (target: ClasseId, confDocId: string) => {
      if (target.value === options.failFor) throw new Error('template non trovato');
      generated.push(`${target.value}:${confDocId}`);
      const skipped = options.resultStatus === 'SKIPPED';
      return {
        fileId: skipped ? null : `file_${target.value}`,
        fileName: skipped ? null : `Documento_${target.value}`,
        fileLink: skipped ? null : `https://docs.google.com/document/d/file_${target.value}/edit`,
        status: options.resultStatus ?? 'GENERATO',
        durationMs: options.resultDurationMs ?? 8572,
        ...(skipped ? { skipReason: 'CONDIZIONE non soddisfatta' } : {})
      };
    }
  } as unknown as DocumentGenerationService;
  const service = new DocumentBatchService(
    classi,
    new AlunnoRepository(db),
    new ConfigurazioneDocumentoRepository(db),
    documenti,
    noopTeachingAssignments,
    FIXED_NOW,
    noopDipartimenti,
    options.monitor,
    options.logger,
    options.logJob,
    options.activeUser
  );
  return { service, generated, classi };
}

function wirePiani(
  options: {
    monitor?: FakeProcessMonitor;
    configTipo?: string;
    configId?: string;
    missingConfig?: boolean;
    failForTipo?: TipoPiano;
    logger?: LoggerService;
    resultStatus?: 'GENERATO' | 'SKIPPED';
    resultDurationMs?: number;
  } = {}
) {
  const configId = options.configId ?? 'PIANI_PERSONALIZZATI';
  const studenti = [
    new Alunno({
      EMAIL: 'con-piani@school.it',
      COGNOMENOME: 'CON PIANI',
      CLASSE: '5A',
      RELIGIONE: 'IRC',
      ATTIVO: true
    }),
    new Alunno({
      EMAIL: 'senza-piani@school.it',
      COGNOMENOME: 'SENZA PIANI',
      CLASSE: '5A',
      RELIGIONE: 'IRC',
      ATTIVO: true
    })
  ];
  const piani = [
    new Piano({ STUDENTE: 'con-piani@school.it', TIPO: 'PEI', PARAMETRI: null }),
    new Piano({ STUDENTE: 'con-piani@school.it', TIPO: 'PDP_BES', PARAMETRI: null })
  ];
  const alunni = {
    findAttivi: () => studenti,
    getPiani: (alunno: Alunno) => (alunno.email.value === 'con-piani@school.it' ? piani : [])
  };
  const configs = {
    findById: (id: string) =>
      id === configId && options.missingConfig !== true
        ? new ConfigurazioneDocumento({
            ID: id,
            TIPO: options.configTipo ?? 'PIANO_PERS',
            GENERATORE: GeneratoreAxis.PIANO_PERSONALIZZATO,
            FORMATO: 'GDOC'
          })
        : null
  };
  const generated: Array<{
    studente: string;
    tipo: TipoPiano;
    confDocId: string;
    jobId?: string;
  }> = [];
  const documenti = {
    generateForPiano: (studente: string, tipo: TipoPiano, confDocId: string, jobId?: string) => {
      generated.push({ studente, tipo, confDocId, jobId });
      if (tipo === options.failForTipo) throw new Error('template non trovato');
      const skipped = options.resultStatus === 'SKIPPED';
      return {
        fileId: skipped ? null : `file_${studente}_${tipo}`,
        fileName: skipped ? null : `Piano_${tipo}_${studente}`,
        fileLink: skipped
          ? null
          : `https://docs.google.com/document/d/file_${studente}_${tipo}/edit`,
        status: options.resultStatus ?? 'GENERATO',
        durationMs: options.resultDurationMs ?? 8572
      };
    }
  };
  const EmptyClassi = { findAttive: () => [] };
  const service = new DocumentBatchService(
    EmptyClassi as unknown as IClasseRepository,
    alunni as unknown as IAlunnoRepository,
    configs,
    documenti as unknown as DocumentGenerationService,
    noopTeachingAssignments,
    FIXED_NOW,
    noopDipartimenti,
    options.monitor,
    options.logger
  );
  return { service, generated, studenti, piani };
}

test('emits unredacted document target headers and content-first timed item summaries', () => {
  const lines: string[] = [];
  jest.spyOn(Logger, 'log').mockImplementation((line) => lines.push(String(line)));
  const { service } = wirePiani({ logger: new LoggerService() });

  const generator = service.batchGenerateHandler({
    confDocId: 'PIANI_PERSONALIZZATI',
    jobId: 'job_piani'
  });
  let step = generator.next();
  while (!step.done) step = generator.next();

  const output = lines.join('\n');
  expect(output).toContain('📑 [PROCESSING BATCH] (2 Items in queue)');
  expect(output).toContain('📄 [DOCUMENT 1/2]');
  expect(output).toContain('📄 [DOCUMENT 2/2]');
  expect(output).toContain('con-piani@school.it:PEI');
  expect(output).not.toContain('[EMAIL_REDACTED]');
  expect(output).toContain(
    '✅ Document generated: Piano_PEI_con-piani@school.it (COMPLETED in 8572ms)'
  );
});

test('uses a skipped document summary when the PIANI pipeline returns SKIPPED', () => {
  const lines: string[] = [];
  jest.spyOn(Logger, 'log').mockImplementation((line) => lines.push(String(line)));
  const { service } = wirePiani({
    logger: new LoggerService(),
    resultStatus: 'SKIPPED',
    resultDurationMs: 321
  });

  const generator = service.batchGenerateHandler({ confDocId: 'PIANI_PERSONALIZZATI' });
  let step = generator.next();
  while (!step.done) step = generator.next();

  expect(lines.join('\n')).toContain(
    '✔️ Document skipped: con-piani@school.it:PEI (COMPLETED in 321ms)'
  );
});

test('PIANO_PERS configuration with a nonstandard ID still runs one target per plan', () => {
  const configId = 'PIANO_INCLUSIONE_2026';
  const { service, generated } = wirePiani({ configId });
  const generator = service.batchGenerateHandler({ confDocId: configId, jobId: 'job_inclusione' });
  let step = generator.next();
  while (!step.done) step = generator.next();

  expect(generated).toEqual([
    {
      studente: 'con-piani@school.it',
      tipo: TipoPiano.PEI,
      confDocId: configId,
      jobId: 'job_inclusione'
    },
    {
      studente: 'con-piani@school.it',
      tipo: TipoPiano.PDP_BES,
      confDocId: configId,
      jobId: 'job_inclusione'
    }
  ]);
  expect(step.value).toMatchObject({ success: true, totale: 2 });
});

test('PIANI batch yields one persisted checkpoint and one progress update per active-student plan', () => {
  const monitor = new FakeProcessMonitor();
  const { service, generated } = wirePiani({ monitor });
  const gen = service.batchGenerateHandler({
    confDocId: 'PIANI_PERSONALIZZATI',
    jobId: 'job_piani'
  });
  const checkpoints: BatchCheckpoint[] = [];
  let step = gen.next();
  while (!step.done) {
    checkpoints.push(step.value);
    step = gen.next();
  }

  expect(generated).toEqual([
    {
      studente: 'con-piani@school.it',
      tipo: TipoPiano.PEI,
      confDocId: 'PIANI_PERSONALIZZATI',
      jobId: 'job_piani'
    },
    {
      studente: 'con-piani@school.it',
      tipo: TipoPiano.PDP_BES,
      confDocId: 'PIANI_PERSONALIZZATI',
      jobId: 'job_piani'
    }
  ]);
  expect(checkpoints).toHaveLength(2);
  expect(checkpoints.map((checkpoint) => checkpoint.percentage)).toEqual([50, 100]);
  expect(checkpoints[0]).toMatchObject({
    nextIndex: 1,
    planTargets: [
      { studente: 'con-piani@school.it', tipo: TipoPiano.PEI },
      { studente: 'con-piani@school.it', tipo: TipoPiano.PDP_BES }
    ]
  });
  expect(monitor.progress.map(({ percentage }) => percentage)).toEqual([50, 100]);
  expect(monitor.progress.map(({ message }) => message)).toEqual([
    '✅ Document generated: Piano_PEI_con-piani@school.it (GENERATO in 8572ms)',
    '✅ Document generated: Piano_PDP_BES_con-piani@school.it (GENERATO in 8572ms)'
  ]);
  expect(step.value).toEqual({
    success: true,
    totale: 2,
    processed: ['con-piani@school.it:PEI', 'con-piani@school.it:PDP_BES'],
    errori: []
  });
});

test('PIANI resume consumes its persisted target order without querying current student plans again', () => {
  const { service, generated, studenti, piani } = wirePiani();
  const firstRun = service.batchGenerateHandler({
    confDocId: 'PIANI_PERSONALIZZATI',
    jobId: 'job_piani'
  });
  const first = firstRun.next();
  expect(first.done).toBe(false);

  studenti.splice(0);
  piani.reverse();
  const resumed = service.batchGenerateHandler({
    confDocId: 'PIANI_PERSONALIZZATI',
    jobId: 'job_piani',
    resumeState: first.value
  });
  let resumedStep = resumed.next();
  while (!resumedStep.done) resumedStep = resumed.next();

  expect(generated).toEqual([
    {
      studente: 'con-piani@school.it',
      tipo: TipoPiano.PEI,
      confDocId: 'PIANI_PERSONALIZZATI',
      jobId: 'job_piani'
    },
    {
      studente: 'con-piani@school.it',
      tipo: TipoPiano.PDP_BES,
      confDocId: 'PIANI_PERSONALIZZATI',
      jobId: 'job_piani'
    }
  ]);
  expect(resumedStep.value.processed).toEqual([
    'con-piani@school.it:PEI',
    'con-piani@school.it:PDP_BES'
  ]);
});

test('registered handler resumes a raw PIANI checkpoint without top-level IDs or duplicate plans', () => {
  const { service, generated } = wirePiani();
  const registered = new Map<string, unknown>();
  service.registerJobHandlers({
    registerJobHandler: (type, handler) => registered.set(type, handler)
  });
  const handler = registered.get(JOB_TYPE_GENERAZIONE_DOCUMENTI) as (params: {
    resumeState?: BatchCheckpoint;
  }) => Generator<BatchCheckpoint, unknown, void>;

  const first = service
    .batchGenerateHandler({ confDocId: 'PIANI_PERSONALIZZATI', jobId: 'job_piani' })
    .next();
  expect(first.value).toMatchObject({ confDocId: 'PIANI_PERSONALIZZATI', jobId: 'job_piani' });

  const { result } = drain(handler({ resumeState: first.value }));

  expect(generated.map(({ tipo }) => tipo)).toEqual([TipoPiano.PEI, TipoPiano.PDP_BES]);
  expect(result.success).toBe(true);
  expect(Array.isArray(result.processed)).toBe(true);
});

test('PIANI isolates one plan error with the email:TIPO prefix and continues remaining targets', () => {
  const monitor = new FakeProcessMonitor();
  const { service, generated } = wirePiani({ monitor, failForTipo: TipoPiano.PEI });
  const gen = service.batchGenerateHandler({
    confDocId: 'PIANI_PERSONALIZZATI',
    jobId: 'job_piani'
  });
  let step = gen.next();
  while (!step.done) step = gen.next();

  expect(generated.map(({ tipo }) => tipo)).toEqual([TipoPiano.PEI, TipoPiano.PDP_BES]);
  expect(step.value).toEqual({
    success: false,
    totale: 2,
    processed: ['con-piani@school.it:PEI', 'con-piani@school.it:PDP_BES'],
    errori: ['con-piani@school.it:PEI: template non trovato']
  });
  expect(monitor.progress.map(({ message }) => message)).toEqual([
    'Errore piano 1/2 con-piani@school.it:PEI: template non trovato',
    '✅ Document generated: Piano_PDP_BES_con-piani@school.it (GENERATO in 8572ms)'
  ]);
});

test.each([
  {
    missingConfig: true,
    configTipo: undefined,
    error: 'CONF_DOC PIANI_PERSONALIZZATI non trovato'
  },
  {
    missingConfig: false,
    configTipo: 'VERBALE',
    error: 'CONF_DOC PIANI_PERSONALIZZATI deve avere TIPO PIANO_PERS'
  }
])('PIANI stops before job startup on invalid configuration: $error', (scenario) => {
  const monitor = new FakeProcessMonitor();
  const { service, generated } = wirePiani({ monitor, ...scenario });
  const gen = service.batchGenerateHandler({
    confDocId: 'PIANI_PERSONALIZZATI',
    jobId: 'job_piani'
  });

  expect(() => gen.next()).toThrow(ConfigurationError);
  expect(() =>
    wirePiani({ ...scenario })
      .service.batchGenerateHandler({ confDocId: 'PIANI_PERSONALIZZATI' })
      .next()
  ).toThrow(scenario.error);
  expect(generated).toEqual([]);
  expect(monitor.registered).toEqual([]);
});

test('handler yields one resumable checkpoint per targeted class and returns the total', () => {
  const { service, generated } = wire();
  const gen = service.batchGenerateHandler({ confDocId: 'CD1' });
  const checkpoints: BatchCheckpoint[] = [];
  let step = gen.next();
  while (!step.done) {
    checkpoints.push(step.value);
    step = gen.next();
  }
  const result = step.value;
  // Fixture has 4 active classes (5A, 1F, 1F-LSO, 1F-LSS; 3B is inactive).
  // CD1.GESTIONE_ARTICOLAZIONE = COMPLETA (fixture default), so the
  // articulated partners 1F-LSO/1F-LSS are excluded; only the parent (1F)
  // and the standalone class (5A) are targeted.
  expect(generated).toEqual(['5A:CD1', '1F:CD1']);
  expect(checkpoints).toHaveLength(2);
  expect(checkpoints[0]!.nextIndex).toBe(1);
  expect(checkpoints[1]!.percentage).toBe(100);
  expect(result).toEqual({
    success: true,
    totale: 2,
    processed: ['5A', '1F'],
    errori: []
  });
});

test('generateClassi honors CONF_DOC.GESTIONE_ARTICOLAZIONE=ARTICOLATA: the parent is excluded, partners are targeted', () => {
  const { service, generated } = wire();
  const gen = service.batchGenerateHandler({ confDocId: 'CD_ARTICOLATA' });
  const checkpoints: BatchCheckpoint[] = [];
  let step = gen.next();
  while (!step.done) {
    checkpoints.push(step.value);
    step = gen.next();
  }
  const result = step.value;
  // Same 4 active classes as CD1 (5A, 1F, 1F-LSO, 1F-LSS), but CD_ARTICOLATA.
  // GESTIONE_ARTICOLAZIONE = ARTICOLATA, so this proves config.gestioneArticolazione
  // genuinely threads into filterPerGestioneArticolazione: the parent (1F) is
  // excluded and the articulated partners (1F-LSO/1F-LSS) are targeted instead
  // -- the opposite subset from the COMPLETA case above.
  expect(generated).toEqual(['5A:CD_ARTICOLATA', '1F-LSO:CD_ARTICOLATA', '1F-LSS:CD_ARTICOLATA']);
  expect(checkpoints).toHaveLength(3);
  expect(result).toEqual({
    success: true,
    totale: 3,
    processed: ['5A', '1F-LSO', '1F-LSS'],
    errori: []
  });
});

test('generateClassi persists its class targets and consumes them on resume (audit §3)', () => {
  const { service, generated } = wire();
  const initial = service.batchGenerateHandler({ confDocId: 'CD1', jobId: 'job_classi' });
  const first = initial.next();
  expect(first.done).toBe(false);
  expect(first.value).toMatchObject({ classeTargets: ['5A', '1F'] });

  const { result } = drain(service.batchGenerateHandler({ resumeState: first.value }));

  expect(generated).toEqual(['5A:CD1', '1F:CD1']);
  expect(result).toMatchObject({ totale: 2, processed: ['5A', '1F'] });
});

test('generateClassi keeps frozen positions when a processed class disappears before resume', () => {
  const { service, generated, classi } = wire();
  const first = service.batchGenerateHandler({ confDocId: 'CD1', jobId: 'job_classi' }).next()
    .value as BatchCheckpoint;
  const findById = classi.findById.bind(classi);
  jest
    .spyOn(classi, 'findById')
    .mockImplementation((id) => (id.value === '5A' ? null : findById(id)));

  const { checkpoints, result } = drain(service.batchGenerateHandler({ resumeState: first }));

  expect(generated).toEqual(['5A:CD1', '1F:CD1']);
  expect(checkpoints[0]).toMatchObject({ nextIndex: 2, classeTargets: ['5A', '1F'] });
  expect(result).toMatchObject({ totale: 2, processed: ['5A', '1F'] });
});

test('generateClassi resume without persisted classeTargets fails loud (audit §3)', () => {
  const { service } = wire();
  expect(() =>
    service
      .batchGenerateHandler({
        resumeState: {
          confDocId: 'CD1',
          jobId: 'job_classi',
          nextIndex: 1,
          processed: ['5A'],
          errori: []
        }
      })
      .next()
  ).toThrow(ConfigurationError);
});

test('PIANO_PERS TIPO constraint is still enforced independently of GENERATORE', () => {
  const { service } = wirePiani({ configTipo: 'VERBALE' });

  expect(() =>
    service.batchGenerateHandler({ confDocId: 'PIANI_PERSONALIZZATI', jobId: 'job_piani' }).next()
  ).toThrow('CONF_DOC PIANI_PERSONALIZZATI deve avere TIPO PIANO_PERS');
});

test('handler resumes from params.resumeState without reprocessing completed classes (JobRunnerLib resume cycle)', () => {
  const { service, generated } = wire();
  const gen = service.batchGenerateHandler({
    confDocId: 'CD1',
    resumeState: {
      confDocId: 'CD1',
      jobId: 'CD1',
      nextIndex: 1,
      processed: ['5A'],
      errori: [],
      classeTargets: ['5A', '1F']
    }
  });
  let step = gen.next();
  while (!step.done) step = gen.next();
  const result = step.value;
  expect(generated).toEqual(['1F:CD1']); // 5A skipped, already processed
  expect(result.processed).toEqual(['5A', '1F']);
});

test('registered handler resumes a raw class checkpoint without top-level IDs or duplicate generation', () => {
  const { logJob, entries } = fakeLogJob();
  const { service, generated } = wire({ logJob });
  const registered = new Map<string, unknown>();
  service.registerJobHandlers({
    registerJobHandler: (type, handler) => registered.set(type, handler)
  });
  const handler = registered.get(JOB_TYPE_GENERAZIONE_DOCUMENTI) as (params: {
    resumeState?: BatchCheckpoint;
  }) => Generator<BatchCheckpoint, unknown, void>;

  const firstRun = service.batchGenerateHandler({ confDocId: 'CD1', jobId: 'job_cd1' });
  const first = firstRun.next();
  expect(first.done).toBe(false);
  expect(first.value).toMatchObject({ confDocId: 'CD1', jobId: 'job_cd1', nextIndex: 1 });

  const resumedGenerator = handler({ resumeState: first.value });
  let resumed = resumedGenerator.next();
  while (!resumed.done) resumed = resumedGenerator.next();

  expect(generated).toEqual(['5A:CD1', '1F:CD1']);
  expect(resumed.value).toMatchObject({ success: true, processed: ['5A', '1F'] });
  expect(entries.map((entry) => entry.stato)).toEqual([
    StatoJob.SOSPESO_TEMPO,
    StatoJob.COMPLETATO
  ]);
  expect(entries[1]).toMatchObject({ totaleTask: 2, completatiOk: 2, falliti: 0 });
});

test('top-level document IDs override conflicting resume IDs', () => {
  const { service, generated } = wire();
  const first = service
    .batchGenerateHandler({
      confDocId: 'CD1',
      jobId: 'job_top',
      resumeState: {
        confDocId: 'CD_ARTICOLATA',
        jobId: 'job_resume',
        nextIndex: 0,
        processed: [],
        errori: [],
        classeTargets: ['5A', '1F']
      }
    })
    .next();

  expect(first.value).toMatchObject({ confDocId: 'CD1', jobId: 'job_top' });
  expect(generated).toEqual(['5A:CD1']);
});

test('legacy document state without confDocId fails before configuration lookup or generation', () => {
  const configs = { findById: jest.fn() };
  const generateForClasse = jest.fn();
  const documenti = { generateForClasse } as unknown as DocumentGenerationService;
  const service = new DocumentBatchService(
    {} as unknown as IClasseRepository,
    {} as unknown as IAlunnoRepository,
    configs,
    documenti,
    noopTeachingAssignments,
    FIXED_NOW,
    noopDipartimenti
  );

  expect(() =>
    service
      .batchGenerateHandler({
        resumeState: { jobId: 'job_legacy', nextIndex: 0, processed: [], errori: [] }
      })
      .next()
  ).toThrow('Stato di ripresa documenti privo di confDocId');
  expect(configs.findById).not.toHaveBeenCalled();
  expect(generateForClasse).not.toHaveBeenCalled();
});

test('a single class failure is isolated: logged in errori, the batch continues (15 §8)', () => {
  const { service, generated } = wire({ failFor: '5A' });
  const gen = service.batchGenerateHandler({ confDocId: 'CD1' });
  let step = gen.next();
  while (!step.done) step = gen.next();
  const result = step.value;
  expect(generated).toEqual(['1F:CD1']); // 5A failed, 1F still ran
  expect(result.processed).toEqual(['5A', '1F']); // still marked processed (attempted)
  expect(result.errori).toEqual(['5A: template non trovato']);
  expect(result.success).toBe(false);
});

test('prints an end-of-job summary with total/succeeded/failed counts and the failed target list', () => {
  const lines: string[] = [];
  jest.spyOn(Logger, 'log').mockImplementation((line) => lines.push(String(line)));
  const { service } = wire({ failFor: '5A', logger: new LoggerService() });

  const gen = service.batchGenerateHandler({ confDocId: 'CD1', jobId: 'job_1' });
  let step = gen.next();
  while (!step.done) step = gen.next();

  const output = lines.join('\n');
  expect(output).toContain('📊❌ [RIEPILOGO JOB] GENERAZIONE DOCUMENTI');
  expect(output).toContain('  Task totali: 2');
  expect(output).toContain('  Eseguiti con successo: 1');
  expect(output).toContain('  Falliti: 1');
  expect(output).toContain('    - 5A: template non trovato');
});

test('uses the elapsed duration in a failed class summary', () => {
  const lines: string[] = [];
  jest.spyOn(Logger, 'log').mockImplementation((line) => lines.push(String(line)));
  const { service } = wire({ failFor: '5A', logger: new LoggerService() });
  const now = jest
    .spyOn(Date, 'now')
    .mockReturnValueOnce(1_000) // containerStartedAt (run-tracking)
    .mockReturnValueOnce(1_000)
    .mockReturnValueOnce(1_250)
    .mockReturnValue(1_250);

  try {
    const generator = service.batchGenerateHandler({ confDocId: 'CD1' });
    let step = generator.next();
    while (!step.done) step = generator.next();
  } finally {
    now.mockRestore();
  }

  expect(lines.join('\n')).toContain(
    '❌ Document failed: 5A: template non trovato (COMPLETED in 250ms)'
  );
});

test('GasProcessMonitorLib progress calls (15 §9): register/start once, progress per class, complete at the end', () => {
  const monitor = new FakeProcessMonitor();
  const { service } = wire({ monitor });
  const gen = service.batchGenerateHandler({ confDocId: 'CD1', jobId: 'job_1' });
  let step = gen.next();
  while (!step.done) step = gen.next();
  expect(monitor.registered).toEqual(['job_1']);
  expect(monitor.started).toEqual(['job_1']);
  expect(monitor.progress).toHaveLength(2);
  expect(monitor.progress[0]!.message).toContain('5A');
  expect(monitor.progress[1]!.percentage).toBe(100);
  expect(monitor.completed).toHaveLength(1);
  expect(monitor.errors).toHaveLength(0); // non-critical per-element errors never call setError
});

test('a failing class surfaces an "Errore: ..." progress message but setError is never called (15 §8/§9)', () => {
  const monitor = new FakeProcessMonitor();
  const { service } = wire({ failFor: '1F', monitor });
  const gen = service.batchGenerateHandler({ confDocId: 'CD1', jobId: 'job_1' });
  let step = gen.next();
  while (!step.done) step = gen.next();
  const failedMessage = monitor.progress.find((p) => p.message?.includes('Errore'));
  expect(failedMessage?.message).toContain('template non trovato');
  expect(monitor.errors).toHaveLength(0);
});

test('resume does not re-register/re-start the job (only the initial invocation does)', () => {
  const monitor = new FakeProcessMonitor();
  const { service } = wire({ monitor });
  const gen = service.batchGenerateHandler({
    confDocId: 'CD1',
    jobId: 'job_1',
    resumeState: {
      confDocId: 'CD1',
      jobId: 'job_1',
      nextIndex: 1,
      processed: ['5A'],
      errori: [],
      classeTargets: ['5A', '1F']
    }
  });
  let step = gen.next();
  while (!step.done) step = gen.next();
  expect(monitor.registered).toEqual([]);
  expect(monitor.started).toEqual([]);
  expect(monitor.completed).toHaveLength(1);
});

test('LOG_JOB (NEW_TABLE_LOG_JOB.md): a fresh completed run appends one ESECUZIONE=0 COMPLETATO row', () => {
  const { logJob, entries } = fakeLogJob();
  const { service } = wire({ logJob });
  const gen = service.batchGenerateHandler({
    confDocId: 'CD1',
    jobId: 'job_1',
    eseguitoDa: 'prof@school.it'
  });
  let step = gen.next();
  while (!step.done) step = gen.next();

  expect(entries).toHaveLength(1);
  expect(entries[0]).toMatchObject({
    idJob: 'job_1',
    esecuzione: 0,
    tipo: JOB_TYPE_GENERAZIONE_DOCUMENTI,
    idConfig: 'CD1',
    stato: StatoJob.COMPLETATO,
    totaleTask: 2,
    completatiOk: 2,
    falliti: 0,
    eseguitoDa: 'prof@school.it'
  });
});

test('SKIPPED targets are tallied per reason across a resume and excluded from COMPLETATI_OK', () => {
  const { logJob, entries } = fakeLogJob();
  const logger = new LoggerService();
  const report = jest.spyOn(logger, 'logJobReport');
  const { service } = wire({ logJob, logger, resultStatus: 'SKIPPED' });
  const first = service.batchGenerateHandler({ confDocId: 'CD1', jobId: 'job_1' }).next();
  expect(first.value).toMatchObject({ saltati: { 'CONDIZIONE non soddisfatta': 1 } });

  // Timeout after the first target: JobRunnerLib re-enters with the yielded checkpoint.
  const gen = service.batchGenerateHandler({ resumeState: first.value });
  let step = gen.next();
  while (!step.done) step = gen.next();

  expect(report).toHaveBeenCalledWith(
    expect.objectContaining({
      totale: 2,
      saltati: 2,
      dettagliSaltati: ['CONDIZIONE non soddisfatta ×2']
    })
  );
  expect(entries[entries.length - 1]).toMatchObject({ totaleTask: 2, completatiOk: 0, falliti: 0 });
});

test('LOG_JOB: a run with per-class failures appends COMPLETATO_CON_ERRORI', () => {
  const { logJob, entries } = fakeLogJob();
  const { service } = wire({ logJob, failFor: '5A' });
  const gen = service.batchGenerateHandler({ confDocId: 'CD1', jobId: 'job_1' });
  let step = gen.next();
  while (!step.done) step = gen.next();

  expect(entries).toHaveLength(1);
  expect(entries[0]).toMatchObject({
    stato: StatoJob.COMPLETATO_CON_ERRORI,
    totaleTask: 2,
    completatiOk: 1,
    falliti: 1,
    listaFallimenti: ['5A: template non trovato']
  });
});

test('LOG_JOB: a resumed run backfills a SOSPESO_TEMPO row for the execution JobRunnerLib cut off', () => {
  const { logJob, entries } = fakeLogJob();
  const { service } = wire({ logJob });
  const gen = service.batchGenerateHandler({
    confDocId: 'CD1',
    jobId: 'job_1',
    resumeState: {
      confDocId: 'CD1',
      jobId: 'job_1',
      nextIndex: 1,
      processed: ['5A'],
      errori: [],
      runCount: 1,
      totalDurationMs: 4000,
      eseguitoDa: 'prof@school.it',
      esecuzioneIniziata: '2026-01-01T00:00:00.000Z',
      classeTargets: ['5A', '1F']
    }
  });
  let step = gen.next();
  while (!step.done) step = gen.next();

  expect(entries).toHaveLength(2);
  expect(entries[0]).toMatchObject({
    idJob: 'job_1',
    esecuzione: 0,
    stato: StatoJob.SOSPESO_TEMPO,
    inizio: '2026-01-01T00:00:00.000Z',
    eseguitoDa: 'prof@school.it'
  });
  expect(entries[1]).toMatchObject({ esecuzione: 1, stato: StatoJob.COMPLETATO });
});

test('LOG_JOB: CONF_DOC not found appends a FALLITO row before rethrowing', () => {
  const { logJob, entries } = fakeLogJob();
  const { service } = wire({ logJob });
  const gen = service.batchGenerateHandler({ confDocId: 'MISSING', jobId: 'job_1' });
  expect(() => gen.next()).toThrow(ConfigurationError);

  expect(entries).toHaveLength(1);
  expect(entries[0]).toMatchObject({
    idJob: 'job_1',
    esecuzione: 0,
    stato: StatoJob.FALLITO,
    totaleTask: 0
  });
});

/** Minimal fake TeachingAssignment — DocumentBatchService.generateDocentiClasseMateria only reads slot.materia/docenteEffettivo.email. */
function fakeAssignment(materiaId: string, docenteEmail: string): TeachingAssignment {
  return {
    slot: { materia: MateriaId.of(materiaId), kind: 'STANDARD', specifica: null },
    docenteEffettivo: new Docente({
      EMAIL: docenteEmail,
      COGNOME: docenteEmail,
      NOME: '',
      GENERE: 'M'
    })
  } as unknown as TeachingAssignment;
}

/** Same as fakeAssignment but with an explicit kind/specifica — Finding 1: two
 * slots differing ONLY on this third TeachingSlot dimension must collapse to
 * one DocenteClasseMateriaBatchTarget (classe, materiaId, docenteEmail is 2-D). */
function fakeAssignmentWithSlot(
  materiaId: string,
  docenteEmail: string,
  kind: 'MAIN' | 'ITP' | 'SPECIFICA',
  specifica: string | null
): TeachingAssignment {
  return {
    slot: { materia: MateriaId.of(materiaId), kind, specifica },
    docenteEffettivo: new Docente({
      EMAIL: docenteEmail,
      COGNOME: docenteEmail,
      NOME: '',
      GENERE: 'M'
    })
  } as unknown as TeachingAssignment;
}

function wireDocentiClasseMateria(
  options: {
    failFor?: string;
    monitor?: FakeProcessMonitor;
    logger?: LoggerService;
    /** Extra base-council assignments merged in per classe id — used to model
     * same-(materia,docente) slots that differ only by kind/specifica (Finding 1). */
    extraCouncilByClasse?: Record<string, TeachingAssignment[]>;
  } = {}
) {
  const db = new FakeDatabase(fixtureTables());
  const generated: Array<{
    classe: string;
    docente: string;
    materia: string;
    confDocId: string;
    jobId?: string;
  }> = [];
  const documenti = {
    generateForDocenteClasseMateria: (
      target: ClasseId,
      docenteEmail: string,
      materiaId: string,
      confDocId: string,
      jobId?: string
    ) => {
      const key = `${target.value}:${materiaId}:${docenteEmail}`;
      if (key === options.failFor) throw new Error('template non trovato');
      generated.push({
        classe: target.value,
        docente: docenteEmail,
        materia: materiaId,
        confDocId,
        jobId
      });
      return {
        fileId: `file_${target.value}_${materiaId}`,
        fileName: `Doc_${target.value}_${materiaId}`,
        fileLink: `https://docs.google.com/document/d/file_${target.value}_${materiaId}/edit`,
        status: 'GENERATO',
        durationMs: 8572
      };
    }
  } as unknown as DocumentGenerationService;
  const configIds: string[] = [];
  const configs = {
    findById: (id: string) => {
      configIds.push(id);
      return id === 'PROGRAMMA_SVOLTO'
        ? new ConfigurazioneDocumento({
            ID: id,
            TIPO: 'DOCUMENTO_DOCENTE_CLASSE_MATERIA',
            GENERATORE: GeneratoreAxis.CLASSE_DOCENTE_MATERIA,
            FORMATO: 'GDOC'
          })
        : null;
    }
  };
  // Models the real fixture fact fix round 1 addresses: 5A's nominal
  // CLASSI.MATE holder is rossi@school.it, but VARIAZIONI_CATTEDRA reassigns
  // it to bianchi@school.it effective 2025-10-01 (see fixtureTables() /
  // docente-classe-materia-focus-provider.test.ts and document-generation-service
  // .test.ts, which independently rely on the same fact for the CDU-recipe
  // path). Enumerating via role resolution (not the raw CLASSI cattedre) must
  // surface bianchi as 5A's current MATE titolare, matching what
  // DocenteClasseMateriaFocusProvider resolves downstream — that's exactly the
  // divergence Finding 1 flagged.
  const councilByClasse: Record<string, TeachingAssignment[]> = {
    '5A': [
      fakeAssignment('MATE', 'bianchi@school.it'),
      fakeAssignment('FISI', 'bianchi@school.it'),
      ...(options.extraCouncilByClasse?.['5A'] ?? [])
    ],
    '1F': [
      fakeAssignment('MATE', 'rossi@school.it'),
      ...(options.extraCouncilByClasse?.['1F'] ?? [])
    ]
  };
  // Separate, options-gated bucket: models a docente who teaches ONLY a
  // religione-alt materia (IRC's IS_RELIGIONE_ALT=true in fixtureTables()).
  // AldoTeachingAssignmentResolver.resolveConsiglio skips IS_RELIGIONE_ALT
  // materie entirely unless called with { includeReligioneAlt: true } (fix
  // round 2) — this fake reproduces that same gating so a production call
  // that omits the option makes verdi@school.it/IRC silently vanish from
  // `generated` here too, exactly like the real regression it caught.
  const religioneAltByClasse: Record<string, TeachingAssignment[]> = {
    '5A': [fakeAssignment('IRC', 'verdi@school.it')]
  };
  const teachingAssignments = {
    resolveConsiglio: (
      classe: Classe,
      _date: Date,
      resolveOptions?: { includeReligioneAlt?: boolean }
    ) => {
      const base = councilByClasse[classe.id ?? ''] ?? [];
      const alt =
        resolveOptions?.includeReligioneAlt === true
          ? (religioneAltByClasse[classe.id ?? ''] ?? [])
          : [];
      return [...base, ...alt];
    },
    resolveMateria: () => []
  } as unknown as ITeachingAssignmentResolver;
  const service = new DocumentBatchService(
    new ClasseRepository(db),
    new AlunnoRepository(db),
    configs,
    documenti,
    teachingAssignments,
    FIXED_NOW,
    noopDipartimenti,
    options.monitor,
    options.logger
  );
  return { service, generated, configIds };
}

describe('DocumentBatchService.generateDocentiClasseMateria', () => {
  test('registered handler resumes a raw docente/materia checkpoint without top-level IDs or duplicate targets', () => {
    const { service, generated, configIds } = wireDocentiClasseMateria();
    const registered = new Map<string, unknown>();
    service.registerJobHandlers({
      registerJobHandler: (type, handler) => registered.set(type, handler)
    });
    const handler = registered.get(JOB_TYPE_GENERAZIONE_DOCUMENTI) as (params: {
      resumeState?: BatchCheckpoint;
    }) => Generator<BatchCheckpoint, unknown, void>;

    const first = service
      .batchGenerateHandler({ confDocId: 'PROGRAMMA_SVOLTO', jobId: 'job_docenti' })
      .next();
    expect(first.value).toMatchObject({ confDocId: 'PROGRAMMA_SVOLTO', jobId: 'job_docenti' });

    const { result } = drain(handler({ resumeState: JSON.parse(JSON.stringify(first.value)) }));
    const targetIds = generated.map(
      ({ classe, materia, docente }) => `${classe}:${materia}:${docente}`
    );

    expect(configIds).toEqual(['PROGRAMMA_SVOLTO', 'PROGRAMMA_SVOLTO']);
    expect(
      generated.every(
        ({ confDocId, jobId }) => confDocId === 'PROGRAMMA_SVOLTO' && jobId === 'job_docenti'
      )
    ).toBe(true);
    expect(new Set(targetIds).size).toBe(targetIds.length);
    expect(result).toMatchObject({ success: true, totale: targetIds.length });
  });

  test('enumerates one target per cattedra across active classes (GESTIONE_ARTICOLAZIONE=COMPLETA excludes partners)', () => {
    const { service, generated } = wireDocentiClasseMateria();
    const gen = service.batchGenerateHandler({ confDocId: 'PROGRAMMA_SVOLTO', jobId: 'job1' });
    const checkpoints: BatchCheckpoint[] = [];
    let step = gen.next();
    while (!step.done) {
      checkpoints.push(step.value);
      step = gen.next();
    }
    const result = step.value;

    // Fixture active classes are 5A, 1F, 1F-LSO, 1F-LSS; GESTIONE_ARTICOLAZIONE
    // defaults to COMPLETA (unset on the fabricated config), so the parent (1F)
    // is targeted and its partners are excluded — same subset as the CD1 case.
    // 5A's role-resolved council is MATE->bianchi (substitution, see
    // wireDocentiClasseMateria's comment), FISI->bianchi, plus the religione-alt-gated
    // IRC->verdi (only present because resolveConsiglio is called with
    // includeReligioneAlt: true, fix round 2); 1F is only MATE->rossi.
    expect(generated).toEqual([
      {
        classe: '5A',
        docente: 'bianchi@school.it',
        materia: 'MATE',
        confDocId: 'PROGRAMMA_SVOLTO',
        jobId: 'job1'
      },
      {
        classe: '5A',
        docente: 'bianchi@school.it',
        materia: 'FISI',
        confDocId: 'PROGRAMMA_SVOLTO',
        jobId: 'job1'
      },
      {
        classe: '5A',
        docente: 'verdi@school.it',
        materia: 'IRC',
        confDocId: 'PROGRAMMA_SVOLTO',
        jobId: 'job1'
      },
      {
        classe: '1F',
        docente: 'rossi@school.it',
        materia: 'MATE',
        confDocId: 'PROGRAMMA_SVOLTO',
        jobId: 'job1'
      }
    ]);
    expect(checkpoints).toHaveLength(4);
    expect(result).toEqual({
      success: true,
      totale: 4,
      processed: [
        '5A:MATE:bianchi@school.it',
        '5A:FISI:bianchi@school.it',
        '5A:IRC:verdi@school.it',
        '1F:MATE:rossi@school.it'
      ],
      errori: []
    });
  });

  // Dedicated regression guard for the divergence Finding 1's fix (role-
  // resolved enumeration) itself introduced (fix round 2): a docente who
  // teaches ONLY a religione-alt materia (IRC) must still be enumerated as a
  // batch target — not silently dropped, and not even surfaced as an `errori`
  // entry, just absent — which is exactly what happens if
  // resolveConsiglio is called without { includeReligioneAlt: true }.
  test('enumerates a docente who only teaches a religione-alt materia (IRC) — regression guard for includeReligioneAlt', () => {
    const { service, generated } = wireDocentiClasseMateria();
    const gen = service.batchGenerateHandler({ confDocId: 'PROGRAMMA_SVOLTO' });
    let step = gen.next();
    while (!step.done) step = gen.next();

    expect(generated).toContainEqual({
      classe: '5A',
      docente: 'verdi@school.it',
      materia: 'IRC',
      confDocId: 'PROGRAMMA_SVOLTO',
      jobId: 'PROGRAMMA_SVOLTO'
    });
  });

  test('resumes from persisted docenteClasseMateriaTargets without re-querying the teaching-assignment resolver', () => {
    const { service, generated } = wireDocentiClasseMateria();
    const gen = service.batchGenerateHandler({
      confDocId: 'PROGRAMMA_SVOLTO',
      resumeState: {
        confDocId: 'PROGRAMMA_SVOLTO',
        jobId: 'PROGRAMMA_SVOLTO',
        nextIndex: 2,
        processed: ['5A:MATE:bianchi@school.it', '5A:FISI:bianchi@school.it'],
        errori: [],
        docenteClasseMateriaTargets: [
          { classe: '5A', docenteEmail: 'bianchi@school.it', materiaId: 'MATE' },
          { classe: '5A', docenteEmail: 'bianchi@school.it', materiaId: 'FISI' },
          { classe: '5A', docenteEmail: 'verdi@school.it', materiaId: 'IRC' },
          { classe: '1F', docenteEmail: 'rossi@school.it', materiaId: 'MATE' }
        ]
      }
    });
    let step = gen.next();
    while (!step.done) step = gen.next();

    // Only the two targets after nextIndex=2 are (re)generated — proves the
    // persisted docenteClasseMateriaTargets snapshot is consumed as-is rather than
    // re-derived from teachingAssignments.resolveConsiglio on resume.
    expect(generated).toEqual([
      {
        classe: '5A',
        docente: 'verdi@school.it',
        materia: 'IRC',
        confDocId: 'PROGRAMMA_SVOLTO',
        jobId: 'PROGRAMMA_SVOLTO'
      },
      {
        classe: '1F',
        docente: 'rossi@school.it',
        materia: 'MATE',
        confDocId: 'PROGRAMMA_SVOLTO',
        jobId: 'PROGRAMMA_SVOLTO'
      }
    ]);
    expect(step.value.processed).toEqual([
      '5A:MATE:bianchi@school.it',
      '5A:FISI:bianchi@school.it',
      '5A:IRC:verdi@school.it',
      '1F:MATE:rossi@school.it'
    ]);
  });

  test('resumes historical docenteMateriaTargets and emits only docenteClasseMateriaTargets', () => {
    const { service } = wireDocentiClasseMateria();
    const gen = service.batchGenerateHandler({
      confDocId: 'PROGRAMMA_SVOLTO',
      resumeState: {
        confDocId: 'PROGRAMMA_SVOLTO',
        jobId: 'PROGRAMMA_SVOLTO',
        nextIndex: 0,
        processed: [],
        errori: [],
        docenteMateriaTargets: [
          { classe: '5A', docenteEmail: 'bianchi@school.it', materiaId: 'MATE' }
        ]
      }
    });

    const step = gen.next();

    expect(step).toMatchObject({
      done: false,
      value: {
        docenteClasseMateriaTargets: [
          { classe: '5A', docenteEmail: 'bianchi@school.it', materiaId: 'MATE' }
        ]
      }
    });
    expect(step.value).not.toHaveProperty('docenteMateriaTargets');
  });

  test('a single cattedra failure is isolated: logged in errori, the batch continues (15 §8)', () => {
    const { service, generated } = wireDocentiClasseMateria({
      failFor: '5A:FISI:bianchi@school.it'
    });
    const gen = service.batchGenerateHandler({ confDocId: 'PROGRAMMA_SVOLTO' });
    let step = gen.next();
    while (!step.done) step = gen.next();
    const result = step.value;

    expect(generated).toEqual([
      {
        classe: '5A',
        docente: 'bianchi@school.it',
        materia: 'MATE',
        confDocId: 'PROGRAMMA_SVOLTO',
        jobId: 'PROGRAMMA_SVOLTO'
      },
      {
        classe: '5A',
        docente: 'verdi@school.it',
        materia: 'IRC',
        confDocId: 'PROGRAMMA_SVOLTO',
        jobId: 'PROGRAMMA_SVOLTO'
      },
      {
        classe: '1F',
        docente: 'rossi@school.it',
        materia: 'MATE',
        confDocId: 'PROGRAMMA_SVOLTO',
        jobId: 'PROGRAMMA_SVOLTO'
      }
    ]);
    expect(result.errori).toEqual(['5A:FISI:bianchi@school.it: template non trovato']);
    expect(result.success).toBe(false);
  });

  test('generateDocentiClasseMateria targets the composite materiaId for a specifica cattedra', () => {
    const { service, generated } = wireDocentiClasseMateria({
      extraCouncilByClasse: {
        '5A': [fakeAssignmentWithSlot('INTERPRET', 'bianchi@school.it', 'SPECIFICA', 'CHITARRA')]
      }
    });

    const { result } = drain(
      service.batchGenerateHandler({ confDocId: 'PROGRAMMA_SVOLTO', jobId: 'job1' })
    );

    expect(generated).toContainEqual({
      classe: '5A',
      docente: 'bianchi@school.it',
      materia: 'INTERPRET.CHITARRA',
      confDocId: 'PROGRAMMA_SVOLTO',
      jobId: 'job1'
    });
    expect(result.processed).toContain('5A:INTERPRET.CHITARRA:bianchi@school.it');
  });

  test('generateDocentiClasseMateria produces two separate targets for a docente holding two specifics of the same family', () => {
    const { service, generated } = wireDocentiClasseMateria({
      extraCouncilByClasse: {
        '5A': [
          fakeAssignmentWithSlot('INTERPRET', 'bianchi@school.it', 'SPECIFICA', 'CHITARRA'),
          fakeAssignmentWithSlot('INTERPRET', 'bianchi@school.it', 'SPECIFICA', 'FLAUTO')
        ]
      }
    });

    drain(service.batchGenerateHandler({ confDocId: 'PROGRAMMA_SVOLTO', jobId: 'job1' }));

    const materiaIds = generated
      .filter((target) => target.classe === '5A' && target.docente === 'bianchi@school.it')
      .map((target) => target.materia)
      .filter((materiaId) => materiaId.startsWith('INTERPRET.'))
      .sort();
    expect(materiaIds).toEqual(['INTERPRET.CHITARRA', 'INTERPRET.FLAUTO']);
  });

  // Finding 1 (final review fix wave): TeachingSlot is 3-D (materia, kind,
  // specifica) but DocenteClasseMateriaBatchTarget is 2-D (classe, materiaId,
  // docenteEmail). A docente holding two slots on the same materia that
  // differ only by kind (STANDARD+ITP on a lab subject) or specifica must
  // collapse to exactly ONE target, not two byte-identical ones.
  test('two TeachingAssignments for the same (classe, materia, docente) differing only by kind/specifica collapse to one target', () => {
    const { service, generated } = wireDocentiClasseMateria({
      extraCouncilByClasse: {
        '1F': [fakeAssignmentWithSlot('MATE', 'rossi@school.it', 'ITP', null)]
      }
    });
    const gen = service.batchGenerateHandler({ confDocId: 'PROGRAMMA_SVOLTO', jobId: 'job1' });
    let step = gen.next();
    while (!step.done) step = gen.next();
    const result = step.value;

    const oneFTargets = generated.filter((g) => g.classe === '1F' && g.materia === 'MATE');
    expect(oneFTargets).toHaveLength(1);
    expect(oneFTargets[0]).toEqual({
      classe: '1F',
      docente: 'rossi@school.it',
      materia: 'MATE',
      confDocId: 'PROGRAMMA_SVOLTO',
      jobId: 'job1'
    });
    expect(result.processed.filter((id) => id === '1F:MATE:rossi@school.it')).toHaveLength(1);
  });
});

function wireClassiMateria(options: { failFor?: string; tipoLabel?: string } = {}) {
  const db = new FakeDatabase(fixtureTables());
  const generated: Array<{ classe: string; materia: string; confDocId: string; jobId?: string }> =
    [];
  const documenti = {
    generateForClasseMateria: (
      target: ClasseId,
      materiaId: string,
      confDocId: string,
      jobId?: string
    ) => {
      const key = `${target.value}:${materiaId}`;
      if (key === options.failFor) throw new Error('template non trovato');
      generated.push({ classe: target.value, materia: materiaId, confDocId, jobId });
      return {
        fileId: `file_${target.value}_${materiaId}`,
        fileName: `Doc_${target.value}_${materiaId}`,
        fileLink: `https://docs.google.com/document/d/file_${target.value}_${materiaId}/edit`,
        status: 'GENERATO',
        durationMs: 8572
      };
    }
  } as unknown as DocumentGenerationService;
  const configs = {
    findById: (id: string) =>
      id === 'SCHEDA_MATERIA'
        ? new ConfigurazioneDocumento({
            ID: id,
            TIPO: options.tipoLabel ?? 'DOCUMENTO_CLASSE_MATERIA',
            GENERATORE: GeneratoreAxis.CLASSE_MATERIA,
            FORMATO: 'GDOC'
          })
        : null
  };
  const councilByClasse: Record<string, TeachingAssignment[]> = {
    '5A': [
      fakeAssignment('MATE', 'bianchi@school.it'),
      fakeAssignment('MATE', 'rossi@school.it'),
      fakeAssignment('FISI', 'bianchi@school.it'),
      fakeAssignment('IRC', 'verdi@school.it')
    ],
    '1F': [fakeAssignment('MATE', 'rossi@school.it')]
  };
  let resolveCalls = 0;
  const resolvedClassIds: string[] = [];
  const teachingAssignments = {
    resolveConsiglio: (classe: Classe) => {
      resolveCalls++;
      resolvedClassIds.push(classe.id ?? '');
      return councilByClasse[classe.id ?? ''] ?? [];
    },
    resolveMateria: () => []
  } as unknown as ITeachingAssignmentResolver;
  const service = new DocumentBatchService(
    new ClasseRepository(db),
    new AlunnoRepository(db),
    configs,
    documenti,
    teachingAssignments,
    FIXED_NOW,
    noopDipartimenti
  );
  return { service, generated, getResolveCalls: () => resolveCalls, resolvedClassIds };
}

describe('DocumentBatchService.generateClassiMateria', () => {
  test('dispatch routes purely on GENERATORE, ignoring an unrelated TIPO label', () => {
    const { service, generated } = wireClassiMateria({
      tipoLabel: 'ETICHETTA_LIBERA_QUALSIASI'
    });

    drain(service.batchGenerateHandler({ confDocId: 'SCHEDA_MATERIA', jobId: 'job_cm' }));

    expect(generated.length).toBeGreaterThan(0);
  });

  test('DOCUMENTO_CLASSE_MATERIA emits one target per (classe, materia), not per docente', () => {
    const { service, generated, resolvedClassIds } = wireClassiMateria();

    drain(service.batchGenerateHandler({ confDocId: 'SCHEDA_MATERIA', jobId: 'job_cm' }));

    expect(generated).toEqual([
      { classe: '5A', materia: 'MATE', confDocId: 'SCHEDA_MATERIA', jobId: 'job_cm' },
      { classe: '5A', materia: 'FISI', confDocId: 'SCHEDA_MATERIA', jobId: 'job_cm' },
      { classe: '5A', materia: 'IRC', confDocId: 'SCHEDA_MATERIA', jobId: 'job_cm' },
      { classe: '1F', materia: 'MATE', confDocId: 'SCHEDA_MATERIA', jobId: 'job_cm' }
    ]);
    expect(resolvedClassIds).toEqual(['5A', '1F']);
  });

  test('resumes persisted classe/materia targets without re-querying the teaching-assignment resolver', () => {
    const { service, generated, getResolveCalls } = wireClassiMateria();

    const { result } = drain(
      service.batchGenerateHandler({
        confDocId: 'SCHEDA_MATERIA',
        jobId: 'job_cm',
        resumeState: {
          confDocId: 'SCHEDA_MATERIA',
          jobId: 'job_cm',
          nextIndex: 2,
          processed: ['5A:MATE', '5A:FISI'],
          errori: [],
          classeMateriaTargets: [
            { classe: '5A', materiaId: 'MATE' },
            { classe: '5A', materiaId: 'FISI' },
            { classe: '5A', materiaId: 'IRC' },
            { classe: '1F', materiaId: 'MATE' }
          ]
        }
      })
    );

    expect(getResolveCalls()).toBe(0);
    expect(generated).toEqual([
      { classe: '5A', materia: 'IRC', confDocId: 'SCHEDA_MATERIA', jobId: 'job_cm' },
      { classe: '1F', materia: 'MATE', confDocId: 'SCHEDA_MATERIA', jobId: 'job_cm' }
    ]);
    expect(result.processed).toEqual(['5A:MATE', '5A:FISI', '5A:IRC', '1F:MATE']);
  });

  test('a single classe/materia failure is isolated and the batch continues', () => {
    const { service, generated } = wireClassiMateria({ failFor: '5A:FISI' });

    const { result } = drain(service.batchGenerateHandler({ confDocId: 'SCHEDA_MATERIA' }));

    expect(generated.map(({ classe, materia }) => `${classe}:${materia}`)).toEqual([
      '5A:MATE',
      '5A:IRC',
      '1F:MATE'
    ]);
    expect(result).toMatchObject({
      success: false,
      errori: ['5A:FISI: template non trovato'],
      processed: ['5A:MATE', '5A:FISI', '5A:IRC', '1F:MATE']
    });
  });
});

function wireClasseDocente() {
  const db = new FakeDatabase(fixtureTables());
  const generated: Array<{ classe: string; docente: string }> = [];
  let resolveCalls = 0;
  const documenti = {
    generateForClasseDocente: (target: ClasseId, docenteEmail: string) => {
      generated.push({ classe: target.value, docente: docenteEmail });
      return {
        fileId: 'file',
        fileName: 'Doc',
        fileLink: 'link',
        status: 'GENERATO',
        durationMs: 1
      };
    }
  } as unknown as DocumentGenerationService;
  const teachingAssignments = {
    resolveConsiglio: (classe: Classe) => {
      resolveCalls++;
      return classe.id === '5A'
        ? [fakeAssignment('MATE', 'bianchi@school.it'), fakeAssignment('FISI', 'bianchi@school.it')]
        : classe.id === '1F'
          ? [fakeAssignment('MATE', 'rossi@school.it')]
          : [];
    },
    resolveMateria: () => []
  } as unknown as ITeachingAssignmentResolver;
  const service = new DocumentBatchService(
    new ClasseRepository(db),
    new AlunnoRepository(db),
    {
      findById: (id: string) =>
        id === 'CLASSE_DOCENTE'
          ? new ConfigurazioneDocumento({
              ID: id,
              TIPO: 'LIBERO',
              GENERATORE: GeneratoreAxis.CLASSE_DOCENTE,
              FORMATO: 'GDOC'
            })
          : null
    },
    documenti,
    teachingAssignments,
    FIXED_NOW,
    noopDipartimenti
  );
  return { service, generated, getResolveCalls: () => resolveCalls };
}

describe('DocumentBatchService.generateClasseDocente', () => {
  test('emits one target per (classe, docente) pair, not per (classe, docente, materia)', () => {
    const { service, generated } = wireClasseDocente();

    const { checkpoints } = drain(
      service.batchGenerateHandler({ confDocId: 'CLASSE_DOCENTE', jobId: 'job_cd' })
    );

    expect(generated).toEqual([
      { classe: '5A', docente: 'bianchi@school.it' },
      { classe: '1F', docente: 'rossi@school.it' }
    ]);
    expect(checkpoints[0]).toMatchObject({
      classeDocenteTargets: [
        { classe: '5A', docenteEmail: 'bianchi@school.it' },
        { classe: '1F', docenteEmail: 'rossi@school.it' }
      ]
    });
  });

  test('resume from persisted classeDocenteTargets skips completed work', () => {
    const { service, generated, getResolveCalls } = wireClasseDocente();

    drain(
      service.batchGenerateHandler({
        confDocId: 'CLASSE_DOCENTE',
        jobId: 'job_cd',
        resumeState: {
          confDocId: 'CLASSE_DOCENTE',
          jobId: 'job_cd',
          nextIndex: 1,
          processed: ['5A:bianchi@school.it'],
          errori: [],
          classeDocenteTargets: [
            { classe: '5A', docenteEmail: 'bianchi@school.it' },
            { classe: '1F', docenteEmail: 'rossi@school.it' }
          ]
        }
      })
    );

    expect(getResolveCalls()).toBe(0);
    expect(generated).toEqual([{ classe: '1F', docente: 'rossi@school.it' }]);
  });
});

function wireDocenti() {
  const db = new FakeDatabase(fixtureTables());
  const generated: Array<{ docente: string; classiCompetenza: string[] }> = [];
  const documenti = {
    generateForDocente: (docenteEmail: string, classiCompetenza: string[]) => {
      generated.push({ docente: docenteEmail, classiCompetenza });
      return {
        fileId: 'file',
        fileName: 'Doc',
        fileLink: 'link',
        status: 'GENERATO',
        durationMs: 1
      };
    }
  } as unknown as DocumentGenerationService;
  const assignmentsByClasse: Record<string, TeachingAssignment[]> = {
    '5A': [
      fakeAssignment('MATE', 'bianchi@school.it'),
      fakeAssignment('FISI', 'bianchi@school.it')
    ],
    '1F': [fakeAssignment('MATE', 'bianchi@school.it'), fakeAssignment('FISI', 'rossi@school.it')]
  };
  const teachingAssignments = {
    resolveConsiglio: (classe: Classe) => assignmentsByClasse[classe.id ?? ''] ?? [],
    resolveMateria: () => []
  } as unknown as ITeachingAssignmentResolver;
  const service = new DocumentBatchService(
    new ClasseRepository(db),
    new AlunnoRepository(db),
    {
      findById: (id: string) =>
        id === 'DOCENTE'
          ? new ConfigurazioneDocumento({
              ID: id,
              TIPO: 'LIBERO',
              GENERATORE: GeneratoreAxis.DOCENTE,
              FORMATO: 'GDOC'
            })
          : null
    },
    documenti,
    teachingAssignments,
    FIXED_NOW,
    noopDipartimenti
  );
  return { service, generated, assignmentsByClasse };
}

describe('DocumentBatchService.generateDocenti', () => {
  test('emits one target per unique docente email across ALL active classes, with classiCompetenza aggregated', () => {
    const { service, generated } = wireDocenti();

    const { checkpoints } = drain(
      service.batchGenerateHandler({ confDocId: 'DOCENTE', jobId: 'job_d' })
    );

    expect(generated).toEqual([
      { docente: 'bianchi@school.it', classiCompetenza: ['5A', '1F'] },
      { docente: 'rossi@school.it', classiCompetenza: ['1F'] }
    ]);
    expect(checkpoints[0]).toMatchObject({
      docenteTargets: [
        { docenteEmail: 'bianchi@school.it', classiCompetenza: ['5A', '1F'] },
        { docenteEmail: 'rossi@school.it', classiCompetenza: ['1F'] }
      ]
    });
  });

  test('resume consumes persisted docenteTargets after the teaching source changes', () => {
    const { service, generated, assignmentsByClasse } = wireDocenti();
    const initial = service.batchGenerateHandler({ confDocId: 'DOCENTE', jobId: 'job_d' });
    const first = initial.next();
    expect(first.done).toBe(false);
    assignmentsByClasse['5A'] = [];
    assignmentsByClasse['1F'] = [fakeAssignment('MATE', 'mutato@school.it')];

    const { result } = drain(service.batchGenerateHandler({ resumeState: first.value }));

    expect(generated).toEqual([
      { docente: 'bianchi@school.it', classiCompetenza: ['5A', '1F'] },
      { docente: 'rossi@school.it', classiCompetenza: ['1F'] }
    ]);
    expect(result).toMatchObject({ processed: ['bianchi@school.it', 'rossi@school.it'] });
  });
});

function wireAlunni() {
  const generated: string[] = [];
  const activeStudents = [
    new Alunno({
      EMAIL: 'alfa@school.it',
      COGNOMENOME: 'ALFA',
      CLASSE: '5A',
      RELIGIONE: 'IRC',
      ATTIVO: true
    }),
    new Alunno({
      EMAIL: 'beta@school.it',
      COGNOMENOME: 'BETA',
      CLASSE: '1F',
      RELIGIONE: 'IRC',
      ATTIVO: true
    })
  ];
  const alunni = {
    findAttivi: () => activeStudents,
    getPiani: () => []
  } as unknown as IAlunnoRepository;
  const documenti = {
    generateForAlunno: (email: string) => {
      generated.push(email);
      return {
        fileId: 'file',
        fileName: 'Doc',
        fileLink: 'link',
        status: 'GENERATO',
        durationMs: 1
      };
    }
  } as unknown as DocumentGenerationService;
  const service = new DocumentBatchService(
    {
      findAttive: () => [],
      filterPerGestioneArticolazione: () => []
    } as unknown as IClasseRepository,
    alunni,
    {
      findById: (id: string) =>
        id === 'ALUNNO'
          ? new ConfigurazioneDocumento({
              ID: id,
              TIPO: 'LIBERO',
              GENERATORE: GeneratoreAxis.ALUNNO,
              FORMATO: 'GDOC'
            })
          : null
    },
    documenti,
    noopTeachingAssignments,
    FIXED_NOW,
    noopDipartimenti
  );
  return { service, generated, activeStudents };
}

describe('DocumentBatchService.generateAlunni', () => {
  test('emits one target per active student, calling generateForAlunno', () => {
    const { service, generated } = wireAlunni();

    const { checkpoints, result } = drain(
      service.batchGenerateHandler({ confDocId: 'ALUNNO', jobId: 'job_a' })
    );

    expect(generated).toEqual(['alfa@school.it', 'beta@school.it']);
    expect(checkpoints[0]).toMatchObject({
      alunnoTargets: [{ email: 'alfa@school.it' }, { email: 'beta@school.it' }]
    });
    expect(result).toMatchObject({ totale: 2, processed: ['alfa@school.it', 'beta@school.it'] });
  });

  test('resume consumes persisted alunnoTargets after the student source changes', () => {
    const { service, generated, activeStudents } = wireAlunni();
    const initial = service.batchGenerateHandler({ confDocId: 'ALUNNO', jobId: 'job_a' });
    const first = initial.next();
    expect(first.done).toBe(false);
    activeStudents.splice(
      0,
      activeStudents.length,
      new Alunno({
        EMAIL: 'mutato@school.it',
        COGNOMENOME: 'MUTATO',
        CLASSE: '5A',
        RELIGIONE: 'IRC',
        ATTIVO: true
      })
    );

    const { result } = drain(service.batchGenerateHandler({ resumeState: first.value }));

    expect(generated).toEqual(['alfa@school.it', 'beta@school.it']);
    expect(result).toMatchObject({ processed: ['alfa@school.it', 'beta@school.it'] });
  });
});

/** Drains a batch generator to completion, returning every yielded checkpoint plus the final result. */
function drain<T, R>(gen: Generator<T, R, void>): { checkpoints: T[]; result: R } {
  const checkpoints: T[] = [];
  let step = gen.next();
  while (!step.done) {
    checkpoints.push(step.value);
    step = gen.next();
  }
  return { checkpoints, result: step.value };
}

function fakeDipartimento(id: string): Dipartimento {
  return Dipartimento.fromData({ ID: id, NOME: id, CAPO: '', MATERIE: '' });
}

function wireDipartimenti(
  options: {
    failFor?: string;
    monitor?: FakeProcessMonitor;
    logger?: LoggerService;
  } = {}
) {
  const dipartimenti = {
    findAll: () => [fakeDipartimento('LETTERE'), fakeDipartimento('SCIENZE')],
    findByMateria: () => null
  } as unknown as IDipartimentoRepository;
  const generated: Array<{ dipartimentoId: string; confDocId: string; jobId?: string }> = [];
  const documenti = {
    generateForDipartimento: (dipartimentoId: string, confDocId: string, jobId?: string) => {
      if (dipartimentoId === options.failFor) throw new Error('template non trovato');
      generated.push({ dipartimentoId, confDocId, jobId });
      return {
        fileId: `file_${dipartimentoId}`,
        fileName: `Verbale_${dipartimentoId}`,
        fileLink: `https://docs.google.com/document/d/file_${dipartimentoId}/edit`,
        status: 'GENERATO',
        durationMs: 8572
      };
    }
  } as unknown as DocumentGenerationService;
  const configIds: string[] = [];
  const configs = {
    findById: (id: string) => {
      configIds.push(id);
      return id === 'VERBALE_DIPARTIMENTO'
        ? new ConfigurazioneDocumento({
            ID: id,
            TIPO: 'DIPARTIMENTO',
            GENERATORE: GeneratoreAxis.DIPARTIMENTO,
            FORMATO: 'GDOC'
          })
        : null;
    }
  };
  const service = new DocumentBatchService(
    {} as unknown as IClasseRepository,
    {} as unknown as IAlunnoRepository,
    configs,
    documenti,
    noopTeachingAssignments,
    FIXED_NOW,
    dipartimenti,
    options.monitor,
    options.logger
  );
  return { service, generated, configIds };
}

describe('DocumentBatchService.generateDipartimenti', () => {
  test('enumerates one target per DIPART row (no gestioneArticolazione)', () => {
    const { service, generated } = wireDipartimenti();

    const { checkpoints, result } = drain(
      service.batchGenerateHandler({ confDocId: 'VERBALE_DIPARTIMENTO', jobId: 'job1' })
    );

    expect(generated).toEqual([
      { dipartimentoId: 'LETTERE', confDocId: 'VERBALE_DIPARTIMENTO', jobId: 'job1' },
      { dipartimentoId: 'SCIENZE', confDocId: 'VERBALE_DIPARTIMENTO', jobId: 'job1' }
    ]);
    expect(checkpoints).toHaveLength(2);
    expect(result).toEqual({
      success: true,
      totale: 2,
      processed: ['LETTERE', 'SCIENZE'],
      errori: []
    });
  });

  test('a single department failure is isolated: logged in errori, the batch continues (15 §8)', () => {
    const { service, generated } = wireDipartimenti({ failFor: 'SCIENZE' });

    const { result } = drain(service.batchGenerateHandler({ confDocId: 'VERBALE_DIPARTIMENTO' }));

    expect(generated).toEqual([
      {
        dipartimentoId: 'LETTERE',
        confDocId: 'VERBALE_DIPARTIMENTO',
        jobId: 'VERBALE_DIPARTIMENTO'
      }
    ]);
    expect(result.errori).toEqual(['SCIENZE: template non trovato']);
    expect(result.success).toBe(false);
  });

  test('resumes from persisted nextIndex without re-listing already-processed departments', () => {
    const { service, generated } = wireDipartimenti();

    const { result } = drain(
      service.batchGenerateHandler({
        confDocId: 'VERBALE_DIPARTIMENTO',
        resumeState: {
          confDocId: 'VERBALE_DIPARTIMENTO',
          jobId: 'VERBALE_DIPARTIMENTO',
          nextIndex: 1,
          processed: ['LETTERE'],
          errori: [],
          dipartimentoTargets: ['LETTERE', 'SCIENZE']
        }
      })
    );

    expect(generated).toEqual([
      {
        dipartimentoId: 'SCIENZE',
        confDocId: 'VERBALE_DIPARTIMENTO',
        jobId: 'VERBALE_DIPARTIMENTO'
      }
    ]);
    expect(result.processed).toEqual(['LETTERE', 'SCIENZE']);
  });

  test('registered handler resumes a raw department checkpoint without top-level IDs or duplicate departments', () => {
    const { service, generated, configIds } = wireDipartimenti();
    const registered = new Map<string, unknown>();
    service.registerJobHandlers({
      registerJobHandler: (type, handler) => registered.set(type, handler)
    });
    const handler = registered.get(JOB_TYPE_GENERAZIONE_DOCUMENTI) as (params: {
      resumeState?: BatchCheckpoint;
    }) => Generator<BatchCheckpoint, unknown, void>;

    const first = service
      .batchGenerateHandler({ confDocId: 'VERBALE_DIPARTIMENTO', jobId: 'job_dipartimenti' })
      .next();
    expect(first.value).toMatchObject({
      confDocId: 'VERBALE_DIPARTIMENTO',
      jobId: 'job_dipartimenti'
    });

    const { result } = drain(handler({ resumeState: first.value }));

    expect(configIds).toEqual(['VERBALE_DIPARTIMENTO', 'VERBALE_DIPARTIMENTO']);
    expect(generated.map(({ dipartimentoId }) => dipartimentoId)).toEqual(['LETTERE', 'SCIENZE']);
    expect(
      generated.every(
        ({ confDocId, jobId }) =>
          confDocId === 'VERBALE_DIPARTIMENTO' && jobId === 'job_dipartimenti'
      )
    ).toBe(true);
    expect(result).toMatchObject({ success: true, processed: ['LETTERE', 'SCIENZE'] });
  });

  test('resume consumes persisted dipartimentoTargets after the department source changes', () => {
    const { service, generated } = wireDipartimenti();
    const initial = service.batchGenerateHandler({
      confDocId: 'VERBALE_DIPARTIMENTO',
      jobId: 'job_dip'
    });
    const first = initial.next();
    expect(first.done).toBe(false);
    expect(first.value).toMatchObject({ dipartimentoTargets: ['LETTERE', 'SCIENZE'] });

    const { result } = drain(service.batchGenerateHandler({ resumeState: first.value }));

    expect(generated.map((g) => g.dipartimentoId)).toEqual(['LETTERE', 'SCIENZE']);
    expect(result).toMatchObject({ totale: 2, processed: ['LETTERE', 'SCIENZE'] });
  });

  test('a resume without persisted dipartimentoTargets fails loud', () => {
    const { service } = wireDipartimenti();
    expect(() =>
      service
        .batchGenerateHandler({
          resumeState: {
            confDocId: 'VERBALE_DIPARTIMENTO',
            jobId: 'job_dip',
            nextIndex: 1,
            processed: ['LETTERE'],
            errori: []
          }
        })
        .next()
    ).toThrow(ConfigurationError);
  });
});

test('registerJobHandlers registers the generator under the job type (JobRunnerLib registry callback)', () => {
  const { service } = wire();
  const registered = new Map<string, unknown>();
  service.registerJobHandlers({
    registerJobHandler: (type, handler) => {
      registered.set(type, handler);
    }
  });
  expect(registered.has(JOB_TYPE_GENERAZIONE_DOCUMENTI)).toBe(true);
  const handler = registered.get(JOB_TYPE_GENERAZIONE_DOCUMENTI) as (p: {
    confDocId: string;
  }) => Generator<unknown>;
  expect(typeof handler({ confDocId: 'CD1' }).next).toBe('function'); // returns a live generator
});
