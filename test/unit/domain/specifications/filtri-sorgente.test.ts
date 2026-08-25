import { COL_LOG_DOCS, COL_LOG_FOLD } from '../../../../src/config/schema';
import { LogCartella } from '../../../../src/domain/entities/LogCartella';
import { LogDocumento } from '../../../../src/domain/entities/LogDocumento';
import {
  parseFiltriSorgente,
  specCartelle,
  specDocumenti,
  type FiltriSorgente
} from '../../../../src/domain/specifications/FiltriSorgente';
import { StatoDocumento } from '../../../../src/domain/value-objects/enums';

function documento(overrides: Record<string, unknown> = {}): LogDocumento {
  return new LogDocumento({
    [COL_LOG_DOCS.ID]: 'doc-1',
    [COL_LOG_DOCS.ID_GEN]: 'VERBALE_CDC',
    [COL_LOG_DOCS.TIPO]: 'VERBALE',
    [COL_LOG_DOCS.NOME]: 'Verbale 5A',
    [COL_LOG_DOCS.STATO]: StatoDocumento.NOTIFICATO,
    [COL_LOG_DOCS.SOTTOTIPO]: 'CDC',
    [COL_LOG_DOCS.ID_ORIG]: 'orig-1',
    [COL_LOG_DOCS.NOTIFICATO]: '2026-08-23T10:00:00.000Z',
    [COL_LOG_DOCS.CLASSI]: '5A,3B',
    [COL_LOG_DOCS.UTENTI]: 'a@school.it,b@school.it',
    [COL_LOG_DOCS.MATERIE]: 'MATE,FIS',
    ...overrides
  });
}

function cartella(overrides: Record<string, unknown> = {}): LogCartella {
  return new LogCartella({
    [COL_LOG_FOLD.ID]: 'fold-1',
    [COL_LOG_FOLD.TIPO]: 'VERBALI',
    [COL_LOG_FOLD.NOME]: 'Verbali CDC',
    [COL_LOG_FOLD.PATH]: 'Archivio/2026/Verbali',
    [COL_LOG_FOLD.CLASSI]: '5A,3B',
    [COL_LOG_FOLD.UTENTI]: 'a@school.it,b@school.it',
    [COL_LOG_FOLD.MATERIE]: 'MATE,FIS',
    ...overrides
  });
}

describe('parseFiltriSorgente', () => {
  test.each([undefined, {}])('does not filter when document filters are %p', (raw) => {
    expect(parseFiltriSorgente(raw, 'documenti')).toEqual({ filtri: undefined, errori: [] });
  });

  it('parses document filters, normalizing a CSV string to one value', () => {
    expect(
      parseFiltriSorgente(
        {
          tipo: 'VERBALE',
          csv: 'all',
          classi: ['5A', '3B'],
          utenti: 'a@school.it',
          not: { stato: 'ARCHIVIATO' }
        },
        'documenti'
      )
    ).toEqual({
      filtri: {
        tipo: 'VERBALE',
        csv: 'all',
        classi: ['5A', '3B'],
        utenti: ['a@school.it'],
        not: { stato: StatoDocumento.ARCHIVIATO }
      },
      errori: []
    });
  });

  test.each([
    [
      'documenti',
      {
        tipo: 'VERBALE',
        stato: StatoDocumento.GENERATO,
        sottotipo: 'CDC',
        idGen: 'GEN',
        idOrig: 'orig',
        notificato: false,
        classi: '5A',
        utenti: ['a@school.it'],
        materie: ['MATE']
      },
      {
        tipo: 'VERBALE',
        stato: StatoDocumento.GENERATO,
        sottotipo: 'CDC',
        idGen: 'GEN',
        idOrig: 'orig',
        notificato: false,
        classi: ['5A'],
        utenti: ['a@school.it'],
        materie: ['MATE']
      }
    ],
    [
      'cartelle',
      {
        idGen: 'VERBALI',
        nome: 'Verbali',
        path: 'Archivio',
        classi: '5A',
        utenti: ['a@school.it'],
        materie: ['MATE']
      },
      {
        idGen: 'VERBALI',
        nome: 'Verbali',
        path: 'Archivio',
        classi: ['5A'],
        utenti: ['a@school.it'],
        materie: ['MATE']
      }
    ]
  ] as const)('accepts every valid %s field', (entita, raw, expected) => {
    const result = parseFiltriSorgente(raw, entita);
    expect(result.errori).toEqual([]);
    expect(result.filtri).toEqual(expected);
  });

  test.each([
    [{ stato: 'INVALIDO' }, 'stato'],
    [{ csv: 'none' }, 'csv'],
    [{ notificato: 'true' }, 'notificato'],
    [{ tipo: true }, 'tipo'],
    [{ classi: [] }, 'classi'],
    [{ utenti: ['a@school.it', 3] }, 'utenti'],
    [{ sconosciuto: 'x' }, 'sconosciuto'],
    [{ nome: 'Verbali' }, 'nome'],
    [{ sottotipo: 'CDC' }, 'sottotipo'],
    [{ not: { not: { tipo: 'VERBALE' } } }, 'not']
  ])('rejects invalid filters %p mentioning %s', (raw, offendingKey) => {
    const entita = 'sottotipo' in raw ? 'cartelle' : 'documenti';
    const result = parseFiltriSorgente(raw, entita);
    expect(result.filtri).toBeUndefined();
    expect(result.errori.join(' ')).toContain(offendingKey);
  });

  it('rejects document-only and folder-only fields for the other entity', () => {
    for (const [raw, entita, offendingKey] of [
      [{ nome: 'Verbali' }, 'documenti', 'nome'],
      [{ tipo: 'VERBALE' }, 'cartelle', 'tipo']
    ] as const) {
      const result = parseFiltriSorgente(raw, entita);
      expect(result.filtri).toBeUndefined();
      expect(result.errori.join(' ')).toContain(offendingKey);
    }
  });
});

describe('source filter specifications', () => {
  const documents = [
    documento(),
    documento({
      [COL_LOG_DOCS.ID]: 'doc-2',
      [COL_LOG_DOCS.TIPO]: 'CONDOTTA',
      [COL_LOG_DOCS.STATO]: StatoDocumento.ARCHIVIATO,
      [COL_LOG_DOCS.SOTTOTIPO]: 'ALTRO',
      [COL_LOG_DOCS.ID_GEN]: 'ALTRO',
      [COL_LOG_DOCS.ID_ORIG]: 'orig-2',
      [COL_LOG_DOCS.NOTIFICATO]: '',
      [COL_LOG_DOCS.CLASSI]: '4A',
      [COL_LOG_DOCS.UTENTI]: 'c@school.it',
      [COL_LOG_DOCS.MATERIE]: 'STO'
    })
  ];
  const folders = [
    cartella(),
    cartella({
      [COL_LOG_FOLD.ID]: 'fold-2',
      [COL_LOG_FOLD.TIPO]: 'ALTRO',
      [COL_LOG_FOLD.NOME]: 'Archivio',
      [COL_LOG_FOLD.PATH]: 'archivio/2026',
      [COL_LOG_FOLD.CLASSI]: '4A',
      [COL_LOG_FOLD.UTENTI]: 'c@school.it',
      [COL_LOG_FOLD.MATERIE]: 'STO'
    })
  ];

  function matchingDocuments(filtri: FiltriSorgente): string[] {
    return documents
      .filter((candidate) => specDocumenti(filtri).isSatisfiedBy(candidate))
      .map((item) => item.id!);
  }

  function matchingFolders(filtri: FiltriSorgente): string[] {
    return folders
      .filter((candidate) => specCartelle(filtri).isSatisfiedBy(candidate))
      .map((item) => item.id!);
  }

  test.each([
    [{ tipo: 'VERBALE' }],
    [{ stato: StatoDocumento.NOTIFICATO }],
    [{ sottotipo: 'CDC' }],
    [{ idGen: 'VERBALE_CDC' }],
    [{ idOrig: 'orig-1' }],
    [{ notificato: true }],
    [{ notificato: false }]
  ] as const)('matches document scalar filter %p exactly', (filtri) => {
    const expected = filtri.notificato === false ? ['doc-2'] : ['doc-1'];
    expect(matchingDocuments(filtri)).toEqual(expected);
  });

  it('uses any by default and all when requested for CSV filters', () => {
    expect(matchingDocuments({ classi: ['5A', '4A'] })).toEqual(['doc-1', 'doc-2']);
    expect(matchingDocuments({ csv: 'all', classi: ['5A', '3B'] })).toEqual(['doc-1']);
    expect(matchingDocuments({ csv: 'all', classi: ['5A', '4A'] })).toEqual([]);
  });

  it('ANDs positives and lets not exclusions prevail', () => {
    expect(matchingDocuments({ tipo: 'VERBALE', classi: ['5A'], materie: ['MATE'] })).toEqual([
      'doc-1'
    ]);
    expect(matchingDocuments({ classi: ['5A'], not: { tipo: 'VERBALE' } })).toEqual([]);
  });

  it('rejects a document when any one of multiple scalar not criteria matches', () => {
    expect(
      matchingDocuments({
        not: { tipo: 'VERBALE', stato: StatoDocumento.ARCHIVIATO }
      })
    ).toEqual([]);
  });

  it('rejects a folder when any one of multiple scalar not criteria matches', () => {
    expect(matchingFolders({ not: { idGen: 'VERBALI', nome: 'Archivio' } })).toEqual([]);
  });

  it('normalizes an empty not to no exclusion', () => {
    expect(matchingDocuments({ not: {} })).toEqual(['doc-1', 'doc-2']);
    expect(matchingFolders({ not: {} })).toEqual(['fold-1', 'fold-2']);
  });

  it('applies the outer all CSV mode to not criteria', () => {
    const singleClassDocument = documento({
      [COL_LOG_DOCS.ID]: 'doc-3',
      [COL_LOG_DOCS.CLASSI]: '5A'
    });

    expect(
      [documents[0], singleClassDocument]
        .filter((candidate) =>
          specDocumenti({ csv: 'all', not: { classi: ['5A', '3B'] } }).isSatisfiedBy(candidate)
        )
        .map((item) => item.id)
    ).toEqual(['doc-3']);
  });

  it('matches folder idGen exactly and name/path as case-sensitive substrings', () => {
    expect(matchingFolders({ idGen: 'VERBALI' })).toEqual(['fold-1']);
    expect(matchingFolders({ nome: 'Verbali' })).toEqual(['fold-1']);
    expect(matchingFolders({ path: 'Archivio' })).toEqual(['fold-1']);
    expect(matchingFolders({ path: 'archivio' })).toEqual(['fold-2']);
  });

  it('preserves entity-specific specification types', () => {
    const documentSpec = specDocumenti({ tipo: 'VERBALE' });
    const folderSpec = specCartelle({ idGen: 'VERBALI' });
    expect(documentSpec.isSatisfiedBy(documents[0])).toBe(true);
    expect(folderSpec.isSatisfiedBy(folders[0])).toBe(true);
    // @ts-expect-error specifications must not accept the other entity type
    documentSpec.isSatisfiedBy(folders[0]);
    // @ts-expect-error specifications must not accept the other entity type
    folderSpec.isSatisfiedBy(documents[0]);
  });
});
