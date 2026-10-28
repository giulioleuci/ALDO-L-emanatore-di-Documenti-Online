import type { GoogleLogger } from '../internal/core/GoogleService.js';
type CronSchedule = {
    type: 'minutes' | 'hours';
    interval: number;
} | {
    type: 'daily';
    hour: number;
} | {
    type: 'weekly';
    hour: number;
    weekDay: GoogleAppsScript.Base.Weekday;
};
/**
 * @file GoogleApiWrapper/src/services/MyTriggerService.js
 * @description Facade for Google Apps Script's ScriptApp trigger management.
 * Provides a clean, testable interface for creating and managing triggers.
 * @version 1.0 - Translated from Italian and refactored for standalone use.
 */
/**
 * @class TriggerService
 * @description Facade for Google Apps Script ScriptApp trigger management. Specializes in time-based scheduling for JobRunnerLib resumption and recurring maintenance tasks. Provides programmatic discovery, audit, and cleanup of script triggers.
 *
 * @property {LoggerService} _logger Diagnostic logger.
 */
export declare class TriggerService {
    _logger: GoogleLogger;
    /**
     * @description Initializes TriggerService with diagnostic logging.
     * @param {LoggerService} logger Diagnostic logger.
     */
    constructor(logger: GoogleLogger, legacyUtils?: object, legacyExceptionService?: object);
    /**
     * @description Schedules a one-time execution after a specific delay. Ideal for Approaching-Timeout resumption patterns.
     * @param {string} functionName Target function identifier.
     * @param {number} milliseconds Execution delay.
     * @returns {string} Unique trigger identifier.
     * @throws {Error} If delay is invalid or quota exceeded.
     */
    createTimedTrigger(functionName: string, milliseconds: number): string;
    /**
     * @description Schedules a recurring execution based on a simplified CRON-like expression.
     * @param {string} functionName Target function identifier.
     * @param {string} cronExpression Schedule definition (e.g., 'every 5 minutes').
     * @returns {string} Unique trigger identifier.
     * @throws {Error} On invalid schedule expression.
     */
    createRecurringTrigger(functionName: string, cronExpression: string): string;
    /**
     * @private
     * @description Maps CRON-like strings to native ScriptApp trigger builders.
     * @param {string} cronExpression Schedule definition.
     * @returns {Object} Parsed schedule metadata.
     */
    _parseCronExpression(cronExpression: string): CronSchedule;
    /**
     * @description Audits all triggers associated with the current script project.
     * @returns {Object[]} Collection of trigger metadata {id, function, type, event}.
     */
    getAllTriggers(): {
        id: string;
        function: string;
        type: string;
        event: GoogleAppsScript.Script.EventType;
    }[];
    /**
     * @description Retrieves a specific trigger by its ID.
     * @param {string} triggerId Unique ID of the trigger.
     * @returns {GoogleAppsScript.Script.Trigger|null} Trigger object or null if not found.
     */
    findTriggerById(triggerId: string): GoogleAppsScript.Script.Trigger | null;
    /**
     * @description Destroys a specific trigger.
     * @param {string} triggerId Unique ID of the trigger to delete.
     * @returns {boolean} True if deleted successfully, false if not found.
     */
    deleteTriggerById(triggerId: string): boolean;
    /**
     * @description Destroys all triggers targeting a specific global function.
     * @param {string} functionName Name of the function.
     * @returns {number} Number of triggers deleted.
     */
    deleteTriggersByFunction(functionName: string): number;
    /**
     * @description Destroys all project-associated triggers. WARNING: Destructive.
     * @returns {number} Number of triggers deleted.
     */
    deleteAllTriggers(): number;
    /**
     * @description Validates presence of at least one trigger for a specific function.
     * @param {string} functionName Name of the function.
     * @returns {boolean}
     */
    triggerExistsForFunction(functionName: string): boolean;
    /**
     * @description Retrieves detailed metadata for a trigger.
     * @param {string} triggerId Unique ID of the trigger.
     * @returns {Object|null} Metadata {id, function, type, event, enabled}.
     */
    getTriggerInfo(triggerId: string): {
        id: string;
        function: string;
        type: string;
        event: GoogleAppsScript.Script.EventType;
        enabled: boolean;
    } | null;
    /**
     * @description Finds all triggers for a specific function.
     * @param {string} functionName Name of the function.
     * @returns {Object[]} Collection of trigger metadata.
     */
    findTriggersByFunction(functionName: string): {
        id: string;
        function: string;
        type: string;
        event: GoogleAppsScript.Script.EventType;
    }[];
    /**
     * @description Finds all triggers of a specific type.
     * @param {string} triggerType Type of trigger (e.g., 'time_based').
     * @returns {Object[]} Collection of trigger metadata.
     */
    findTriggersByType(triggerType: string): {
        id: string;
        function: string;
        type: string;
        event: GoogleAppsScript.Script.EventType;
    }[];
    /**
     * @private
     * @description Determines the type of a trigger.
     * @param {GoogleAppsScript.Script.Trigger} trigger Native GAS trigger.
     * @returns {string} Category string.
     */
    _determineTriggerType(trigger: {
        getEventType(): GoogleAppsScript.Script.EventType | string;
    }): "other" | "time_based" | "document_open" | "document_edit" | "form_submit" | "spreadsheet_change" | "calendar_event_updated" | "unknown";
    /**
     * @description Schedules a one-time execution at an absolute Date/Time.
     * @param {string} functionName Target function identifier.
     * @param {Date} date Fire date.
     * @returns {string} Unique identifier.
     */
    createTriggerAt(functionName: string, date: Date): string;
    /**
     * @description Schedules high-frequency recurring execution.
     * @param {string} functionName Target function identifier.
     * @param {number} minutes Interval in minutes (1, 5, 10, 15, or 30).
     * @returns {string} Unique identifier.
     */
    createEveryMinutesTrigger(functionName: string, minutes: number): string;
    /**
     * @description Schedules hourly recurring execution.
     * @param {string} functionName Target function identifier.
     * @param {number} hours Interval in hours (1, 2, 4, 6, 8, or 12).
     * @returns {string} Unique identifier.
     */
    createEveryHoursTrigger(functionName: string, hours: number): string;
    /**
     * @description Schedules daily recurring execution at a specific hour.
     * @param {string} functionName Target function identifier.
     * @param {number} hour Hour of day (0-23).
     * @returns {string} Unique identifier.
     */
    createDailyTrigger(functionName: string, hour: number): string;
    /**
     * @description Schedules weekly recurring execution on a specific day.
     * @param {string} functionName Target function identifier.
     * @param {GoogleAppsScript.Base.Weekday} weekDay Day of week.
     * @param {number} hour Hour of day (0-23).
     * @returns {string} Unique identifier.
     */
    createWeeklyTrigger(functionName: string, weekDay: GoogleAppsScript.Base.Weekday, hour: number): string;
}
export {};
