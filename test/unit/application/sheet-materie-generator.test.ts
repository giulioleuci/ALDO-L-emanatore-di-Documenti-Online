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

  override risolvi(
    ...args: Parameters<RisolutoreRuoliService['risolvi']>
  ): ReturnType<RisolutoreRuoliService['risolvi']> {
    const [ruolo, cdu] = args;
    this.roleCalls.push(ruolo);
    if (ruolo === 'DOCENTE_MATERIA') this.subjectCduVariants.push(cdu);
    return super.risolvi(...args);
  }
}

function sheetInfo(name = 'Sheet1', rowCount = 20, columnCount = 10): SpreadsheetSheetInfo[] {
  return [{ name, sheetId: 0, index: 0, hidden: false, gridProperties: { rowCount, columnCount } }];
}

function confDoc(
  generatore: string,
  parametri: Record<string, unknown> | null = null
): ConfigurazioneDocumento {
  return ConfigurazioneDocumento.fromData({
    ID: 'CD_MAT',
    TIPO: 'GRIGLIA',
    GENERATORE: generatore,
    CONDIZIONE: null,
    MODELLI: '{"templateId":"tmpl"}',
    FILE_NAME: 'x',
    PATH_OUT: 'x',
    DUPLICAZIONE: 'NEGATA',
    PERMESSI: null,
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
      idConfigurazione: 'CD_MAT',
      tipoOperazione: 'GENERAZIONE_DOCUMENTO',
      idEsecuzione: 'e1'
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
    const groups = context?.['materieColonne'] as MaterieGroups;
    expect(groups.group1).toEqual([
      { sigla: 'FISI', header: 'Fisica' },
      { sigla: 'MATE', header: 'Matematica' }
    ]);
    expect(groups.group2).toEqual([]);
    expect(groups.group3).toEqual([]);
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
    expect(context?.['focus']).toBeDefined();
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
    cdu.focus.classe!.articolazione = {
      partner: null,
      partners: ['1F-LSO', '1F-LSS'],
      parent: null,
      materieCondivise: [subjectVm('MATE')],
      materieSeparatePrimoGruppo: [subjectVm('FISI')],
      materieSeparateSecondoGruppo: [subjectVm('FISI')]
    };
    const sheets = new FakeSpreadsheetService(sheetInfo());
    const templates = new FakeTemplateEngine();
    const strategy = new SheetMaterieGeneratorStrategy(
      sheets,
      new MateriaRepository(db),
      templates
    );

    strategy.render('file_1', cdu, confDoc('SHEET_CON_MATERIE'));

    const groups = templates.sheetContextFor('file_1')?.['materieColonne'] as MaterieGroups;
    expect(groups.group1).toEqual([{ sigla: 'MATE', header: 'Matematica' }]);
    expect(groups.group2).toEqual([{ sigla: 'FISI', header: 'Fisica', classeId: '1F-LSO' }]);
    expect(groups.group2Label).toBe('1F-LSO');
    expect(groups.group3).toEqual([{ sigla: 'FISI', header: 'Fisica', classeId: '1F-LSS' }]);
    expect(groups.group3Label).toBe('1F-LSS');
  });

  test('articulated class exposes empty dynamic-column arrays when partner groups have no subjects', () => {
    const db = new FakeDatabase(fixtureTables());
    const cdu = buildCdu(db, '1F');
    cdu.focus.classe!.articolazione = {
      partner: null,
      partners: ['1F-LSO', '1F-LSS'],
      parent: null,
      materieCondivise: [subjectVm('MATE')],
      materieSeparatePrimoGruppo: [],
      materieSeparateSecondoGruppo: []
    };
    const templates = new FakeTemplateEngine();
    const strategy = new SheetMaterieGeneratorStrategy(
      new FakeSpreadsheetService(sheetInfo()),
      new MateriaRepository(db),
      templates
    );

    strategy.render('file_1', cdu, confDoc('SHEET_CON_MATERIE'));

    const groups = templates.sheetContextFor('file_1')?.['materieColonne'] as MaterieGroups;
    expect(groups.group1).toEqual([{ sigla: 'MATE', header: 'Matematica' }]);
    expect(groups.group2).toEqual([]);
    expect(groups.group3).toEqual([]);
    expect(groups.group2Label).toBeUndefined();
    expect(groups.group3Label).toBeUndefined();
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

    const groups = templates.sheetContextFor('file_1')?.['materieColonne'] as MaterieGroups;
    expect(groups.group1.filter((item) => !item.isSpecial)).toEqual([
      { sigla: 'LAB', specificita: 'GRUPPO_A', header: 'Lab A' },
      { sigla: 'LAB', specificita: 'GRUPPO_B', header: 'Lab B' }
    ]);
    expect(sheets.protectCalls.find((r) => r.range === 'Sheet1!B:B')?.editors?.users).toEqual(
      expect.arrayContaining(['docente-a@school.it'])
    );
    expect(sheets.protectCalls.find((r) => r.range === 'Sheet1!C:C')?.editors?.users).toEqual(
      expect.arrayContaining(['docente-b@school.it'])
    );
    expect(roles.subjectCduVariants.map((v) => v.meta.parametriInput.materiaCorrente)).toEqual([
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

    expect(() =>
      strategy.render('file_1', cdu, confDoc('SHEET_CON_MATERIE_E_PERMESSI'))
    ).not.toThrow();

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

    expect(() =>
      strategy.render('file_1', cdu, confDoc('SHEET_CON_MATERIE_E_PERMESSI'))
    ).not.toThrow();

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
    expect(() =>
      strategy.render('file_1', cdu, confDoc('SHEET_CON_MATERIE_E_PERMESSI'))
    ).not.toThrow();

    expect(cdu.focus.classe?.elencoMaterieConPermessi?.map((item) => item.sigla)).toEqual([
      'REL',
      'FISI',
      'MATE'
    ]);
    const renderedGroups = templates.sheetContextFor('file_1')?.['materieColonne'] as MaterieGroups;
    expect(renderedGroups.group1[0]).toMatchObject({
      sigla: 'REL',
      header: 'REL',
      isSpecial: true,
      roles: ['IRC']
    });
    expect(roles.roleCalls).toContain('DOCENTI_IRC_ALT');
    // A=REL, then ordinary columns alphabetically: B=Fisica, C=Matematica.
    const colB = sheets.protectCalls.find((r) => r.range === 'Sheet1!B:B');
    const colC = sheets.protectCalls.find((r) => r.range === 'Sheet1!C:C');
    expect(colB?.editors?.users?.sort()).toEqual(['bianchi@school.it', 'rossi@school.it']);
    expect(colC?.editors?.users?.sort()).toEqual(['bianchi@school.it', 'rossi@school.it']);
    expect(
      roles.subjectCduVariants.map((variant) => variant.meta.parametriInput.materiaCorrente)
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
    expect(cdu.meta.parametriInput.materiaCorrente).toBeNull();
  });

  test('a class with no CDC subjects protects nothing (no protectRanges call)', () => {
    const db = new FakeDatabase(fixtureTables());
    const cdu = buildCdu(db, '3B');
    // 3B is inactive but still has a MATE column in the fixture; force an empty CDC to exercise the guard.
    cdu.focus.classe!.consiglioDiClasse = [];
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
    cdu.focus.classe!.articolazione = {
      partner: null,
      partners: ['1F-LSO', '1F-LSS'],
      parent: null,
      materieCondivise: [subjectVm('MATE')],
      materieSeparatePrimoGruppo: [subjectVm('FISI')],
      materieSeparateSecondoGruppo: [subjectVm('FISI')]
    };
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
    const groups = templates.sheetContextFor('file_1')?.['materieColonne'] as MaterieGroups;
    expect(groups.group2).toEqual([{ sigla: 'FISI', header: 'Fisica', classeId: '1F-LSO' }]);
    expect(groups.group3).toEqual([{ sigla: 'FISI', header: 'Fisica', classeId: '1F-LSS' }]);
    expect(
      sheets.protectCalls.find((request) => request.range === 'Sheet1!D:D')?.editors?.users?.sort()
    ).toEqual(['bianchi@school.it', 'rossi@school.it']);
    expect(
      sheets.protectCalls.find((request) => request.range === 'Sheet1!F:F')?.editors?.users?.sort()
    ).toEqual(['rossi@school.it', 'verdi@school.it']);
  });

  test('articulated partner columns retain ACL ownership when the same teacher holds both separated slots', () => {
    const tables = fixtureTables();
    const lss = tables.CLASSI!.find((row) => row.ID === '1F-LSS')!;
    lss.FISI = 'bianchi@school.it';
    const db = new FakeDatabase(tables);
    const cdu = buildCdu(db, '1F');
    cdu.focus.classe!.articolazione = {
      partner: null,
      partners: ['1F-LSO', '1F-LSS'],
      parent: null,
      materieCondivise: [subjectVm('MATE')],
      materieSeparatePrimoGruppo: [subjectVm('FISI')],
      materieSeparateSecondoGruppo: [subjectVm('FISI')]
    };
    const sheets = new FakeSpreadsheetService(sheetInfo());
    const strategy = new SheetMaterieConPermessiGeneratorStrategy(
      sheets,
      new MateriaRepository(db),
      new FakeTemplateEngine(),
      composeRisolutoreRuoli(db)
    );

    strategy.render('file_1', cdu, confDoc('SHEET_CON_MATERIE_E_PERMESSI'));

    expect(
      sheets.protectCalls.find((request) => request.range === 'Sheet1!D:D')?.editors?.users?.sort()
    ).toEqual(['bianchi@school.it', 'rossi@school.it']);
    expect(
      sheets.protectCalls.find((request) => request.range === 'Sheet1!F:F')?.editors?.users?.sort()
    ).toEqual(['bianchi@school.it', 'rossi@school.it']);
  });

  test('attaches the rendered column groups onto focus.classe.sheet.materieColonne', () => {
    const db = new FakeDatabase(fixtureTables());
    const cdu = buildCdu(db, '1F');
    cdu.focus.classe!.articolazione = {
      partner: null,
      partners: ['1F-LSO', '1F-LSS'],
      parent: null,
      materieCondivise: [subjectVm('MATE')],
      materieSeparatePrimoGruppo: [subjectVm('FISI')],
      materieSeparateSecondoGruppo: [subjectVm('FISI')]
    };
    const sheets = new FakeSpreadsheetService(sheetInfo());
    const strategy = new SheetMaterieConPermessiGeneratorStrategy(
      sheets,
      new MateriaRepository(db),
      new FakeTemplateEngine(),
      composeRisolutoreRuoli(db)
    );

    strategy.render('file_1', cdu, confDoc('SHEET_CON_MATERIE_E_PERMESSI'));

    expect(cdu.focus.classe!.sheet?.materieColonne.group1[0]).toMatchObject({ isSpecial: true });
    expect(cdu.focus.classe!.sheet?.materieColonne.group2Label).toEqual(expect.any(String));

    // Finding 3 fix: group2/group3 come from articolazione columns, which carry
    // `classeId` (partner class) internally -- confirm it (and `specificita`/`kind`,
    // never set here but part of the same leak) never reaches the printable
    // classe.sheet.materieColonne contract (02 §4.1 / Cdu.ts CduClasse['sheet']),
    // even though buildGroups()'s own internal return value legitimately carries it.
    const printableColumns = [
      ...cdu.focus.classe!.sheet!.materieColonne.group1,
      ...cdu.focus.classe!.sheet!.materieColonne.group2,
      ...cdu.focus.classe!.sheet!.materieColonne.group3
    ];
    expect(printableColumns.length).toBeGreaterThan(0);
    for (const column of printableColumns) {
      expect(column).not.toHaveProperty('classeId');
      expect(column).not.toHaveProperty('specificita');
      expect(column).not.toHaveProperty('kind');
      expect(Object.keys(column).sort()).toEqual(
        [...new Set(['sigla', 'header', ...(column.isSpecial === undefined ? [] : ['isSpecial']), ...(column.roles === undefined ? [] : ['roles'])])].sort()
      );
    }
    expect(JSON.stringify(cdu.focus.classe!.sheet)).not.toContain('classeId');
  });
});
