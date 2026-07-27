import { resolveLogRegistration } from '../../../../src/application/pipelines/logRegistration';
import { PipelineError } from '../../../../src/domain/errors/DomainError';
import { FakeTemplateEngine } from '../../../fakes/FakeTemplateEngine';

const templates = new FakeTemplateEngine();
const cdu = {
  focus: {
    classe: '5A',
    alunno: 'alunno@scuola.it'
  }
};

describe('resolveLogRegistration', () => {
  test('renders and normalizes all metadata fields as CSV', () => {
    const metadata = resolveLogRegistration(
      JSON.stringify({
        classi: ' {{focus.classe}} , {{focus.classe}} ',
        utenti: ' {{focus.alunno}} , docente@scuola.it ',
        materie: ' MATE , MATE , FISI '
      }),
      templates,
      cdu,
      'REGISTRA_DOC'
    );

    expect(metadata).toEqual({
      classi: '5A',
      utenti: 'alunno@scuola.it,docente@scuola.it',
      materie: 'MATE,FISI'
    });
  });

  test('returns blank fields for an absent or empty configuration without fallback', () => {
    expect(resolveLogRegistration('', templates, cdu, 'REGISTRA_FOLD')).toEqual({
      classi: '',
      utenti: '',
      materie: ''
    });
  });

  test.each([null, undefined, '   '])(
    'returns blank fields for an absent configuration value %p',
    (raw) => {
      expect(resolveLogRegistration(raw, templates, cdu, 'REGISTRA_FOLD')).toEqual({
        classi: '',
        utenti: '',
        materie: ''
      });
    }
  );

  test('leaves omitted metadata keys blank', () => {
    expect(
      resolveLogRegistration(JSON.stringify({ classi: ' 5A ' }), templates, cdu, 'REGISTRA_DOC')
    ).toEqual({
      classi: '5A',
      utenti: '',
      materie: ''
    });
  });

  test.each([
    ['{', 'malformato'],
    [JSON.stringify({ classe: '{{focus.classe}}' }), 'chiave non ammessa'],
    [JSON.stringify({ classi: 42 }), 'deve essere una stringa']
  ])('rejects %s', (raw, message) => {
    expect(() => resolveLogRegistration(raw, templates, cdu, 'REGISTRA_DOC')).toThrow(PipelineError);
    expect(() => resolveLogRegistration(raw, templates, cdu, 'REGISTRA_DOC')).toThrow(message);
    expect(() => resolveLogRegistration(raw, templates, cdu, 'REGISTRA_DOC')).toThrow(
      'REGISTRA_DOC'
    );
  });

  test.each([JSON.stringify([]), JSON.stringify(null), JSON.stringify(42)])(
    'rejects non-object JSON %s with its source column',
    (raw) => {
      expect(() => resolveLogRegistration(raw, templates, cdu, 'REGISTRA_FOLD')).toThrow(
        PipelineError
      );
      expect(() => resolveLogRegistration(raw, templates, cdu, 'REGISTRA_FOLD')).toThrow(
        'REGISTRA_FOLD'
      );
    }
  );
});
