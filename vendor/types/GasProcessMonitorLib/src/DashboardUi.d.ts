import type { MonitorLogger, MonitorUiService, DashboardOptions } from './types.js';
/**
 * @file GasProcessMonitorLib/src/DashboardUi.ts
 * @description UI service for generating process monitoring dashboard sidebars
 * @version 1.0.0
 */
/**
 * UI generation service for process monitoring, creating interactive Google Apps Script sidebars with real-time status polling and progress visualization.
 * @class
 */
export declare class DashboardUi {
    private readonly _uiService;
    private readonly _logger;
    /**
     * Default polling interval in milliseconds
     * @static
     * @type {number}
     */
    static get DEFAULT_POLLING_INTERVAL(): number;
    /**
     * Default sidebar width in pixels
     * @static
     * @type {number}
     */
    static get DEFAULT_WIDTH(): number;
    /**
     * Initializes the UI service with required service facades.
     * @param {Object} uiService GoogleApiWrapper UiService for sidebar management.
     * @param {Object} logger Diagnostic output interface.
     * @throws {Error} If mandatory dependencies are missing.
     */
    constructor(uiService: MonitorUiService, logger: MonitorLogger);
    /**
     * Orchestrates the creation of a pre-configured sidebar builder for a specific job tracking context.
     * @param {string} jobId Unique identifier of the process to monitor.
     * @param {string} [title='Process Monitor'] User-facing sidebar heading.
     * @param {Object} [options={}] UI behavior overrides.
     * @param {number} [options.pollingInterval=1500] Client-side refresh rate in milliseconds.
     * @param {number} [options.width=300] Sidebar pixel width.
     * @returns {Object} Prepared sidebar orchestrator.
     * @throws {Error} If jobId is invalid.
     */
    createSidebar(jobId: string, title?: string, options?: DashboardOptions): import("./types.js").MonitorSidebar;
    /**
     * Synthesizes the complete HTML document including styles and client-side polling logic.
     * @private
     * @param {string} jobId target process identifier.
     * @param {number} pollingInterval client refresh rate.
     * @returns {string} Standalone HTML/CSS/JS payload.
     */
    _generateHtml(jobId: string, pollingInterval: number): string;
    /**
     * Generates the CSS component of the dashboard, implementing Material-inspired aesthetics.
     * @private
     * @returns {string} Inline style block.
     */
    _generateStyles(): string;
    /**
     * Generates the client-side JavaScript orchestrating asynchronous polling via google.script.run.
     * @private
     * @param {string} jobId target process identifier.
     * @param {number} pollingInterval local polling frequency.
     * @returns {string} Inline script block.
     */
    _generateScript(jobId: string, pollingInterval: number): string;
}
