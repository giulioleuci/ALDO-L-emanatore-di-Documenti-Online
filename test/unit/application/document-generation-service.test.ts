import { DocumentGenerationService } from '../../../src/application/services/DocumentGenerationService';
import { ContextEngineFactory } from '../../../src/application/context-engine/ContextEngineFactory';
import { VerbaleGeneratorStrategy } from '../../../src/application/strategies/VerbaleGeneratorStrategy';
import { ConfigurazioneDocumentoRepository } from '../../../src/infrastructure/repositories/ConfigurazioneDocumentoRepository';
import { RisolutoreRuoliService } from '../../../src/application/services/RisolutoreRuoliService';
import { ExpressionEngineFacade } from '../../../src/infrastructure/facades/ExpressionEngineFacade';
import type { GeneratorStrategy } from '../../../src/application/strategies/GeneratorStrategy';
import { FakeDatabase } from '../../fakes/FakeDatabase';
import { FakeDriveFacade } from '../../fakes/FakeDriveFacade';
import { FakeTemplateEngine } from '../../fakes/FakeTemplateEngine';
import { fixtureTables } from '../../fixtures/tables';
import { ClasseId } from '../../../src/domain/value-objects/ClasseId';
import { TABLE } from '../../../src/config/schema';
import { PipelineError } from '../../../src/domain/errors/DomainError';
import type { Row, IDatabase, IReadableTable } from '../../../src/infrastructure/db/Database';
import type { PostProcessDb } from '../../../src/infrastructure/steps/postProcessActions';

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
      get(target, prop, receiver) {
        if (prop === 'find') return () => null;
        return Reflect.get(target, prop, receiver);
      }
    });
  }
}

function wire(tables: Record<string, Row[]> = fixtureTables(), options: { strategy?: GeneratorStrategy; registry?: Map<string, GeneratorStrategy>; db?: FakeDatabase } = {}) {
  const db = options.db ?? new FakeDatabase(tables);
  const drive = new FakeDriveFacade();
  const templates = new FakeTemplateEngine();
  const registry = options.registry ?? new Map([['VERBALE_CDC', options.strategy ?? new VerbaleGeneratorStrategy(templates)]]);
  const service = new DocumentGenerationService({
    db: db as unknown as IDatabase & PostProcessDb,
    drive,
    contextBuilder: ContextEngineFactory.create(db),
    strategyRegistry: registry,
    templates,
    expressionEngine: new ExpressionEngineFacade(),
    configs: new ConfigurazioneDocumentoRepository(db),
    roleResolver: new RisolutoreRuoliService(db),
    now: new Date('2026-07-01T09:00:00Z')
  });
  return { db, drive, templates, service };
}

describe('DocumentGenerationService.generateForClasse — error paths', () => {
  test('throws when the CONF_DOC row does not exist', () => {
    const { service } = wire();
    expect(() => service.generateForClasse(ClasseId.of('5A'), 'MISSING_ID')).toThrow(PipelineError);
    expect(() => service.generateForClasse(ClasseId.of('5A'), 'MISSING_ID')).toThrow('CONF_DOC MISSING_ID non trovato');
  });

  test('throws when the configured GENERATORE is not registered in the strategy registry', () => {
    const { service } = wire(fixtureTables(), { registry: new Map() });
    expect(() => service.generateForClasse(ClasseId.of('5A'), 'CD1')).toThrow('GENERATORE non registrato: VERBALE_CDC');
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

  test("returns status 'SKIPPED' when CheckDuplicatesStep prevents a newFileId from being produced", () => {
    const { service } = wire();
    service.generateForClasse(ClasseId.of('5A'), 'CD1');
    const second = service.generateForClasse(ClasseId.of('5A'), 'CD1');
    expect(second).toEqual({ fileId: null, status: 'SKIPPED' });
  });

  test("returns status 'UNKNOWN' when newFileId is set but the LOG_DOCS row can't be found back", () => {
    const db = new LogDocsNeverFoundDatabase(fixtureTables());
    const { service } = wire(fixtureTables(), { db });
    const result = service.generateForClasse(ClasseId.of('5A'), 'CD1');
    expect(result.fileId).not.toBeNull();
    expect(result.status).toBe('UNKNOWN');
  });
});
