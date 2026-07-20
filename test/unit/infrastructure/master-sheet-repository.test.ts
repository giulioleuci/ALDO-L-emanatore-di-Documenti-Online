import { MasterSheetRepository } from '../../../src/infrastructure/repositories/MasterSheetRepository';
import { MasterConfig } from '../../../src/domain/entities/MasterConfig';
import { FakeDatabase } from '../../../test/fakes/FakeDatabase';
import { fixtureTables } from '../../../test/fixtures/tables';
import { EntityNotFoundError } from '../../../src/domain/errors/DomainError';

function repo(): MasterSheetRepository {
  return new MasterSheetRepository(new FakeDatabase(fixtureTables()));
}

test('MasterConfig: PK, anno VO, supervisore flag (01 §0)', () => {
  const m = MasterConfig.fromData({
    ANNO_SCOLASTICO: '2025-2026',
    ID_SPREADSHEET: 'ss',
    ID_CARTELLA_GOOGLE: 'f',
    SUPERVISORE_EMAIL: 'x@y.it'
  });
  expect(m.id).toBe('2025-2026');
  expect(m.annoScolastico.getAnnoInizio()).toBe(2025);
  expect(m.hasSupervisore()).toBe(true);
  expect(
    MasterConfig.fromData({ ANNO_SCOLASTICO: '2024-2025', SUPERVISORE_EMAIL: '' }).hasSupervisore()
  ).toBe(false);
});

test('findConfigAnnoCorrente returns the first (top) row (06 §0)', () => {
  const r = repo();
  const corrente = r.findConfigAnnoCorrente();
  expect(corrente.annoScolasticoRaw).toBe('2025-2026');
  expect(r.getSpreadsheetId(corrente)).toBe('ss_2526');
});

test('findConfigPerAnno + findAnniStorici', () => {
  const r = repo();
  expect(r.findConfigPerAnno('2024-2025')!.idSpreadsheet).toBe('ss_2425');
  expect(r.findConfigPerAnno('1999-2000')).toBeNull();
  expect(r.findAnniStorici(1).map((m) => m.annoScolasticoRaw)).toEqual(['2024-2025']);
  expect(r.findAnniStorici(10).map((m) => m.annoScolasticoRaw)).toEqual(['2024-2025', '2023-2024']);
});

test('findConfigAnnoCorrente throws on an empty Master Sheet', () => {
  const empty = new MasterSheetRepository(new FakeDatabase({ MASTER: [] }));
  expect(() => empty.findConfigAnnoCorrente()).toThrow(EntityNotFoundError);
});
