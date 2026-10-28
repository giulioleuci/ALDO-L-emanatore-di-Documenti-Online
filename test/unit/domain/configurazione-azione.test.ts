import { ConfigurazioneAzione } from '../../../src/domain/entities/ConfigurazioneAzione';
import { ConfigurationError } from '../../../src/domain/errors/DomainError';

test('reads every CONF_AZIONI column', () => {
  const azione = ConfigurazioneAzione.fromData({
    ID: 'ALLINEA_PERMESSI_CATTEDRE',
    TIPO: 'PERMESSI',
    ASSE: 'CLASSE',
    CONDIZIONE: '{{istituto.annoScolastico}} != ""',
    ATTIVO: true,
    AZIONI: '[{"tipo":"AGGIORNA_PERMESSI"}]',
    PERIODICITA: 'WEEKLY'
  });
  expect(azione.id).toBe('ALLINEA_PERMESSI_CATTEDRE');
  expect(azione.tipo).toBe('PERMESSI');
  expect(azione.asse).toBe('CLASSE');
  expect(azione.condizione).toBe('{{istituto.annoScolastico}} != ""');
  expect(azione.isAttivo()).toBe(true);
  expect(azione.getAzioniRaw()).toBe('[{"tipo":"AGGIORNA_PERMESSI"}]');
  expect(azione.periodicita).toBe('WEEKLY');
});

test('accepts the reserved SINGOLA axis', () => {
  expect(ConfigurazioneAzione.fromData({ ID: 'SANIFICA_TRIM', ASSE: 'SINGOLA' }).asse).toBe(
    'SINGOLA'
  );
});

test('rejects an unknown ASSE with a ConfigurationError', () => {
  expect(() => ConfigurazioneAzione.fromData({ ID: 'X', ASSE: 'GALASSIA' })).toThrow(
    ConfigurationError
  );
  expect(() => ConfigurazioneAzione.fromData({ ID: 'X', ASSE: 'GALASSIA' })).toThrow(/GALASSIA/);
});

test('ATTIVO defaults to true when the cell is blank and is false only when explicitly disabled', () => {
  expect(ConfigurazioneAzione.fromData({ ID: 'X', ASSE: 'SINGOLA' }).isAttivo()).toBe(true);
  expect(ConfigurazioneAzione.fromData({ ID: 'X', ASSE: 'SINGOLA', ATTIVO: '' }).isAttivo()).toBe(
    true
  );
  expect(
    ConfigurazioneAzione.fromData({ ID: 'X', ASSE: 'SINGOLA', ATTIVO: false }).isAttivo()
  ).toBe(false);
  expect(
    ConfigurazioneAzione.fromData({ ID: 'X', ASSE: 'SINGOLA', ATTIVO: 'FALSE' }).isAttivo()
  ).toBe(false);
});

test('an unset AZIONI cell reads as null (nothing to execute), including the Sheets empty-string round-trip', () => {
  expect(ConfigurazioneAzione.fromData({ ID: 'X', ASSE: 'SINGOLA' }).getAzioniRaw()).toBeNull();
  expect(
    ConfigurazioneAzione.fromData({ ID: 'X', ASSE: 'SINGOLA', AZIONI: '  ' }).getAzioniRaw()
  ).toBeNull();
});
