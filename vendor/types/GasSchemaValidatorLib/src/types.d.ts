export interface ValidationIssue {
    field: string;
    message: string;
}
export type ValidationResult<T> = {
    success: true;
    data: T;
    errors?: never;
} | {
    success: false;
    errors: ValidationIssue[];
    data?: never;
};
export type DatasetRow = Record<string, unknown>;
export type Datasets = Record<string, DatasetRow[]>;
export interface DatasetContext {
    datasets: Datasets;
    index(table: string, column: string): Set<string>;
}
export interface PredicateViolation {
    column: string;
    value?: unknown;
    details?: Record<string, unknown>;
}
export type DatasetRule = {
    id: string;
    table: string;
} & ({
    type: 'required';
    columns: string[];
} | {
    type: 'enum';
    column: string;
    values: string[];
    allowEmpty?: boolean;
} | {
    type: 'json';
    column: string;
} | {
    type: 'foreignKey';
    column: string;
    targetTable: string;
    targetColumn: string;
    allowEmpty?: boolean;
    csv?: boolean;
    allowWildcard?: boolean;
} | {
    type: 'columnName';
    targetTable: string;
    targetColumn: string;
    knownColumns?: string[];
    ignore?: string[];
    normalize?: (name: string) => string;
} | {
    type: 'rowPredicate';
    check(row: DatasetRow, context: DatasetContext): PredicateViolation | null | undefined | false | void;
});
export interface DatasetViolation {
    ruleId: string;
    type: DatasetRule['type'];
    table: string;
    rowIndex: number;
    column: string;
    value: string;
    details: Record<string, unknown>;
}
