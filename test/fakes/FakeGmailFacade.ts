import type {
  IGmailFacade,
  EmailSendOptions,
  EmailSendResult,
  BounceMessage
} from '../../src/infrastructure/facades/GmailServiceFacade';

/** In-memory Gmail double: records sends; any `to` in `failFor` simulates a send failure. */
export class FakeGmailFacade implements IGmailFacade {
  public readonly sent: EmailSendOptions[] = [];
  public readonly failFor = new Set<string>();
  public remainingQuota = 1000;
  public bounces: BounceMessage[] = [];
  public lastLookbackDays = 0;

  sendEmail(opts: EmailSendOptions): EmailSendResult {
    const broken = opts.to.find((e) => this.failFor.has(e));
    if (broken !== undefined) {
      return { success: false, error: `simulated failure for ${broken}` };
    }
    this.sent.push(opts);
    return { success: true };
  }

  getRemainingQuota(): number {
    return this.remainingQuota;
  }

  searchBounceMessages(lookbackDays: number): BounceMessage[] {
    this.lastLookbackDays = lookbackDays;
    return this.bounces;
  }
}
