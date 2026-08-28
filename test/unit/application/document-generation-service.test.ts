import { DocumentGenerationService } from '../../../src/application/services/DocumentGenerationService';
import { VerbaleGeneratorStrategy } from '../../../src/application/strategies/VerbaleGeneratorStrategy';
import { DocPersonalizzatoGeneratorStrategy } from '../../../src/application/strategies/DocPersonalizzatoGeneratorStrategy';
import { ConfigurazioneDocumentoRepository } from '../../../src/infrastructure/repositories/ConfigurazioneDocumentoRepository';
import {
  composeContextBuilder,
  composeRisolutoreRuoli
} from '../../../src/config/ApplicationComposition';
import { ExpressionEngineFacade } from '../../../src/infrastructure/facades/ExpressionEngineFacade';
import type { GeneratorStrategy } from '../../../src/application/strategies/GeneratorStrategy';
import { FakeDatabase } from '../../fakes/FakeDatabase';
import { FakeDriveFacade } from '../../fakes/FakeDriveFacade';
import { FakeTemplateEngine } from '../../fakes/FakeTemplateEngine';
import { FakeProcessMonitor } from '../../fakes/FakeProcessMonitor';
import { fixtureTables } from '../../fixtures/tables';
import { ClasseId } from '../../../src/domain/value-objects/ClasseId';
import { TipoPiano } from '../../../src/domain/value-objects/enums';
import { TABLE } from '../../../src/config/schema';
import { PipelineError } from '../../../src/domain/errors/DomainError';
import type { Row, IReadableTable } from '../../../src/infrastructure/db/Database';
import { ClasseRepository } from '../../../src/infrastructure/repositories/ClasseRepository';
import type { Cdu } from '../../../src/application/context-engine/Cdu';

/**
 * A FakeDatabase whose LOG_DOCS.find() always misses, while every other
 * operation (including LOG_DOCS.insert, used by RegisterDocumentStep) passes
 * through unchanged — reproduces the "row written but not found back" case
 * that drives DocumentGenerationService's 'UNKNOWN' status branch.
 */
class LogDocsNeverFoundDatabase extends FakeDatabase {
  table(name: string): IReadableTable {
    const real = super.table(name);
    if (name !== TABLE.LOG_DOCS) return real;
    return new Proxy(real, {
      get(target, prop, receiver): unknown {
        if (prop === 'find') return () => null;
        return Reflect.get(target, prop, receiver);
      }
    });
  }
}

function wire(
  tables: Record<string, Row[]> = fixtureTables(),
  options: {
    strategy?: GeneratorStrategy;
    registry?: Map<string, GeneratorStrategy>;
    db?: FakeDatabase;
    now?: Date;
    monitor?: FakeProcessMonitor;
  } = {}
) {
  const db = options.db ?? new FakeDatabase(tables);
  const drive = new FakeDriveFacade();
  const templates = new FakeTemplateEngine();
  const registry =
    options.registry ??
    new Map([['VERBALE_CDC', options.strategy ?? new VerbaleGeneratorStrategy(templates)]]);
  const service = new DocumentGenerationService({
    db,
    drive,
    contextBuilder: composeContextBuilder(db),
    strategyRegistry: registry,
    templates,
    expressionEngine: new ExpressionEngineFacade(),
    configs: new ConfigurazioneDocumentoRepository(db),
    roleResolver: composeRisolutoreRuoli(db),
    classi: new ClasseRepository(db),
    now: options.now ?? new Date('2026-07-01T09:00:00Z'),
    monitor: options.monitor
  });
  return { db, drive, templates, service };
}

describe('DocumentGenerationService.generateForClasse — error paths', () => {
  test('throws when the CONF_DOC row does not exist', () => {
    const { service } = wire();
    expect(() => service.generateForClasse(ClasseId.of('5A'), 'MISSING_ID')).toThrow(PipelineError);
    expect(() => service.generateForClasse(ClasseId.of('5A'), 'MISSING_ID')).toThrow(
      'CONF_DOC MISSING_ID non trovato'
    );
  });

  test('throws when the configured GENERATORE is not registered in the strategy registry', () => {
    const { service } = wire(fixtureTables(), { registry: new Map() });
    expect(() => service.generateForClasse(ClasseId.of('5A'), 'CD1')).toThrow(
      'GENERATORE non registrato: VERBALE_CDC'
    );
  });

  test('deletes the orphaned newFileId and rethrows when a critical step (RenderTemplate) fails after a file was created', () => {
    const boomStrategy: GeneratorStrategy = {
      render: () => {
        throw new Error('render esploso');
      }
    };
    const { drive, service } = wire(fixtureTables(), { strategy: boomStrategy });
    const deleteSpy = jest.spyOn(drive, 'deleteFile');
    expect(() => service.generateForClasse(ClasseId.of('5A'), 'CD1')).toThrow(PipelineError);
    expect(deleteSpy).toHaveBeenCalledWith(drive.copies[0]!.fileId);
  });

  test('does not call drive.deleteFile when a critical step (SelectTemplate) fails before any file was created', () => {
    const tables = fixtureTables();
    // MODELLI without a templateId: ConfigurazioneDocumentoRepository.resolveTemplateId
    // throws inside SelectTemplateStep, which runs BEFORE CloneTemplateStep — newFileId
    // is therefore never set.
    tables.CONF_DOC![0]!.MODELLI = '{}';
    const { drive, service } = wire(tables);
    const deleteSpy = jest.spyOn(drive, 'deleteFile');
    expect(() => service.generateForClasse(ClasseId.of('5A'), 'CD1')).toThrow(PipelineError);
    expect(deleteSpy).not.toHaveBeenCalled();
    expect(drive.copies).toHaveLength(0);
  });

  test.each(['REGISTRA_DOC', 'REGISTRA_FOLD'])('rolls back both log tables when %s is malformed', (column) => {
    const tables = fixtureTables();
    tables.CONF_DOC![0]![column] = '{';
    const { db, service } = wire(tables);

    expect(() => service.generateForClasse(ClasseId.of('5A'), 'CD1')).toThrow(`${column} malformato`);
    expect(db.table(TABLE.LOG_DOCS).findAll()).toEqual([]);
    expect(db.table(TABLE.LOG_FOLD).findAll()).toEqual([]);
  });

  test("returns status 'SKIPPED' when CheckDuplicatesStep prevents a newFileId from being produced", () => {
    const { service } = wire();
    const nowSpy = jest.spyOn(Date, 'now').mockReturnValue(1000);
    try {
      service.generateForClasse(ClasseId.of('5A'), 'CD1');
      const second = service.generateForClasse(ClasseId.of('5A'), 'CD1');
      expect(second).toEqual({
        fileId: null,
        fileName: null,
        fileLink: null,
        status: 'SKIPPED',
        durationMs: 0
      });
    } finally {
      nowSpy.mockRestore();
    }
  });

  test('registra gli step SKIPPED come saltati, non come completati', () => {
    const tables = fixtureTables();
    tables.CONF_DOC[0] = { ...tables.CONF_DOC[0]!, CONDIZIONE: 'false' };
    const monitor = new FakeProcessMonitor();
    const { service } = wire(tables, { monitor });

    service.generateForClasse(ClasseId.of('5A'), 'CD1', 'job1');

    expect(monitor.steps).toContainEqual({
      jobId: 'job1',
      stepName: 'PrepareInfrastructure',
      event: 'skipped'
    });
    expect(monitor.steps).not.toContainEqual({
      jobId: 'job1',
      stepName: 'PrepareInfrastructure',
      event: 'complete',
      success: true
    });
  });

  test('generates one document per class in a shared folder and skips the same class retry', () => {
    const tables = fixtureTables();
    tables.CLASSI.push({ ...tables.CLASSI[0]!, ID: '4B', ANNO: 4 });
    tables.CONF_DOC[0] = {
      ...tables.CONF_DOC[0]!,
      FILE_NAME: 'E2E_{{focus.classe.anagrafica.nome}}_{{progressivo}}',
      PATH_OUT: 'Output'
    };
    const { service } = wire(tables);

    expect(service.generateForClasse(ClasseId.of('5A'), 'CD1').status).toBe('GENERATO');
    expect(service.generateForClasse(ClasseId.of('4B'), 'CD1').status).toBe('GENERATO');
    expect(service.generateForClasse(ClasseId.of('5A'), 'CD1').status).toBe('SKIPPED');
  });

  test("returns status 'GENERATO' from pipeline context when LOG_DOCS cannot be read back", () => {
    const db = new LogDocsNeverFoundDatabase(fixtureTables());
    const { service } = wire(fixtureTables(), { db });
    const result = service.generateForClasse(ClasseId.of('5A'), 'CD1');
    expect(result.fileId).not.toBeNull();
    expect(result.status).toBe('GENERATO');
  });
});

describe('DocumentGenerationService.generateForPiano', () => {
  test('returns the generated document metadata and measured duration from the completed pipeline context', () => {
    const registry = new Map([
      ['DOC_PERSONALIZZATO', new DocPersonalizzatoGeneratorStrategy(new FakeTemplateEngine())]
    ]);
    const { service } = wire(fixtureTables(), { registry });
    const nowSpy = jest
      .spyOn(Date, 'now')
      .mockReturnValueOnce(1000)
      .mockReturnValue(9572);

    try {
      expect(
        service.generateForPiano(
          'a2@school.it',
          TipoPiano.PDP_DSA,
          'PIANI_PERSONALIZZATI',
          'job'
        )
      ).toEqual({
        fileId: 'file_2',
        fileName: 'Piano_PDP_DSA_NERI PAOLO',
        fileLink: 'https://docs.google.com/document/d/file_2/edit',
        status: 'GENERATO',
        durationMs: 8572
      });
    } finally {
      nowSpy.mockRestore();
    }
  });

  test('runs two focused plan subtypes through one conditional configuration and skips their reruns independently', () => {
    const tables = fixtureTables();
    tables.PIANI.push({ STUDENTE: 'a1@school.it', TIPO: 'PDP_BES', PARAMETRI: '{"gravita":"lieve"}' });
    tables.CONF_DOC!.push({
      ID: 'PIANI_PERSONALIZZATI',
      TIPO: 'PIANO_PERS',
      GENERATORE: 'DOC_PERSONALIZZATO',
      CONDIZIONE: null,
      MODELLI: JSON.stringify([
        { condizione: "{{focus.piano.tipo}} == 'PEI'", templateId: 'tmpl_pei' },
        { condizione: "{{focus.piano.tipo}} == 'PDP_BES'", templateId: 'tmpl_pdp_bes' }
      ]),
      FILE_NAME: 'Piano_{{focus.alunno.anagrafica.nomeCompleto}}',
      PATH_OUT: 'Piani',
      DUPLICAZIONE: 'NEGATA',
      PERMESSI: null,
      POST_PROCESSO: null,
      PARAMETRI: '',
      GESTIONE_ARTICOLAZIONE: '',
      FORMATO: 'GDOC',
      REGISTRA_DOC: JSON.stringify({
        classi: '{{focus.classe.anagrafica.nome}}',
        utenti: '{{focus.alunno.anagrafica.email}}',
        materie: ''
      })
    });
    const documentTemplates = new FakeTemplateEngine();
    const { db, drive, service } = wire(tables, {
      registry: new Map([
        ['DOC_PERSONALIZZATO', new DocPersonalizzatoGeneratorStrategy(documentTemplates)]
      ])
    });

    const pei = service.generateForPiano('a1@school.it', TipoPiano.PEI, 'PIANI_PERSONALIZZATI');
    const pdpBes = service.generateForPiano(
      'a1@school.it',
      TipoPiano.PDP_BES,
      'PIANI_PERSONALIZZATI'
    );

    expect(pei.status).toBe('GENERATO');
    expect(pdpBes.status).toBe('GENERATO');
    expect(drive.copies.map((copy) => copy.templateId)).toEqual(['tmpl_pei', 'tmpl_pdp_bes']);
    expect(db.table(TABLE.LOG_DOCS).findAll()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          ID_GEN: 'PIANI_PERSONALIZZATI',
          TIPO: 'PIANO_PERS',
          SOTTOTIPO: 'PEI',
          UTENTI: 'a1@school.it'
        }),
        expect.objectContaining({
          ID_GEN: 'PIANI_PERSONALIZZATI',
          TIPO: 'PIANO_PERS',
          SOTTOTIPO: 'PDP_BES',
          UTENTI: 'a1@school.it'
        })
      ])
    );
    expect(service.generateForPiano('a1@school.it', TipoPiano.PEI, 'PIANI_PERSONALIZZATI')).toMatchObject({
      fileId: null,
      fileName: null,
      fileLink: null,
      status: 'SKIPPED'
    });
    expect(
      service.generateForPiano('a1@school.it', TipoPiano.PDP_BES, 'PIANI_PERSONALIZZATI')
    ).toMatchObject({ fileId: null, fileName: null, fileLink: null, status: 'SKIPPED' });
  });

  test('throws when the CONF_DOC row does not exist, same as generateForClasse', () => {
    const { service } = wire();
    expect(() =>
      service.generateForPiano('a1@school.it', TipoPiano.PEI, 'MISSING_ID')
    ).toThrow(PipelineError);
  });

  test('skips the same student plan across dates while preserving a different subtype', () => {
    const tables = fixtureTables();
    tables.PIANI.push({
      STUDENTE: 'a1@school.it',
      TIPO: 'PDP_BES',
      PARAMETRI: '{"gravita":"lieve"}'
    });
    const db = new FakeDatabase(tables);
    const registry = () =>
      new Map([
        [
          'DOC_PERSONALIZZATO',
          new DocPersonalizzatoGeneratorStrategy(new FakeTemplateEngine())
        ]
      ]);
    const firstRun = wire(tables, {
      db,
      registry: registry(),
      now: new Date('2026-07-01T09:00:00Z')
    });
    const laterRun = wire(tables, {
      db,
      registry: registry(),
      now: new Date('2026-07-02T09:00:00Z')
    });

    expect(
      firstRun.service.generateForPiano(
        'a1@school.it',
        TipoPiano.PEI,
        'PIANI_PERSONALIZZATI'
      ).status
    ).toBe('GENERATO');
    expect(
      laterRun.service.generateForPiano(
        'a1@school.it',
        TipoPiano.PEI,
        'PIANI_PERSONALIZZATI'
      )
    ).toMatchObject({ fileId: null, fileName: null, fileLink: null, status: 'SKIPPED' });
    expect(
      laterRun.service.generateForPiano(
        'a1@school.it',
        TipoPiano.PDP_BES,
        'PIANI_PERSONALIZZATI'
      ).status
    ).toBe('GENERATO');

    expect(firstRun.drive.copies).toHaveLength(1);
    expect(laterRun.drive.copies).toHaveLength(1);
    expect(db.table(TABLE.LOG_DOCS).findAll()).toHaveLength(2);
  });

  test('rejects a configuration whose TIPO is not PIANO_PERS before pipeline execution', () => {
    const { service } = wire();

    expect(() => service.generateForPiano('a1@school.it', TipoPiano.PEI, 'CD1')).toThrow(
      'CONF_DOC CD1 deve avere TIPO PIANO_PERS'
    );
  });

  test('PIANI_PERSONALIZZATI_NO_PEI (01_SCHEMA_DATABASE.md "Eccezione ammessa"): CONDIZIONE skips PEI, generates other subtypes identically', () => {
    const tables = fixtureTables();
    tables.PIANI.push({ STUDENTE: 'a1@school.it', TIPO: 'PDP_BES', PARAMETRI: '{"gravita":"lieve"}' });
    tables.CONF_DOC!.push({
      ID: 'PIANI_PERSONALIZZATI_NO_PEI',
      TIPO: 'PIANO_PERS',
      GENERATORE: 'DOC_PERSONALIZZATO',
      CONDIZIONE: '{{focus.piano.tipo}} != "PEI"',
      MODELLI: JSON.stringify([
        { condizione: "{{focus.piano.tipo}} == 'PEI'", templateId: 'tmpl_pei' },
        { condizione: "{{focus.piano.tipo}} == 'PDP_BES'", templateId: 'tmpl_pdp_bes' }
      ]),
      FILE_NAME: 'Piano_{{focus.alunno.anagrafica.nomeCompleto}}',
      PATH_OUT: 'Piani',
      DUPLICAZIONE: 'NEGATA',
      PERMESSI: null,
      POST_PROCESSO: null,
      PARAMETRI: '',
      GESTIONE_ARTICOLAZIONE: '',
      FORMATO: 'GDOC',
      REGISTRA_DOC: JSON.stringify({
        classi: '{{focus.classe.anagrafica.nome}}',
        utenti: '{{focus.alunno.anagrafica.email}}',
        materie: ''
      })
    });
    const { drive, service } = wire(tables, {
      registry: new Map([
        ['DOC_PERSONALIZZATO', new DocPersonalizzatoGeneratorStrategy(new FakeTemplateEngine())]
      ])
    });

    expect(
      service.generateForPiano('a1@school.it', TipoPiano.PEI, 'PIANI_PERSONALIZZATI_NO_PEI')
    ).toMatchObject({ fileId: null, fileName: null, fileLink: null, status: 'SKIPPED' });
    expect(
      service.generateForPiano('a1@school.it', TipoPiano.PDP_BES, 'PIANI_PERSONALIZZATI_NO_PEI')
        .status
    ).toBe('GENERATO');
    expect(drive.copies.map((copy) => copy.templateId)).toEqual(['tmpl_pdp_bes']);
  });
});

describe('DocumentGenerationService.generateForClasse — articulated parent (ARTICOLAZIONE.md item 4)', () => {
  class CapturingStrategy implements GeneratorStrategy {
    cdu: Cdu | undefined;
    render(_fileId: string, cdu: Cdu): void {
      this.cdu = cdu;
    }
  }

  test('includes personalized plans filed under a partner class when targeting the parent', () => {
    const tables = fixtureTables();
    tables.CONF_DOC!.push({
      ID: 'CD_CLASSE_COMPLETA',
      TIPO: 'GENERICO',
      GENERATORE: 'CAPTURING',
      CONDIZIONE: null,
      MODELLI: '{"templateId":"tmpl_generico"}',
      FILE_NAME: 'Doc_{{focus.classe.anagrafica.nome}}',
      PATH_OUT: 'Docs',
      DUPLICAZIONE: 'NEGATA',
      PERMESSI: null,
      POST_PROCESSO: null,
      PARAMETRI: null,
      GESTIONE_ARTICOLAZIONE: '',
      FORMATO: 'GDOC',
      REGISTRA_DOC: null,
      REGISTRA_FOLD: null
    });
    tables.LOG_DOCS!.push({
      ID: 'LD1',
      ID_GEN: 'CD_CLASSE_COMPLETA',
      TIPO: 'PIANO_PERS',
      SOTTOTIPO: 'PDP_DSA',
      NOME: 'Piano DSA',
      STATO: 'PUBBLICATO',
      NOTIFICATO: true,
      PATH: '',
      LINK: 'https://drive/piano-dsa',
      CLASSI: '1F-LSO',
      UTENTI: 'studente@school.test',
      MATERIE: '',
      DATA_CREAZ: '2026-06-01T00:00:00.000Z',
      ID_ORIG: ''
    });
    const strategy = new CapturingStrategy();
    const { service } = wire(tables, { registry: new Map([['CAPTURING', strategy]]) });

    service.generateForClasse(ClasseId.of('1F'), 'CD_CLASSE_COMPLETA');

    expect(strategy.cdu?.focus.classe?.didattica?.pianiPersonalizzati.items.map((i) => i.id)).toEqual([
      'LD1'
    ]);
  });

  test('targeting a partner class directly sees only its own data, not the sibling partner\'s LOG_DOCS (narrowed to parent-only expansion)', () => {
    const tables = fixtureTables();
    tables.CONF_DOC!.push({
      ID: 'CD_PARTNER',
      TIPO: 'GENERICO',
      GENERATORE: 'CAPTURING',
      CONDIZIONE: null,
      MODELLI: '{"templateId":"tmpl_generico"}',
      FILE_NAME: 'Doc_{{focus.classe.anagrafica.nome}}',
      PATH_OUT: 'Docs',
      DUPLICAZIONE: 'NEGATA',
      PERMESSI: null,
      POST_PROCESSO: null,
      PARAMETRI: null,
      GESTIONE_ARTICOLAZIONE: '',
      FORMATO: 'GDOC',
      REGISTRA_DOC: null,
      REGISTRA_FOLD: null
    });
    tables.LOG_DOCS!.push({
      ID: 'LD_SIBLING',
      ID_GEN: 'CD_PARTNER',
      TIPO: 'PIANO_PERS',
      SOTTOTIPO: 'PDP_DSA',
      NOME: 'Piano DSA sorella',
      STATO: 'PUBBLICATO',
      NOTIFICATO: true,
      PATH: '',
      LINK: 'https://drive/piano-dsa-sibling',
      CLASSI: '1F-LSS',
      UTENTI: 'altro-studente@school.test',
      MATERIE: '',
      DATA_CREAZ: '2026-06-01T00:00:00.000Z',
      ID_ORIG: ''
    });
    const strategy = new CapturingStrategy();
    const { service } = wire(tables, { registry: new Map([['CAPTURING', strategy]]) });

    service.generateForClasse(ClasseId.of('1F-LSO'), 'CD_PARTNER');

    expect(strategy.cdu?.focus.classe?.didattica?.pianiPersonalizzati.items).toEqual([]);
  });

  test('standard (non-articulated) class is unaffected: classiCompetenza is just the target', () => {
    const tables = fixtureTables();
    tables.CONF_DOC!.push({
      ID: 'CD_5A',
      TIPO: 'GENERICO',
      GENERATORE: 'CAPTURING',
      CONDIZIONE: null,
      MODELLI: '{"templateId":"tmpl_generico"}',
      FILE_NAME: 'Doc_{{focus.classe.anagrafica.nome}}',
      PATH_OUT: 'Docs',
      DUPLICAZIONE: 'NEGATA',
      PERMESSI: null,
      POST_PROCESSO: null,
      PARAMETRI: null,
      GESTIONE_ARTICOLAZIONE: '',
      FORMATO: 'GDOC',
      REGISTRA_DOC: null,
      REGISTRA_FOLD: null
    });
    const strategy = new CapturingStrategy();
    const { service } = wire(tables, { registry: new Map([['CAPTURING', strategy]]) });

    service.generateForClasse(ClasseId.of('5A'), 'CD_5A');

    expect(strategy.cdu?.meta.parametriInput.target).toBe('5A');
    expect(strategy.cdu?.focus.classe?.flags.isArticolata).toBe(false);
  });
});

describe('DocumentGenerationService.generateForClasseDocenteClasseMateria', () => {
  class CapturingStrategy implements GeneratorStrategy {
    cdu: Cdu | undefined;
    render(_fileId: string, cdu: Cdu): void {
      this.cdu = cdu;
    }
  }

  function pushDocenteClasseMateriaConfig(tables: Record<string, Row[]>, id = 'CD_DOCENTE_CLASSE_MATERIA'): void {
    tables.CONF_DOC!.push({
      ID: id,
      TIPO: 'DOCUMENTO_DOCENTE_CLASSE_MATERIA',
      GENERATORE: 'CAPTURING',
      CONDIZIONE: null,
      MODELLI: '{"templateId":"tmpl_generico"}',
      FILE_NAME: 'Programma_{{focus.materia.sigla}}_{{focus.docente.email}}',
      PATH_OUT: 'Docs',
      DUPLICAZIONE: 'NEGATA',
      PERMESSI: null,
      POST_PROCESSO: null,
      PARAMETRI: null,
      GESTIONE_ARTICOLAZIONE: '',
      FORMATO: 'GDOC',
      REGISTRA_DOC: null,
      REGISTRA_FOLD: null
    });
  }

  // 5A/MATE resolves to bianchi@school.it, not the nominal CLASSI.MATE holder
  // rossi@school.it: fixtureTables().VARIAZIONI_CATTEDRA reassigns 5A/MATE
  // from rossi to bianchi effective 2025-10-01, and `wire()`'s injected `now`
  // (2026-07-01) is well inside that window, so the 'consiglio' provider
  // (role-resolved via SUPPLENZE/VARIAZIONI_CATTEDRA/CLASSI, ref RoleResolutionLib)
  // reflects bianchi as 5A's current MATE titolare.
  test('builds the CDU scoped to the docente/materia focus (5A: MATE -> bianchi@school.it per VARIAZIONI_CATTEDRA) and runs the pipeline', () => {
    const tables = fixtureTables();
    pushDocenteClasseMateriaConfig(tables);
    const strategy = new CapturingStrategy();
    const { service } = wire(tables, { registry: new Map([['CAPTURING', strategy]]) });

    const result = service.generateForClasseDocenteClasseMateria(
      ClasseId.of('5A'),
      'bianchi@school.it',
      'MATE',
      'CD_DOCENTE_CLASSE_MATERIA'
    );

    expect(strategy.cdu?.focus.docente?.email).toBe('bianchi@school.it');
    expect(strategy.cdu?.focus.materia?.sigla).toBe('MATE');
    expect(result.status).toBe('GENERATO');
    expect(result.fileName).toBe('Programma_MATE_bianchi@school.it');
  });

  test('reuses the same Pipeline instance for one jobId and rebuilds it when the jobId changes', () => {
    const tables = fixtureTables();
    pushDocenteClasseMateriaConfig(tables);
    const strategy = new CapturingStrategy();
    const { service } = wire(tables, { registry: new Map([['CAPTURING', strategy]]) });
    const seen: Pipeline[] = [];
    const originalBuildPipeline = (
      service as unknown as { buildPipeline: (jobId?: string) => Pipeline }
    ).buildPipeline.bind(service);
    (service as unknown as { buildPipeline: (jobId?: string) => Pipeline }).buildPipeline = (
      jobId?: string
    ) => {
      const pipeline = originalBuildPipeline(jobId);
      seen.push(pipeline);
      return pipeline;
    };

    service.generateForClasseDocenteClasseMateria(
      ClasseId.of('5A'),
      'bianchi@school.it',
      'MATE',
      'CD_DOCENTE_CLASSE_MATERIA',
      'job-1'
    );
    service.generateForClasseDocenteClasseMateria(
      ClasseId.of('5A'),
      'bianchi@school.it',
      'MATE',
      'CD_DOCENTE_CLASSE_MATERIA',
      'job-1'
    );

    expect(seen).toHaveLength(1);

    service.generateForClasseDocenteClasseMateria(
      ClasseId.of('5A'),
      'bianchi@school.it',
      'MATE',
      'CD_DOCENTE_CLASSE_MATERIA',
      'job-2'
    );
    expect(seen).toHaveLength(2);
  });

  // The DocenteClasseMateriaFocusProvider PipelineError is thrown during
  // ContextBuilder.build's provider-assembly step, same as every other
  // provider error (e.g. ClasseProvider/AlunnoProvider's EntityNotFoundError)
  // — the ContextEngine library wraps it in a ContextEngineError, so the
  // observable contract at this integration boundary is the message, not the
  // original error class (already covered directly at the provider unit level
  // in docente-classe-materia-focus-provider.test.ts).
  test('throws when the docente/materia pair is not on the class council', () => {
    const tables = fixtureTables();
    pushDocenteClasseMateriaConfig(tables);
    const strategy = new CapturingStrategy();
    const { service } = wire(tables, { registry: new Map([['CAPTURING', strategy]]) });

    expect(() =>
      service.generateForClasseDocenteClasseMateria(
        ClasseId.of('5A'),
        'ignoto@school.it',
        'MATE',
        'CD_DOCENTE_CLASSE_MATERIA'
      )
    ).toThrow(/docente ignoto@school\.it non trovato nel consiglio di classe/);
  });
});

describe('DocumentGenerationService.generateForClasseMateria', () => {
  class CapturingStrategy implements GeneratorStrategy {
    cdu: Cdu | undefined;
    render(_fileId: string, cdu: Cdu): void {
      this.cdu = cdu;
    }
  }

  test('builds the CDU scoped to a materia and its role-resolved class teachers', () => {
    const tables = fixtureTables();
    tables.CONF_DOC!.push({
      ID: 'CD_CLASSE_MATERIA',
      TIPO: 'DOCUMENTO_CLASSE_MATERIA',
      GENERATORE: 'CAPTURING',
      CONDIZIONE: null,
      MODELLI: '{"templateId":"tmpl_generico"}',
      FILE_NAME: 'Materia_{{focus.materia.sigla}}',
      PATH_OUT: 'Docs',
      DUPLICAZIONE: 'NEGATA',
      PERMESSI: null,
      POST_PROCESSO: null,
      PARAMETRI: null,
      GESTIONE_ARTICOLAZIONE: '',
      FORMATO: 'GDOC',
      REGISTRA_DOC: null,
      REGISTRA_FOLD: null
    });
    const strategy = new CapturingStrategy();
    const { service } = wire(tables, { registry: new Map([['CAPTURING', strategy]]) });

    const result = service.generateForClasseMateria(
      ClasseId.of('5A'),
      'MATE',
      'CD_CLASSE_MATERIA'
    );

    expect(strategy.cdu?.focus.materia?.sigla).toBe('MATE');
    expect(strategy.cdu?.focus.classiMateria?.docenti.map((docente) => docente.email)).toEqual([
      'bianchi@school.it'
    ]);
    expect(strategy.cdu?.focus.classe?.anagrafica.anno).toBe(5);
    expect(strategy.cdu?.focus.classe?.anagrafica.indirizzo?.sigla).toBe('SCIENTIFICO');
    expect(result.status).toBe('GENERATO');
  });
});

describe('DocumentGenerationService.generateForDipartimento', () => {
  class CapturingStrategy implements GeneratorStrategy {
    cdu: Cdu | undefined;
    render(_fileId: string, cdu: Cdu): void {
      this.cdu = cdu;
    }
  }

  function pushDipartimentoConfig(tables: Record<string, Row[]>, id = 'CD_DIPARTIMENTO'): void {
    tables.CONF_DOC!.push({
      ID: id,
      TIPO: 'DIPARTIMENTO',
      GENERATORE: 'CAPTURING',
      CONDIZIONE: null,
      MODELLI: '{"templateId":"tmpl_generico"}',
      FILE_NAME: 'Verbale_{{focus.dipartimento.anagrafica.nome}}',
      PATH_OUT: 'Docs',
      DUPLICAZIONE: 'NEGATA',
      PERMESSI: null,
      POST_PROCESSO: null,
      PARAMETRI: null,
      GESTIONE_ARTICOLAZIONE: '',
      FORMATO: 'GDOC',
      REGISTRA_DOC: null,
      REGISTRA_FOLD: null
    });
  }

  // fixtureTables().DIPART has SCIENTIFICO_DIP (CAPO rossi@school.it, MATERIE
  // MATE,FISI); DOCENTI rossi/bianchi both belong to it (see
  // test/fixtures/tables.ts) so DipartimentoProvider.findByDipartimento
  // surfaces both as `focus.dipartimento.docenti`.
  test('builds the CDU with the DIPARTIMENTO_COMPLETO recipe and tipoTarget dipartimento, and runs the pipeline', () => {
    const tables = fixtureTables();
    pushDipartimentoConfig(tables);
    const strategy = new CapturingStrategy();
    const { service } = wire(tables, { registry: new Map([['CAPTURING', strategy]]) });

    const result = service.generateForDipartimento('SCIENTIFICO_DIP', 'CD_DIPARTIMENTO');

    expect(strategy.cdu?.meta.parametriInput.target).toBe('SCIENTIFICO_DIP');
    expect(strategy.cdu?.meta.parametriInput.tipoTarget).toBe('dipartimento');
    expect(strategy.cdu?.focus.dipartimento?.anagrafica).toEqual({
      id: 'SCIENTIFICO_DIP',
      nome: 'Dipartimento scientifico'
    });
    expect(strategy.cdu?.focus.dipartimento?.capo).toEqual(
      expect.objectContaining({ email: 'rossi@school.it' })
    );
    expect(strategy.cdu?.focus.dipartimento?.docenti).toHaveLength(2);
    expect(result.status).toBe('GENERATO');
    expect(result.fileName).toBe('Verbale_Dipartimento scientifico');
  });

  test('throws when the department is not found', () => {
    const tables = fixtureTables();
    pushDipartimentoConfig(tables);
    const strategy = new CapturingStrategy();
    const { service } = wire(tables, { registry: new Map([['CAPTURING', strategy]]) });

    expect(() => service.generateForDipartimento('IGNOTO', 'CD_DIPARTIMENTO')).toThrow(
      /Dipartimento IGNOTO non trovato/
    );
  });

  test('throws when the CONF_DOC row does not exist, same as generateForClasse', () => {
    const { service } = wire();
    expect(() => service.generateForDipartimento('SCIENTIFICO_DIP', 'MISSING_ID')).toThrow(
      PipelineError
    );
  });
});
