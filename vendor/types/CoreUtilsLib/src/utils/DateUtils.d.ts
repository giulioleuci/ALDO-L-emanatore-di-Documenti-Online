/**
 * @file CoreUtilsLib/src/utils/DateUtils.js
 * @description Extracted DateUtils utility module.
 */
/**
 * Universal date parser shared by CoreUtilsLib consumers.
 * Day-first strings (GG/MM/AA, GG/MM/AAAA) parse as UTC midnight.
 * @param {Date|string|number|null|undefined} input Multi-format date input.
 * @returns {Date|null} Parsed Date object or null for invalid inputs.
 */
export declare function parseDate(input: unknown): Date | null;
export declare class DateUtils {
    /**
     * Milliseconds in one day (86,400,000).
     * @returns {number} 86400000
     * @example
     * const daysInMs = DateUtils.MILLIS_PER_DAY * 7; // 1 week in milliseconds
     */
    static get MILLIS_PER_DAY(): number;
    /**
     * Milliseconds in one hour (3,600,000).
     * @returns {number} 3600000
     * @example
     * const timeout = DateUtils.MILLIS_PER_HOUR * 2; // 2 hours
     */
    static get MILLIS_PER_HOUR(): number;
    /**
     * Milliseconds in one minute (60,000).
     * @returns {number} 60000
     * @example
     * const delay = DateUtils.MILLIS_PER_MINUTE * 5; // 5 minutes
     */
    static get MILLIS_PER_MINUTE(): number;
    /**
     * Milliseconds in one second (1,000).
     * @returns {number} 1000
     * @example
     * const timeout = DateUtils.MILLIS_PER_SECOND * 30; // 30 seconds
     */
    static get MILLIS_PER_SECOND(): number;
    /**
     * Universal date parser for Date objects, ISO strings, Unix timestamps (>=100k), and Sheets serials (<100k).
     * @param {Date|string|number|null|undefined} input Multi-format date input.
     * @returns {Date|null} Parsed Date object or null for invalid inputs.
     */
    parseDate(input: unknown): Date | null;
    /**
     * Converts a Google Sheets serial number (days since Dec 30, 1899) to a Date object.
     * @param {number} serialNumber Sheets date serial number.
     * @returns {Date} Parsed Date object.
     */
    parseGoogleSheetsDate(serialNumber: number): Date;
    /**
     * Strictly parses an ISO 8601 formatted date string.
     * @param {string} isoString ISO 8601 date string.
     * @returns {Date|null} Parsed Date object or null if invalid.
     */
    parseISODate(isoString: unknown): Date | null;
    /**
     * Parses a date string using a specific pattern (DD/MM/YYYY, MM/DD/YYYY, or YYYY-MM-DD).
     * @param {string} dateString Formatted date string.
     * @param {string} format Expected format pattern.
     * @returns {Date|null} Parsed Date object or null if unparseable.
     */
    parseDateWithFormat(dateString: string, format: string): Date | null;
    /**
     * Formats a Date object as a standard ISO 8601 string.
     * @param {Date} date Date to format.
     * @returns {string|null} ISO 8601 string or null if date is invalid.
     */
    formatISODate(date: unknown): string | null;
    /**
     * Formats a Date object using custom tokens (YYYY, MM, DD, HH, mm, ss, SSS).
     * @param {Date} date Date to format.
     * @param {string} [format='YYYY-MM-DD'] Token-based format pattern.
     * @param {Object} [options={}] Formatting options.
     * @param {boolean} [options.utc=false] If true, tokens are derived from the UTC
     *   components of the date (deterministic, host-timezone independent) instead
     *   of the local ones.
     * @returns {string|null} Formatted string or null if date is invalid.
     */
    formatDate(date: unknown, format?: string, options?: {
        utc?: boolean;
    } | null): string | null;
    /**
     * Converts a Date object to a Google Sheets serial number (decimal days since epoch).
     * @param {Date} date Date to convert.
     * @returns {number|null} Sheets serial number or null if invalid.
     */
    toGoogleSheetsDate(date: unknown): number | null;
    /**
     * Returns a new Date with specified days added (or subtracted if negative).
     * @param {Date} date Reference date.
     * @param {number} days Days to add.
     * @returns {Date|null} Resulting date or null if invalid.
     */
    /** @private Clones a Date instance. @param {Date} date Valid date object. @returns {Date} New instance. */
    _cloneDate(date: Date): Date;
    /**
     * @private Calculates millisecond difference (d2 - d1). @param {Date} date1 Start date. @param {Date} date2 End date. @returns {number|null} Diff or null if invalid.
     */
    _diffMs(date1: unknown, date2: unknown): number | null;
    addDays(date: unknown, days: number): Date | null;
    /**
     * Returns a new Date with specified hours added.
     * @param {Date} date Reference date.
     * @param {number} hours Hours to add.
     * @returns {Date|null} Resulting date or null if invalid.
     */
    addHours(date: unknown, hours: number): Date | null;
    /**
     * Returns a new Date with specified minutes added.
     * @param {Date} date Reference date.
     * @param {number} minutes Minutes to add.
     * @returns {Date|null} Resulting date or null if invalid.
     */
    addMinutes(date: unknown, minutes: number): Date | null;
    /**
     * Returns a new Date with specified months added.
     * @param {Date} date Reference date.
     * @param {number} months Months to add.
     * @returns {Date|null} Resulting date or null if invalid.
     */
    addMonths(date: unknown, months: number): Date | null;
    /**
     * Returns a new Date with specified years added.
     * @param {Date} date Reference date.
     * @param {number} years Years to add.
     * @returns {Date|null} Resulting date or null if invalid.
     */
    addYears(date: unknown, years: number): Date | null;
    /**
     * Calculates truncated day difference between two dates (date2 - date1).
     * @param {Date} date1 Start date.
     * @param {Date} date2 End date.
     * @returns {number|null} Day count or null if invalid.
     */
    daysBetween(date1: unknown, date2: unknown): number | null;
    /**
     * Calculates truncated hour difference between two dates.
     * @param {Date} date1 Start date.
     * @param {Date} date2 End date.
     * @returns {number|null} Hour count or null if invalid.
     */
    hoursBetween(date1: unknown, date2: unknown): number | null;
    /**
     * Calculates truncated minute difference between two dates.
     * @param {Date} date1 Start date.
     * @param {Date} date2 End date.
     * @returns {number|null} Minute count or null if invalid.
     */
    minutesBetween(date1: unknown, date2: unknown): number | null;
    /**
     * Checks if date1 is chronologically earlier than date2.
     * @param {Date} date1 Comparison date.
     * @param {Date} date2 Reference date.
     * @returns {boolean|null} Comparison result or null if invalid.
     */
    isBefore(date1: unknown, date2: unknown): boolean | null;
    /**
     * Checks if date1 is chronologically later than date2.
     * @param {Date} date1 Comparison date.
     * @param {Date} date2 Reference date.
     * @returns {boolean|null} Comparison result or null if invalid.
     */
    isAfter(date1: unknown, date2: unknown): boolean | null;
    /**
     * Checks if two dates fall on the same calendar day (ignores time).
     * @param {Date} date1 First date.
     * @param {Date} date2 Second date.
     * @returns {boolean|null} True if YYYY-MM-DD matches, null if invalid.
     */
    isSameDay(date1: unknown, date2: unknown): boolean | null;
    /**
     * Returns a new Date set to 00:00:00.000 for the specified day.
     * @param {Date} date Reference date.
     * @returns {Date|null} Midnight Date instance or null if invalid.
     */
    startOfDay(date: unknown): Date | null;
    /**
     * Returns a new Date set to 23:59:59.999 for the specified day.
     * @param {Date} date Reference date.
     * @returns {Date|null} End-of-day Date instance or null if invalid.
     */
    endOfDay(date: unknown): Date | null;
    /**
     * Validates if a value is a Date object or unparseable date string/number.
     * @param {*} value Input to validate.
     * @returns {boolean} True if parseable as a valid date.
     */
    isValidDate(value: unknown): boolean;
    /**
     * Formats millisecond duration into a human-readable string (e.g., '1d 2h 5m 30s').
     * @param {number} ms Duration in milliseconds.
     * @param {{short?:boolean, showMs?:boolean}} [options={}] Formatting behavior options.
     * @returns {string} Formatted duration string or '--' for invalid inputs.
     */
    formatDuration(ms: number | null | undefined, options?: {
        short?: boolean;
        showMs?: boolean;
    }): string;
}
