import { buildPersonVm, buildPersonVmFromDocente } from '../../../../../src/application/context-engine/mappers/personVmMapper';
import { Docente } from '../../../../../src/domain/entities/Docente';
import { Email } from '../../../../../src/domain/value-objects/Email';
import { Genere } from '../../../../../src/domain/value-objects/enums';

describe('personVmMapper', () => {
  it('builds a complete PersonVM for a male internal docente', () => {
    const docente = Docente.create(Email.of('mario.rossi@scuola.edu.it'), 'Rossi', 'Mario', Genere.M);
    const vm = buildPersonVmFromDocente(docente);
    expect(vm).toEqual({
      nome: 'Mario',
      cognome: 'Rossi',
      email: 'mario.rossi@scuola.edu.it',
      genere: 'M',
      appellativo: 'Prof.',
      articolo: 'il',
      coordinatore: 'coordinatore',
      nomeCompleto: 'Mario Rossi',
      materia: null,
      appellativoCompleto: 'Prof. Mario Rossi',
      appellativoCognome: 'Prof. Rossi'
    });
  });

  it('builds a complete PersonVM for a female internal docente with a materia tag', () => {
    const docente = Docente.create(Email.of('laura.gialli@scuola.edu.it'), 'Gialli', 'Laura', Genere.F);
    const vm = buildPersonVmFromDocente(docente, 'Greco');
    expect(vm.genere).toBe('F');
    expect(vm.appellativo).toBe('Prof.ssa');
    expect(vm.articolo).toBe('la');
    expect(vm.coordinatore).toBe('coordinatrice');
    expect(vm.nomeCompleto).toBe('Laura Gialli');
    expect(vm.materia).toBe('Greco');
    expect(vm.appellativoCompleto).toBe('Prof.ssa Laura Gialli');
    expect(vm.appellativoCognome).toBe('Prof.ssa Gialli');
  });

  it('degrades gracefully for an external expert (no cognome, no genere)', () => {
    const vm = buildPersonVm({ nome: 'Studio Legale Bianchi', cognome: null, email: null, genere: null });
    expect(vm).toEqual({
      nome: 'Studio Legale Bianchi',
      cognome: null,
      email: null,
      genere: null,
      appellativo: null,
      articolo: null,
      coordinatore: null,
      nomeCompleto: 'Studio Legale Bianchi',
      materia: null,
      appellativoCompleto: 'Studio Legale Bianchi',
      appellativoCognome: 'Studio Legale Bianchi'
    });
  });
});
