import { DocumentTableFacade } from '../../../src/infrastructure/facades/DocumentTableFacade';

class FakeDocumentBuilder {
  ops: Array<{ type: 'replaceText' | 'createTable'; args: unknown[] }> = [];
  result: { success: boolean; error?: unknown } = { success: true };
  replaceText(searchPattern: string, replacement: string): this {
    this.ops.push({ type: 'replaceText', args: [searchPattern, replacement] });
    return this;
  }
  createTable(data: string[][], options?: Record<string, unknown>): this {
    this.ops.push({ type: 'createTable', args: [data, options] });
    return this;
  }
  execute(): { success: boolean; error?: unknown } {
    return this.result;
  }
}

class FakeDocumentService {
  builders: Record<string, FakeDocumentBuilder> = {};
  standardDocs: Record<string, { saveAndClose?: () => void }> = {};
  scanResult: DocumentScanResult = { tables: [], textMatches: [] };
  insertTableAtMarkerCalls: Array<{
    documentId: string;
    markerText: string;
    data: string[][];
    options?: Record<string, unknown>;
  }> = [];
  document(documentId: string): FakeDocumentBuilder {
    const b = this.builders[documentId] ?? new FakeDocumentBuilder();
    this.builders[documentId] = b;
    return b;
  }
  scanDocumentStructure(): DocumentScanResult {
    return this.scanResult;
  }
  openStandard(documentId: string): { saveAndClose?: () => void } {
    return this.standardDocs[documentId] ?? {};
  }
  insertTableAtMarker(
    documentId: string,
    markerText: string,
    data: string[][],
    options?: Record<string, unknown>
  ): void {
    this.insertTableAtMarkerCalls.push({ documentId, markerText, data, options });
  }
}

describe('DocumentTableFacade (10 §9)', () => {
  test('findTablePlaceholders extracts every {{TABELLA:<id>}} marker from scanned paragraphs, including multiple per paragraph', () => {
    const documents = new FakeDocumentService();
    documents.scanResult = {
      tables: [],
      textMatches: [
        { elementIndex: 1, text: 'Griglia: {{TABELLA:sheet_1}}', type: 'TEXT' },
        {
          elementIndex: 2,
          text: 'Due tabelle {{TABELLA:sheet_2}} e {{TABELLA:sheet_3}}',
          type: 'TEXT'
        }
      ]
    };
    const facade = new DocumentTableFacade(documents);

    const found = facade.findTablePlaceholders('doc1');

    expect(found).toEqual([
      { marker: '{{TABELLA:sheet_1}}', sheetFileId: 'sheet_1' },
      { marker: '{{TABELLA:sheet_2}}', sheetFileId: 'sheet_2' },
      { marker: '{{TABELLA:sheet_3}}', sheetFileId: 'sheet_3' }
    ]);
  });

  test('removeText strips the marker via replaceText and executes', () => {
    const documents = new FakeDocumentService();
    const facade = new DocumentTableFacade(documents);

    facade.removeText('doc1', '{{TABELLA:sheet_1}}');

    expect(documents.builders['doc1']?.ops).toEqual([
      { type: 'replaceText', args: ['{{TABELLA:sheet_1}}', ''] }
    ]);
  });

  test('appendTable creates a table and skips the call entirely for empty data', () => {
    const documents = new FakeDocumentService();
    const facade = new DocumentTableFacade(documents);

    facade.appendTable('doc1', [['a', 'b']], { headerRow: true });
    facade.appendTable('doc1', []);

    expect(documents.builders['doc1']?.ops).toEqual([
      { type: 'createTable', args: [[['a', 'b']], { headerRow: true }] }
    ]);
  });

  test('insertTableAtMarker delegates directly to DocumentService.insertTableAtMarker (imperative call, bypasses the op-queue)', () => {
    const documents = new FakeDocumentService();
    const facade = new DocumentTableFacade(documents);

    facade.insertTableAtMarker('doc1', '{{TABELLA:sheet_1}}', [['a', 'b']], { headerRow: true });

    expect(documents.insertTableAtMarkerCalls).toEqual([
      {
        documentId: 'doc1',
        markerText: '{{TABELLA:sheet_1}}',
        data: [['a', 'b']],
        options: { headerRow: true }
      }
    ]);
    // Positional insertion does not go through the fluent DocumentBuilder op-queue.
    expect(documents.builders['doc1']).toBeUndefined();
  });

  test('insertTableAtMarker skips the call entirely for empty data', () => {
    const documents = new FakeDocumentService();
    const facade = new DocumentTableFacade(documents);

    facade.insertTableAtMarker('doc1', '{{TABELLA:sheet_1}}', []);

    expect(documents.insertTableAtMarkerCalls).toEqual([]);
  });

  test('flush saves and closes the DocumentApp model opened by table insertion', () => {
    const saveAndClose = jest.fn();
    const documents = new FakeDocumentService();
    documents.standardDocs = { doc1: { saveAndClose } };
    const facade = new DocumentTableFacade(documents as never);

    facade.flush('doc1');

    expect(saveAndClose).toHaveBeenCalledTimes(1);
  });

  test('flush does not throw when the document does not expose saveAndClose', () => {
    const documents = new FakeDocumentService();
    documents.standardDocs = { doc1: {} };
    const facade = new DocumentTableFacade(documents as never);

    expect(() => facade.flush('doc1')).not.toThrow();
  });

  test('throws when the builder reports failure', () => {
    const documents = new FakeDocumentService();
    const facade = new DocumentTableFacade(documents);
    documents.document('doc1').result = { success: false, error: 'boom' };

    expect(() => facade.removeText('doc1', '{{TABELLA:x}}')).toThrow(/boom/);
  });
});
