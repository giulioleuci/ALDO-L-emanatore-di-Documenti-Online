import type { LoggerService } from '@CoreUtilsLib';
import type { DocumentService, SpreadsheetService } from '@GoogleApiWrapper';
import type { Mustache } from './facades/Mustache.js';
import type { RenderSegment } from './facades/Mustache.js';
import type { TextRun, ScannedDocument, DocumentRequest } from '../../GoogleApiWrapper/src/internal/services-managers/DocumentContracts.js';
export type { TextRun, ScannedDocument, DocumentRequest, RenderSegment };
export type TemplateLogger = {
    [K in 'debug' | 'info' | 'warn' | 'error']: (...args: Parameters<LoggerService[K]>) => unknown;
};
export interface TemplateUtils {
    formatDate(date: Date, format: string): string;
}
export interface TemplateOptions {
    logger?: TemplateLogger | null;
    mustache?: ProcessorHost['mustache'];
    strictFilters?: boolean;
    utils?: unknown;
    cache?: unknown;
}
export interface ProcessorHost {
    mustache: Pick<Mustache, 'render' | 'getValue' | 'renderSegments' | '_lookupValue'>;
    logger: TemplateLogger;
}
export type ParsedArgument = string | number | boolean;
export interface ParsedFilter {
    name: string;
    args: ParsedArgument[];
}
export interface ScannedTable {
    index?: number;
    startIndex?: number;
    rows: {
        index?: number;
        startIndex?: number;
        cells: {
            index?: number;
            startIndex?: number;
            endIndex?: number;
            text: string;
            runs?: TextRun[];
        }[];
    }[];
}
export type TextMatch = Omit<ScannedDocument['textMatches'][number], 'runs' | 'type'> & {
    type?: string;
    startIndex?: number;
    endIndex?: number;
    runs?: TextRun[];
};
export interface RowLoop {
    type: 'rowLoop';
    index: number;
    tableIndex: number;
    rowIndex: number;
    dataArray: unknown[];
    controlText?: string;
    markerCell?: number;
    sourceRuns?: TextRun[][];
}
export interface ColumnLoop {
    type: 'columnLoop';
    index: number;
    tableIndex: number;
    cellIndex: number;
    dataArray: unknown[];
    templateContent: string;
    sourceRuns?: TextRun[];
}
export interface DeleteRow {
    type: 'deleteRow';
    index: number;
    tableIndex: number;
    rowIndex: number;
}
export interface ListLoop {
    type: 'listLoop';
    index: number;
    paragraphIndex: number;
    listType: string;
    dataArray: unknown[];
    itemTemplate: string;
    fullMatch: string;
    sourceRuns?: TextRun[];
}
export interface ConditionalDelete {
    type: 'conditionalDelete';
    index: number;
    length: number;
    kind: 'section' | 'marker';
}
export interface TextSubstitution {
    type: 'textSubstitution';
    index: number;
    originalText: string;
    newText: string;
    segments?: RenderSegment[];
    sourceRuns?: TextRun[];
}
export interface TableInsert {
    type: 'tableInsert';
    placeholder: string;
    data: unknown[][];
    options: {
        headerRow?: boolean;
    };
}
export interface ConditionalNode {
    symbol: string;
    expr: string;
    openIndex: number;
    openLength: number;
    closeIndex?: number;
    closeLength?: number;
    children: ConditionalNode[];
}
export type StructuralOperation = RowLoop | ColumnLoop | DeleteRow;
export type BatchOperation = ConditionalDelete | DeleteRow | TextSubstitution | ListLoop;
export interface StyledSegment {
    rendered: string;
    style: GoogleAppsScript.Docs.Schema.TextStyle;
}
export interface SheetValueRequest {
    range: string;
    values: unknown[][];
}
export interface ProtectionRequest {
    range: string;
    description: string;
    editors: {
        users: string[];
    };
}
export interface SheetColumn {
    header: unknown;
    column: number;
    isLabel: boolean;
    item: unknown;
}
export interface SheetLayout {
    sheetName: string;
    headerRow: number;
    startColumn: number;
    columns: SheetColumn[];
}
export type SheetInfo = ReturnType<SpreadsheetService['getSheetInfo']>[number];
export interface ProcessorText {
    appendText(text: string): unknown;
    setAttributes(start: number, end: number, attributes: Record<string, unknown>): unknown;
}
export interface ProcessorElement {
    getParent?: () => ProcessorElement | null;
    getType?: () => {
        toString(): string;
    };
    copy?: () => ProcessorElement;
    clear?: () => unknown;
    editAsText?: () => ProcessorText;
}
export interface ProcessorBody extends ProcessorElement {
    findText(pattern: string): {
        getElement(): ProcessorElement;
    } | null;
    getChildIndex?(element: ProcessorElement): number;
    insertListItem?(index: number, element: ProcessorElement): unknown;
    insertParagraph?(index: number, element: ProcessorElement): unknown;
    getChild?(index: number): ProcessorElement;
    removeChild?(element: ProcessorElement): unknown;
}
export interface ProcessorDocument {
    getBody(): ProcessorBody;
    saveAndClose?: () => unknown;
}
export interface ProcessorDocumentService {
    getTableRow(documentId: string, tableIndex: number, rowIndex: number): {
        cells: string[];
    } | null;
    getTableData(documentId: string, tableIndex: number): {
        numRows: number;
        data: string[][];
    } | null;
    getColumnWidth(documentId: string, tableIndex: number, columnIndex: number): {
        widthPoints: number;
    };
    scanDocumentStructure(documentId: string, textPatterns?: string[]): {
        tables: ScannedTable[];
        textMatches: TextMatch[];
    };
    openStandard(documentId: string): ProcessorDocument;
}
export type ProcessorDocumentWrites = {
    [K in 'copyTableRow' | 'setCellRunStyles' | 'deleteTableRow' | 'updateTableCell' | 'copyTableColumn' | 'setColumnWidth' | '_executeBatchUpdate' | 'insertTableAtMarker' | 'batchReplaceText']: (...args: Parameters<DocumentService[K]>) => unknown;
};
export type ProcessorSpreadsheetService = Pick<SpreadsheetService, 'getSheetInfo' | 'getRanges'> & Partial<Pick<SpreadsheetService, 'getProtectedRanges'>> & {
    [K in 'updateRanges' | 'expandSheetGrid']: (...args: Parameters<SpreadsheetService[K]>) => unknown;
} & Partial<{
    [K in 'deleteProtectedRanges' | 'protectRanges']: (...args: Parameters<SpreadsheetService[K]>) => unknown;
}>;
