import { GmailServiceFacade } from '../../../src/infrastructure/facades/GmailServiceFacade';
import { FakeGmailFacade } from '../../../test/fakes/FakeGmailFacade';

describe('FakeGmailFacade', () => {
  test('records sends and reports success', () => {
    const gmail = new FakeGmailFacade();
    const res = gmail.sendEmail({ to: ['a@x.it'], subject: 'S', htmlBody: '<p>hi</p>' });
    expect(res.success).toBe(true);
    expect(gmail.sent).toHaveLength(1);
    expect(gmail.sent[0]!.to).toEqual(['a@x.it']);
    expect(gmail.sent[0]!.htmlBody).toBe('<p>hi</p>');
  });

  test('failFor injects a failure without throwing (11 §8)', () => {
    const gmail = new FakeGmailFacade();
    gmail.failFor.add('broken@x.it');
    const res = gmail.sendEmail({ to: ['ok@x.it', 'broken@x.it'], subject: 'S', htmlBody: '' });
    expect(res.success).toBe(false);
    expect(res.error).toContain('simulated');
    expect(gmail.sent).toHaveLength(0);
  });
});

describe('GmailServiceFacade', () => {
  test('maps EmailSendOptions onto library MailService.send', () => {
    const calls: MailSendOptions[] = [];
    const mail = {
      send: (opts: MailSendOptions): MailSendResult => {
        calls.push(opts);
        return { success: true };
      }
    } as unknown as MailService;
    const facade = new GmailServiceFacade(mail);
    const res = facade.sendEmail({
      to: ['a@x.it', 'b@x.it'],
      subject: 'Oggetto',
      htmlBody: '<b>x</b>',
      bcc: ['super@x.it'],
      noReply: true
    });
    expect(res.success).toBe(true);
    expect(calls[0]).toEqual({
      to: ['a@x.it', 'b@x.it'],
      subject: 'Oggetto',
      body: '',
      htmlBody: '<b>x</b>',
      bcc: ['super@x.it'],
      noReply: true,
      attachments: undefined
    });
  });

  test('propagates library failure result', () => {
    const mail = { send: (): MailSendResult => ({ success: false, error: 'quota' }) } as unknown as MailService;
    const res = new GmailServiceFacade(mail).sendEmail({ to: ['a@x.it'], subject: 'S', htmlBody: '' });
    expect(res).toEqual({ success: false, error: 'quota' });
  });
});
