import {
  buildMovimentoAlunnoVm,
  buildMovimentoClasseVm,
  buildPresenzaAlunnoVm
} from '../../../../../src/application/context-engine/mappers/movimentoVmMapper';
import { MovimentoAlunno } from '../../../../../src/domain/entities/MovimentoAlunno';
import { TipoMovimento } from '../../../../../src/domain/value-objects/enums';

const classe = (nome: string) => ({ nome });
const resolveClasse = (id: string) => (['4A', '5A'].includes(id) ? classe(id) : null);

function movimento(tipo: TipoMovimento, data: string, da: string, a: string) {
  return new MovimentoAlunno({ STUDENTE: 'anna@scuola.it', TIPO: tipo, DATA: data, DA: da, A: a });
}

test('maps one canonical student movement with printable labels and endpoints', () => {
  expect(buildMovimentoAlunnoVm(movimento(TipoMovimento.CAMBIO, '2026-02-03', '4A', '5A'), resolveClasse)).toEqual({
    tipo: 'CAMBIO',
    tipoLabel: 'Cambio di classe',
    data: '2026-02-03',
    dataBreve: '03/02/2026',
    dataEstesa: '03 febbraio 2026',
    provenienza: { valore: '4A', descrizione: '4A', classe: { nome: '4A' }, scuolaEsterna: null, isClasse: true, isScuolaEsterna: false },
    destinazione: { valore: '5A', descrizione: '5A', classe: { nome: '5A' }, scuolaEsterna: null, isClasse: true, isScuolaEsterna: false },
    isIngresso: false,
    isUscita: false,
    isRitirato: false,
    isCambioClasse: true,
    descrizione: 'Cambio di classe da 4A a 5A'
  });
});

test.each([
  ['ENTRATA', new Set(['5A']), 'Scuola esterna', '5A'],
  ['USCITA', new Set(['4A']), '4A', 'Scuola esterna'],
  ['INTERNA', new Set(['4A', '5A']), '4A', '5A']
] as const)('derives %s relative to class scope', (direzione, scope, da, a) => {
  const base = buildMovimentoAlunnoVm(movimento(TipoMovimento.CAMBIO, '2026-02-03', da, a), resolveClasse);
  const result = buildMovimentoClasseVm(base, { nomeCompleto: 'Verdi Anna', email: 'anna@scuola.it' }, scope);
  expect(result.direzione).toBe(direzione);
  expect(result.isEntrata).toBe(direzione === 'ENTRATA');
  expect(result.isUscita).toBe(direzione === 'USCITA');
  expect(result.isMovimentoInterno).toBe(direzione === 'INTERNA');
});

test('presence uses the same filtered canonical movement collection', () => {
  const cambio = buildMovimentoAlunnoVm(movimento(TipoMovimento.CAMBIO, '2026-02-03', '4A', '5A'), resolveClasse);
  expect(buildPresenzaAlunnoVm([cambio], { isCalcolato: true, isPresente: true }, '5A')).toEqual({
    annoPrecedente: { isCalcolato: true, isPresente: true },
    isPresenteTuttoAnno: false,
    hasCambiatoClasse: true,
    classePrecedente: { nome: '4A' },
    hasClassePrecedente: true
  });
});

test('presence ignores a transfer away from the current class', () => {
  const cambio = buildMovimentoAlunnoVm(
    movimento(TipoMovimento.CAMBIO, '2026-02-03', '5A', '4A'),
    resolveClasse
  );

  expect(buildPresenzaAlunnoVm([cambio], { isCalcolato: true, isPresente: true }, '5A'))
    .toMatchObject({ isPresenteTuttoAnno: true, hasCambiatoClasse: true });
});
