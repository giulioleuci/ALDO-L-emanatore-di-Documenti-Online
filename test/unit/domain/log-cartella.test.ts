import { LogCartella } from '../../../src/domain/entities/LogCartella';
import { COL_LOG_FOLD } from '../../../src/config/schema';

describe('LogCartella construction', () => {
  test('hydrates id/tipo/nome from known columns', () => {
    const log = new LogCartella({
      [COL_LOG_FOLD.ID]: 'folder-123',
      [COL_LOG_FOLD.TIPO]: 'PIANI_PERS',
      [COL_LOG_FOLD.NOME]: 'Cartella 5A'
    });
    expect(log.id).toBe('folder-123');
    expect(log.tipo).toBe('PIANI_PERS');
    expect(log.nome).toBe('Cartella 5A');
  });

  test('missing/non-string cells default id to null and tipo/nome to empty string', () => {
    const log = new LogCartella({});
    expect(log.id).toBeNull();
    expect(log.tipo).toBe('');
    expect(log.nome).toBe('');
  });

  test('non-string ID cell is coerced to null id (fail-loud typing, not silent coercion)', () => {
    const log = new LogCartella({ [COL_LOG_FOLD.ID]: 42 });
    expect(log.id).toBeNull();
  });
});

describe('LogCartella.containsClasse', () => {
  test('true when the class id is present in the CSV column', () => {
    const log = new LogCartella({ [COL_LOG_FOLD.CLASSI]: '5A, 1F ,2B' });
    expect(log.containsClasse('1F')).toBe(true);
    expect(log.containsClasse('5A')).toBe(true);
  });

  test('false when the class id is absent', () => {
    const log = new LogCartella({ [COL_LOG_FOLD.CLASSI]: '5A,1F' });
    expect(log.containsClasse('9Z')).toBe(false);
  });

  test('false when CLASSI cell is absent or not a string', () => {
    expect(new LogCartella({}).containsClasse('5A')).toBe(false);
    expect(new LogCartella({ [COL_LOG_FOLD.CLASSI]: 123 }).containsClasse('5A')).toBe(false);
  });
});

describe('LogCartella.toData / fromData', () => {
  test('toData round-trips the full raw row, including unknown/dynamic columns', () => {
    const raw = {
      [COL_LOG_FOLD.ID]: 'folder-1',
      [COL_LOG_FOLD.TIPO]: 'PIANI_PERS',
      [COL_LOG_FOLD.NOME]: 'X',
      [COL_LOG_FOLD.CLASSI]: '5A',
      EXTRA_COL: 'kept-verbatim'
    };
    const log = new LogCartella(raw);
    expect(log.toData()).toEqual(raw);
  });

  test('fromData is equivalent to the constructor', () => {
    const raw = { [COL_LOG_FOLD.ID]: 'folder-2', [COL_LOG_FOLD.TIPO]: 'X', [COL_LOG_FOLD.NOME]: 'Y' };
    const log = LogCartella.fromData(raw);
    expect(log).toBeInstanceOf(LogCartella);
    expect(log.id).toBe('folder-2');
  });
});
