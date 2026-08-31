import { SheetMaterieGeneratorStrategy } from '../../../src/application/strategies/SheetMaterieGeneratorStrategy';
import { SheetMaterieConPermessiGeneratorStrategy } from '../../../src/application/strategies/SheetMaterieConPermessiGeneratorStrategy';
import { RisolutoreRuoliService } from '../../../src/application/services/RisolutoreRuoliService';
import { MateriaRepository } from '../../../src/infrastructure/repositories/MateriaRepository';
import {
  composeContextBuilder,
  composeRisolutoreRuoli,
  composeRisolutoreRuoliDependencies
} from '../../../src/config/ApplicationComposition';
import { recipe } from '../../../src/application/context-engine/Recipe';
import { ConfigurazioneDocumento } from '../../../src/domain/entities/ConfigurazioneDocumento';
import { ConfigurationError } from '../../../src/domain/errors/DomainError';
import { FakeTemplateEngine } from '../../fakes/FakeTemplateEngine';
import { FakeDatabase } from '../../fakes/FakeDatabase';
import { fixtureTables } from '../../fixtures/tables';
import type { Cdu } from '../../../src/application/context-engine/Cdu';
import type { MaterieGroups } from '../../../src/application/strategies/SheetMaterieGeneratorStrategy';
import type { SubjectVM } from '../../../src/application/context-engine/mappers/subjectVmMapper';
import { GeneratoreAxis, GestioneSupplenti } from '../../../src/domain/value-objects/enums';

/** Minimal SubjectVM fixture for articolazione groups — only `sigla` matters to
 * buildGroups (headers/colors are resolved separately from MATERIE), other
 * fields are filled with harmless defaults to satisfy the interface. */
function subjectVm(sigla: string): SubjectVM {
  return {
    sigla,
    nome: sigla,
    nomeSintetico: sigla,
    colore1: '#000000',
    colore2: '#ffffff',
    isMateriaPrimaProva: false,
    isMateriaSecondaProva: false,
    principale: null,
    specificita: null,
    isITP: false,
    evoluzione: null
  };
}

class FakeSpreadsheetService {
  protectCalls: Array<{ range: string; description?: string; editors?: { users?: string[] } }> = [];
  protectOptions: SpreadsheetProtectOptions | undefined;
  constructor(
    private readonly sheets: SpreadsheetSheetInfo[],
    private readonly protectionFailures: SpreadsheetProtectFailure[] = [],
    private readonly returnsFailureList = true
  ) {}
  getSheetInfo(): SpreadsheetSheetInfo[] {
    return this.sheets;
  }
  getRanges(): unknown[][] {
    throw new Error('not used by these strategies anymore (column placement is template-driven)');
  }
  updateRanges(): SpreadsheetUpdateResult {
    throw new Error('not used by these strategies anymore (column placement is template-driven)');
  }
  appendRows(): unknown {
    throw new Error('not used by these strategies');
  }
  formatRanges(): unknown {
    throw new Error('not used by these strategies');
  }
  createSheets(): unknown {
    throw new Error('not used by these strategies');
  }
  protectRanges(
    _id: string,
    requests: SpreadsheetProtectRequest | SpreadsheetProtectRequest[],
    options?: SpreadsheetProtectOptions
  ): SpreadsheetProtectResult | SpreadsheetProtectBestEffortResult {
    const arr = Array.isArray(requests) ? requests : [requests];
    this.protectCalls.push(...arr);
    this.protectOptions = options;
    return {
      spreadsheetId: 'sheet1',
      protectedCount: arr.length,
      protectedRangeIds: arr.map((_, i) => i),
      replies: [],
      ...(this.returnsFailureList ? { failures: this.protectionFailures } : {})
    };
  }
}

class RecordingRisolutoreRuoliService extends RisolutoreRuoliService {
  readonly subjectCduVariants: Cdu[] = [];
  readonly roleCalls: string[] = [];
  readonly calls: Array<Parameters<RisolutoreRuoliService['risolvi']>> = [];

  override risolvi(
    ...args: Parameters<RisolutoreRuoliService['risolvi']>
  ): ReturnType<RisolutoreRuoliService['risolvi']> {
    const [ruolo, cdu] = args;
    this.calls.push(args);
    this.roleCalls.push(ruolo);
    if (ruolo === 'DOCENTE_MATERIA') this.subjectCduVariants.push(cdu);
    return super.risolvi(...args);
  }
}

function sheetInfo(name = 'Sheet1', rowCount = 20, columnCount = 10): SpreadsheetSheetInfo[] {
  return [{ name, sheetId: 0, index: 0, hidden: false, gridProperties: { rowCount, columnCount } }];
}

function confDoc(
  _generatore: string,
  parametri: Record<string, unknown> | null = null,
  permessi: Record<string, unknown> | null = null
): ConfigurazioneDocumento {
  return ConfigurazioneDocumento.fromData({
    ID: 'CD_MAT',
    TIPO: 'GRIGLIA',
    GENERATORE: GeneratoreAxis.CLASSE,
    CONDIZIONE: null,
    MODELLI: '{"templateId":"tmpl"}',
    FILE_NAME: 'x',
    PATH_OUT: 'x',
    DUPLICAZIONE: 'NEGATA',
    PERMESSI: permessi === null ? null : JSON.stringify(permessi),
    POST_PROCESSO: null,
    PARAMETRI: parametri === null ? null : JSON.stringify(parametri),
    GESTIONE_ARTICOLAZIONE: 'COMPLETA',
    FORMATO: 'GSHEET'
  });
}

/** Builds a realistic CDU through the shared teaching-assignment port. */
function buildCdu(db: FakeDatabase, classeId: string): Cdu {
  return composeContextBuilder(db).build(
    {
      target: classeId,
      tipoTarget: 'classe',
      now: new Date('2026-07-09'),
      configurazioneId: 'CD_MAT',
      tipoOperazione: 'GENERAZIONE_DOCUMENTO',
      esecuzioneId: 'e1'
    },
    recipe('CLASSE_COMPLETA')
  );
}

describe('SheetMaterieGeneratorStrategy (10 §9)', () => {
  test('places one dynamic_columns group entry per class subject, header = MATERIE.SINTESI, in sorted order', () => {
    const db = new FakeDatabase(fixtureTables());
    const cdu = buildCdu(db, '5A');
    const sheets = new FakeSpreadsheetService(sheetInfo());
    const templates = new FakeTemplateEngine();
    const strategy = new SheetMaterieGeneratorStrategy(
      sheets,
      new MateriaRepository(db),
      templates
    );

    strategy.render('file_1', cdu, confDoc('SHEET_CON_MATERIE'));

    const context = templates.sheetContextFor('file_1');
    const groups = (context?.['focus'] as Cdu['focus']).classe?.sheet?.materieColonne.gruppi;
    expect(groups?.[0]?.colonne).toEqual([
      { sigla: 'FISI', header: 'Fisica', isSpeciale: false, ruoli: [] },
      { sigla: 'MATE', header: 'Matematica', isSpeciale: false, ruoli: [] }
    ]);
    expect(groups?.[1]?.colonne).toEqual([]);
    expect(groups?.[2]?.colonne).toEqual([]);
  });

  test('CONF_DOC.PARAMETRI.sheetName selects the target sheet/tab', () => {
    const db = new FakeDatabase(fixtureTables());
    const cdu = buildCdu(db, '5A');
    const sheets = new FakeSpreadsheetService(sheetInfo('Voti'));
    const templates = new FakeTemplateEngine();
    const strategy = new SheetMaterieGeneratorStrategy(
      sheets,
      new MateriaRepository(db),
      templates
    );

    strategy.render('file_1', cdu, confDoc('SHEET_CON_MATERIE', { sheetName: 'Voti' }));

    expect(templates.renderedSheets).toHaveLength(1);
    expect(templates.renderedSheets[0]?.sheetId).toBe('file_1');
    expect(templates.renderedSheets[0]?.sheetName).toBe('Voti');
  });

  test('renders the sheet exactly once — column expansion and generic substitution share a single processSheet call', () => {
    const db = new FakeDatabase(fixtureTables());
    const cdu = buildCdu(db, '5A');
    const sheets = new FakeSpreadsheetService(sheetInfo());
    const templates = new FakeTemplateEngine();
    const strategy = new SheetMaterieGeneratorStrategy(
      sheets,
      new MateriaRepository(db),
      templates
    );

    strategy.render('file_1', cdu, confDoc('SHEET_CON_MATERIE'));

    expect(templates.renderedSheets).toHaveLength(1);
    const context = templates.sheetContextFor('file_1');
    const focus = context?.['focus'] as { classe?: { nome?: string } } | undefined;
    expect(focus?.classe?.nome).toBe('5A');
  });

  test('throws a ConfigurationError when the CDU has no focus.classe', () => {
    const db = new FakeDatabase(fixtureTables());
    const sheets = new FakeSpreadsheetService(sheetInfo());
    const strategy = new SheetMaterieGeneratorStrategy(
      sheets,
      new MateriaRepository(db),
      new FakeTemplateEngine()
    );
    const cdu = {
      meta: {},
      focus: {},
      tech: {
        entita: {},
        servizi: [],
        pipeline: { statoCorrente: '', stepEseguiti: [], errori: [], logEsecuzione: [] }
      }
    } as unknown as Cdu;

    expect(() => strategy.render('file_1', cdu, confDoc('SHEET_CON_MATERIE'))).toThrow(
      ConfigurationError
    );
  });

  test('throws a ConfigurationError when the configured sheet name does not exist', () => {
    const db = new FakeDatabase(fixtureTables());
    const cdu = buildCdu(db, '5A');
    const sheets = new FakeSpreadsheetService(sheetInfo('Sheet1'));
    const strategy = new SheetMaterieGeneratorStrategy(
      sheets,
      new MateriaRepository(db),
      new FakeTemplateEngine()
    );

    expect(() =>
      strategy.render('file_1', cdu, confDoc('SHEET_CON_MATERIE', { sheetName: 'Assente' }))
    ).toThrow(ConfigurationError);
  });

  test('articulated class: shared subjects first, then each partner group with its own label (10 §9)', () => {
    const db = new FakeDatabase(fixtureTables());
    const cdu = buildCdu(db, '1F');
    const sheets = new FakeSpreadsheetService(sheetInfo());
    const templates = new FakeTemplateEngine();
    const strategy = new SheetMaterieGeneratorStrategy(
      sheets,
      new MateriaRepository(db),
      templates
    );

    strategy.render('file_1', cdu, confDoc('SHEET_CON_MATERIE'));

    const groups = (templates.sheetContextFor('file_1')?.['focus'] as Cdu['focus']).classe?.sheet?.materieColonne.gruppi!;
    expect(groups[0]!.colonne).toEqual([{ sigla: 'MATE', header: 'Matematica', isSpeciale: false, ruoli: [] }]);
    expect(groups[1]!.colonne).toEqual([{ sigla: 'FISI', header: 'Fisica', isSpeciale: false, ruoli: [] }]);
    expect(groups[1]!.label).toBe('1F-LSO');
    expect(groups[2]!.colonne).toEqual([{ sigla: 'FISI', header: 'Fisica', isSpeciale: false, ruoli: [] }]);
    expect(groups[2]!.label).toBe('1F-LSS');
  });

  test('articulated class exposes empty dynamic-column arrays when partner groups have no subjects', () => {
    const db = new FakeDatabase(fixtureTables());
    const cdu = buildCdu(db, '1F');
    cdu.focus.classe!.articolazione!.materieSeparatePrimo = [];
    cdu.focus.classe!.articolazione!.materieSeparateSecondo = [];
    const templates = new FakeTemplateEngine();
    const strategy = new SheetMaterieGeneratorStrategy(
      new FakeSpreadsheetService(sheetInfo()),
      new MateriaRepository(db),
      templates
    );

    strategy.render('file_1', cdu, confDoc('SHEET_CON_MATERIE'));

    const groups = (templates.sheetContextFor('file_1')?.['focus'] as Cdu['focus']).classe?.sheet?.materieColonne.gruppi!;
    expect(groups[0]!.colonne).toEqual([{ sigla: 'MATE', header: 'Matematica', isSpeciale: false, ruoli: [] }]);
    expect(groups[1]!.colonne).toEqual([]);
    expect(groups[2]!.colonne).toEqual([]);
    expect(groups[1]!.label).toBe('');
    expect(groups[2]!.label).toBe('');
  });
});

describe('SheetMaterieConPermessiGeneratorStrategy (10 §9)', () => {
  test('renders and protects one column per subject specificity using catalog SINTESI', () => {
    const tables = fixtureTables();
    tables.CLASSI!.push({
      ID: '5LAB',
      ANNO: 5,
      INDIRIZZO: 'SCIENTIFICO',
      ARTICOLAZIONE: null,
      RUOLI: null,
      ATTIVA: true,
      COORD: 'rossi@school.it',
      'LAB.GRUPPO_A': 'docente-a@school.it',
      'LAB.GRUPPO_B': 'docente-b@school.it'
    });
    tables.DOCENTI!.push(
      {
        EMAIL: 'docente-a@school.it',
        COGNOME: 'DOCENTE',
        NOME: 'A',
        GENERE: 'F',
        DIPART: 'SCIENTIFICO_DIP',
        ITP: false
      },
      {
        EMAIL: 'docente-b@school.it',
        COGNOME: 'DOCENTE',
        NOME: 'B',
        GENERE: 'M',
        DIPART: 'SCIENTIFICO_DIP',
        ITP: false
      }
    );
    const db = new FakeDatabase(tables);
    const cdu = buildCdu(db, '5LAB');
    const sheets = new FakeSpreadsheetService(sheetInfo());
    const roles = new RecordingRisolutoreRuoliService(
      composeRisolutoreRuoliDependencies(db)
    );
    const templates = new FakeTemplateEngine();
    const strategy = new SheetMaterieConPermessiGeneratorStrategy(
      sheets,
      new MateriaRepository(db),
      templates,
      roles
    );

    strategy.render('file_1', cdu, confDoc('SHEET_CON_MATERIE_E_PERMESSI'));

    const groups = (templates.sheetContextFor('file_1')?.['focus'] as Cdu['focus']).classe?.sheet?.materieColonne.gruppi!;
    expect(groups[0]!.colonne.filter((item) => !item.isSpeciale)).toEqual([
      { sigla: 'LAB', header: 'Lab A', isSpeciale: false, ruoli: [] },
      { sigla: 'LAB', header: 'Lab B', isSpeciale: false, ruoli: [] }
    ]);
    expect(sheets.protectCalls.find((r) => r.range === 'Sheet1!B:B')?.editors?.users).toEqual(
      expect.arrayContaining(['docente-a@school.it'])
    );
    expect(sheets.protectCalls.find((r) => r.range === 'Sheet1!C:C')?.editors?.users).toEqual(
      expect.arrayContaining(['docente-b@school.it'])
    );
    expect(roles.subjectCduVariants.map((v) => v.meta.materiaCorrente)).toEqual([
      'LAB',
      'LAB'
    ]);
  });

  test('keeps MAIN and ITP teachers on one non-specific subject column', () => {
    const tables = fixtureTables();
    tables.CLASSI!.push({
      ID: '5LAB_KINDS',
      ANNO: 5,
      INDIRIZZO: 'SCIENTIFICO',
      ARTICOLAZIONE: null,
      RUOLI: null,
      ATTIVA: true,
      COORD: 'rossi@school.it',
      LAB: 'docente-main@school.it',
      'LAB.itp': 'docente-itp@school.it'
    });
    tables.DOCENTI!.push(
      {
        EMAIL: 'docente-main@school.it',
        COGNOME: 'DOCENTE',
        NOME: 'MAIN',
        GENERE: 'F',
        DIPART: 'SCIENTIFICO_DIP',
        ITP: false
      },
      {
        EMAIL: 'docente-itp@school.it',
        COGNOME: 'DOCENTE',
        NOME: 'ITP',
        GENERE: 'M',
        DIPART: 'SCIENTIFICO_DIP',
        ITP: true
      }
    );
    const db = new FakeDatabase(tables);
    const cdu = buildCdu(db, '5LAB_KINDS');
    const sheets = new FakeSpreadsheetService(sheetInfo());
    const strategy = new SheetMaterieConPermessiGeneratorStrategy(
      sheets,
      new MateriaRepository(db),
      new FakeTemplateEngine(),
      composeRisolutoreRuoli(db)
    );

    strategy.render('file_1', cdu, confDoc('SHEET_CON_MATERIE_E_PERMESSI'));

    expect(sheets.protectCalls.find((r) => r.range === 'Sheet1!B:B')?.editors?.users).toEqual(
      expect.arrayContaining(['docente-main@school.it', 'docente-itp@school.it'])
    );
  });

  test('keeps the rendered sheet when a legacy protection result has no failures field', () => {
    const db = new FakeDatabase(fixtureTables());
    const cdu = buildCdu(db, '5A');
    const sheets = new FakeSpreadsheetService(sheetInfo(), [], false);
    const templates = new FakeTemplateEngine();
    const strategy = new SheetMaterieConPermessiGeneratorStrategy(
      sheets,
      new MateriaRepository(db),
      templates,
      composeRisolutoreRuoli(db)
    );

    strategy.render('file_1', cdu, confDoc('SHEET_CON_MATERIE_E_PERMESSI'));

    expect(templates.renderedSheets).toHaveLength(1);
  });

  test('keeps the rendered sheet when a returned range protection failure is continued', () => {
    const db = new FakeDatabase(fixtureTables());
    const cdu = buildCdu(db, '5A');
    const sheets = new FakeSpreadsheetService(sheetInfo(), [
      {
        request: { range: 'Sheet1!B:B', editors: { users: ['rossi@school.it'] } },
        message: 'Invalid protected-range editor'
      }
    ]);
    const templates = new FakeTemplateEngine();
    const warn = jest.spyOn(LoggerService.prototype, 'warn');
    const strategy = new SheetMaterieConPermessiGeneratorStrategy(
      sheets,
      new MateriaRepository(db),
      templates,
      composeRisolutoreRuoli(db)
    );

    strategy.render('file_1', cdu, confDoc('SHEET_CON_MATERIE_E_PERMESSI'));

    expect(templates.renderedSheets).toHaveLength(1);
    expect(sheets.protectOptions).toEqual({ onError: 'continue' });
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('Sheet1!B:B')
    );
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('Invalid protected-range editor')
    );
  });

  test('protects each subject column for its resolved teacher(s) + the coordinator, skipping group-label columns', () => {
    const db = new FakeDatabase(fixtureTables());
    const cdu = buildCdu(db, '5A');
    const sheets = new FakeSpreadsheetService(sheetInfo());
    const roles = new RecordingRisolutoreRuoliService(
      composeRisolutoreRuoliDependencies(db)
    );
    const templates = new FakeTemplateEngine();
    const strategy = new SheetMaterieConPermessiGeneratorStrategy(
      sheets,
      new MateriaRepository(db),
      templates,
      roles
    );

    expect(Object.keys(cdu)).not.toContain('tech');
    strategy.render('file_1', cdu, confDoc('SHEET_CON_MATERIE_E_PERMESSI'));

    expect(cdu.focus.classe?.sheet?.materieConPermessi.elenco.map((item) => item.sigla)).toEqual([
      'REL',
      'FISI',
      'MATE'
    ]);
    const renderedGroups = (templates.sheetContextFor('file_1')?.['focus'] as Cdu['focus']).classe?.sheet?.materieColonne.gruppi!;
    expect(renderedGroups[0]!.colonne[0]).toMatchObject({
      sigla: 'REL',
      header: 'REL',
      isSpeciale: true,
      ruoli: ['IRC']
    });
    expect(roles.roleCalls).toContain('DOCENTI_IRC_ALT');
    // A=REL, then ordinary columns alphabetically: B=Fisica, C=Matematica.
    const colB = sheets.protectCalls.find((r) => r.range === 'Sheet1!B:B');
    const colC = sheets.protectCalls.find((r) => r.range === 'Sheet1!C:C');
    expect(colB?.editors?.users?.sort()).toEqual(['bianchi@school.it', 'rossi@school.it']);
    expect(colC?.editors?.users?.sort()).toEqual(['bianchi@school.it', 'rossi@school.it']);
    expect(
      roles.subjectCduVariants.map((variant) => variant.meta.materiaCorrente)
    ).toEqual(['FISI', 'MATE']);
    for (const variant of roles.subjectCduVariants) {
      expect(Object.getOwnPropertyDescriptor(variant, 'tech')).toMatchObject({
        enumerable: false,
        writable: true,
        configurable: true,
        value: cdu.tech
      });
      expect(JSON.stringify(variant)).not.toContain('tech');
    }
    expect(cdu.meta.materiaCorrente).toBeNull();
  });

  test('non tenta la protezione quando ogni editor di colonna è un principal sintetico', () => {
    const tables = fixtureTables();
    const classi = tables['CLASSI'] as Array<Record<string, unknown>>;
    const classe5A = classi.find((row) => row['ID'] === '5A')!;
    // Every source of editors for 5A's dynamic columns (coordinator, MATE, FISI, and the
    // IRC/ALT special column) resolves to the same synthetic principal, so every protection
    // request ends up all-synthetic and the strategy must skip all of them.
    classe5A['COORD'] = 'e2edocente1@onlinetest.aldo.local';
    classe5A['IRC'] = 'e2edocente1@onlinetest.aldo.local';
    classe5A['MATE'] = 'e2edocente1@onlinetest.aldo.local';
    classe5A['FISI'] = 'e2edocente1@onlinetest.aldo.local';
    (tables['DOCENTI'] as Array<Record<string, unknown>>).push({
      EMAIL: 'e2edocente1@onlinetest.aldo.local',
      COGNOME: 'SINTETICO',
      NOME: 'E2E',
      GENERE: 'M',
      DIPART: 'SCIENTIFICO_DIP',
      ITP: false
    });
    const db = new FakeDatabase(tables);
    const cdu = buildCdu(db, '5A');
    const sheets = new FakeSpreadsheetService(sheetInfo());
    const warn = jest.spyOn(LoggerService.prototype, 'warn');
    const strategy = new SheetMaterieConPermessiGeneratorStrategy(
      sheets,
      new MateriaRepository(db),
      new FakeTemplateEngine(),
      composeRisolutoreRuoli(db)
    );

    strategy.render('file_1', cdu, confDoc('SHEET_CON_MATERIE_E_PERMESSI'));

    expect(sheets.protectCalls).toHaveLength(0);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('principal sintetici'));
  });

  test('protegge normalmente quando almeno un editor è reale', () => {
    const db = new FakeDatabase(fixtureTables());
    const cdu = buildCdu(db, '5A');
    const sheets = new FakeSpreadsheetService(sheetInfo());
    const strategy = new SheetMaterieConPermessiGeneratorStrategy(
      sheets,
      new MateriaRepository(db),
      new FakeTemplateEngine(),
      composeRisolutoreRuoli(db)
    );

    strategy.render('file_1', cdu, confDoc('SHEET_CON_MATERIE_E_PERMESSI'));

    // One protect call per rendered column for 5A: A=REL (special), B=Fisica, C=Matematica.
    expect(sheets.protectCalls.map((c) => c.range)).toEqual([
      'Sheet1!A:A',
      'Sheet1!B:B',
      'Sheet1!C:C'
    ]);
  });

  test('uses PERMESSI.regolaSupplente.file for protected ranges even when PARAMETRI conflicts', () => {
    const db = new FakeDatabase(fixtureTables());
    const cdu = buildCdu(db, '5A');
    const sheets = new FakeSpreadsheetService(sheetInfo());
    const roles = new RecordingRisolutoreRuoliService(
      composeRisolutoreRuoliDependencies(db)
    );
    const strategy = new SheetMaterieConPermessiGeneratorStrategy(
      sheets,
      new MateriaRepository(db),
      new FakeTemplateEngine(),
      roles
    );

    strategy.render(
      'file_1',
      cdu,
      confDoc('SHEET_CON_MATERIE_E_PERMESSI', {
        gestioneSupplenti: 'SOLO_TITOLARI'
      }, {
        regolaSupplente: { file: 'SOLO_SUPPLENTI' }
      })
    );

    const routed = roles.calls.filter(([role]) =>
      ['DOCENTE_MATERIA', 'DOCENTI_IRC_ALT'].includes(role)
    );
    expect(routed.map(([role]) => role)).toEqual([
      'DOCENTI_IRC_ALT',
      'DOCENTE_MATERIA',
      'DOCENTE_MATERIA'
    ]);
    expect(
      routed.every(
        ([, , options]) => options?.regolaSupplente === GestioneSupplenti.SOLO_SUPPLENTI
      )
    ).toBe(true);
  });

  test('defaults protected-range routing to ENTRAMBI when PERMESSI.regolaSupplente is absent', () => {
    const db = new FakeDatabase(fixtureTables());
    const cdu = buildCdu(db, '5A');
    const roles = new RecordingRisolutoreRuoliService(
      composeRisolutoreRuoliDependencies(db)
    );
    const strategy = new SheetMaterieConPermessiGeneratorStrategy(
      new FakeSpreadsheetService(sheetInfo()),
      new MateriaRepository(db),
      new FakeTemplateEngine(),
      roles
    );

    strategy.render('file_1', cdu, confDoc('SHEET_CON_MATERIE_E_PERMESSI'));

    const routed = roles.calls.filter(([role]) =>
      ['DOCENTE_MATERIA', 'DOCENTI_IRC_ALT'].includes(role)
    );
    expect(routed.map(([role]) => role)).toEqual([
      'DOCENTI_IRC_ALT',
      'DOCENTE_MATERIA',
      'DOCENTE_MATERIA'
    ]);
    expect(
      routed.every(([, , options]) => options?.regolaSupplente === GestioneSupplenti.ENTRAMBI)
    ).toBe(true);
  });

  test('a class with no CDC subjects protects nothing (no protectRanges call)', () => {
    const db = new FakeDatabase(fixtureTables());
    const cdu = buildCdu(db, '3B');
    // 3B is inactive but still has a MATE column in the fixture; force an empty CDC to exercise the guard.
    cdu.focus.classe!.consiglio?.elenco = [];
    const sheets = new FakeSpreadsheetService(sheetInfo());
    const strategy = new SheetMaterieConPermessiGeneratorStrategy(
      sheets,
      new MateriaRepository(db),
      new FakeTemplateEngine(),
      composeRisolutoreRuoli(db)
    );

    strategy.render('file_1', cdu, confDoc('SHEET_CON_MATERIE_E_PERMESSI'));

    expect(sheets.protectCalls).toEqual([]);
  });

  test('articulated class: label columns get no ACL, partner-specific columns are protected by their own teacher', () => {
    const db = new FakeDatabase(fixtureTables());
    const cdu = buildCdu(db, '1F');
    const sheets = new FakeSpreadsheetService(sheetInfo());
    const templates = new FakeTemplateEngine();
    const strategy = new SheetMaterieConPermessiGeneratorStrategy(
      sheets,
      new MateriaRepository(db),
      templates,
      composeRisolutoreRuoli(db)
    );

    strategy.render('file_1', cdu, confDoc('SHEET_CON_MATERIE_E_PERMESSI'));

    // column layout order: A=REL/ALT, B=MATE (group1), C=label(1F-LSO, no ACL),
    // D=FISI (group2), E=label(1F-LSS, no ACL), F=FISI (group3)
    expect(sheets.protectCalls.map((r) => r.range).sort()).toEqual([
      'Sheet1!A:A',
      'Sheet1!B:B',
      'Sheet1!D:D',
      'Sheet1!F:F'
    ]);
    const groups = (templates.sheetContextFor('file_1')?.['focus'] as Cdu['focus']).classe?.sheet?.materieColonne.gruppi!;
    expect(groups[1]!.colonne).toEqual([{ sigla: 'FISI', header: 'Fisica', isSpeciale: false, ruoli: [] }]);
    expect(groups[2]!.colonne).toEqual([{ sigla: 'FISI', header: 'Fisica', isSpeciale: false, ruoli: [] }]);
    expect(
      sheets.protectCalls.find((request) => request.range === 'Sheet1!D:D')?.editors?.users?.sort()
    ).toEqual(['bianchi@school.it', 'rossi@school.it']);
    expect(
      sheets.protectCalls.find((request) => request.range === 'Sheet1!F:F')?.editors?.users?.sort()
    ).toEqual(['rossi@school.it', 'verdi@school.it']);
  });

  test('a subject shared by both articulated partners is rendered once with its shared ACL', () => {
    const tables = fixtureTables();
    const lss = tables.CLASSI!.find((row) => row.ID === '1F-LSS')!;
    lss.FISI = 'bianchi@school.it';
    const db = new FakeDatabase(tables);
    const cdu = buildCdu(db, '1F');
    const sheets = new FakeSpreadsheetService(sheetInfo());
    const strategy = new SheetMaterieConPermessiGeneratorStrategy(
      sheets,
      new MateriaRepository(db),
      new FakeTemplateEngine(),
      composeRisolutoreRuoli(db)
    );

    strategy.render('file_1', cdu, confDoc('SHEET_CON_MATERIE_E_PERMESSI'));

    expect(
      sheets.protectCalls.find((request) => request.range === 'Sheet1!C:C')?.editors?.users?.sort()
    ).toEqual(['rossi@school.it']);
  });

  test('attaches the rendered column groups onto focus.classe.sheet.materieColonne', () => {
    const db = new FakeDatabase(fixtureTables());
    const cdu = buildCdu(db, '1F');
    const sheets = new FakeSpreadsheetService(sheetInfo());
    const strategy = new SheetMaterieConPermessiGeneratorStrategy(
      sheets,
      new MateriaRepository(db),
      new FakeTemplateEngine(),
      composeRisolutoreRuoli(db)
    );

    strategy.render('file_1', cdu, confDoc('SHEET_CON_MATERIE_E_PERMESSI'));

    const gruppi = cdu.focus.classe!.sheet!.materieColonne.gruppi;
    expect(gruppi[0]!.colonne[0]).toMatchObject({ isSpeciale: true });
    expect(gruppi[1]!.label).toBe('1F-LSO');

    // Finding 3 fix: group2/group3 come from articolazione columns, which carry
    // `classeId` (partner class) internally -- confirm it (and `specificita`/`kind`,
    // never set here but part of the same leak) never reaches the printable
    // classe.sheet.materieColonne contract (02 §4.1 / Cdu.ts CduClasse['sheet']),
    // even though buildGroups()'s own internal return value legitimately carries it.
    const printableColumns = [
      ...gruppi.flatMap((gruppo) => gruppo.colonne)
    ];
    expect(printableColumns).toEqual([
      { sigla: 'REL', header: 'REL', isSpeciale: true, ruoli: ['IRC'] },
      { sigla: 'MATE', header: 'Matematica', isSpeciale: false, ruoli: [] },
      { sigla: 'FISI', header: 'Fisica', isSpeciale: false, ruoli: [] },
      { sigla: 'FISI', header: 'Fisica', isSpeciale: false, ruoli: [] }
    ]);
    for (const column of printableColumns) {
      expect(Object.keys(column).sort()).toEqual(['header', 'isSpeciale', 'ruoli', 'sigla']);
    }
    expect(JSON.stringify(cdu.focus.classe!.sheet)).not.toContain('classeId');
  });
});
