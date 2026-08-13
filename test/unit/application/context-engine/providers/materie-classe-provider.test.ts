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
import type { Row } from '../../../../../src/infrastructure/db/Database';

function docenteCdc(
  nomeCompleto: string,
  email: string,
  sigla: string,
  isITP = false
): DocenteCdcVM {
  return {
    anagrafica: {
      nome: '',
      cognome: '',
      email,
      genere: 'M',
      appellativo: 'Prof.',
      articolo: 'il',
      coordinatore: 'coordinatore',
      nomeCompleto,
      materia: null,
      appellativoCompleto: `Prof. ${nomeCompleto}`,
      appellativoCognome: `Prof. ${nomeCompleto}`
    },
    materie: [
      {
        sigla,
        nome: sigla,
        nomeSintetico: sigla,
        colore1: '',
        colore2: '',
        isMateriaPrimaProva: false,
        isMateriaSecondaProva: false,
        principale: null,
        specificita: null,
        isITP,
        evoluzione: null
      }
    ],
    materieDescrizione: sigla,
    materieSigle: sigla,
    ruoli: {
      isCoordinatore: false,
      isTutorAsl: false,
      isTutorOrientamento: false,
      descrizione: []
    },
    stato: { isSupplente: false, sostituisce: null },
    tipoArticolazione: null,
    gruppoNome: null,
    isITP,
    flags: { isNotLast: false }
  };
}

const params: BuildParams = {
  target: '3A',
  tipoTarget: 'classe',
  now: new Date('2026-08-06T09:00:00Z')
};

function cduConClasse(consiglio: DocenteCdcVM[]): Cdu {
  const classe = Classe.fromData({ ID: '3A', ANNO: 3, INDIRIZZO: 'SCIENTIFICO' });
  return {
    focus: { classe: { consiglioDiClasse: consiglio } },
    tech: { entita: { classe } }
  } as unknown as Cdu;
}

describe('MaterieClasseProvider', () => {
  it('groups the class council into a flat, deduped subject catalog with docentiDescrizione/hasItp', () => {
    const cdu = {
      focus: {
        classe: {
          consiglioDiClasse: [
            docenteCdc('Mario Rossi', 'm@x.it', 'ITA'),
            docenteCdc('Laura Gialli', 'l@x.it', 'ITA', true)
          ]
        }
      }
    } as unknown as Cdu;
    new MaterieClasseProvider().provide(cdu, params, makeOptions());
    expect(cdu.focus.classe!.materie).toHaveLength(1);
    const ita = cdu.focus.classe!.materie![0]!;
    expect(ita.docenti?.map((d) => d.nomeCompleto)).toEqual(['Mario Rossi', 'Laura Gialli']);
    expect(ita.docentiDescrizione).toBe('Mario Rossi, Laura Gialli');
    expect(ita.hasItp).toBe(true);
  });

  describe('continuita attachment (includiStorico)', () => {
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
      expect(cdu.focus.classe!.materie![0]!.continuita).toBeDefined();

      const cdu2 = cduConClasse([docenteCdc('Mario Rossi', 'm@x.it', 'ITA')]);
      provider.provide(cdu2, params, makeOptions({ includiStorico: false }));
      expect(cdu2.focus.classe!.materie![0]!.continuita).toBeUndefined();
    });

    it('does not attach continuita when a required dependency is missing, even with includiStorico true', () => {
      const provider = new MaterieClasseProvider(materie); // docenti/storicoDb/classi absent
      const cdu = cduConClasse([docenteCdc('Mario Rossi', 'm@x.it', 'ITA')]);
      provider.provide(
        cdu,
        params,
        makeOptions({ includiStorico: true, profonditaAnniStorico: 1 })
      );
      expect(cdu.focus.classe!.materie![0]!.continuita).toBeUndefined();
    });

    it('wires ruoli.itp end to end: hasItp subject gets a populated itp continuity from the historical cattedra matrix', () => {
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

      const mate = cdu.focus.classe!.materie![0]!;
      expect(mate.hasItp).toBe(true);
      const continuita = mate.continuita!;
      expect(continuita.docentiAnniPrecedenti).toHaveLength(1);
      const annoMeno1 = continuita.docentiAnniPrecedenti[0]!;
      expect(annoMeno1.titolare?.nomeCompleto).toBe('Mario Rossi');
      expect(annoMeno1.itp?.nomeCompleto).toBe('Laura Gialli');
      expect(continuita.continuitaUltimiDueAnni).toBe(true);
      expect(continuita.continuitaUltimiDueAnniItp).toBe(true);
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

      const dotted = cdu.focus.classe!.materie![0]!;
      expect(dotted.sigla).toBe('INTERPRET.CHITARRA');
      expect(dotted.continuita?.docentiAnniPrecedenti[0]?.titolare?.email).toBe('guitar@x.it');
      expect(dotted.continuita?.docentiAnniPrecedenti[0]?.itp?.email).toBe('guitar-itp@x.it');
      expect(dotted.continuita?.continuitaUltimiDueAnni).toBe(true);
      expect(dotted.continuita?.continuitaUltimiDueAnniItp).toBe(true);
    });
  });
});
