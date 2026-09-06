import { buildContinuita } from '../../../../../src/application/context-engine/mappers/continuitaMapper';
import type { AnnoClasseStorico } from '../../../../../src/application/storico/StoricoClassiService';
import { Materia } from '../../../../../src/domain/entities/Materia';
import { COL_MATERIE } from '../../../../../src/config/schema';
import type { IDocenteRepository } from '../../../../../src/domain/repositories/IDocenteRepository';
import type { Docente } from '../../../../../src/domain/entities/Docente';

describe('buildContinuita', () => {
  it('flags continuitaUltimiDueAnni true when the same titolare taught the (reconciled) subject the prior year', () => {
    const materiaCorrente = Materia.fromData({
      [COL_MATERIE.ID]: 'STO',
      [COL_MATERIE.NOME]: 'Storia',
      [COL_MATERIE.EVOLUZIONE]: JSON.stringify({ GST: [1, 2] })
    });
    const anniStorici: AnnoClasseStorico[] = [
      {
        anno: '2024-2025',
        nomeStorico: '4A-LC',
        docenti: [{ docenteEmail: 'mario.rossi@scuola.edu.it', materia: 'GST', isItp: false }],
        cattedre: []
      }
    ];
    const docenti: IDocenteRepository = {
      findById: (email: string) =>
        email === 'mario.rossi@scuola.edu.it'
          ? ({ nome: 'Mario', cognome: 'Rossi', genere: 'M', id: email } as unknown as Docente)
          : null
    } as unknown as IDocenteRepository;
    const vm = buildContinuita({
      siglaCorrente: 'STO',
      hasItp: false,
      titolareCorrenteEmail: 'mario.rossi@scuola.edu.it',
      itpCorrenteEmail: null,
      annoCorsoCorrente: 3,
      anniStorici,
      materiaCorrente,
      docenti,
      docentiStorici: [docenti],
      cattedreCorrenti: []
    });
    expect(vm.anniPrecedenti).toHaveLength(1);
    const entry = vm.anniPrecedenti[0]!;
    expect(entry.annoIndietro).toBe(1);
    expect(entry.annoScolastico).toBe('2024-2025');
    expect(entry.titolare?.nomeCompleto).toBe('Rossi Mario');
    expect(entry.hasTitolare).toBe(true);
    expect(entry.itp).toBeNull();
    expect(entry.hasItp).toBe(false);
    expect(vm.isContinuitaUltimiDueAnni).toBe(true);
    expect(vm.isContinuitaUltimiTreAnni).toBe(false);
    expect(vm.isContinuitaItpUltimiTreAnni).toBe(false);
  });

  it('includes the itp field per-year and computes the *Itp continuity booleans when hasItp is true', () => {
    const materiaCorrente = Materia.fromData({
      [COL_MATERIE.ID]: 'STO',
      [COL_MATERIE.NOME]: 'Storia',
      [COL_MATERIE.EVOLUZIONE]: JSON.stringify({ GST: [1, 2] })
    });
    const anniStorici: AnnoClasseStorico[] = [
      {
        anno: '2024-2025',
        nomeStorico: '4A-LC',
        docenti: [
          { docenteEmail: 'mario.rossi@scuola.edu.it', materia: 'GST', isItp: false },
          { docenteEmail: 'laura.gialli@scuola.edu.it', materia: 'GST', isItp: true }
        ],
        cattedre: []
      },
      {
        anno: '2023-2024',
        nomeStorico: '3A-LC',
        docenti: [
          { docenteEmail: 'mario.rossi@scuola.edu.it', materia: 'GST', isItp: false },
          { docenteEmail: 'laura.gialli@scuola.edu.it', materia: 'GST', isItp: true }
        ],
        cattedre: []
      }
    ];
    const docenti: IDocenteRepository = {
      findById: (email: string) => {
        if (email === 'mario.rossi@scuola.edu.it') {
          return { nome: 'Mario', cognome: 'Rossi', genere: 'M', id: email } as unknown as Docente;
        }
        if (email === 'laura.gialli@scuola.edu.it') {
          return { nome: 'Laura', cognome: 'Gialli', genere: 'F', id: email } as unknown as Docente;
        }
        return null;
      }
    } as unknown as IDocenteRepository;
    const vm = buildContinuita({
      siglaCorrente: 'STO',
      hasItp: true,
      titolareCorrenteEmail: 'mario.rossi@scuola.edu.it',
      itpCorrenteEmail: 'laura.gialli@scuola.edu.it',
      annoCorsoCorrente: 3,
      anniStorici,
      materiaCorrente,
      docenti,
      docentiStorici: [docenti, docenti],
      cattedreCorrenti: []
    });
    expect(vm.anniPrecedenti).toHaveLength(2);
    expect(vm.hasAnniPrecedenti).toBe(true);
    const [annoMeno1, annoMeno2] = vm.anniPrecedenti;
    expect(annoMeno1!.titolare?.nomeCompleto).toBe('Rossi Mario');
    expect(annoMeno1!.itp?.nomeCompleto).toBe('Gialli Laura');
    expect(annoMeno2!.titolare?.nomeCompleto).toBe('Rossi Mario');
    expect(annoMeno2!.itp?.nomeCompleto).toBe('Gialli Laura');
    expect(vm.isContinuitaUltimiDueAnni).toBe(true);
    expect(vm.isContinuitaUltimiTreAnni).toBe(true);
    expect(vm.isContinuitaItpUltimiDueAnni).toBe(true);
    expect(vm.isContinuitaItpUltimiTreAnni).toBe(true);
  });

  it('maps current and historical main/ITP cattedra timelines with annual teachers', () => {
    const materiaCorrente = Materia.fromData({
      [COL_MATERIE.ID]: 'MAT',
      [COL_MATERIE.NOME]: 'Matematica'
    });
    const docente = (email: string): Docente =>
      ({
        nome: email.split('@')[0],
        cognome: 'Docente',
        genere: 'M',
        id: email
      }) as unknown as Docente;
    const repository = (...emails: string[]): IDocenteRepository =>
      ({
        findById: (email: string) => (emails.includes(email) ? docente(email) : null)
      }) as unknown as IDocenteRepository;
    const storico = repository(
      'storico@scuola.it',
      'nuovo@scuola.it',
      'supplente@scuola.it',
      'itp-nuovo@scuola.it',
      'itp-originario@scuola.it',
      'itp-supplente@scuola.it'
    );
    const input = {
      siglaCorrente: 'MAT',
      hasItp: true,
      titolareCorrenteEmail: 'corrente@scuola.it',
      itpCorrenteEmail: 'itp-corrente@scuola.it',
      annoCorsoCorrente: 3,
      anniStorici: [
        {
          anno: '2025-2026',
          nomeStorico: '2A',
          docenti: [
            { docenteEmail: 'nuovo@scuola.it', materia: 'MAT', isItp: false },
            { docenteEmail: 'itp-nuovo@scuola.it', materia: 'MAT', isItp: true }
          ],
          cattedre: [
            {
              materia: 'MAT',
              isItp: false,
              titolareOriginario: 'storico@scuola.it',
              variazioni: [{ nuovoTitolare: 'nuovo@scuola.it', dal: new Date('2025-10-01') }],
              supplenze: [
                {
                  supplente: 'supplente@scuola.it',
                  dal: new Date('2025-11-01'),
                  al: new Date('2025-11-15')
                }
              ]
            },
            {
              materia: 'MAT',
              isItp: true,
              titolareOriginario: 'itp-originario@scuola.it',
              variazioni: [{ nuovoTitolare: 'itp-nuovo@scuola.it', dal: new Date('2025-09-15') }],
              supplenze: [
                {
                  supplente: 'itp-supplente@scuola.it',
                  dal: new Date('2025-10-15'),
                  al: null
                }
              ]
            }
          ]
        }
      ],
      materiaCorrente,
      docenti: repository('corrente@scuola.it', 'itp-corrente@scuola.it'),
      docentiStorici: [storico],
      cattedreCorrenti: [
        {
          materia: 'MAT',
          isItp: false,
          titolareOriginario: 'corrente@scuola.it',
          variazioni: [],
          supplenze: []
        },
        {
          materia: 'MAT',
          isItp: true,
          titolareOriginario: 'itp-corrente@scuola.it',
          variazioni: [],
          supplenze: []
        }
      ]
    };

    const continuita = buildContinuita(input);

    expect(continuita).toMatchObject({
      titolareTimeline: {
        titolareOriginario: expect.objectContaining({ email: 'corrente@scuola.it' }),
        hasVariazioni: false,
        hasSupplenze: false
      },
      itpTimeline: {
        titolareOriginario: expect.objectContaining({ email: 'itp-corrente@scuola.it' }),
        variazioni: [],
        supplenze: [],
        hasVariazioni: false,
        hasSupplenze: false
      }
    });
    expect(continuita.anniPrecedenti[0]).toMatchObject({
      titolareTimeline: {
        titolareOriginario: expect.objectContaining({ email: 'storico@scuola.it' }),
        variazioni: [
          {
            nuovoTitolare: expect.objectContaining({ email: 'nuovo@scuola.it' }),
            dal: new Date('2025-10-01')
          }
        ],
        supplenze: [
          {
            supplente: expect.objectContaining({ email: 'supplente@scuola.it' }),
            dal: new Date('2025-11-01'),
            al: new Date('2025-11-15')
          }
        ],
        hasVariazioni: true,
        hasSupplenze: true
      },
      itpTimeline: {
        titolareOriginario: expect.objectContaining({ email: 'itp-originario@scuola.it' }),
        variazioni: [
          {
            nuovoTitolare: expect.objectContaining({ email: 'itp-nuovo@scuola.it' }),
            dal: new Date('2025-09-15')
          }
        ],
        supplenze: [
          {
            supplente: expect.objectContaining({ email: 'itp-supplente@scuola.it' }),
            dal: new Date('2025-10-15'),
            al: null
          }
        ],
        hasVariazioni: true,
        hasSupplenze: true
      }
    });
  });
});
