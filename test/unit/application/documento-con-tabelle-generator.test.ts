import { DocumentoConTabelleImportateGeneratorStrategy } from '../../../src/application/strategies/DocumentoConTabelleImportateGeneratorStrategy';
import { FakeTemplateEngine } from '../../fakes/FakeTemplateEngine';
import type {
  IDocumentTableFacade,
  TablePlaceholder
} from '../../../src/infrastructure/facades/DocumentTableFacade';
import type { Cdu } from '../../../src/application/context-engine/Cdu';

class FakeDocumentTableFacade implements IDocumentTableFacade {
  removed: Array<{ fileId: string; marker: string }> = [];
  appended: Array<{ fileId: string; data: string[][]; options?: { headerRow?: boolean } }> = [];
  insertedAtMarker: Array<{
    fileId: string;
    marker: string;
    data: string[][];
    options?: { headerRow?: boolean };
  }> = [];
  /** Records the interleaved call order ('insert' | 'remove') per marker, to assert insert-before-remove. */
  callOrder: string[] = [];
  constructor(private readonly placeholders: TablePlaceholder[]) {}
  findTablePlaceholders(): TablePlaceholder[] {
    return this.placeholders;
  }
  removeText(fileId: string, marker: string): void {
    this.removed.push({ fileId, marker });
    this.callOrder.push(`remove:${marker}`);
  }
  appendTable(fileId: string, data: string[][], options?: { headerRow?: boolean }): void {
    this.appended.push({ fileId, data, options });
  }
  insertTableAtMarker(
    fileId: string,
    marker: string,
    data: string[][],
    options?: { headerRow?: boolean }
  ): void {
    this.insertedAtMarker.push({ fileId, marker, data, options });
    this.callOrder.push(`insert:${marker}`);
  }
}

class FakeSpreadsheetService {
  constructor(
    private readonly sheets: SpreadsheetSheetInfo[],
    private readonly ranges: Record<string, unknown[][]>
  ) {}
  getSheetInfo(): SpreadsheetSheetInfo[] {
    return this.sheets;
  }
  getRanges(_id: string, range: string): unknown[][] {
    return this.ranges[range] ?? [];
  }
  updateRanges(): unknown {
    throw new Error('not used');
  }
  appendRows(): unknown {
    throw new Error('not used');
  }
  formatRanges(): unknown {
    throw new Error('not used');
  }
  createSheets(): unknown {
    throw new Error('not used');
  }
  protectRanges(): unknown {
    throw new Error('not used');
  }
}

function sheetInfo(name = 'Sheet1', rowCount = 5, columnCount = 3): SpreadsheetSheetInfo[] {
  return [{ name, sheetId: 0, index: 0, hidden: false, gridProperties: { rowCount, columnCount } }];
}

function fakeCdu(): Cdu {
  return {
    meta: {
      date: { oggi: { breve: '09/07/2026' } },
      parametriInput: { target: 'x', tipoTarget: 'classe', opzioni: {} }
    },
    focus: {},
    tech: {
      entita: {},
      servizi: [],
      pipeline: { statoCorrente: '', stepEseguiti: [], errori: [], logEsecuzione: [] }
    }
  } as unknown as Cdu;
}

describe('DocumentoConTabelleImportateGeneratorStrategy (10 §9)', () => {
  test('for each {{TABELLA:<id>}} marker: reads the sheet, inserts it as a table at the marker position, THEN removes the marker, then runs the generic placeholder pass', () => {
    const placeholders: TablePlaceholder[] = [
      { marker: '{{TABELLA:sheet_1}}', sheetFileId: 'sheet_1' }
    ];
    const tables = new FakeDocumentTableFacade(placeholders);
    const sheets = new FakeSpreadsheetService(sheetInfo('Sheet1', 3, 2), {
      'Sheet1!A1:B3': [
        ['NOME', 'VOTO'],
        ['Rossi', 8],
        ['', '']
      ]
    });
    const templates = new FakeTemplateEngine();
    const strategy = new DocumentoConTabelleImportateGeneratorStrategy(templates, sheets, tables);
    const cdu = fakeCdu();

    strategy.render('doc1', cdu);

    expect(tables.insertedAtMarker).toEqual([
      {
        fileId: 'doc1',
        marker: '{{TABELLA:sheet_1}}',
        data: [
          ['NOME', 'VOTO'],
          ['Rossi', '8']
        ],
        options: { headerRow: true }
      }
    ]);
    expect(tables.removed).toEqual([{ fileId: 'doc1', marker: '{{TABELLA:sheet_1}}' }]);
    // Insertion (which relies on findText locating the marker) must happen before removal.
    expect(tables.callOrder).toEqual(['insert:{{TABELLA:sheet_1}}', 'remove:{{TABELLA:sheet_1}}']);
    expect(tables.appended).toEqual([]);
    expect(templates.contextFor('doc1')).toEqual(cdu);
  });

  test('no {{TABELLA:...}} markers -> no insertions/removals, still runs the generic placeholder pass', () => {
    const tables = new FakeDocumentTableFacade([]);
    const sheets = new FakeSpreadsheetService(sheetInfo(), {});
    const templates = new FakeTemplateEngine();
    const strategy = new DocumentoConTabelleImportateGeneratorStrategy(templates, sheets, tables);

    strategy.render('doc2', fakeCdu());

    expect(tables.removed).toEqual([]);
    expect(tables.insertedAtMarker).toEqual([]);
    expect(templates.contextFor('doc2')).not.toBeNull();
  });

  test('a missing sheet (getSheetInfo returns nothing) skips insertTableAtMarker for empty data, but still removes the marker', () => {
    const placeholders: TablePlaceholder[] = [
      { marker: '{{TABELLA:sheet_missing}}', sheetFileId: 'sheet_missing' }
    ];
    const tables = new FakeDocumentTableFacade(placeholders);
    const sheets = new FakeSpreadsheetService([], {});
    const strategy = new DocumentoConTabelleImportateGeneratorStrategy(
      new FakeTemplateEngine(),
      sheets,
      tables
    );

    strategy.render('doc3', fakeCdu());

    expect(tables.insertedAtMarker).toEqual([]);
    expect(tables.removed).toEqual([{ fileId: 'doc3', marker: '{{TABELLA:sheet_missing}}' }]);
  });

  test('a source containing only the header removes its marker without inserting a bogus table', () => {
    const marker = '{{TABELLA:sheet_header_only}}';
    const tables = new FakeDocumentTableFacade([{ marker, sheetFileId: 'sheet_header_only' }]);
    const sheets = new FakeSpreadsheetService(sheetInfo('Sheet1', 1, 2), {
      'Sheet1!A1:B1': [['Nome', 'Valore']]
    });
    const strategy = new DocumentoConTabelleImportateGeneratorStrategy(
      new FakeTemplateEngine(),
      sheets,
      tables
    );

    strategy.render('doc-header-only', fakeCdu());

    expect(tables.insertedAtMarker).toEqual([]);
    expect(tables.removed).toEqual([{ fileId: 'doc-header-only', marker }]);
  });
});
