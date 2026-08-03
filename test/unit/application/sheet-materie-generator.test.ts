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

class FakeSpreadsheetService {
  protectCalls: Array<{ range: string; description?: string; editors?: { users?: string[] } }> = [];
  constructor(private readonly sheets: SpreadsheetSheetInfo[]) {}
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
    requests: SpreadsheetProtectRequest | SpreadsheetProtectRequest[]
  ): SpreadsheetProtectResult {
    const arr = Array.isArray(requests) ? requests : [requests];
    this.protectCalls.push(...arr);
    return {
      spreadsheetId: 'sheet1',
      protectedCount: arr.length,
      protectedRangeIds: arr.map((_, i) => i),
      replies: []
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
      materieCondivise: ['MATE'],
      materieSeparatePrimoGruppo: ['FISI'],
      materieSeparateSecondoGruppo: ['FISI']
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
      materieCondivise: ['MATE'],
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
      materieCondivise: ['MATE'],
      materieSeparatePrimoGruppo: ['FISI'],
      materieSeparateSecondoGruppo: ['FISI']
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
      materieCondivise: ['MATE'],
      materieSeparatePrimoGruppo: ['FISI'],
      materieSeparateSecondoGruppo: ['FISI']
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
});
