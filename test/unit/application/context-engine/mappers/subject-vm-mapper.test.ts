import { buildSubjectVm, docentiDescrizione } from '../../../../../src/application/context-engine/mappers/subjectVmMapper';
import { buildPersonVm } from '../../../../../src/application/context-engine/mappers/personVmMapper';
import { Materia } from '../../../../../src/domain/entities/Materia';
import { IndirizzoId } from '../../../../../src/domain/value-objects/IndirizzoId';
import { COL_MATERIE } from '../../../../../src/config/schema';

describe('subjectVmMapper', () => {
  it('resolves sigla/nome/colori/prova/evoluzione from a Materia entity', () => {
    const materia = Materia.fromData({
      [COL_MATERIE.ID]: 'ITA',
      [COL_MATERIE.NOME]: 'Lingua e letteratura italiana',
      [COL_MATERIE.SINTESI]: 'Italiano',
      [COL_MATERIE.COLORE_1]: '#005A9C',
      [COL_MATERIE.COLORE_2]: '#E6F0FA',
      [COL_MATERIE.ESAME_CFG]: JSON.stringify({ primaProva: ['LC'], secondaProva: [] }),
      [COL_MATERIE.EVOLUZIONE]: JSON.stringify({ GST: [1, 2] })
    });
    const vm = buildSubjectVm(materia, { indirizzo: IndirizzoId.of('LC') });
    expect(vm.sigla).toBe('ITA');
    expect(vm.nome).toBe('Lingua e letteratura italiana');
    expect(vm.nomeSintetico).toBe('Italiano');
    expect(vm.colore1).toBe('#005A9C');
    expect(vm.colore2).toBe('#E6F0FA');
    expect(vm.isMateriaPrimaProva).toBe(true);
    expect(vm.isMateriaSecondaProva).toBe(false);
    expect(vm.principale).toBeNull();
    expect(vm.specificita).toBeNull();
    expect(vm.evoluzione).toEqual({ siglePrecedenti: [{ sigla: 'GST', nome: null, anni: [1, 2] }] });
  });

  it('defaults isMateriaPrimaProva/SecondaProva to false when ESAME_CFG is absent, and evoluzione to null when empty', () => {
    const materia = Materia.fromData({ [COL_MATERIE.ID]: 'STO', [COL_MATERIE.NOME]: 'Storia', [COL_MATERIE.SINTESI]: 'Storia' });
    const vm = buildSubjectVm(materia, { indirizzo: IndirizzoId.of('LC') });
    expect(vm.isMateriaPrimaProva).toBe(false);
    expect(vm.isMateriaSecondaProva).toBe(false);
    expect(vm.evoluzione).toBeNull();
  });

  it('joins docenti nomeCompleto for docentiDescrizione', () => {
    const p1 = buildPersonVm({ nome: 'Mario', cognome: 'Rossi', email: 'm@x.it', genere: 'M' });
    const p2 = buildPersonVm({ nome: 'Laura', cognome: 'Gialli', email: 'l@x.it', genere: 'F' });
    expect(docentiDescrizione([p1, p2])).toBe('Mario Rossi, Laura Gialli');
    expect(docentiDescrizione([])).toBe('');
  });
});
