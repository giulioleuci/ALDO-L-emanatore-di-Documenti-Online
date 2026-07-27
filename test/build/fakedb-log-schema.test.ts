import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

function header(file: string): string[] {
  return readFileSync(resolve(__dirname, '../../FAKEDB', file), 'utf8').trim().split('\n')[0]!.split(',');
}

test('FAKEDB log tables use the plural MATERIE column', () => {
  const logDocs = header('LOG_DOCS.csv');
  const logFold = header('LOG_FOLD.csv');

  expect(logDocs).toContain('MATERIE');
  expect(logFold).toContain('MATERIE');
  expect(logDocs).not.toContain('MATERIA');
  expect(logFold).not.toContain('MATERIA');
});
