import { MaterieClasseProvider } from '../../../../../src/application/context-engine/providers/MaterieClasseProvider';
import { ClasseRepository } from '../../../../../src/infrastructure/repositories/ClasseRepository';
import { LogDocumentoRepository } from '../../../../../src/infrastructure/repositories/LogDocumentoRepository';
import type { Cdu, DocenteCdcVM } from '../../../../../src/application/context-engine/Cdu';
import { makeOptions } from '../../../../../src/application/context-engine/Recipe';
import type { BuildParams } from '../../../../../src/application/context-engine/Recipe';
import { Classe } from '../../../../../src/domain/entities/Classe';
import { Materia } from '../../../../../src/domain/entities/Materia';
import type { IDocenteRepository } from '../../../../../src/domain/repositories/IDocenteRepository';
import type { IClasseRepository } from '../../../../../src/domain/repositories/IClasseRepository';
import type { IMateriaRepository } from '../../../../../src/domain/repositories/IMateriaRepository';
import type { StoricoDatabaseProvider } from '../../../../../src/application/storico/StoricoDatabaseProvider';
import { DocenteRepository } from '../../../../../src/infrastructure/repositories/DocenteRepository';
import { FakeDatabase } from '../../../../fakes/FakeDatabase';
import { ClasseId } from '../../../../../src/domain/value-objects/ClasseId';
import { MateriaId } from '../../../../../src/domain/value-objects/MateriaId';
import { Docente } from '../../../../../src/domain/entities/Docente';
import { Supplenza } from '../../../../../src/domain/entities/Supplenza';
import { VariazioneCattedra } from '../../../../../src/domain/entities/VariazioneCattedra';
import { VariazioneCattedraRepository } from '../../../../../src/infrastructure/repositories/VariazioneCattedraRepository';
import { SupplenzaRepository } from '../../../../../src/infrastructure/repositories/SupplenzaRepository';
import { MateriaRepository } from '../../../../../src/infrastructure/repositories/MateriaRepository';
import { AldoTeachingAssignmentResolver } from '../../../../../src/infrastructure/role-resolution/AldoTeachingAssignmentResolver';
import type { ISupplenzaRepository } from '../../../../../src/domain/repositories/ISupplenzaRepository';
import type { IVariazioneCattedraRepository } from '../../../../../src/domain/repositories/IVariazioneCattedraRepository';
import type { Row } from '../../../../../src/infrastructure/db/Database';

function docenteCdc(
  nomeCompleto: string,
  email: string,
  sigla: string,
  isItp = false
): DocenteCdcVM {
  return {
    nome: '',
    cognome: '',
    email,
    genere: 'M',
    appellativo: 'Prof.',
    articolo: 'Il',
    coordinatore: 'Coordinatore',
    nomeCompleto,
    appellativoCompleto: `Prof. ${nomeCompleto}`,
    appellativoCognome: `Prof. ${nomeCompleto}`,
    isEsterno: false,
    materie: [
      {
        sigla,
        nome: sigla,
        nomeSintetico: sigla,
        colore1: '',
        colore2: '',
        principale: null,
        specificita: null,
        hasSpecificita: false,
        nomeConSpecificita: sigla,
        isItp,
        isMateriaPrimaProva: false,
        isMateriaSecondaProva: false,
        evoluzione: { siglePrecedenti: [], hasSiglePrecedenti: false }
      }
    ],
    materieDescrizione: sigla,
    materieDescrizioneSintesi: sigla,
    materieSigle: sigla,
    numeroMaterie: 1,
    hasMaterie: true,
    isCoordinatore: false,
    isTutorAsl: false,
    isTutorOrientamento: false,
    isTutor: false,
    isSupplente: false,
    isItp,
    isComune: false,
    isSeparatoPrimo: false,
    isSeparatoSecondo: false,
    ruoliDescrizione: [],
    ruoliDescrizioneTesto: '',
    sostituisce: null,
    hasSostituisce: false,
    tipoArticolazione: null,
    tipoArticolazioneLabel: '',
    gruppoNome: null
  };
}

const params: BuildParams = {
  target: '3A',
  tipoTarget: 'classe',
  now: new Date('2026-08-06T09:00:00Z')
} as BuildParams;

function cduConClasse(consiglio: DocenteCdcVM[]): Cdu {
  const classe = Classe.fromData({ ID: '3A', ANNO: 3, INDIRIZZO: 'SCIENTIFICO' });
  return {
    focus: { classe: { consiglio: { elenco: consiglio } } },
    tech: { entita: { classe } }
  } as unknown as Cdu;
}

describe('MaterieClasseProvider', () => {
  it('groups the class council into a flat, deduped subject catalog with docentiDescrizione/hasCattedraItp', () => {
    const cdu = {
      focus: {
        classe: {
          consiglio: {
            elenco: [
              docenteCdc('Mario Rossi', 'm@x.it', 'ITA'),
              docenteCdc('Laura Gialli', 'l@x.it', 'ITA', true)
            ]
          }
        }
      }
    } as unknown as Cdu;
    new MaterieClasseProvider().provide(cdu, params, makeOptions());
    expect(cdu.focus.classe!.materie!.elenco).toHaveLength(1);
    const ita = cdu.focus.classe!.materie!.elenco[0]!;
    expect(ita.docenti?.map((d) => d.nomeCompleto)).toEqual(['Laura Gialli', 'Mario Rossi']);
    expect(ita.docentiDescrizione).toBe('Prof. Laura Gialli e prof. Mario Rossi');
    expect(ita.hasCattedraItp).toBe(true);
  });

  describe('continuita attachment (includiStorico)', () => {
    test.each([
      ['main', 'INF', 'INF', '3A', 'INF', false],
      ['ITP qualifier', 'INF.itp', 'INF', '3A', 'INF.itp', true],
      [
        'specifica qualifier',
        'INTERPRET.CHITARRA',
        'INTERPRET.CHITARRA',
        '3A',
        'INTERPRET.CHITARRA',
        false
      ],
      ['omitted class', 'INF.itp', 'INF', '', 'INF.itp', true],
      ['omitted materia', 'INF', 'INF', '3A', '', false],
      ['omitted class with wildcard materia', 'INF', 'INF', '', '*', false],
      ['omitted substitution scopes', 'INF', 'INF', '3A', 'INF', false]
    ])(
      'preserves permanent holders and chained events in current and historical %s slots',
      (_name, column, sigla, classiScope, materieScope, isItp) => {
        const emails = ['originario', 'nuovo', 's1', 's2', 'altro'].map(
          (name) => `${name}@scuola.it`
        );
        const [originario, nuovo, s1, s2, altro] = emails as [
          string,
          string,
          string,
          string,
          string
        ];
        const secondStart = _name === 'main' ? '2025-11-01' : '2025-11-10';
        const permanentHolder = _name === 'omitted substitution scopes' ? originario : nuovo;
        const tables: Record<string, Row[]> = {
          CLASSI: [
            {
              ID: '3A',
              ANNO: 3,
              INDIRIZZO: 'SCIENTIFICO',
              STORICO: '3A',
              INF: altro,
              'INF.itp': altro,
              'INTERPRET.CHITARRA': altro,
              'INTERPRET.PIANO': altro,
              [column]: originario
            }
          ],
          MATERIE: ['INF', 'INTERPRET', 'INTERPRET.CHITARRA', 'INTERPRET.PIANO'].map((ID) => ({
            ID,
            NOME: ID
          })),
          DOCENTI: emails.map((EMAIL) => ({ EMAIL, COGNOME: EMAIL, NOME: 'Mario', GENERE: 'M' })),
          VARIAZIONI_CATTEDRA: [
            {
              TITOLARE: originario,
              NUOVO_TITOLARE: nuovo,
              DAL: '2025-10-01',
              CLASSI: classiScope,
              MATERIE: materieScope
            }
          ],
          SUPPLENZE: [
            {
              TITOLARE: s1,
              SUPPLENTE: s2,
              DAL: secondStart,
              AL: '',
              CLASSI: '3A',
              MATERIE: column
            },
            {
              TITOLARE: nuovo,
              SUPPLENTE: s1,
              DAL: '2025-11-01',
              AL: '',
              CLASSI: '3A',
              MATERIE: column
            }
          ]
        };
        if (materieScope === 'INF.itp') tables.CLASSI![0]!.INF = originario;
        if (materieScope === 'INTERPRET.CHITARRA')
          tables.CLASSI![0]!['INTERPRET.PIANO'] = originario;
        if (_name === 'omitted substitution scopes') {
          tables.VARIAZIONI_CATTEDRA = [];
          Object.assign(tables.SUPPLENZE![1]!, { TITOLARE: originario, CLASSI: '', MATERIE: '' });
        }
        const db = new FakeDatabase(tables);
        const classiRepo = new ClasseRepository(db);
        const docentiRepo = new DocenteRepository(db);
        const classe = classiRepo.findById('3A')!;
        const assignments = new AldoTeachingAssignmentResolver(db).resolveMateria(
          classe,
          MateriaId.of(sigla.split('.')[0]!),
          new Date('2026-02-01')
        );
        const target = assignments.find(
          (assignment) =>
            (assignment.slot.kind === 'ITP') === isItp &&
            assignment.slot.specifica === (sigla.split('.')[1] ?? null)
        )!;
        expect(target.titolare.id).toBe(permanentHolder);
        expect(target.docenteEffettivo.id).toBe(s2);
        const provider = new MaterieClasseProvider(
          new MateriaRepository(db),
          docentiRepo,
          {
            anniStorici: () => [
              {
                anno: '2025-2026',
                db,
                logDocs: new LogDocumentoRepository(db, new LazyRef(() => classiRepo))
              }
            ]
          },
          classiRepo,
          new VariazioneCattedraRepository(db),
          new SupplenzaRepository(db)
        );
        const council = (permanent: boolean): DocenteCdcVM[] =>
          assignments.map((assignment) =>
            docenteCdc(
              'Docente',
              (permanent ? assignment.titolare : assignment.docenteEffettivo).id!,
              assignment.slot.specifica === null
                ? assignment.slot.materia.value
                : `${assignment.slot.materia.value}.${assignment.slot.specifica}`,
              assignment.slot.kind === 'ITP'
            )
          );
        const cdu = cduConClasse(council(false));
        cdu.focus.classe!.consiglio!.titolari = council(true);
        cdu.tech.entita.classe = classe;

        provider.provide(cdu, params, makeOptions({ includiStorico: true }));

        const catalogo = cdu.focus.classe!.materie!.elenco;
        const continuita = catalogo.find((materia) => materia.sigla === sigla)!.continuita!;
        const key = isItp ? 'itpTimeline' : 'titolareTimeline';
        const expected = {
          titolareOriginario: expect.objectContaining({ email: originario }),
          variazioni:
            permanentHolder === originario
              ? []
              : [
                  {
                    nuovoTitolare: expect.objectContaining({ email: nuovo }),
                    dal: new Date('2025-10-01')
                  }
                ],
          supplenze: expect.arrayContaining([
            {
              supplente: expect.objectContaining({ email: s1 }),
              dal: new Date('2025-11-01'),
              al: null
            },
            {
              supplente: expect.objectContaining({ email: s2 }),
              dal: new Date(secondStart),
              al: null
            }
          ]),
          hasVariazioni: permanentHolder !== originario,
          hasSupplenze: true
        };
        expect(continuita[key]).toEqual(expected);
        expect(continuita.anniPrecedenti[0]![key]).toEqual(expected);
        expect(continuita[key]!.supplenze).toHaveLength(2);
        expect(continuita.anniPrecedenti[0]![key]!.supplenze).toHaveLength(2);
        expect(continuita.anniPrecedenti[0]![isItp ? 'itp' : 'titolare']?.email).toBe(
          permanentHolder
        );
        expect(
          continuita[isItp ? 'isContinuitaItpUltimiDueAnni' : 'isContinuitaUltimiDueAnni']
        ).toBe(true);
        if (isItp) {
          expect(continuita.titolareTimeline?.variazioni).toEqual([]);
          expect(continuita.titolareTimeline?.supplenze).toEqual([]);
          expect(continuita.anniPrecedenti[0]!.titolareTimeline?.variazioni).toEqual([]);
          expect(continuita.anniPrecedenti[0]!.titolareTimeline?.supplenze).toEqual([]);
        }
        if (sigla === 'INTERPRET.CHITARRA') {
          const piano = catalogo.find(
            (materia) => materia.sigla === 'INTERPRET.PIANO'
          )!.continuita!;
          expect(piano.titolareTimeline?.variazioni).toEqual([]);
          expect(piano.titolareTimeline?.supplenze).toEqual([]);
          expect(piano.anniPrecedenti[0]!.titolareTimeline?.variazioni).toEqual([]);
          expect(piano.anniPrecedenti[0]!.titolareTimeline?.supplenze).toEqual([]);
        }
      }
    );

    const docenti: IDocenteRepository = { findById: () => null } as unknown as IDocenteRepository;
    const classi: IClasseRepository = { getStorico: () => [] } as unknown as IClasseRepository;
    const storicoDb: StoricoDatabaseProvider = { anniStorici: () => [] };
    const materie: IMateriaRepository = {
      findById: (id: string) => Materia.fromData({ ID: id, NOME: id })
    } as unknown as IMateriaRepository;

    it('attaches continuita to each subject only when includiStorico is true', () => {
      const provider = new MaterieClasseProvider(materie, docenti, storicoDb, classi);
      const cdu = cduConClasse([docenteCdc('Mario Rossi', 'm@x.it', 'ITA')]);
      provider.provide(
        cdu,
        params,
        makeOptions({ includiStorico: true, profonditaAnniStorico: 2 })
      );
      expect(cdu.focus.classe!.materie!.elenco[0]!.continuita).toEqual({
        anniPrecedenti: [],
        titolareTimeline: null,
        itpTimeline: null,
        hasAnniPrecedenti: false,
        isContinuitaUltimiDueAnni: false,
        isContinuitaUltimiTreAnni: false,
        isContinuitaItpUltimiDueAnni: false,
        isContinuitaItpUltimiTreAnni: false
      });

      const cdu2 = cduConClasse([docenteCdc('Mario Rossi', 'm@x.it', 'ITA')]);
      provider.provide(cdu2, params, makeOptions({ includiStorico: false }));
      expect(cdu2.focus.classe!.materie!.elenco[0]!.continuita).toBeUndefined();
    });

    it('loads the current main and ITP timelines from the injected repositories', () => {
      const persone = [
        ['originario@scuola.it', 'Originario'],
        ['nuovo@scuola.it', 'Nuovo'],
        ['supplente@scuola.it', 'Supplente'],
        ['itp@scuola.it', 'Itp']
      ].map(([email, cognome]) =>
        Docente.fromData({ EMAIL: email, COGNOME: cognome, NOME: 'Mario', GENERE: 'M' })
      );
      const docentiCorrenti: IDocenteRepository = {
        findById: (email: string) => persone.find((docente) => docente.id === email) ?? null
      } as unknown as IDocenteRepository;
      const classiCorrenti: IClasseRepository = {
        getStorico: () => [],
        getTeachingSlots: () => [
          {
            column: 'MAT',
            materia: MateriaId.of('MAT'),
            kind: 'MAIN',
            specifica: null,
            actorEmails: ['originario@scuola.it']
          },
          {
            column: 'MAT.itp',
            materia: MateriaId.of('MAT'),
            kind: 'ITP',
            specifica: null,
            actorEmails: ['itp@scuola.it']
          }
        ]
      } as unknown as IClasseRepository;
      const variazioni: IVariazioneCattedraRepository = {
        findAll: () => [
          VariazioneCattedra.fromData({
            TITOLARE: 'originario@scuola.it',
            NUOVO_TITOLARE: 'nuovo@scuola.it',
            DAL: '2026-10-01',
            CLASSI: '3A',
            MATERIE: 'MAT'
          })
        ]
      } as unknown as IVariazioneCattedraRepository;
      const supplenze: ISupplenzaRepository = {
        findAll: () => [
          Supplenza.fromData({
            TITOLARE: 'nuovo@scuola.it',
            SUPPLENTE: 'supplente@scuola.it',
            DAL: '2026-11-01',
            AL: '',
            CLASSI: '3A',
            MATERIE: 'MAT'
          })
        ]
      } as unknown as ISupplenzaRepository;
      const provider = new MaterieClasseProvider(
        materie,
        docentiCorrenti,
        storicoDb,
        classiCorrenti,
        variazioni,
        supplenze
      );
      const cdu = cduConClasse([
        docenteCdc('Mario Nuovo', 'nuovo@scuola.it', 'MAT'),
        docenteCdc('Mario Itp', 'itp@scuola.it', 'MAT', true)
      ]);

      provider.provide(cdu, params, makeOptions({ includiStorico: true }));

      expect(cdu.focus.classe!.materie!.elenco[0]!.continuita).toMatchObject({
        titolareTimeline: {
          titolareOriginario: expect.objectContaining({ email: 'originario@scuola.it' }),
          variazioni: [
            {
              nuovoTitolare: expect.objectContaining({ email: 'nuovo@scuola.it' }),
              dal: new Date('2026-10-01')
            }
          ],
          supplenze: [
            {
              supplente: expect.objectContaining({ email: 'supplente@scuola.it' }),
              dal: new Date('2026-11-01'),
              al: null
            }
          ]
        },
        itpTimeline: {
          titolareOriginario: expect.objectContaining({ email: 'itp@scuola.it' }),
          variazioni: [],
          supplenze: []
        }
      });
    });

    it('preserves current dotted specifica and ITP slot identity', () => {
      const persone = ['guitar@scuola.it', 'guitar-itp@scuola.it'].map((email) =>
        Docente.fromData({ EMAIL: email, COGNOME: 'Rossi', NOME: 'Mario', GENERE: 'M' })
      );
      const classiCorrenti: IClasseRepository = {
        getStorico: () => [],
        getTeachingSlots: () => [
          {
            column: 'INTERPRET.CHITARRA',
            materia: MateriaId.of('INTERPRET'),
            kind: 'SPECIFICA',
            specifica: 'CHITARRA',
            actorEmails: ['guitar@scuola.it']
          },
          {
            column: 'INTERPRET.CHITARRA.itp',
            materia: MateriaId.of('INTERPRET'),
            kind: 'ITP',
            specifica: 'CHITARRA',
            actorEmails: ['guitar-itp@scuola.it']
          }
        ]
      } as unknown as IClasseRepository;
      const provider = new MaterieClasseProvider(
        materie,
        {
          findById: (email: string) => persone.find((docente) => docente.id === email) ?? null
        } as unknown as IDocenteRepository,
        storicoDb,
        classiCorrenti,
        { findAll: () => [] } as unknown as IVariazioneCattedraRepository,
        { findAll: () => [] } as unknown as ISupplenzaRepository
      );
      const cdu = cduConClasse([
        docenteCdc('Mario Rossi', 'guitar@scuola.it', 'INTERPRET.CHITARRA'),
        docenteCdc('Mario Rossi', 'guitar-itp@scuola.it', 'INTERPRET.CHITARRA', true)
      ]);

      provider.provide(cdu, params, makeOptions({ includiStorico: true }));

      const continuita = cdu.focus.classe!.materie!.elenco[0]!.continuita;
      expect(continuita?.titolareTimeline?.titolareOriginario?.email).toBe('guitar@scuola.it');
      expect(continuita?.itpTimeline?.titolareOriginario?.email).toBe('guitar-itp@scuola.it');
    });

    it('does not attach continuita when a required dependency is missing, even with includiStorico true', () => {
      const provider = new MaterieClasseProvider(materie); // docenti/storicoDb/classi absent
      const cdu = cduConClasse([docenteCdc('Mario Rossi', 'm@x.it', 'ITA')]);
      provider.provide(
        cdu,
        params,
        makeOptions({ includiStorico: true, profonditaAnniStorico: 1 })
      );
      expect(cdu.focus.classe!.materie!.elenco[0]!.continuita).toBeUndefined();
    });

    it('wires the ITP role end to end: hasCattedraItp subject gets a populated itp continuity from the historical cattedra matrix', () => {
      // Historical year (2A, one year back from current 3A): MATE main = m@x.it,
      // MATE.itp = l@x.it — the same titolare/ITP pair as the current council.
      const historicalTables: Record<string, Row[]> = {
        CLASSI: [
          {
            ID: '2A',
            ANNO: 2,
            INDIRIZZO: 'SCIENTIFICO',
            ATTIVA: false,
            MATE: 'm@x.it',
            'MATE.itp': 'l@x.it'
          }
        ],
        MATERIE: [{ ID: 'MATE', NOME: 'Matematica' }],
        DOCENTI: [
          { EMAIL: 'm@x.it', COGNOME: 'Rossi', NOME: 'Mario', GENERE: 'M' },
          { EMAIL: 'l@x.it', COGNOME: 'Gialli', NOME: 'Laura', GENERE: 'F' }
        ]
      };
      const docentiConEmail = new DocenteRepository(new FakeDatabase(historicalTables));
      const classiConStorico: IClasseRepository = {
        getStorico: () => [ClasseId.of('2A')]
      } as unknown as IClasseRepository;
      const db = new FakeDatabase(historicalTables);
      const storicoDbConItp: StoricoDatabaseProvider = {
        anniStorici: () => [
          {
            anno: '2024-2025',
            db,
            logDocs: new LogDocumentoRepository(db, new LazyRef(() => new ClasseRepository(db)))
          }
        ]
      };

      const provider = new MaterieClasseProvider(
        materie,
        docentiConEmail,
        storicoDbConItp,
        classiConStorico
      );
      const cdu = cduConClasse([
        docenteCdc('Mario Rossi', 'm@x.it', 'MATE', false),
        docenteCdc('Laura Gialli', 'l@x.it', 'MATE', true)
      ]);
      provider.provide(
        cdu,
        params,
        makeOptions({ includiStorico: true, profonditaAnniStorico: 1 })
      );

      const mate = cdu.focus.classe!.materie!.elenco[0]!;
      expect(mate.hasCattedraItp).toBe(true);
      const continuita = mate.continuita!;
      expect(continuita.anniPrecedenti).toHaveLength(1);
      const annoMeno1 = continuita.anniPrecedenti[0]!;
      expect(annoMeno1.titolare?.nomeCompleto).toBe('Rossi Mario');
      expect(annoMeno1.itp?.nomeCompleto).toBe('Gialli Laura');
      expect(continuita.isContinuitaUltimiDueAnni).toBe(true);
      expect(continuita.isContinuitaItpUltimiDueAnni).toBe(true);
    });

    it('preserves dotted subject identity and its ITP through historical continuity', () => {
      const historicalTables: Record<string, Row[]> = {
        CLASSI: [
          {
            ID: '2A',
            ANNO: 2,
            INDIRIZZO: 'SCIENTIFICO',
            ATTIVA: false,
            'INTERPRET.CHITARRA': 'guitar@x.it',
            'INTERPRET.CHITARRA.itp': 'guitar-itp@x.it'
          }
        ],
        MATERIE: [
          {
            ID: 'INTERPRET.CHITARRA',
            NOME: 'Interpretazione (Chitarra)',
            PRINCIPALE: 'Interpretazione',
            SPECIFICITA: 'Chitarra'
          }
        ],
        DOCENTI: [
          { EMAIL: 'guitar@x.it', COGNOME: 'Rossi', NOME: 'Mario', GENERE: 'M' },
          { EMAIL: 'guitar-itp@x.it', COGNOME: 'Gialli', NOME: 'Laura', GENERE: 'F' }
        ]
      };
      const db = new FakeDatabase(historicalTables);
      const provider = new MaterieClasseProvider(
        {
          findById: (id: string) => Materia.fromData({ ID: id, NOME: id })
        } as unknown as IMateriaRepository,
        new DocenteRepository(db),
        {
          anniStorici: () => [
            {
              anno: '2024-2025',
              db,
              logDocs: new LogDocumentoRepository(db, new LazyRef(() => new ClasseRepository(db)))
            }
          ]
        },
        { getStorico: () => [ClasseId.of('2A')] } as unknown as IClasseRepository
      );
      const cdu = cduConClasse([
        docenteCdc('Mario Rossi', 'guitar@x.it', 'INTERPRET.CHITARRA'),
        docenteCdc('Laura Gialli', 'guitar-itp@x.it', 'INTERPRET.CHITARRA', true)
      ]);

      provider.provide(
        cdu,
        params,
        makeOptions({ includiStorico: true, profonditaAnniStorico: 1 })
      );

      const dotted = cdu.focus.classe!.materie!.elenco[0]!;
      expect(dotted.sigla).toBe('INTERPRET.CHITARRA');
      expect(dotted.continuita?.anniPrecedenti[0]?.titolare?.email).toBe('guitar@x.it');
      expect(dotted.continuita?.anniPrecedenti[0]?.itp?.email).toBe('guitar-itp@x.it');
      expect(dotted.continuita?.isContinuitaUltimiDueAnni).toBe(true);
      expect(dotted.continuita?.isContinuitaItpUltimiDueAnni).toBe(true);
    });
  });
});
