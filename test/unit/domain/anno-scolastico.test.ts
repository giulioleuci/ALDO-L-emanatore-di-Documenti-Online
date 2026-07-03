import { AnnoScolastico } from '../../../src/domain/value-objects/AnnoScolastico';
import { ValidationError } from '../../../src/domain/errors/DomainError';

test('parses YYYY-YYYY and exposes start/end', () => {
  const a = AnnoScolastico.of(' 2024-2025 ');
  expect(a.value).toBe('2024-2025');
  expect(a.getAnnoInizio()).toBe(2024);
  expect(a.getAnnoFine()).toBe(2025);
});

test('rejects malformed or non-consecutive years', () => {
  expect(() => AnnoScolastico.of('2024/2025')).toThrow(ValidationError);
  expect(() => AnnoScolastico.of('2024-2026')).toThrow(ValidationError);
});

test('successivo / precedente / equals', () => {
  const a = AnnoScolastico.of('2024-2025');
  expect(a.getAnnoSuccessivo().value).toBe('2025-2026');
  expect(a.getAnnoPrecedente().value).toBe('2023-2024');
  expect(a.equals(AnnoScolastico.of('2024-2025'))).toBe(true);
  expect(a.equals(AnnoScolastico.of('2025-2026'))).toBe(false);
});
