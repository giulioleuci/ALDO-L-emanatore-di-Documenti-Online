import { salutoPerTarget, type EmailTarget } from '../../../src/application/email/saluto';
import { Docente } from '../../../src/domain/entities/Docente';
import { Alunno } from '../../../src/domain/entities/Alunno';

function target(tipo: EmailTarget['tipo'], emails: string[]): EmailTarget {
  return { tipo, tipoTarget: 'classe', target: '5A', emails, classiCompetenza: [] };
}

test('docente M/F saluto with appellativo (11 §6)', () => {
  const m = Docente.fromData({
    EMAIL: 'r@x.it',
    COGNOME: 'ROSSI',
    NOME: 'MARIO',
    GENERE: 'M',
    DIPART: 'D1'
  });
  const f = Docente.fromData({
    EMAIL: 'b@x.it',
    COGNOME: 'BIANCHI',
    NOME: 'LUCIA',
    GENERE: 'F',
    DIPART: 'D1'
  });
  expect(salutoPerTarget(target('docente', ['r@x.it']), m, null)).toBe('Gentile Prof. ROSSI MARIO');
  expect(salutoPerTarget(target('docente', ['b@x.it']), f, null)).toBe(
    'Gentile Prof.ssa BIANCHI LUCIA'
  );
});

test('alunno saluto uses nomeCompleto (schema 01: single COGNOMENOME field)', () => {
  const a = Alunno.fromData({
    EMAIL: 'a1@x.it',
    COGNOMENOME: 'VERDI ANNA',
    CLASSE: '5A',
    ATTIVO: true
  });
  expect(salutoPerTarget(target('alunno', ['a1@x.it']), null, a)).toBe('Gentile VERDI ANNA');
});

test('genitori and cdc plural salutos (11 §6/§12)', () => {
  expect(salutoPerTarget(target('genitori', ['g1@x.it', 'g2@x.it']), null, null)).toBe(
    'Gentili Genitori'
  );
  expect(salutoPerTarget(target('cdc', ['d1@x.it', 'd2@x.it']), null, null)).toBe(
    'Gentili Docenti'
  );
});

test('zero recipients falls back to Gentile Utente (11 §6)', () => {
  expect(salutoPerTarget(target('docente', []), null, null)).toBe('Gentile Utente');
});

test('missing entity falls back to Gentili Destinatari for non-uniform multiples', () => {
  expect(salutoPerTarget(target('docente', ['x@x.it']), null, null)).toBe('Gentili Destinatari');
});

test('salutoPerTarget: genitori_alunno greets both parents and the student by name', () => {
  const a = Alunno.fromData({
    EMAIL: 'a1@school.it',
    COGNOMENOME: 'VERDI ANNA',
    CLASSE: '5A',
    ATTIVO: true
  });
  const saluto = salutoPerTarget(target('genitori_alunno', ['g@x.it', 'a1@school.it']), null, a);
  expect(saluto).toBe('Gentili Genitori e VERDI ANNA');
});

test('salutoPerTarget: genitori_alunno falls back to "Gentili Destinatari" when alunno is null', () => {
  const saluto = salutoPerTarget(target('genitori_alunno', ['g@x.it']), null, null);
  expect(saluto).toBe('Gentili Destinatari');
});
