import { PeriodoSupplenza } from '../../../src/domain/value-objects/PeriodoSupplenza';
import { CsvScope } from '../../../src/domain/value-objects/CsvScope';
import { ValidationError } from '../../../src/domain/errors/DomainError';

test('PeriodoSupplenza: contiene (03)', () => {
  const p = PeriodoSupplenza.of(new Date('2025-11-01'), new Date('2025-11-30'));
  expect(p.contiene(new Date('2025-11-15'))).toBe(true);
  expect(p.contiene(new Date('2025-12-01'))).toBe(false);
});

test('PeriodoSupplenza: open-ended AL is always active after DAL; DAL>AL throws', () => {
  const open = PeriodoSupplenza.of(new Date('2025-11-01'), null);
  expect(open.contiene(new Date('2030-01-01'))).toBe(true);
  expect(() => PeriodoSupplenza.of(new Date('2025-11-30'), new Date('2025-11-01'))).toThrow(
    ValidationError
  );
});

test('PeriodoSupplenza: DAL>AL throws the specific ordering message', () => {
  expect(() =>
    PeriodoSupplenza.of(new Date('2025-11-30'), new Date('2025-11-01'))
  ).toThrow('PeriodoSupplenza: deve valere DAL ≤ AL');
});

test('PeriodoSupplenza: a non-ordering DateRange construction failure surfaces its own message, not the ordering one', () => {
  // DAL === AL, so the explicit ordering pre-check passes; force the underlying
  // DateRange constructor itself to fail for an unrelated reason.
  const dal = new Date('2025-11-01');
  const al = new Date('2025-11-01');
  const globalWithDateRange = globalThis as unknown as { DateRange: typeof DateRange };
  const RealDateRange = globalWithDateRange.DateRange;
  class FailingDateRange {
    constructor() {
      throw new Error('boom: unrelated construction failure');
    }
  }
  globalWithDateRange.DateRange = FailingDateRange as unknown as typeof DateRange;
  try {
    expect(() => PeriodoSupplenza.of(dal, al)).toThrow(
      'PeriodoSupplenza: costruzione DateRange fallita — boom: unrelated construction failure'
    );
    expect(() => PeriodoSupplenza.of(dal, al)).not.toThrow('deve valere DAL ≤ AL');
  } finally {
    globalWithDateRange.DateRange = RealDateRange;
  }
});

test('CsvScope: wildcard and order-insensitive containment (04 §14)', () => {
  expect(CsvScope.of('*').applica('5A')).toBe(true);
  const scope = CsvScope.of('5A, 4B');
  expect(scope.applica('4B')).toBe(true);
  expect(scope.applica('3C')).toBe(false);
  expect(scope.isWildcard()).toBe(false);
});
