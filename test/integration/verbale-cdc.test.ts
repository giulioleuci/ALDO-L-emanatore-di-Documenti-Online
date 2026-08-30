import { DocumentGenerationService } from '../../src/application/services/DocumentGenerationService';
import { DocumentoGenericoGeneratorStrategy } from '../../src/application/strategies/DocumentoGenericoGeneratorStrategy';
import { ConfigurazioneDocumentoRepository } from '../../src/infrastructure/repositories/ConfigurazioneDocumentoRepository';
import {
  composeContextBuilder,
  composeRisolutoreRuoli
} from '../../src/config/ApplicationComposition';
import { ExpressionEngineFacade } from '../../src/infrastructure/facades/ExpressionEngineFacade';
import type { GeneratorStrategy } from '../../src/application/strategies/GeneratorStrategy';
import type { DocumentStrategyFactory } from '../../src/application/factories/DocumentStrategyFactory';
import { FakeDatabase } from '../fakes/FakeDatabase';
import { FakeDriveFacade } from '../fakes/FakeDriveFacade';
import { FakeTemplateEngine } from '../fakes/FakeTemplateEngine';
import { fixtureTables } from '../fixtures/tables';
import { ClasseId } from '../../src/domain/value-objects/ClasseId';
import { COL_LOG_DOCS } from '../../src/config/schema';
import type { Row } from '../../src/infrastructure/db/Database';
import { ClasseRepository } from '../../src/infrastructure/repositories/ClasseRepository';

function wire(tables: Record<string, Row[]> = fixtureTables(), strategy?: GeneratorStrategy) {
  const db = new FakeDatabase(tables);
  const drive = new FakeDriveFacade();
  const templates = new FakeTemplateEngine();
  const service = new DocumentGenerationService({
    db,
    drive,
    contextBuilder: composeContextBuilder(db),
    strategyFactory: {
      resolve: () => strategy ?? new DocumentoGenericoGeneratorStrategy(templates)
    } as unknown as DocumentStrategyFactory,
    templates,
    expressionEngine: new ExpressionEngineFacade(),
    configs: new ConfigurazioneDocumentoRepository(db),
    roleResolver: composeRisolutoreRuoli(db),
    classi: new ClasseRepository(db),
    now: new Date('2026-07-01T09:00:00Z')
  });
  return { db, drive, templates, service };
}

test('generates a Verbale CdC end-to-end (ref 10 full pipeline)', () => {
  const { db, drive, templates, service } = wire();
  const result = service.generateForClasse(ClasseId.of('5A'), 'CD1');

  expect(result.status).toBe('GENERATO');
  expect(result.fileId).not.toBeNull();

  // Drive: folder created + template copied; names rendered by WorkspaceTemplateEngine
  expect(drive.folders.get('Verbali/5')).toBeDefined();
  expect(drive.copies[0]!.templateId).toBe('tmpl_verbale');
  expect(drive.copies[0]!.name).toBe('Verbale_5A_01/07/2026');

  // Document: rendered with the assembled CDU as the template context
  const rendered = templates.contextFor(result.fileId!) as {
    focus: { classe: { nome: string } };
    meta: { oggi: { breve: string } };
  };
  expect(rendered.focus.classe.nome).toBe('5A');
  expect(rendered.meta.oggi.breve).toBe('01/07/2026');

  // LOG_DOCS: audit row persisted with correct columns (ref 01, 10 §11)
  const row = db.table('LOG_DOCS').find((r) => r[COL_LOG_DOCS.ID] === result.fileId);
  expect(row?.[COL_LOG_DOCS.STATO]).toBe('GENERATO');
  expect(row?.[COL_LOG_DOCS.CLASSI]).toBe('5A');
  expect(row?.[COL_LOG_DOCS.TIPO]).toBe('VERBALE');

  // SheetDBLib transaction boundary: exactly one commit, no rollback
  expect(db.committed).toBe(1);
  expect(db.rolledBack).toBe(0);
});

test('second run is deduplicated by CheckDuplicatesStep (10 §4)', () => {
  const { service, db } = wire();
  service.generateForClasse(ClasseId.of('5A'), 'CD1');
  const second = service.generateForClasse(ClasseId.of('5A'), 'CD1');
  expect(second.status).toBe('SKIPPED');
  expect(db.table('LOG_DOCS').findAll()).toHaveLength(1);
});

test('conditional CONF_DOC (CD_ESAME) evaluates CONDIZIONE and conditional MODELLI via the expression engine', () => {
  const tables = fixtureTables();
  // CD_ESAME has FILE_NAME/PATH_OUT null in the fixture; give it renderable values.
  tables.CONF_DOC![1]!.FILE_NAME = 'Esame_{{focus.classe.anagrafica.nome}}';
  tables.CONF_DOC![1]!.PATH_OUT = 'Esami/{{focus.classe.anagrafica.anno}}';
  const { drive, service } = wire(tables);
  const result = service.generateForClasse(ClasseId.of('5A'), 'CD_ESAME');
  expect(result.status).toBe('GENERATO');
  expect(drive.copies[0]!.templateId).toBe('tmpl_esame'); // {{anno}} == 5 entry won
});

test('critical failure rolls back Drive clone and DB transaction (10 §8 + SheetDBLib rollback)', () => {
  const boomStrategy: GeneratorStrategy = {
    render: () => {
      throw new Error('render esploso');
    }
  };
  const { db, drive, service } = wire(fixtureTables(), boomStrategy);
  expect(() => service.generateForClasse(ClasseId.of('5A'), 'CD1')).toThrow(/RenderTemplate/);
  // Drive: the orphan clone was deleted by the onError rollback
  expect(drive.copies).toHaveLength(1);
  expect(drive.deleted).toEqual([drive.copies[0]!.fileId]);
  // DB: LOG_FOLD/LOG_DOCS mutations reverted by the transaction rollback
  expect(db.rolledBack).toBe(1);
  expect(db.committed).toBe(0);
  expect(db.table('LOG_DOCS').findAll()).toHaveLength(0);
  expect(db.table('LOG_FOLD').findAll()).toHaveLength(0);
});

test('applies CONF_DOC.PERMESSI ACLs end-to-end via role resolution (10 §10, 14 §1)', () => {
  const tables = fixtureTables();
  tables.CONF_DOC = tables.CONF_DOC!.map((r) =>
    r.ID === 'CD1'
      ? {
          ...r,
          PERMESSI: JSON.stringify({
            file: [{ ruolo: 'COORDINATORI', permesso: 'SCRITTURA' }],
            folder: [{ ruolo: 'CDC', permesso: 'LETTURA' }],
            regolaSupplente: { file: 'SOLO_TITOLARI', folder: 'SOLO_TITOLARI' }
          })
        }
      : r
  );
  const { db, drive, service } = wire(tables);
  const result = service.generateForClasse(ClasseId.of('5A'), 'CD1');
  expect(result.status).toBe('GENERATO');

  const fileAcls = drive.permissions.filter((p) => p.fileId === result.fileId);
  expect(fileAcls).toEqual([
    { fileId: result.fileId, email: 'rossi@school.it', permesso: 'SCRITTURA' }
  ]);
  const folderId = drive.folders.get('Verbali/5');
  const folderAcls = drive.permissions
    .filter((p) => p.fileId === folderId)
    .map((p) => p.email)
    .sort();
  // 5A's CDC roster is effective-holder-based (14 §1, cattedra-resolution plan): MATE
  // permanently transferred rossi -> bianchi as of 2025-10-01 (VARIAZIONI_CATTEDRA), and
  // this document is generated at 2026-07-01 (well past decorrenza). FISI's nominal
  // holder is already bianchi, so the deduped effective council for 5A is bianchi alone
  // -- rossi is no longer a current teacher of this class for CDC purposes.
  expect(folderAcls).toEqual(['bianchi@school.it']);
  expect(db.table('LOG_DOCS').findAll()).toHaveLength(1);
});
