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
  cc?: string[];
  bcc?: string[];
  replyTo?: string;
  noReply?: boolean;
  attachments?: unknown[];
}

export interface EmailSendResult {
  success: boolean;
  error?: string;
}

export interface BounceMessage {
  id: string;
  date: Date;
  subject: string;
  body: string;
}

export interface IGmailFacade {
  sendEmail(opts: EmailSendOptions): EmailSendResult;
  getRemainingQuota(): number;
  searchBounceMessages(lookbackDays: number): BounceMessage[];
}

export class GmailServiceFacade implements IGmailFacade {
  constructor(private readonly mail: MailService) {}

  getRemainingQuota(): number {
    return this.mail.getQuotaUsage();
  }

  sendEmail(opts: EmailSendOptions): EmailSendResult {
    const mailOpts: MailSendOptions = {
      to: opts.to,
      subject: opts.subject,
      body: '',
      htmlBody: opts.htmlBody
    };
    if (opts.cc !== undefined) mailOpts.cc = opts.cc;
    if (opts.bcc !== undefined) mailOpts.bcc = opts.bcc;
    if (opts.replyTo !== undefined) mailOpts.replyTo = opts.replyTo;
    if (opts.noReply !== undefined) mailOpts.noReply = opts.noReply;
    if (opts.attachments !== undefined) mailOpts.attachments = opts.attachments;
    const result = this.mail.send(mailOpts);
    return result.error === undefined
      ? { success: result.success }
      : { success: result.success, error: result.error };
  }

  searchBounceMessages(lookbackDays: number): BounceMessage[] {
    return this.mail
      .searchMessages(`from:mailer-daemon newer_than:${Math.max(1, Math.ceil(lookbackDays))}d`, 100)
      .map((m) => ({ id: m.id, date: m.date, subject: m.subject, body: m.plainBody }));
  }
}
