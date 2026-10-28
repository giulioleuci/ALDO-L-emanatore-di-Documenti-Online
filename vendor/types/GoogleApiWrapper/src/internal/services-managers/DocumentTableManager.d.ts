import type { DocumentTableFacade, TableOptions, DocumentOperation, TableSummary } from './DocumentContracts.js';
export declare class DocumentTableManager {
    facade: DocumentTableFacade;
    _logger: DocumentTableFacade['_logger'];
    _cache: unknown;
    _utils: unknown;
    _exceptionService: unknown;
    /**
     * Creates a new DocumentTableManager instance.
     * @param {DocumentService} facade - The DocumentService facade
     */
    constructor(facade: DocumentTableFacade);
    /**
     * @description Retrieves metadata for all tables in a document via Advanced Docs API.
     * @param {string} documentId Target document identifier.
     * @returns {Object[]} Collection of table summaries {startIndex, endIndex, tableIndex, rows, columns}.
     */
    getDocumentTables(documentId: string): TableSummary[];
    /**
     * @description Retrieves detailed structural metadata for a specific table via Advanced Docs API.
     * @param {string} documentId Target document identifier.
     * @param {number} tableIndex Zero-based sequence index.
     * @returns {Object} Table structure {startIndex, endIndex, rows: Array<{startIndex, endIndex, rowIndex, cells: Array<{startIndex, endIndex, cellIndex}>}>}.
     * @throws {Error} If index is out of bounds.
     */
    getTableStructure(documentId: string, tableIndex: number): {
        startIndex: number | undefined;
        endIndex: number | undefined;
        rows: {
            startIndex: number | undefined;
            endIndex: number | undefined;
            rowIndex: number;
            cells: {
                startIndex: number | undefined;
                endIndex: number | undefined;
                cellIndex: number;
            }[];
        }[];
    };
    /**
     * @description Retrieves all cell text from a table via standard DocumentApp API.
     * @param {string} documentId Target document identifier.
     * @param {number} [tableIndex=0] Zero-based sequence index.
     * @returns {Object} Table data {tableIndex, numRows, numColumns, data: unknown[][]}.
     */
    getTableData(documentId: string, tableIndex?: number): {
        tableIndex: number;
        numRows: number;
        numColumns: number;
        data: string[][];
    };
    getTableRow(documentId: string, tableIndex: number, rowIndex: number): {
        rowIndex: number;
        cells: string[];
    };
    getTableColumn(documentId: string, tableIndex: number, columnIndex: number): {
        columnIndex: number;
        cells: string[];
    };
    insertTableRow(documentId: string, tableIndex: number, rowIndex: number, cellValues?: string[]): {
        success: boolean;
        tableIndex: number;
        rowIndex: number;
        numCells: number;
    };
    appendTableRow(documentId: string, tableIndex: number, cellValues?: string[]): {
        success: boolean;
        tableIndex: number;
        rowIndex: number;
        numCells: number;
    };
    deleteTableRow(documentId: string, tableIndex: number, rowIndex: number): {
        success: boolean;
        tableIndex: number;
        deletedRowIndex: number;
    };
    updateTableCell(documentId: string, tableIndex: number, rowIndex: number, columnIndex: number, value: string): {
        success: boolean;
        tableIndex: number;
        rowIndex: number;
        columnIndex: number;
        value: string;
    };
    updateTableRow(documentId: string, tableIndex: number, rowIndex: number, cellValues: string[]): {
        success: boolean;
        tableIndex: number;
        rowIndex: number;
        updatedCells: number;
    };
    updateTableColumn(documentId: string, tableIndex: number, columnIndex: number, cellValues: string[]): {
        success: boolean;
        tableIndex: number;
        columnIndex: number;
        updatedRows: number;
    };
    copyTableRow(documentId: string, tableIndex: number, sourceRowIndex: number, targetRowIndex?: number | null): {
        success: boolean;
        tableIndex: number;
        sourceRowIndex: number;
        insertedRowIndex: number;
        numCells: number;
    };
    /**
     * @description Copies a table column's cells (preserving native formatting via
     * TableCell.copy()) from sourceColumnIndex into a new column at targetColumnIndex,
     * one row at a time. Mirrors copyTableRow's shape for columns.
     * @param {string} documentId Target document identifier.
     * @param {number} tableIndex Table ordinal.
     * @param {number} sourceColumnIndex Column to copy from.
     * @param {number} targetColumnIndex Column position to insert the copy at.
     * @returns {Object} {success, tableIndex, sourceColumnIndex, insertedColumnIndex, numRows}.
     * @throws {Error} If tableIndex is out of bounds, the table has no rows, sourceColumnIndex
     * is out of bounds, or targetColumnIndex is out of bounds (targetColumnIndex may equal the
     * first row's cell count, to insert the copy as a new last column).
     */
    copyTableColumn(documentId: string, tableIndex: number, sourceColumnIndex: number, targetColumnIndex: number): {
        success: boolean;
        tableIndex: number;
        sourceColumnIndex: number;
        insertedColumnIndex: number;
        numRows: number;
    };
    /**
     * @description Replaces one table cell's text content with a sequence of styled
     * segments, clearing the cell first and re-applying each segment's captured
     * Advanced-API TextStyle via native Text.setAttributes(). Used after a
     * formatting-preserving structural clone (copyTableRow/copyTableColumn) to
     * retext the clone without discarding its cell-level (border/shading/padding)
     * attributes, which clear()/setText() do not touch.
     *
     * Offset convention: `setAttributes` is called with an inclusive end offset
     * (`offset + rendered.length - 1`) for each segment, per Apps Script's
     * `Text.setAttributes(startOffset, endOffsetInclusive, attrs)` contract.
     * @param {string} documentId Target document identifier.
     * @param {number} tableIndex Table ordinal.
     * @param {number} rowIndex Row index of the cell to retext.
     * @param {number} columnIndex Column index of the cell to retext.
     * @param {Array<{rendered: string, style: Object}>} segments Ordered text+style segments.
     * @returns {Object} {success, tableIndex, rowIndex, columnIndex, runsApplied}.
     * @throws {Error} If tableIndex/rowIndex/columnIndex is out of bounds.
     */
    setCellRunStyles(documentId: string, tableIndex: number, rowIndex: number, columnIndex: number, segments: {
        rendered?: string;
        style?: GoogleAppsScript.Docs.Schema.TextStyle;
    }[]): {
        success: boolean;
        tableIndex: number;
        rowIndex: number;
        columnIndex: number;
        runsApplied: number;
    };
    deleteTableColumn(documentId: string, tableIndex: number, columnIndex: number): {
        success: boolean;
        tableIndex: number;
        deletedColumnIndex: number;
        affectedRows: number;
    };
    insertTableColumn(documentId: string, tableIndex: number, columnIndex: number, cellValues?: string[]): {
        success: boolean;
        tableIndex: number;
        insertedColumnIndex: number;
        affectedRows: number;
    };
    appendTableColumn(documentId: string, tableIndex: number, cellValues?: string[]): {
        success: boolean;
        tableIndex: number;
        appendedColumnIndex: number;
        affectedRows: number;
    };
    setColumnWidth(documentId: string, tableIndex: number, columnIndex: number, widthPoints: number): {
        success: boolean;
        tableIndex: number;
        columnIndex: number;
        widthPoints: number;
    };
    getColumnWidth(documentId: string, tableIndex: number, columnIndex: number): {
        tableIndex: number;
        columnIndex: number;
        widthPoints: number;
    };
    setRowBackgroundColor(documentId: string, tableIndex: number, rowIndex: number, color: string): {
        success: boolean;
        tableIndex: number;
        rowIndex: number;
        color: string;
        affectedCells: number;
    };
    setRowMinimumHeight(documentId: string, tableIndex: number, rowIndex: number, heightPoints: number): {
        success: boolean;
        tableIndex: number;
        rowIndex: number;
        heightPoints: number;
    };
    getRowMinimumHeight(documentId: string, tableIndex: number, rowIndex: number): {
        tableIndex: number;
        rowIndex: number;
        heightPoints: number;
    };
    clearTableRow(documentId: string, tableIndex: number, rowIndex: number): {
        success: boolean;
        tableIndex: number;
        rowIndex: number;
        clearedCells: number;
    };
    setCellBackgroundColor(documentId: string, tableIndex: number, rowIndex: number, columnIndex: number, color: string): {
        success: boolean;
        tableIndex: number;
        rowIndex: number;
        columnIndex: number;
        color: string;
    };
    getCellBackgroundColor(documentId: string, tableIndex: number, rowIndex: number, columnIndex: number): {
        tableIndex: number;
        rowIndex: number;
        columnIndex: number;
        color: string;
    };
    setCellPadding(documentId: string, tableIndex: number, rowIndex: number, columnIndex: number, padding: {
        top?: number;
        bottom?: number;
        left?: number;
        right?: number;
    }): {
        success: boolean;
        tableIndex: number;
        rowIndex: number;
        columnIndex: number;
        padding: {
            top?: number;
            bottom?: number;
            left?: number;
            right?: number;
        };
    };
    getCellPadding(documentId: string, tableIndex: number, rowIndex: number, columnIndex: number): {
        tableIndex: number;
        rowIndex: number;
        columnIndex: number;
        padding: {
            top: number;
            bottom: number;
            left: number;
            right: number;
        };
    };
    setCellVerticalAlignment(documentId: string, tableIndex: number, rowIndex: number, columnIndex: number, alignment: string): {
        success: boolean;
        tableIndex: number;
        rowIndex: number;
        columnIndex: number;
        alignment: string;
    };
    getCellVerticalAlignment(documentId: string, tableIndex: number, rowIndex: number, columnIndex: number): {
        tableIndex: number;
        rowIndex: number;
        columnIndex: number;
        alignment: string | null;
    };
    getCellDetails(documentId: string, tableIndex: number, rowIndex: number, columnIndex: number): {
        tableIndex: number;
        rowIndex: number;
        columnIndex: number;
        text: string;
        backgroundColor: string;
        width: number;
        padding: {
            top: number;
            bottom: number;
            left: number;
            right: number;
        };
        verticalAlignment: string | null;
        colSpan: number;
        rowSpan: number;
    };
    getTableMetadata(documentId: string, tableIndex: number): {
        tableIndex: number;
        numRows: number;
        numColumns: number;
        columnWidths: number[];
        rowMinHeights: number[];
        totalTables: number;
    };
    setRowTextAlignment(documentId: string, tableIndex: number, rowIndex: number, alignment: string): {
        success: boolean;
        tableIndex: number;
        rowIndex: number;
        alignment: string;
        affectedCells: number;
    };
    setRowBold(documentId: string, tableIndex: number, rowIndex: number, bold?: boolean): {
        success: boolean;
        tableIndex: number;
        rowIndex: number;
        bold: boolean;
        affectedCells: number;
    };
    /**
     * @private
     * @description Applies header-row bold, alternating-row background and column-width
     * styling to a freshly created/inserted `Table`. Shared by `_createTableWithStandardAPI`
     * (append-at-end) and `insertTableAtMarker` (positional insertion) so the styling logic
     * lives in exactly one place regardless of how the table was placed.
     * @param {GoogleAppsScript.Document.Table} table Native table to style.
     * @param {Array<Array<string>>} data The data the table was created from (used for row/column counts).
     * @param {Object} options {headerRow, alternatingRows, columnWidths}.
     */
    _applyTableStyling(table: GoogleAppsScript.Document.Table, data: unknown[][], options?: TableOptions): void;
    /**
     * @private
     * @description Bridges DocumentBuilder to native DocumentApp for table creation. Supports header styling and alternating row backgrounds.
     * @param {string} documentId Target document identifier.
     * @param {Object} op Table parameters {data, options: {headerRow, alternatingRows, columnWidths}}.
     * @returns {Object} Result summary {success, rows, columns}.
     */
    _createTableWithStandardAPI(documentId: string, op: Pick<Extract<DocumentOperation, {
        type: 'createTable';
    }>, 'data' | 'options'>): {
        success: boolean;
        rows: number;
        columns: number;
    };
    /**
     * @description Inserts a table immediately after the paragraph/element containing
     * `markerText`, instead of appending it at the document's end. Locates the marker via
     * native `body.findText()`, walks up from the matched text run to the top-level child of
     * `body` (a Paragraph/ListItem/etc.), and inserts the table right after that child's index.
     *
     * The marker text itself is NOT removed by this call — the caller (e.g. a facade doing a
     * scan-then-remove flow) is expected to remove it separately using the returned
     * `foundElementIndex`/its own marker-search logic. This mirrors the existing
     * find-placeholder / remove-text split already used by callers of `appendTable`.
     *
     * @param {string} documentId Target document identifier.
     * @param {string} markerText Literal text to search for (e.g. `{{TABELLA:sheetId}}`).
     * @param {Array<Array<string>>} data Table cell data.
     * @param {Object} [options={}] {headerRow, alternatingRows, columnWidths} - same as `_createTableWithStandardAPI`.
     * @returns {Object} Result summary {success, rows, columns, foundElementIndex}.
     * @throws {Error} If `markerText` is not found in the document (no silent fallback to append).
     */
    insertTableAtMarker(documentId: string, markerText: string, data: unknown[][], options?: TableOptions): {
        success: boolean;
        rows: number;
        columns: number;
        foundElementIndex: number;
    };
}
