import { LogEmailRepository } from '../../../src/infrastructure/repositories/LogEmailRepository';
import { StatoEmail } from '../../../src/domain/value-objects/enums';
import { Email } from '../../../src/domain/value-objects/Email';
import { FakeDatabase } from '../../fakes/FakeDatabase';
import { fixtureTables } from '../../fixtures/tables';

describe('LogEmailRepository.marcaRimbalzo', () => {
  it('flips SUCCESS to BOUNCED, appends diagnostic and merges meta into ALLEGATI', () => {
    const tables = fixtureTables();
    tables['LOG_MAIL'] = [];
    const repo = new LogEmailRepository(new FakeDatabase(tables));
    const log = repo.registraInvio(
      'NOTIFICA_PDP',
      [Email.of('a@x.it')],
      StatoEmail.SUCCESS,
      '<p>hi</p>',
      {
        logicalTargetId: 't1'
      }
    );
    repo.marcaRimbalzo(log, '550 5.1.1 User unknown', {
      bouncedAt: '2026-10-05T08:00:00.000Z',
      bounceMessageId: 'm1'
    });
    const [row] = repo.findByStato(StatoEmail.BOUNCED);
    expect(row!.errore).toBe('Bounce: 550 5.1.1 User unknown');
    expect(row!.getAllegati()).toEqual({
      logicalTargetId: 't1',
      bouncedAt: '2026-10-05T08:00:00.000Z',
      bounceMessageId: 'm1'
    });
    expect(repo.findFailed()).toHaveLength(0);
  });
});
