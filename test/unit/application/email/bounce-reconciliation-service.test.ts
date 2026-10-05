import { BounceReconciliationService } from '../../../../src/application/email/BounceReconciliationService';
import type { BounceFilters } from '../../../../src/application/email/BounceReconciliationService';
import { LogEmail } from '../../../../src/domain/entities/LogEmail';
import { StatoEmail } from '../../../../src/domain/value-objects/enums';
import { FakeGmailFacade } from '../../../fakes/FakeGmailFacade';
import type { ILogEmailRepository } from '../../../../src/domain/repositories/ILogEmailRepository';
import type { IMasterSheetRepository } from '../../../../src/domain/repositories/IMasterSheetRepository';
import type { BounceMessage } from '../../../../src/infrastructure/facades/GmailServiceFacade';

const NOW = new Date('2026-10-05T09:00:00.000Z');
const NDR_DATE = new Date('2026-10-05T08:00:00.000Z');
const REASON = '550 5.1.1 The email account that you tried to reach does not exist.';

const ndrBody = (addr: string) =>
  `Address not found\nYour message wasn't delivered to ${addr} because the address couldn't be found.\nThe response was:\n${REASON}`;
const ndr = (addr: string, id = 'm1', date = NDR_DATE): BounceMessage => ({
  id,
  date,
  subject: 'Delivery Status Notification (Failure)',
  body: ndrBody(addr)
});
const row = (o: Record<string, string> = {}) =>
  LogEmail.fromData({
    PATTERN: 'NOTIFICA_PDP',
    DESTINATARI: 'a@x.it',
    DATA: '2026-10-05T07:00:00.000Z',
    STATO: 'SUCCESS',
    ...o
  });

function wire(rows: LogEmail[], opts: { user?: string; supervisor?: string } = {}) {
  const gmail = new FakeGmailFacade();
  const marcaRimbalzo = jest.fn<void, [LogEmail, string, Record<string, unknown>]>();
  const logMail = {
    findByStato: (s: StatoEmail) => rows.filter((r) => r.stato === s),
    marcaRimbalzo
  } as unknown as ILogEmailRepository;
  const master = {
    findConfigAnnoCorrente: () => ({
      hasSupervisore: () => (opts.supervisor ?? '') !== '',
      supervisoreEmail: opts.supervisor ?? ''
    })
  } as unknown as IMasterSheetRepository;
  const logger = { info: jest.fn(), warn: jest.fn(), error: jest.fn() } as unknown as LoggerService;
  const svc = new BounceReconciliationService({
    gmail,
    logMail,
    master,
    activeUser: { getEmail: () => opts.user ?? 'admin@scuola.it' },
    logger,
    now: () => NOW
  });
  const run = (f: BounceFilters = {}) => svc.riconcilia(f);
  return { gmail, marcaRimbalzo, logger, run };
}

describe('BounceReconciliationService', () => {
  it('marks the matching SUCCESS row with the SMTP diagnostic and NDR id', () => {
    const { gmail, marcaRimbalzo, run } = wire([row()]);
    gmail.bounces = [ndr('a@x.it')];
    const s = run();
    expect(s).toMatchObject({ ispezionati: 1, riconciliati: 1, anomalie: 0 });
    expect(marcaRimbalzo).toHaveBeenCalledTimes(1);
    expect(marcaRimbalzo).toHaveBeenCalledWith(
      expect.objectContaining({ destinatariRaw: 'a@x.it' }),
      `${REASON} (a@x.it)`,
      { bouncedAt: NOW.toISOString(), bounceMessageId: 'm1' }
    );
  });

  it('NDR for an unknown address is an anomaly: no mark, no mail, no crash', () => {
    const { gmail, marcaRimbalzo, run } = wire([row()]);
    gmail.bounces = [
      ndr('ghost@x.it'),
      { id: 'm2', date: NDR_DATE, subject: 's', body: 'garbage' }
    ];
    expect(run()).toMatchObject({ ispezionati: 2, riconciliati: 0, anomalie: 2 });
    expect(marcaRimbalzo).not.toHaveBeenCalled();
    expect(gmail.sent).toHaveLength(0);
  });

  it('only SUCCESS rows are considered: an already BOUNCED row makes the re-run a no-op', () => {
    const { gmail, marcaRimbalzo, run } = wire([row({ STATO: 'BOUNCED' })]);
    gmail.bounces = [ndr('a@x.it')];
    expect(run()).toMatchObject({ riconciliati: 0, anomalie: 1 });
    expect(marcaRimbalzo).not.toHaveBeenCalled();
    expect(gmail.sent).toHaveLength(0);
  });

  it('filters by pattern, da/a window and NDR date', () => {
    const rows = [
      row({ PATTERN: 'A', DESTINATARI: 'a@x.it' }),
      row({ PATTERN: 'B', DESTINATARI: 'b@x.it' }),
      row({ PATTERN: 'A', DESTINATARI: 'old@x.it', DATA: '2026-10-01T07:00:00.000Z' }),
      row({ PATTERN: 'A', DESTINATARI: 'late@x.it', DATA: '2026-10-05T08:30:00.000Z' }),
      // before the NDR (08:00) but after `a` (07:30): excluded ONLY by the upper bound
      row({ PATTERN: 'A', DESTINATARI: 'after@x.it', DATA: '2026-10-05T07:50:00.000Z' })
    ];
    const { gmail, marcaRimbalzo, run } = wire(rows);
    gmail.bounces = [
      ndr('a@x.it', 'n1'),
      ndr('b@x.it', 'n2'),
      ndr('old@x.it', 'n3'),
      ndr('late@x.it', 'n4'),
      ndr('after@x.it', 'n5')
    ];
    const s = run({
      patterns: ['A'],
      da: new Date('2026-10-04T00:00:00.000Z'),
      a: new Date('2026-10-05T07:30:00.000Z')
    });
    expect(s).toMatchObject({ ispezionati: 5, riconciliati: 1, anomalie: 4 });
    expect(marcaRimbalzo).toHaveBeenCalledTimes(1);
    expect(marcaRimbalzo.mock.calls[0][0].destinatariRaw).toBe('a@x.it');
    expect(marcaRimbalzo.mock.calls[0][2].bounceMessageId).toBe('n1');
  });

  it('multi-recipient row: NDR for one address marks the row and names that address', () => {
    const { gmail, marcaRimbalzo, run } = wire([row({ DESTINATARI: 'a@x.it,b@x.it' })]);
    gmail.bounces = [ndr('b@x.it')];
    const s = run();
    expect(s.riconciliati).toBe(1);
    expect(marcaRimbalzo.mock.calls[0][1]).toContain('b@x.it');
    expect(s.dettagli[0]).toMatchObject({ rejected: 'b@x.it', destinatari: 'a@x.it,b@x.it' });
  });

  it('summary mail goes to initiator + supervisor, deduplicated', () => {
    const both = wire([row()], { user: 'admin@scuola.it', supervisor: 'sup@scuola.it' });
    both.gmail.bounces = [ndr('a@x.it')];
    both.run();
    expect(both.gmail.sent).toHaveLength(1);
    expect(both.gmail.sent[0]!.to).toEqual(['admin@scuola.it', 'sup@scuola.it']);
    expect(both.gmail.sent[0]!.htmlBody).toContain('a@x.it');

    const blank = wire([row()], { user: 'admin@scuola.it', supervisor: '' });
    blank.gmail.bounces = [ndr('a@x.it')];
    blank.run();
    expect(blank.gmail.sent[0]!.to).toEqual(['admin@scuola.it']);

    const same = wire([row()], { user: 'admin@scuola.it', supervisor: 'admin@scuola.it' });
    same.gmail.bounces = [ndr('a@x.it')];
    same.run();
    expect(same.gmail.sent[0]!.to).toEqual(['admin@scuola.it']);
  });

  it('lookback: default 2 days; explicit da widens the Gmail search window', () => {
    const def = wire([]);
    def.run();
    expect(def.gmail.lastLookbackDays).toBe(2);

    const wide = wire([]);
    wide.run({ da: new Date(NOW.getTime() - 5 * 86_400_000) });
    expect(wide.gmail.lastLookbackDays).toBeGreaterThanOrEqual(5);
  });

  it('zero NDRs: zeros, info log, no mail', () => {
    const { gmail, logger, marcaRimbalzo, run } = wire([row()]);
    const info = jest.spyOn(logger, 'info');
    expect(run()).toEqual({ ispezionati: 0, riconciliati: 0, anomalie: 0, dettagli: [] });
    expect(info).toHaveBeenCalledTimes(1);
    expect(marcaRimbalzo).not.toHaveBeenCalled();
    expect(gmail.sent).toHaveLength(0);
  });
});
