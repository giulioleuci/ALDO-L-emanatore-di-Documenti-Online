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
        docenti: [{ docenteEmail: 'mario.rossi@scuola.edu.it', materia: 'GST', isItp: false }]
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
      docenti
    });
    expect(vm.docentiAnniPrecedenti).toHaveLength(1);
    const entry = vm.docentiAnniPrecedenti[0]!;
    expect(entry.annoIndietro).toBe(1);
    expect(entry.annoScolastico).toBe('2024-2025');
    expect(entry.titolare?.nomeCompleto).toBe('Mario Rossi');
    expect(entry).not.toHaveProperty('itp');
    expect(vm.continuitaUltimiDueAnni).toBe(true);
    expect(vm.continuitaUltimiTreAnni).toBe(false);
    expect(vm).not.toHaveProperty('continuitaUltimiTreAnniItp');
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
        ]
      },
      {
        anno: '2023-2024',
        nomeStorico: '3A-LC',
        docenti: [
          { docenteEmail: 'mario.rossi@scuola.edu.it', materia: 'GST', isItp: false },
          { docenteEmail: 'laura.gialli@scuola.edu.it', materia: 'GST', isItp: true }
        ]
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
      docenti
    });
    expect(vm.docentiAnniPrecedenti).toHaveLength(2);
    const [annoMeno1, annoMeno2] = vm.docentiAnniPrecedenti;
    expect(annoMeno1!.titolare?.nomeCompleto).toBe('Mario Rossi');
    expect(annoMeno1!.itp?.nomeCompleto).toBe('Laura Gialli');
    expect(annoMeno2!.titolare?.nomeCompleto).toBe('Mario Rossi');
    expect(annoMeno2!.itp?.nomeCompleto).toBe('Laura Gialli');
    expect(vm.continuitaUltimiDueAnni).toBe(true);
    expect(vm.continuitaUltimiTreAnni).toBe(true);
    expect(vm.continuitaUltimiDueAnniItp).toBe(true);
    expect(vm.continuitaUltimiTreAnniItp).toBe(true);
  });
});
