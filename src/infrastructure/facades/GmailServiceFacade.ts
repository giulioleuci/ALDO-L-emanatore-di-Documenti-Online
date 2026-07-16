/**
 * Gmail port (ref 11 §8). The real facade routes through the vendored
 * GoogleApiWrapper `MailService` global (GmailApp abstraction with retry and
 * rate limiting); ALDO never talks to GmailApp directly. `sendEmail` never
 * throws: failures surface as `{ success:false, error }` so SendEmailStep can
 * collect them without breaking the pipeline (11 §8).
 */
export interface EmailSendOptions {
  to: string[];
  subject: string;
  htmlBody: string;
  bcc?: string[];
  noReply?: boolean;
  attachments?: unknown[];
}

export interface EmailSendResult {
  success: boolean;
  error?: string;
}

export interface IGmailFacade {
  sendEmail(opts: EmailSendOptions): EmailSendResult;
}

export class GmailServiceFacade implements IGmailFacade {
  constructor(private readonly mail: MailService) {}

  sendEmail(opts: EmailSendOptions): EmailSendResult {
    const mailOpts: MailSendOptions = {
      to: opts.to,
      subject: opts.subject,
      body: '',
      htmlBody: opts.htmlBody
    };
    if (opts.bcc !== undefined) mailOpts.bcc = opts.bcc;
    if (opts.noReply !== undefined) mailOpts.noReply = opts.noReply;
    if (opts.attachments !== undefined) mailOpts.attachments = opts.attachments;
    const result = this.mail.send(mailOpts);
    return result.error === undefined
      ? { success: result.success }
      : { success: result.success, error: result.error };
  }
}
