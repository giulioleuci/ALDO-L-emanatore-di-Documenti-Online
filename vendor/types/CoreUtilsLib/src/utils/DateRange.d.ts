/**
 * @file CoreUtilsLib/src/utils/DateRange.js
 * @description Generic date-range value object: containment, duration, overlap,
 * and an open-ended sentinel. Extracted as a Code Reuse Initiative item so
 * callers stop hand-rolling `Date.getTime()` arithmetic and magic-number
 * "infinity" sentinels for open-ended periods (ref ALDO_GLF_AUDIT_RESULTS.md B-2).
 */
export declare class DateRange {
    start: Date;
    end: Date;
    /**
     * @param {Date} start Range start (inclusive).
     * @param {Date|null} [end] Range end (inclusive). Omit or pass `null` for an open-ended range.
     * @throws {TypeError} If `start` (or a provided `end`) is not a valid Date, or if `start` is after `end`.
     */
    constructor(start: Date, end?: Date | null);
    /** True if `end` is the open-ended sentinel (no upper bound was supplied). */
    isOpenEnded(): boolean;
    /** True if `date` falls within `[start, end]` inclusive. */
    contains(date: Date): boolean;
    /** Whole-day span, truncated (uses `DateUtils.daysBetween`). */
    durationInDays(): number;
    /** True if this range and `other` share at least one instant. */
    overlaps(other: Pick<DateRange, 'start' | 'end'>): boolean;
}
