/**
 * @file GasSchemaValidatorLib/src/DatasetValidator.js
 * @description Declarative cross-table dataset validation. Complements
 * SchemaValidator (single-entity Zod shape validation) with the checks a
 * sheet-backed relational store needs and Zod cannot express: referential
 * integrity across tables, CSV foreign keys, dynamic column names, and
 * caller-supplied row predicates.
 *
 * Domain-agnostic by construction: rule ids, vocabulary and user-facing
 * messages belong to the caller; this engine only reports machine-readable
 * violations.
 */
import type { DatasetContext, DatasetRow, DatasetRule, Datasets, DatasetViolation } from './types.js';
type IndexedRows = {
    row: DatasetRow;
    rowIndex: number;
}[];
export declare class DatasetValidator {
    _logger: {
        warn(message: string): void;
    } | null;
    _indexes: Map<string, Set<string>>;
    /**
     * @param {{logger?: object}} [deps]
     */
    constructor(deps?: {
        logger?: {
            warn(message: string): void;
        };
    });
    /**
     * @param {Record<string, Array<Record<string, unknown>>>} datasets
     * @param {Array<object>} rules
     * @returns {{violations: Array<object>}}
     */
    validate(datasets: Datasets, rules?: DatasetRule[] | null): {
        violations: DatasetViolation[];
    };
    _applyRule(rule: DatasetRule, rows: IndexedRows, datasets: Datasets, context: DatasetContext): DatasetViolation[];
    _violation(rule: DatasetRule, rowIndex: number, column: string, value: string, details?: Record<string, unknown>): DatasetViolation;
    _index(datasets: Datasets, table: string, column: string): Set<string>;
    _required(rule: Extract<DatasetRule, {
        type: 'required';
    }>, indexedRows: IndexedRows): DatasetViolation[];
    _enum(rule: Extract<DatasetRule, {
        type: 'enum';
    }>, indexedRows: IndexedRows): DatasetViolation[];
    _json(rule: Extract<DatasetRule, {
        type: 'json';
    }>, indexedRows: IndexedRows): DatasetViolation[];
    _foreignKey(rule: Extract<DatasetRule, {
        type: 'foreignKey';
    }>, indexedRows: IndexedRows, datasets: Datasets): DatasetViolation[];
    _columnName(rule: Extract<DatasetRule, {
        type: 'columnName';
    }>, indexedRows: IndexedRows, datasets: Datasets): DatasetViolation[];
    _rowPredicate(rule: Extract<DatasetRule, {
        type: 'rowPredicate';
    }>, indexedRows: IndexedRows, context: DatasetContext): DatasetViolation[];
}
export {};
