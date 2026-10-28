import type { BuilderHtmlOutput, SidebarUi } from './UiContracts.js';
import type { GoogleLogger } from '../internal/core/GoogleService.js';
/**
 * @file GoogleApiWrapper/src/builders/SidebarBuilder.js
 * @description Fluent builder for creating HTML sidebars in Google Apps Script
 * @version 1.0
 */
export declare class SidebarBuilder {
    _ui: SidebarUi;
    _logger: Pick<GoogleLogger, 'debug'>;
    _htmlOutput: BuilderHtmlOutput | null;
    _title: string;
    _width: number;
    constructor(ui: SidebarUi, logger: Pick<GoogleLogger, 'debug'>);
    setTitle(title: string): this;
    setContent(html: string): this;
    setContentFromTemplate(template: {
        evaluate(): BuilderHtmlOutput;
    }): this;
    setWidth(pixels: number): this;
    show(): void;
    getHtmlOutput(): BuilderHtmlOutput | null;
}
