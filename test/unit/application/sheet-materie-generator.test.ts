import { SheetMaterieGeneratorStrategy } from '../../../src/application/strategies/SheetMaterieGeneratorStrategy';
import { SheetMaterieConPermessiGeneratorStrategy } from '../../../src/application/strategies/SheetMaterieConPermessiGeneratorStrategy';
import { RisolutoreRuoliService } from '../../../src/application/services/RisolutoreRuoliService';
import { ClasseRepository } from '../../../src/infrastructure/repositories/ClasseRepository';
import { MateriaRepository } from '../../../src/infrastructure/repositories/MateriaRepository';
import { CdcAssembler } from '../../../src/application/context-engine/CdcAssembler';
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
      protectedRangeIds: arr.map((_, i) => i)
    };
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
    PATH_OUT_SOTTOCARTELLE: null,
    SCHEMA_SOTTOCARTELLE: 'UNO PER CLASSE',
    PERMESSI: null,
    POST_PROCESSO: null,
    PARAMETRI: parametri === null ? null : JSON.stringify(parametri),
    GESTIONE_ARTICOLAZIONE: 'COMPLETA',
    FORMATO: 'GSHEET'
  });
}

/** Builds a minimal but realistic Cdu for classeId, using the real CdcAssembler over the fixture DB. */
function buildCdu(db: FakeDatabase, classeId: string): Cdu {
  const classi = new ClasseRepository(db);
  const materie = new MateriaRepository(db);
  const classe = classi.findById(classeId);
  if (classe === null) throw new Error(`fixture classe ${classeId} not found`);
  const consiglioDiClasse = new CdcAssembler(classi, materie).assembleForClasse(classe);
  const isArticolata = classi.isArticolata(classe);
  return {
    meta: {
      timestamp: '',
      idConfigurazione: 'CD_MAT',
      tipoOperazione: 'GENERAZIONE_DOCUMENTO',
      idEsecuzione: 'e1',
      date: {
        oggi: {
          breve: '09/07/2026',
          estesa: '',
          iso: '2026-07-09',
          giorno: '9',
          mese: '7',
          anno: '2026',
          ora: '10:00'
        }
      },
      parametriInput: {
        target: classeId,
        tipoTarget: 'classe',
        materiaCorrente: null,
        opzioni: {} as never
      }
    },
    focus: {
      classe: {
        anagrafica: {
          nome: classeId,
          anno: classe.anno.value,
          sezione: '',
          indirizzo: { nome: '', nomeSintetico: '', sigla: '', tipo: '' }
        },
        flags: {
          isClassePrima: false,
          isTriennio: true,
          isPrimoBiennio: false,
          isTerminale: true,
          isArticolata
        },
        consiglioDiClasse
      }
    },
    tech: {
      entita: { classe },
      servizi: [],
      pipeline: { statoCorrente: '', stepEseguiti: [], errori: [], logEsecuzione: [] }
    }
  } as unknown as Cdu;
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
    expect(groups.group2).toBeUndefined();
    expect(groups.group3).toBeUndefined();
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
    expect(groups.group2).toEqual([{ sigla: 'FISI', header: 'Fisica' }]);
    expect(groups.group2Label).toBe('1F-LSO');
    expect(groups.group3).toEqual([{ sigla: 'FISI', header: 'Fisica' }]);
    expect(groups.group3Label).toBe('1F-LSS');
  });
});

describe('SheetMaterieConPermessiGeneratorStrategy (10 §9)', () => {
  test('protects each subject column for its resolved teacher(s) + the coordinator, skipping group-label columns', () => {
    const db = new FakeDatabase(fixtureTables());
    const cdu = buildCdu(db, '5A');
    const sheets = new FakeSpreadsheetService(sheetInfo());
    const strategy = new SheetMaterieConPermessiGeneratorStrategy(
      sheets,
      new MateriaRepository(db),
      new FakeTemplateEngine(),
      new RisolutoreRuoliService(db)
    );

    strategy.render('file_1', cdu, confDoc('SHEET_CON_MATERIE_E_PERMESSI'));

    // Columns are alphabetical: A=Fisica (bianchi), B=Matematica (rossi); COORD=rossi on both.
    const colA = sheets.protectCalls.find((r) => r.range === 'Sheet1!A:A');
    const colB = sheets.protectCalls.find((r) => r.range === 'Sheet1!B:B');
    expect(colA?.editors?.users?.sort()).toEqual(['bianchi@school.it', 'rossi@school.it']);
    expect(colB?.editors?.users?.sort()).toEqual(['rossi@school.it']);
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
      new RisolutoreRuoliService(db)
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
    const strategy = new SheetMaterieConPermessiGeneratorStrategy(
      sheets,
      new MateriaRepository(db),
      new FakeTemplateEngine(),
      new RisolutoreRuoliService(db)
    );

    strategy.render('file_1', cdu, confDoc('SHEET_CON_MATERIE_E_PERMESSI'));

    // column layout order: A=MATE (group1), B=label(1F-LSO, no ACL), C=FISI (group2), D=label(1F-LSS, no ACL), E=FISI (group3)
    expect(sheets.protectCalls.map((r) => r.range).sort()).toEqual([
      'Sheet1!A:A',
      'Sheet1!C:C',
      'Sheet1!E:E'
    ]);
  });
});
