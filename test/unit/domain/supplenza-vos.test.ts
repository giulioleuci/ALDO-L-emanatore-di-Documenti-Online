import { PeriodoSupplenza } from '../../../src/domain/value-objects/PeriodoSupplenza';
import { CsvScope } from '../../../src/domain/value-objects/CsvScope';
import { ValidationError } from '../../../src/domain/errors/DomainError';

test('PeriodoSupplenza: contiene / durata / attiva / terminata (03)', () => {
  const p = PeriodoSupplenza.of(new Date('2025-11-01'), new Date('2025-11-30'));
  expect(p.contiene(new Date('2025-11-15'))).toBe(true);
  expect(p.contiene(new Date('2025-12-01'))).toBe(false);
  expect(p.durata()).toBe(29);
  expect(p.isAttiva(new Date('2025-11-10'))).toBe(true);
  expect(p.isTerminata(new Date('2025-12-05'))).toBe(true);
});

test('PeriodoSupplenza: open-ended AL is always active after DAL; DAL>AL throws', () => {
  const open = PeriodoSupplenza.of(new Date('2025-11-01'), null);
  expect(open.contiene(new Date('2030-01-01'))).toBe(true);
  expect(() => PeriodoSupplenza.of(new Date('2025-11-30'), new Date('2025-11-01'))).toThrow(
    ValidationError
  );
});

test('CsvScope: wildcard and order-insensitive containment (04 §14)', () => {
  expect(CsvScope.of('*').applica('5A')).toBe(true);
  const scope = CsvScope.of('5A, 4B');
  expect(scope.applica('4B')).toBe(true);
  expect(scope.applica('3C')).toBe(false);
  expect(scope.isWildcard()).toBe(false);
});
