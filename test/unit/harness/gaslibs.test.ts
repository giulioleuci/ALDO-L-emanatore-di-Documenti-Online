// Harness smoke test: proves the vendored DomainRepositoryLib classes are loaded
// as globals by test/setup/load-gaslibs.cjs and that ALDO can subclass Entity /
// Repository and drive the Repository seam with an in-memory fake. This is the
// foundation every R0+ repository/entity builds on.

interface FooData {
  id?: string;
  x?: number;
}

class Foo extends Entity {
  public x: number | null;
  constructor(data: FooData = {}) {
    super(data);
    this.id = data.id ?? null;
    this.x = data.x ?? null;
  }
  override toData(): EntityData {
    return { id: this.id, x: this.x };
  }
  static fromData(data: FooData): Foo {
    return new Foo(data);
  }
}

class FooRepository extends Repository<Foo> {
  constructor(database: RepositoryDatabase) {
    super(database, 'T', Foo);
  }
}

function fakeDb(): RepositoryDatabase {
  const rows: EntityData[] = [
    { id: 'a', x: 7 },
    { id: 'b', x: 0 }
  ];
  return {
    tables: {
      T: {
        getByPK: (id) => rows.find((r) => r.id === id) ?? null,
        getAllRows: () => rows.slice()
      }
    },
    save: () => undefined
  };
}

test('vendored DomainRepositoryLib classes are available as globals', () => {
  expect(typeof Entity).toBe('function');
  expect(typeof Repository).toBe('function');
  expect(typeof FieldSpecification).toBe('function');
  expect(typeof FunctionSpecification).toBe('function');
  expect(typeof EntityNotFoundException).toBe('function');
});

test('vendored PipelineFramework, WorkspaceTemplateEngine, RoleResolutionLib and JobRunnerLib globals are loaded', () => {
  expect(typeof Pipeline).toBe('function');
  expect(typeof Step).toBe('function');
  expect(typeof PipelineContext).toBe('function');
  expect(typeof PlaceholderService).toBe('function');
  expect(typeof Mustache).toBe('function');
  expect(typeof Delegation).toBe('function');
  expect(typeof InMemoryDelegationSource).toBe('function');
  expect(typeof Scope).toBe('function');
  expect(typeof JobRunnerService).toBe('function');
  expect(typeof JobDefinitionRegistry).toBe('function');
});

test('vendored logger preserves scoped callback results and renders pipeline content before status', () => {
  const logSpy = jest.spyOn(Logger, 'log').mockImplementation(() => undefined);
  const logger = new LoggerService();
  const position: TreePosition = { depth: 1, isLast: true, ancestorHasNext: [false] };

  const callbackResult = logger.withPosition(position, () => 'scoped-result');
  logger.logPipelineStep(
    'GenerateName',
    'EXECUTED',
    { content: 'PDP_DSA_Rossi_Mario_2026', durationMs: 12 },
    position
  );

  expect(callbackResult).toBe('scoped-result');
  expect(logSpy).toHaveBeenCalledWith(
    expect.stringContaining('[GenerateName] PDP_DSA_Rossi_Mario_2026 (EXECUTED in 12ms)')
  );
  logSpy.mockRestore();
});

test('vendored GoogleApiWrapper MailService and ComposableContentLib globals are loaded', () => {
  expect(typeof MailService).toBe('function');
  expect(typeof ContentComposer).toBe('function');
  expect(typeof BlockRegistry).toBe('function');
  expect(typeof RendererRegistry).toBe('function');
  expect(typeof HtmlRenderer).toBe('function');
  expect(typeof SimpleContentBlock).toBe('function');
  expect(typeof CompositionRecipe).toBe('function');
  expect(typeof BlockDataContext).toBe('function');
});

test('ComposableContentLib composes a function-template block end-to-end', () => {
  const blocks = new BlockRegistry({});
  blocks.register({
    definition: { id: 'probe', name: 'Probe', supportedFormats: ['html'] },
    factory: (definition, config) =>
      new SimpleContentBlock(definition, {
        ...config,
        dataExtractor: (ctx) => ctx.get('focus.value'),
        emptyChecker: (d) => d === null,
        templates: { html: 'probe' }
      })
  });
  const renderers = new RendererRegistry({ registerDefaults: false });
  renderers.register(
    new HtmlRenderer({ templates: { probe: (data: unknown) => `<b>${String(data)}</b>` } })
  );
  const composer = new ContentComposer({ blockRegistry: blocks, rendererRegistry: renderers });
  const result = composer.compose(
    { id: 'r', name: 'r', blocks: [{ instanceId: 'p1', blockType: 'probe' }] },
    { focus: { value: 42 } }
  );
  expect(result.content).toBe('<b>42</b>');
});

test('an Entity subclass hydrates and dehydrates', () => {
  const f = Foo.fromData({ id: 'a', x: 7 });
  expect(f.id).toBe('a');
  expect(f.x).toBe(7);
  expect(f.toData()).toEqual({ id: 'a', x: 7 });
});

test('a Repository subclass drives findById/findAll over the fake seam', () => {
  const repo = new FooRepository(fakeDb());
  expect(repo.findById('a')?.x).toBe(7);
  expect(repo.findById('z')).toBeNull();
  expect(repo.findAll()).toHaveLength(2);
});

test('find(FunctionSpecification) filters in memory', () => {
  const repo = new FooRepository(fakeDb());
  const spec = new FunctionSpecification((e) => (e as Foo).x !== null && (e as Foo).x! > 5);
  const found = repo.find(spec);
  expect(found).toHaveLength(1);
  expect(found[0]!.id).toBe('a');
});

test('vendored GasDataImporter globals are loaded', () => {
  expect(typeof ImportEngine).toBe('function');
  expect(typeof ImportConfiguration).toBe('function');
  expect(typeof ImportError).toBe('function');
});

test('vendored DriveService/PermissionService instances expose the real bound API surface', () => {
  // Constructed directly (not via ServiceFactory, which needs a live GAS
  // CacheService) to verify the class shape offline: the constructor binds
  // the fileManager/folderManager/metadataService methods onto the instance.
  const logger = new LoggerService();
  const fakeCache = { get: () => null, put: () => undefined, remove: () => undefined };
  const fakeExceptionService = { executeWithRetry: (fn: () => unknown) => fn() };
  const drive = new DriveService(logger, fakeCache, new UtilsService(), fakeExceptionService);
  expect(typeof drive.deleteFiles).toBe('function');
  expect(typeof drive.copyFiles).toBe('function');
  expect(typeof drive.getFileByIdStandard).toBe('function');
  expect(typeof drive.createFolder).toBe('function');
  expect(typeof drive.getFiles).toBe('function');
  expect(typeof drive.searchFiles).toBe('function');
  expect(typeof drive.getFileOwnerEmail).toBe('function');
  const perms = new PermissionService(logger, fakeCache, new UtilsService(), fakeExceptionService);
  expect(typeof perms.shareWithUsers).toBe('function');
});

test('vendored SpreadsheetService exposes the real bound API surface (Sheet-write generators, 10 §9)', () => {
  // getSheetInfo's real return shape nests row/column counts under
  // gridProperties (not flat rowCount/columnCount) — caught via this same
  // "construct the real class" methodology that found the DriveServiceFacade bug.
  const logger = new LoggerService();
  const fakeCache = { get: () => null, put: () => undefined, remove: () => undefined };
  const fakeExceptionService = { executeWithRetry: (fn: () => unknown) => fn() };
  const sheets = new SpreadsheetService(
    logger,
    fakeCache,
    new UtilsService(),
    fakeExceptionService
  );
  expect(typeof sheets.getSheetInfo).toBe('function');
  expect(typeof sheets.getRanges).toBe('function');
  expect(typeof sheets.updateRanges).toBe('function');
  expect(typeof sheets.appendRows).toBe('function');
  expect(typeof sheets.formatRanges).toBe('function');
  expect(typeof sheets.createSheets).toBe('function');
  expect(typeof sheets.protectRanges).toBe('function');
});

test('vendored DocumentService/SpreadsheetService expose createDocument/createSpreadsheet (blank-artifact creation, no template to clone)', () => {
  const logger = new LoggerService();
  const fakeCache = { get: () => null, put: () => undefined, remove: () => undefined };
  const fakeExceptionService = { executeWithRetry: (fn: () => unknown) => fn() };
  const documents = new DocumentService(
    logger,
    fakeCache,
    new UtilsService(),
    fakeExceptionService
  );
  const sheets = new SpreadsheetService(
    logger,
    fakeCache,
    new UtilsService(),
    fakeExceptionService
  );
  expect(typeof documents.createDocument).toBe('function');
  expect(typeof sheets.createSpreadsheet).toBe('function');
});

test('vendored DocumentService exposes document()/scanDocumentStructure (DOCUMENTO_CON_TABELLE_IMPORTATE, 10 §9)', () => {
  const logger = new LoggerService();
  const fakeCache = { get: () => null, put: () => undefined, remove: () => undefined };
  const fakeExceptionService = { executeWithRetry: (fn: () => unknown) => fn() };
  const documents = new DocumentService(
    logger,
    fakeCache,
    new UtilsService(),
    fakeExceptionService
  );
  expect(typeof documents.document).toBe('function');
  expect(typeof documents.scanDocumentStructure).toBe('function');
  const builder = documents.document('doc1');
  expect(typeof builder.replaceText).toBe('function');
  expect(typeof builder.createTable).toBe('function');
  expect(typeof builder.execute).toBe('function');
});

test('vendored DocumentService exposes openStandard (DriveServiceFacade.getFileText escape hatch, E2E scenario 10)', () => {
  // Confirms the real method name backing DriveServiceFacade.getFileText BEFORE trusting it
  // (GoogleApiWrapper_docs.md only documents the table-insertion helpers, not this native
  // escape hatch) — same "construct the real class" methodology that found the
  // DriveServiceFacade/SpreadsheetService bugs referenced above.
  const logger = new LoggerService();
  const fakeCache = { get: () => null, put: () => undefined, remove: () => undefined };
  const fakeExceptionService = { executeWithRetry: (fn: () => unknown) => fn() };
  const documents = new DocumentService(
    logger,
    fakeCache,
    new UtilsService(),
    fakeExceptionService
  );
  expect(typeof documents.openStandard).toBe('function');
});

test('vendored DocumentBuilder exposes appendParagraph/setText (blank-doc content authoring, e2e templates)', () => {
  const logger = new LoggerService();
  const fakeCache = { get: () => null, put: () => undefined, remove: () => undefined };
  const fakeExceptionService = { executeWithRetry: (fn: () => unknown) => fn() };
  const documents = new DocumentService(
    logger,
    fakeCache,
    new UtilsService(),
    fakeExceptionService
  );
  const builder = documents.document('doc1');
  expect(typeof builder.appendParagraph).toBe('function');
  expect(typeof builder.setText).toBe('function');
  // Chainable, like every other DocumentBuilder op (ref DocumentTableFacade usage).
  expect(builder.appendParagraph('x')).toBe(builder);
});

test('custom SourceStrategy registered via ImportEngine.registerCustomSource works end-to-end (GasLibraryFactory extensibility fix)', () => {
  const logger = new LoggerService();
  const fakeCache = { get: () => null, put: () => undefined, remove: () => undefined };
  const fakeExceptionService = { executeWithRetry: (fn: () => unknown) => fn() };
  const drive = new DriveService(logger, fakeCache, new UtilsService(), fakeExceptionService);
  const sheets = new SpreadsheetService(
    logger,
    fakeCache,
    new UtilsService(),
    fakeExceptionService
  );
  const db = {
    tables: { DEST: { getAllRows: () => [], insertRows: () => undefined } },
    save: () => undefined
  };

  class ProbeSourceStrategy extends SourceStrategy {
    protected _extractData(config: Record<string, unknown>): Record<string, unknown>[] {
      return [{ EMAIL: `probe@${String(config['marker'])}` }];
    }
  }

  const engine = new ImportEngine(logger, drive, sheets, db as unknown as DatabaseService);
  engine.registerCustomSource('ProbeSource', ProbeSourceStrategy);

  let extracted: Record<string, unknown>[] = [];
  engine.runImport(
    {
      name: 'probe',
      source: { type: 'ProbeSource', config: { marker: 'x' } },
      transform: { mapping: { EMAIL: 'EMAIL' } },
      load: { targetTable: 'DEST', conflictResolution: 'INSERT_ONLY' }
    },
    {
      dryRun: true,
      postTransform: (data) => {
        extracted = data;
        return data;
      }
    }
  );
  expect(extracted).toEqual([{ EMAIL: 'probe@x' }]);
});

test('vendored bundle exposes DatasetValidator (Feature 2)', () => {
  const validator = new DatasetValidator();
  const { violations } = validator.validate({ T: [{ A: '', B: 'data' }] }, [
    { id: 'R', type: 'required', table: 'T', columns: ['A'] }
  ]);
  expect(violations).toHaveLength(1);
  expect(violations[0]!.ruleId).toBe('R');
});
