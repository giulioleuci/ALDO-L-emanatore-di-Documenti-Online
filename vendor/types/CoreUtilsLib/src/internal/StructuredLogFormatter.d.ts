export interface TreePosition {
    depth?: number;
    isLast?: boolean;
    ancestorHasNext?: boolean[];
}
export interface JobReport {
    jobType?: string;
    runCount?: number;
    totalDurationMs?: number;
    totale?: number;
    falliti?: number;
    dettagliFalliti?: string[];
    saltati?: number;
    dettagliSaltati?: string[];
}
interface DetailEnvelope {
    reason?: unknown;
    content?: unknown;
    durationMs?: unknown;
}
declare const MAJOR_BORDER: string;
declare const SECTION_BORDER: string;
declare const ITEM_ICONS: {
    DOCUMENT: string;
    EMAIL: string;
    IMPORT: string;
    RETRY: string;
    GENERIC: string;
};
/** Pure formatter for deterministic hierarchical console lines. */
export declare class StructuredLogFormatter {
    _safeStringify: (value: unknown) => string;
    /**
     * @param {Function} safeStringify Safe object serialization function.
     */
    constructor(safeStringify: (value: unknown) => string);
    /**
     * @param {TreePosition} [position]
     * @returns {string}
     */
    treePrefix(position?: TreePosition): string;
    /** @returns {string[]} */
    jobStart(jobName: unknown, jobType: unknown): string[];
    /** @returns {string[]} */
    jobResume(jobName: unknown, jobType: unknown, details?: unknown): string[];
    /** @returns {string[]} */
    jobEnd(jobName: unknown, isSuccess: boolean, details?: unknown): string[];
    /** @returns {string[]} */
    jobSuspended(jobName: unknown, details?: unknown): string[];
    /** @returns {string[]} */
    batchStart(totalItems: unknown, label?: unknown): string[];
    /** @returns {string[]} */
    itemStart(itemIndex: unknown, totalItems: unknown, itemLabel: unknown, identifier: unknown, kind?: string): string[];
    /** @returns {string[]} */
    step(message: unknown, position?: TreePosition): string[];
    /** @returns {string[]} */
    pipelineStart(pipelineName: unknown, totalSteps: unknown, position?: TreePosition): string[];
    /** @returns {string[]} */
    pipelineStep(stepName: unknown, status: string, details?: unknown, position?: TreePosition): string[];
    /** @returns {string[]} */
    summary(label: unknown, durationMs: unknown, itemDetails?: unknown, position?: TreePosition): string[];
    /** @returns {string[]} Multi-line end-of-job report (job type, run count, cumulative real duration, task totals, skip and failure detail). */
    jobReport(details?: JobReport | null): string[];
    _isDetailEnvelope(details: unknown): details is DetailEnvelope;
    _duration(value: unknown): number | null;
    _resumeDetails(details: unknown): string;
    _contentText(content: unknown): string;
    _detailsText(details: unknown): string;
    _text(value: unknown): string;
    _count(value: unknown): number;
    _splitPlain(message: unknown): string[];
    _treeLines(message: unknown, position?: TreePosition): string[];
}
export { ITEM_ICONS, MAJOR_BORDER, SECTION_BORDER };
