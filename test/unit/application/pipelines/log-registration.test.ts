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
    expect(() => resolveLogRegistration(raw, templates, cdu, 'REGISTRA_DOC')).toThrow(
      PipelineError
    );
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

  test('classe-articolata piano-di-lavoro pattern: classi covers parent + partners, utenti covers the fused coordinatori (both partner coordinators reachable when queried by their own classe id)', () => {
    const cduParent = {
      focus: {
        classe: {
          anagrafica: { nome: '3C' },
          articolazione: { partners: ['3C-S', '3C-C'] },
          coordinatori: [{ email: 'scientifico@school.it' }, { email: 'classico@school.it' }]
        }
      }
    };

    const metadata = resolveLogRegistration(
      JSON.stringify({
        classi: '{{focus.classe.anagrafica.nome}},{{focus.classe.articolazione.partners | join}}',
        utenti: '{{#focus.classe.coordinatori}}{{email}},{{/focus.classe.coordinatori}}',
        materie: ''
      }),
      templates,
      cduParent,
      'REGISTRA_DOC'
    );

    expect(metadata.classi.split(',').sort()).toEqual(['3C', '3C-C', '3C-S']);
    expect(metadata.utenti.split(',').sort()).toEqual([
      'classico@school.it',
      'scientifico@school.it'
    ]);
  });

  test('classe-articolata piano-di-lavoro pattern: a plain (non-articulated) classe registers only its own id, no trailing artifacts', () => {
    const cduPlain = {
      focus: {
        classe: {
          anagrafica: { nome: '1A' },
          coordinatori: [{ email: 'rossi@school.it' }]
        }
      }
    };

    const metadata = resolveLogRegistration(
      JSON.stringify({
        classi: '{{focus.classe.anagrafica.nome}},{{focus.classe.articolazione.partners | join}}',
        utenti: '{{#focus.classe.coordinatori}}{{email}},{{/focus.classe.coordinatori}}',
        materie: ''
      }),
      templates,
      cduPlain,
      'REGISTRA_DOC'
    );

    expect(metadata.classi).toBe('1A');
    expect(metadata.utenti).toBe('rossi@school.it');
  });
});
