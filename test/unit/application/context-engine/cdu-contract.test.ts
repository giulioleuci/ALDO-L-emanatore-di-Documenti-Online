import { ContextBuilder } from '../../../../src/application/context-engine/ContextBuilder';
import { makeOptions } from '../../../../src/application/context-engine/Recipe';

test('ContextBuilder produces only the canonical root/meta contract', () => {
  const cdu = new ContextBuilder().build(
    {
      target: '5A',
      tipoTarget: 'classe',
      now: new Date('2026-08-30T10:15:00Z'),
      configurazioneId: 'CONF-1',
      esecuzioneId: 'JOB-1',
      tipoOperazione: 'GENERAZIONE_DOCUMENTO',
      materiaCorrente: null
    },
    { providers: [], options: makeOptions() }
  );

  expect(cdu.meta).toMatchObject({
    configurazioneId: 'CONF-1',
    esecuzioneId: 'JOB-1',
    tipoOperazione: 'GENERAZIONE_DOCUMENTO',
    tipoOperazioneLabel: 'Generazione documento',
    target: '5A',
    tipoTarget: 'classe',
    materiaCorrente: null
  });
  expect(cdu.meta.oggi).toMatchObject({ breve: '30/08/2026', meseNome: 'agosto' });
  expect(cdu.meta).not.toHaveProperty('parametriInput');
  expect(cdu.meta).not.toHaveProperty('date');
  expect(cdu).not.toHaveProperty('progressivo');
  expect(Object.getOwnPropertyDescriptor(cdu, 'tech')?.enumerable).toBe(false);
  expect(JSON.parse(JSON.stringify(cdu))).toEqual({ meta: cdu.meta, focus: {} });
});
