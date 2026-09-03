import { studentiDellaClasse } from '../../../../src/application/context-engine/studenti';
import type { IClasseRepository } from '../../../../src/domain/repositories/IClasseRepository';
import { Classe } from '../../../../src/domain/entities/Classe';
import { Alunno } from '../../../../src/domain/entities/Alunno';
import { ArticolazioneConfig } from '../../../../src/domain/value-objects/ArticolazioneConfig';
import { COL_ALUNNI } from '../../../../src/config/schema';

function alunno(email: string): Alunno {
  return new Alunno({ [COL_ALUNNI.EMAIL]: email });
}

function classe(id: string): Classe {
  return new Classe({ ID: id, ANNO: 1, INDIRIZZO: 'SCIENTIFICO' });
}

function fakeRepo(overrides: Partial<IClasseRepository>): IClasseRepository {
  return overrides as IClasseRepository;
}

test('standard class: returns the plain roster from getStudenti', () => {
  const standard = classe('2B');
  const roster = [alunno('a1@school.it'), alunno('a2@school.it')];
  const repo = fakeRepo({
    getArticolazione: () => null,
    getStudenti: () => roster
  });
  expect(studentiDellaClasse(repo, standard, true)).toBe(roster);
});

test('partner class: also returns the plain roster (isParent false)', () => {
  const partner = classe('1F-LSO');
  const roster = [alunno('a3@school.it')];
  const repo = fakeRepo({
    getArticolazione: () =>
      ArticolazioneConfig.fromJson(JSON.stringify({ parent: '1F', partner: '1F-LSS' })),
    getStudenti: () => roster
  });
  expect(studentiDellaClasse(repo, partner, true)).toBe(roster);
});

test('parent class: aggregates students across both partner classes', () => {
  const parent = classe('1F');
  const partnerA = classe('1F-LSO');
  const partnerB = classe('1F-LSS');
  const rosterA = [alunno('a1@school.it')];
  const rosterB = [alunno('a2@school.it'), alunno('a3@school.it')];
  const repo = fakeRepo({
    getArticolazione: () =>
      ArticolazioneConfig.fromJson(JSON.stringify({ partners: ['1F-LSO', '1F-LSS'] })),
    getClassiPartner: () => [partnerA, partnerB],
    getStudenti: (c: Classe) => (c.nome === '1F-LSO' ? rosterA : rosterB)
  });
  expect(studentiDellaClasse(repo, parent, true).map((a) => a.id)).toEqual([
    'a1@school.it',
    'a2@school.it',
    'a3@school.it'
  ]);
});

test('soloAttivi flag is passed through to getStudenti', () => {
  const standard = classe('2B');
  let received: boolean | undefined;
  const repo = fakeRepo({
    getArticolazione: () => null,
    getStudenti: (_c: Classe, soloAttivi?: boolean) => {
      received = soloAttivi;
      return [];
    }
  });
  studentiDellaClasse(repo, standard, false);
  expect(received).toBe(false);
});
