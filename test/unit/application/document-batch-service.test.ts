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
import { TipoPiano } from '../../../src/domain/value-objects/enums';
import { ConfigurationError } from '../../../src/domain/errors/DomainError';
import type { IClasseRepository } from '../../../src/domain/repositories/IClasseRepository';
import type { IAlunnoRepository } from '../../../src/domain/repositories/IAlunnoRepository';

// The generator contract is what JobRunnerLib executes: it yields a resumable
// checkpoint per class and fast-forwards from params.resumeState after a
// suspension. The trigger/state machinery itself is the library's (tested in
// the GasLibraryFactory monorepo and online).

function wire(
  options: {
    failFor?: string;
    monitor?: FakeProcessMonitor;
    logger?: LoggerService;
    resultStatus?: 'GENERATO' | 'SKIPPED';
    resultDurationMs?: number;
  } = {}
) {
  const db = new FakeDatabase(fixtureTables());
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
        durationMs: options.resultDurationMs ?? 8572
      };
    }
  } as unknown as DocumentGenerationService;
  const service = new DocumentBatchService(
    new ClasseRepository(db),
    new AlunnoRepository(db),
    new ConfigurazioneDocumentoRepository(db),
    documenti,
    options.monitor,
    options.logger
  );
  return { service, generated };
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
      RELIGIONE: 'SI',
      ATTIVO: true
    }),
    new Alunno({
      EMAIL: 'senza-piani@school.it',
      COGNOMENOME: 'SENZA PIANI',
      CLASSE: '5A',
      RELIGIONE: 'SI',
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
            GENERATORE: 'DOC_PERSONALIZZATO'
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
        fileLink: skipped ? null : `https://docs.google.com/document/d/file_${studente}_${tipo}/edit`,
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
    'Document generated: Piano_PEI_con-piani@school.it (COMPLETED in 8572ms)'
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
    'Document skipped: con-piani@school.it:PEI (COMPLETED in 321ms)'
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
    'Document generated: Piano_PEI_con-piani@school.it (GENERATO in 8572ms)',
    'Document generated: Piano_PDP_BES_con-piani@school.it (GENERATO in 8572ms)'
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
    'Document generated: Piano_PDP_BES_con-piani@school.it (GENERATO in 8572ms)'
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

test('handler resumes from params.resumeState without reprocessing completed classes (JobRunnerLib resume cycle)', () => {
  const { service, generated } = wire();
  const gen = service.batchGenerateHandler({
    confDocId: 'CD1',
    resumeState: { nextIndex: 1, processed: ['5A'], errori: [] }
  });
  let step = gen.next();
  while (!step.done) step = gen.next();
  const result = step.value;
  expect(generated).toEqual(['1F:CD1']); // 5A skipped, already processed
  expect(result.processed).toEqual(['5A', '1F']);
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

test('uses the elapsed duration in a failed class summary', () => {
  const lines: string[] = [];
  jest.spyOn(Logger, 'log').mockImplementation((line) => lines.push(String(line)));
  const now = jest
    .spyOn(Date, 'now')
    .mockReturnValueOnce(1_000)
    .mockReturnValueOnce(1_250)
    .mockReturnValue(1_250);
  const { service } = wire({ failFor: '5A', logger: new LoggerService() });

  try {
    const generator = service.batchGenerateHandler({ confDocId: 'CD1' });
    let step = generator.next();
    while (!step.done) step = generator.next();
  } finally {
    now.mockRestore();
  }

  expect(lines.join('\n')).toContain(
    'Document failed: 5A: template non trovato (COMPLETED in 250ms)'
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
    resumeState: { nextIndex: 1, processed: ['5A'], errori: [] }
  });
  let step = gen.next();
  while (!step.done) step = gen.next();
  expect(monitor.registered).toEqual([]);
  expect(monitor.started).toEqual([]);
  expect(monitor.completed).toHaveLength(1);
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
