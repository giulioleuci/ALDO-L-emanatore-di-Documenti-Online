import { EsameConfig } from '../../../src/domain/value-objects/EsameConfig';
import { IndirizzoId } from '../../../src/domain/value-objects/IndirizzoId';

describe('EsameConfig.fromJson', () => {
  test('null/undefined/empty/whitespace-only input yields null', () => {
    expect(EsameConfig.fromJson(null)).toBeNull();
    expect(EsameConfig.fromJson(undefined)).toBeNull();
    expect(EsameConfig.fromJson('')).toBeNull();
    expect(EsameConfig.fromJson('   ')).toBeNull();
  });

  test('missing primaProva/secondaProva default to empty arrays', () => {
    const cfg = EsameConfig.fromJson('{}')!;
    expect(cfg.isPrimaProvaPerIndirizzo(IndirizzoId.of('SCIENTIFICO'))).toBe(false);
    expect(cfg.isSecondaProvaPerIndirizzo(IndirizzoId.of('SCIENTIFICO'))).toBe(false);
  });
});

describe('EsameConfig.isPrimaProvaPerIndirizzo / isSecondaProvaPerIndirizzo', () => {
  test('true when the indirizzo is listed in primaProva', () => {
    const cfg = EsameConfig.fromJson(
      JSON.stringify({ primaProva: ['SCIENTIFICO', 'CLASSICO'] })
    )!;
    expect(cfg.isPrimaProvaPerIndirizzo(IndirizzoId.of('SCIENTIFICO'))).toBe(true);
    expect(cfg.isPrimaProvaPerIndirizzo(IndirizzoId.of('LINGUISTICO'))).toBe(false);
  });

  test('true when the indirizzo is listed in secondaProva', () => {
    const cfg = EsameConfig.fromJson(JSON.stringify({ secondaProva: ['TECNICO'] }))!;
    expect(cfg.isSecondaProvaPerIndirizzo(IndirizzoId.of('TECNICO'))).toBe(true);
    expect(cfg.isSecondaProvaPerIndirizzo(IndirizzoId.of('LICEO'))).toBe(false);
  });

  test('a malformed entry in the array is treated as a non-match, not a thrown error', () => {
    // IndirizzoId.of('') throws ValidationError internally; matches() must swallow it.
    const cfg = EsameConfig.fromJson(JSON.stringify({ primaProva: ['', 'SCIENTIFICO'] }))!;
    expect(cfg.isPrimaProvaPerIndirizzo(IndirizzoId.of('SCIENTIFICO'))).toBe(true);
    expect(() => cfg.isPrimaProvaPerIndirizzo(IndirizzoId.of('ALTRO'))).not.toThrow();
  });
});
