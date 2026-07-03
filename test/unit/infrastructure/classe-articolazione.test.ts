import { ClasseRepository } from '../../../src/infrastructure/repositories/ClasseRepository';
import { ArticolazioneConfig } from '../../../src/domain/value-objects/ArticolazioneConfig';
import { FakeDatabase } from '../../../test/fakes/FakeDatabase';
import { fixtureTables } from '../../../test/fixtures/tables';
import { ClasseId } from '../../../src/domain/value-objects/ClasseId';
import { MateriaId } from '../../../src/domain/value-objects/MateriaId';
import { IndirizzoId } from '../../../src/domain/value-objects/IndirizzoId';
import { ValidationError } from '../../../src/domain/errors/DomainError';

function repo(): ClasseRepository {
  return new ClasseRepository(new FakeDatabase(fixtureTables()));
}
function classe(id: string) {
  return repo().findById(ClasseId.of(id))!;
}

test('ArticolazioneConfig parses parent / partner / standard shapes (05 §2)', () => {
  const parent = ArticolazioneConfig.fromJson('{"parent":null,"partner":null,"partners":"1F-LSO,1F-LSS"}')!;
  expect(parent.isParent()).toBe(true);
  expect(parent.partners.map((c) => c.value)).toEqual(['1F-LSO', '1F-LSS']);
  const partner = ArticolazioneConfig.fromJson('{"parent":"1F","partner":"1F-LSS","partners":null}')!;
  expect(partner.isPartner()).toBe(true);
  expect(partner.parent!.value).toBe('1F');
  expect(ArticolazioneConfig.fromJson(null)).toBeNull();
  expect(ArticolazioneConfig.fromJson('{"parent":null,"partner":null,"partners":null}')).toBeNull();
  expect(() => ArticolazioneConfig.fromJson('{"partners":"1F-LSO"}')).toThrow(ValidationError);
});

test('isArticolata + parent/partner navigation (06 §3)', () => {
  const r = repo();
  const parent = classe('1F');
  const lso = classe('1F-LSO');
  expect(r.isArticolata(parent)).toBe(true);
  expect(r.isArticolata(classe('5A'))).toBe(false);
  expect(r.getClassiPartner(parent).map((c) => c.id)).toEqual(['1F-LSO', '1F-LSS']);
  expect(r.getClassePartner(lso)!.id).toBe('1F-LSS');
  expect(r.getClasseParent(lso)!.id).toBe('1F');
  expect(r.getClassePartner(parent)).toBeNull();
});

test('getClassiPartner throws on a partner class (asymmetry, 06 §3)', () => {
  expect(() => repo().getClassiPartner(classe('1F-LSO'))).toThrow(ValidationError);
});

test('getGruppoArticolazione covers self + related, deduped', () => {
  expect(repo().getGruppoArticolazione(classe('1F')).map((c) => c.id).sort())
    .toEqual(['1F', '1F-LSO', '1F-LSS']);
  expect(repo().getGruppoArticolazione(classe('1F-LSO')).map((c) => c.id).sort())
    .toEqual(['1F', '1F-LSO', '1F-LSS']);
  expect(repo().getGruppoArticolazione(classe('5A')).map((c) => c.id)).toEqual(['5A']);
});

test('getAllDocentiCDCArticolata merges parent + partners CDC, deduped', () => {
  // 1F(rossi) ∪ 1F-LSO(rossi,bianchi) ∪ 1F-LSS(rossi,verdi) = bianchi,rossi,verdi
  expect(repo().getAllDocentiCDCArticolata(classe('1F')).map((d) => d.cognome))
    .toEqual(['BIANCHI', 'ROSSI', 'VERDI']);
});

test('getDocentiPerMateriaArticolata resolves by student indirizzo', () => {
  const r = repo();
  const parent = classe('1F');
  // FISI differs per partner: SCIENTIFICO→bianchi (1F-LSO), LSSA→verdi (1F-LSS)
  expect(r.getDocentiPerMateriaArticolata(parent, MateriaId.of('FISI'), IndirizzoId.of('LSSA')).map((d) => d.id))
    .toEqual(['verdi@school.it']);
  // no indirizzo → plain lookup on the given class (parent has no FISI column)
  expect(r.getDocentiPerMateriaArticolata(parent, MateriaId.of('MATE')).map((d) => d.id))
    .toEqual(['rossi@school.it']);
});
