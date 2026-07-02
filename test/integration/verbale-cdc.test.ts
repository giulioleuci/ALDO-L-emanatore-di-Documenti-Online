import { DocumentGenerationService } from '../../src/application/services/DocumentGenerationService';
import { ClasseRepository } from '../../src/infrastructure/repositories/ClasseRepository';
import { ContextBuilder } from '../../src/application/context/ContextBuilder';
import { VerbaleGeneratorStrategy } from '../../src/application/strategies/VerbaleGeneratorStrategy';
import { FakeDatabase } from '../fakes/FakeDatabase';
import { FakeDriveFacade } from '../fakes/FakeDriveFacade';
import { FakeDocumentFacade } from '../fakes/FakeDocumentFacade';
import { fixtureTables } from '../fixtures/tables';
import { ClasseId } from '../../src/domain/value-objects/ClasseId';
import { COL_LOG_DOCS } from '../../src/config/schema';

function wire() {
  const db = new FakeDatabase(fixtureTables());
  const drive = new FakeDriveFacade();
  const doc = new FakeDocumentFacade();
  const repo = new ClasseRepository(db);
  const builder = new ContextBuilder(repo, new Date('2026-07-01T09:00:00Z'));
  const registry = new Map([['VERBALE_CDC', new VerbaleGeneratorStrategy(doc)]]);
  const service = new DocumentGenerationService(db, drive, builder, registry);
  return { db, drive, doc, service };
}

test('generates a Verbale CdC end-to-end (ref 10 full pipeline)', () => {
  const { db, drive, doc, service } = wire();
  const result = service.generateForClasse(ClasseId.of('5A'), 'CD1');

  expect(result.status).toBe('GENERATO');
  expect(result.fileId).not.toBeNull();

  // Drive: folder created + template copied
  expect(drive.folders.get('Verbali/5')).toBeDefined();
  expect(drive.copies[0]!.templateId).toBe('tmpl_verbale');
  expect(drive.copies[0]!.name).toBe('Verbale_5A_01/07/2026');

  // Document: placeholders rendered from CDU
  const repl = doc.replacementsFor(result.fileId!);
  expect(repl['{{focus.classe.anagrafica.nome}}']).toBe('5A');

  // LOG_DOCS: audit row persisted with correct columns (ref 01, 10 §11)
  const row = db.table('LOG_DOCS').find((r) => r[COL_LOG_DOCS.ID] === result.fileId);
  expect(row?.[COL_LOG_DOCS.STATO]).toBe('GENERATO');
  expect(row?.[COL_LOG_DOCS.CLASSI]).toBe('5A');
  expect(row?.[COL_LOG_DOCS.TIPO]).toBe('VERBALE');
});

test('second run is deduplicated by CheckDuplicatesStep (10 §4)', () => {
  const { service, db } = wire();
  service.generateForClasse(ClasseId.of('5A'), 'CD1');
  const second = service.generateForClasse(ClasseId.of('5A'), 'CD1');
  expect(second.status).toBe('SKIPPED');
  expect(db.table('LOG_DOCS').findAll()).toHaveLength(1);
});
