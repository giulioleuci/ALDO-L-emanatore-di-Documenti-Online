import type { GoogleLogger, GoogleRetryExecutor } from '../internal/core/GoogleService.js';
type MailLogger = Pick<GoogleLogger, 'error' | 'debug'>;
export type EmailRecipient = string | string[];
export interface EmailOptions extends Omit<GoogleAppsScript.Gmail.GmailAdvancedOptions, 'cc' | 'bcc'> {
    to: EmailRecipient;
    subject: string;
    body?: string;
    cc?: EmailRecipient;
    bcc?: EmailRecipient;
}
export type SendResult = {
    success: true;
} | {
    success: false;
    error: string;
};
/**
 * @class MailService
 * @description Stateless service for email management via GmailApp/MailApp. Implements quota awareness, sequential rate limiting, and resilient delivery via exceptionService.
 *
 * @property {LoggerService} _logger Diagnostic logger.
 * @property {UtilsService} _utils Foundational utilities (requires sleep).
 * @property {ExceptionService} _exceptionService Resiliency provider.
 * @property {number} _rateLimitMs Throttling delay between sequential operations.
 */
export declare class MailService {
    _logger: MailLogger;
    _utils: {
        sleep(milliseconds: number): unknown;
    };
    _exceptionService: GoogleRetryExecutor | null;
    _rateLimitMs: number;
    /**
     * @description Initializes MailService with mandatory utilities and optional resiliency.
     * @param {LoggerService} logger Diagnostic logger.
     * @param {UtilsService} utils Foundational utilities (must provide sleep()).
     * @param {ExceptionService} [exceptionService=null] Resiliency provider.
     * @param {Object} [options={}] Configuration overrides.
     * @param {number} [options.rateLimitMs=100] Sequential send delay.
     * @throws {Error} If utils.sleep is missing.
     */
    constructor(logger: MailLogger | null | undefined, utils: {
        sleep(milliseconds: number): unknown;
    }, exceptionService?: GoogleRetryExecutor | null, options?: {
        rateLimitMs?: number;
    });
    /**
     * @description Returns the remaining daily email quota for the current user.
     * @returns {number} Remaining email count.
     */
    getQuotaUsage(): number;
    /**
     * @description Searches the user's mailbox with Gmail search syntax and flattens the matching threads to message summaries.
     * @param {string} query Gmail search query (e.g. 'from:mailer-daemon newer_than:2d').
     * @param {number} [maxResults=50] Maximum messages returned.
     * @returns {Array<{id: string, threadId: string, subject: string, from: string, date: Date, plainBody: string}>} Never throws; [] on error.
     */
    searchMessages(query: string, maxResults?: number): {
        id: string;
        threadId: string;
        subject: string;
        from: string;
        date: GoogleAppsScript.Base.Date;
        plainBody: string;
    }[];
    /**
     * @description Sends a single email with resilient retry logic. Normalizes recipient arrays to comma-separated strings.
     * @param {Object} emailOptions Transmission parameters.
     * @param {string|string[]} emailOptions.to Primary recipient(s).
     * @param {string} emailOptions.subject Message subject.
     * @param {string} [emailOptions.body] Plain text content.
     * @param {string} [emailOptions.htmlBody] HTML content.
     * @param {BlobSource[]} [emailOptions.attachments] File attachments.
     * @returns {Object} Transmission result {success, error}.
     */
    send(emailOptions: EmailOptions): SendResult;
    /**
     * @description Sequentially transmits a collection of emails with inter-operation sleep.
     * @param {Object[]} emails Array of transmission parameters.
     * @returns {Object} Result summary {successful: Object[], failed: Array<{email, error}>}.
     */
    sendBatch<Email extends EmailOptions>(emails: Email[]): {
        successful: Email[];
        failed: Array<{
            email: Email;
            error: string;
        }>;
    };
    /**
     * @description Creates a Gmail draft without transmission.
     * @param {Object} emailOptions Drafting parameters.
     * @returns {Object} Result {success, draftId, error}.
     */
    createDraft(emailOptions: EmailOptions): {
        success: boolean;
        draftId: string;
        error?: undefined;
    } | {
        success: boolean;
        error: string;
        draftId?: undefined;
    };
    /**
     * @description Transmits personalized emails generated via callback for each recipient.
     * @param {Object[]} recipientData Contextual data for body generation.
     * @param {Function} bodyGenerator Factory function: (recipient) => bodyContent.
     * @param {string} subject Uniform subject line.
     * @param {boolean} [isHtml=true] Toggle between HTML and plain text generation.
     * @returns {Object} Transmission summary {sent, failed, details}.
     */
    sendBulk<Recipient extends {
        email: EmailRecipient;
    }>(recipientData: Recipient[], bodyGenerator: (recipient: Recipient) => string, subject: string, isHtml?: boolean): {
        sent: number;
        failed: number;
        details: {
            successful: EmailRecipient[];
            failed: Array<{
                email: EmailRecipient;
                error: string;
            }>;
        };
    };
    /**
     * @description Transmits a standard HTML notification template.
     * @param {string|string[]} emails Target recipient(s).
     * @param {string} title Notification header.
     * @param {string} message Primary notification content.
     * @returns {Object} Transmission result.
     */
    sendNotification(emails: string | string[], title: string, message: string): SendResult;
}
export {};
