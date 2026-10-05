import { creaHandlersInfra } from '../../../../src/application/pipelines/azioniInfra';
import { ConfigurationError } from '../../../../src/domain/errors/DomainError';
import { FakeDatabase } from '../../../fakes/FakeDatabase';
import { fixtureTables } from '../../../fixtures/tables';
import { FakeDriveFacade } from '../../../fakes/FakeDriveFacade';
import type { Cdu } from '../../../../src/application/context-engine/Cdu';

const logger = new LoggerService();

function setup(withBounces = true) {
  const riconcilia = jest.fn(() => ({
    ispezionati: 3,
    riconciliati: 2,
    anomalie: 1,
    dettagli: []
  }));
  const handlers = creaHandlersInfra({
    db: new FakeDatabase(fixtureTables()),
    drive: new FakeDriveFacade(),
    roles: { risolvi: () => [] },
    cdu: {} as Cdu,
    logger,
    ...(withBounces ? { bounces: { riconcilia } } : {})
  });
  return { handlers, riconcilia };
}

describe('VERIFICA_EMAIL_INVIATE', () => {
  it('parses GG-MM-AAAA HH:MM:SS bounds and a single pattern', () => {
    const { handlers, riconcilia } = setup();
    const n = handlers['VERIFICA_EMAIL_INVIATE']!(
      {
        tipo: 'VERIFICA_EMAIL_INVIATE',
        daTimestamp: '01-10-2026 08:30:00',
        aTimestamp: '05-10-2026 23:59:59',
        pattern: 'NOTIFICA_PDP'
      },
      {}
    );
    expect(n).toBe(2);
    expect(riconcilia).toHaveBeenCalledWith({
      da: new Date(2026, 9, 1, 8, 30, 0),
      a: new Date(2026, 9, 5, 23, 59, 59),
      patterns: ['NOTIFICA_PDP']
    });
  });

  it('passes only lookbackGiorni when no timestamps or pattern are given', () => {
    const { handlers, riconcilia } = setup();
    handlers['VERIFICA_EMAIL_INVIATE']!({ tipo: 'VERIFICA_EMAIL_INVIATE', lookbackGiorni: 3 }, {});
    expect(riconcilia).toHaveBeenCalledWith({ lookbackGiorni: 3 });
  });

  it('passes a pattern array through', () => {
    const { handlers, riconcilia } = setup();
    handlers['VERIFICA_EMAIL_INVIATE']!(
      { tipo: 'VERIFICA_EMAIL_INVIATE', pattern: ['A', 'B'] },
      {}
    );
    expect(riconcilia).toHaveBeenCalledWith({ patterns: ['A', 'B'] });
  });

  it('rejects a malformed timestamp with a ConfigurationError naming the field', () => {
    const { handlers, riconcilia } = setup();
    const run = () =>
      handlers['VERIFICA_EMAIL_INVIATE']!(
        { tipo: 'VERIFICA_EMAIL_INVIATE', daTimestamp: '2026-10-01' },
        {}
      );
    expect(run).toThrow(ConfigurationError);
    expect(run).toThrow(/daTimestamp/);
    expect(riconcilia).not.toHaveBeenCalled();
  });

  it('is skipped with a warning when the service is absent', () => {
    const warn = jest.spyOn(logger, 'warn').mockImplementation(() => undefined);
    const { handlers } = setup(false);
    expect(handlers['VERIFICA_EMAIL_INVIATE']!({ tipo: 'VERIFICA_EMAIL_INVIATE' }, {})).toBe(0);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});
