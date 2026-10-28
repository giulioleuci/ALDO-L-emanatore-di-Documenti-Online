import type { GoogleLogger } from '../internal/core/GoogleService.js';
export type BuilderLogger = Pick<GoogleLogger, 'debug'>;
export type BuilderHtmlOutput = Pick<GoogleAppsScript.HTML.HtmlOutput, 'setTitle' | 'setWidth' | 'setHeight'>;
export interface DialogUi {
    showModalDialog(html: BuilderHtmlOutput, title: string): unknown;
}
export interface SidebarUi {
    showSidebar(html: BuilderHtmlOutput): unknown;
}
export interface UiBackend extends DialogUi, SidebarUi {
    createMenu: GoogleAppsScript.Base.Ui['createMenu'];
    alert(title: string, message: string, buttonSet?: unknown): unknown;
    prompt(title: string, message: string, buttonSet?: unknown): {
        getResponseText(): string;
        getSelectedButton(): unknown;
    };
    Button: Partial<Record<keyof GoogleAppsScript.Base.Ui['Button'], unknown>>;
    ButtonSet: Partial<Record<keyof GoogleAppsScript.Base.Ui['ButtonSet'], unknown>>;
}
