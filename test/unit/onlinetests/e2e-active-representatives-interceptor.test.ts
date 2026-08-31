import { e2eActiveRepresentativesInterceptor } from '../../../src/onlinetests/E2eActiveRepresentativesInterceptor';
import type { Cdu } from '../../../src/application/context-engine/Cdu';

function cduWithStudentRepresentatives(): Cdu {
  return {
    meta: {
      timestamp: '',
      idConfigurazione: '',
      tipoOperazione: '',
      idEsecuzione: '',
      date: { oggi: { breve: '', estesa: '', iso: '', giorno: '', mese: '', anno: '', ora: '' } },
      parametriInput: { target: '3C', tipoTarget: 'classe', materiaCorrente: null, opzioni: {} }
    },
    focus: {
      classe: {
        anagrafica: {
          nome: '3C',
          anno: 3,
          sezione: 'C',
          indirizzo: { nome: 'Test', nomeSintetico: 'T', sigla: 'T', tipo: 'Test' }
        },
        flags: {
          isClassePrima: false,
          isTriennio: true,
          isPrimoBiennio: false,
          isTerminale: false,
          isArticolata: false
        },
        rappresentanti: {
          studenti: {
            elenco: [{ nomeCompleto: 'Rossi Anna', email: 'anna@example.test' }],
            elencoDescrizione: ''
          },
          genitori: { elenco: [{ nomeCompleto: 'Rossi Mario' }], elencoDescrizione: '' }
        }
      }
    }
  } as Cdu;
}

test('marks E2E student-representative view-model entries active after the representative provider', () => {
  const cdu = cduWithStudentRepresentatives();

  e2eActiveRepresentativesInterceptor.intercept('rappresentanti', undefined, cdu);

  expect(cdu.focus.classe?.rappresentanti?.studenti.elenco).toEqual([
    { nomeCompleto: 'Rossi Anna', email: 'anna@example.test', active: true }
  ]);
  expect(cdu.focus.classe?.rappresentanti?.genitori.elenco).toEqual([{ nomeCompleto: 'Rossi Mario' }]);
});

test('leaves the E2E context untouched for providers other than rappresentanti', () => {
  const cdu = cduWithStudentRepresentatives();

  e2eActiveRepresentativesInterceptor.intercept('students', undefined, cdu);

  expect(cdu.focus.classe?.rappresentanti?.studenti.elenco).toEqual([
    { nomeCompleto: 'Rossi Anna', email: 'anna@example.test' }
  ]);
});
