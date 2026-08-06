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
    expect(entry.itp).toBeNull();
    expect(vm.continuitaUltimiDueAnni).toBe(true);
    expect(vm.continuitaUltimiTreAnni).toBe(false);
    expect(vm).not.toHaveProperty('continuitaUltimiTreAnniItp');
  });
});
