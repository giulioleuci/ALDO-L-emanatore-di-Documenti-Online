import { DocumentoConTabelleImportateGeneratorStrategy } from '../../../src/application/strategies/DocumentoConTabelleImportateGeneratorStrategy';
import { FakeTemplateEngine } from '../../fakes/FakeTemplateEngine';
import type {
  IDocumentTableFacade,
  TablePlaceholder
} from '../../../src/infrastructure/facades/DocumentTableFacade';
import type { Cdu } from '../../../src/application/context-engine/Cdu';

class FakeDocumentTableFacade implements IDocumentTableFacade {
  removed: Array<{ fileId: string; marker: string }> = [];
  insertedAtMarker: Array<{
    fileId: string;
    marker: string;
    data: string[][];
    options?: { headerRow?: boolean };
  }> = [];
  /** Records the interleaved call order to assert DocumentApp flushes before Docs-API calls. */
  callOrder: string[] = [];
  constructor(
    private readonly placeholders: TablePlaceholder[],
    public documentText = ''
  ) {}
  findTablePlaceholders(): TablePlaceholder[] {
    return this.placeholders;
  }
  removeText(fileId: string, marker: string): void {
    this.removed.push({ fileId, marker });
    this.callOrder.push(`remove:${marker}`);
    this.documentText = this.documentText.replace(marker, '');
  }
  flush(): void {
    this.callOrder.push('flush');
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

class HeadingRenderingTemplateEngine extends FakeTemplateEngine {
  textBeforeGenericRender = '';

  constructor(private readonly document: FakeDocumentTableFacade) {
    super();
  }

  override processDocument(fileId: string, context: Record<string, unknown>): void {
    this.textBeforeGenericRender = this.document.documentText;
    super.processDocument(fileId, context);
    this.document.documentText = this.document.documentText.replace(
      '{{focus.classe.anagrafica.nome}}',
      '1A'
    );
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
  getRanges(id: string, range: string): unknown[][] {
    return this.ranges[`${id}:${range}`] ?? this.ranges[range] ?? [];
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

function fakeCdu(className?: string): Cdu {
  return {
    meta: {
      date: { oggi: { breve: '09/07/2026' } },
      parametriInput: { target: 'x', tipoTarget: 'classe', opzioni: {} }
    },
    focus: className === undefined ? {} : { classe: { anagrafica: { nome: className } } },
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
      'sheet_1:Sheet1!A1:B3': [
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
    expect(tables.callOrder).toEqual([
      'insert:{{TABELLA:sheet_1}}',
      'flush',
      'remove:{{TABELLA:sheet_1}}'
    ]);
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
      'sheet_header_only:Sheet1!A1:B1': [['Nome', 'Valore']]
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

  test('flushes the DocumentApp model after tables and before placeholder replacement', () => {
    const calls: string[] = [];
    const tables = {
      findTablePlaceholders: () => [{ marker: '{{TABELLA:s1}}', sheetFileId: 's1' }],
      insertTableAtMarker: () => calls.push('insert'),
      removeText: () => calls.push('remove'),
      flush: () => calls.push('flush')
    };
    const templates = { processDocument: () => calls.push('render') } as never;
    const sheets = new FakeSpreadsheetService(sheetInfo('Sheet1', 2, 2), {
      's1:Sheet1!A1:B2': [
        ['Nome', 'Valore'],
        ['Prima riga', '1']
      ]
    });
    const strategy = new DocumentoConTabelleImportateGeneratorStrategy(templates, sheets, tables);

    strategy.render('doc1', {} as never);

    expect(calls).toEqual(['insert', 'flush', 'remove', 'render']);
  });

  test('preserves the heading placeholder through both table-marker mutations before generic CDU rendering', () => {
    const dataMarker = '{{TABELLA:sheet_data}}';
    const emptyMarker = '{{TABELLA:sheet_empty}}';
    const tables = new FakeDocumentTableFacade(
      [
        { marker: dataMarker, sheetFileId: 'sheet_data' },
        { marker: emptyMarker, sheetFileId: 'sheet_empty' }
      ],
      `Tabelle importate per la classe {{focus.classe.anagrafica.nome}}\n${dataMarker}\n${emptyMarker}`
    );
    const sheets = new FakeSpreadsheetService(sheetInfo('Sheet1', 3, 2), {
      'sheet_data:Sheet1!A1:B3': [
        ['Nome', 'Valore'],
        ['Prima riga', '1'],
        ['Seconda riga', '2']
      ],
      'sheet_empty:Sheet1!A1:B3': [['Nome', 'Valore']]
    });
    const templates = new HeadingRenderingTemplateEngine(tables);
    const strategy = new DocumentoConTabelleImportateGeneratorStrategy(templates, sheets, tables);

    strategy.render('doc-heading', fakeCdu('1A'));

    expect(tables.insertedAtMarker).toEqual([
      {
        fileId: 'doc-heading',
        marker: dataMarker,
        data: [
          ['Nome', 'Valore'],
          ['Prima riga', '1'],
          ['Seconda riga', '2']
        ],
        options: { headerRow: true }
      }
    ]);
    expect(tables.removed).toEqual([
      { fileId: 'doc-heading', marker: dataMarker },
      { fileId: 'doc-heading', marker: emptyMarker }
    ]);
    expect(templates.textBeforeGenericRender).toBe(
      'Tabelle importate per la classe {{focus.classe.anagrafica.nome}}\n\n'
    );
    expect(tables.documentText).toBe('Tabelle importate per la classe 1A\n\n');
  });
});
