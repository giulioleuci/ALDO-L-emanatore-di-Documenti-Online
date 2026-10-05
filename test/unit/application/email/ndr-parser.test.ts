import { parseNdr } from '../../../../src/application/email/NdrParser';

const GOOGLE = `Address not found
Your message wasn't delivered to nobody.123@scuola.it because the address couldn't be found, or is unable to receive mail.
The response was:
550 5.1.1 The email account that you tried to reach does not exist.`;
const RFC3464 = `Final-Recipient: rfc822; mario.rossi@dominio.it
Action: failed
Status: 5.1.1
Diagnostic-Code: smtp; 550 5.1.1 User unknown`;
const M365 = `Delivery has failed to these recipients or groups:
anna@azienda.com
The email address you entered couldn't be found.
Remote Server returned '550 5.1.10 RESOLVER.ADR.RecipientNotFound; Recipient not found by SMTP address lookup'`;
const TRANSIENT = `Delivery incomplete
There was a temporary problem delivering your message to a@b.it.
The response was:
452 4.2.2 Mailbox full`;

describe('parseNdr', () => {
  it('Google format', () =>
    expect(parseNdr(GOOGLE)).toEqual({
      recipient: 'nobody.123@scuola.it',
      code: '550',
      reason: '550 5.1.1 The email account that you tried to reach does not exist.'
    }));
  it('RFC 3464', () =>
    expect(parseNdr(RFC3464)).toMatchObject({ recipient: 'mario.rossi@dominio.it', code: '550' }));
  it('Microsoft 365', () =>
    expect(parseNdr(M365)).toMatchObject({ recipient: 'anna@azienda.com', code: '550' }));
  it('ignores transient 4xx', () => expect(parseNdr(TRANSIENT)).toBeNull());
  it('ignores non-NDR text', () => expect(parseNdr('hello')).toBeNull());
});
