import { buildMateriaVm } from '../../../../../src/application/context-engine/mappers/subjectVmMapper';
import { buildPersonaVm } from '../../../../../src/application/context-engine/mappers/personVmMapper';
import { Materia } from '../../../../../src/domain/entities/Materia';
import { IndirizzoId } from '../../../../../src/domain/value-objects/IndirizzoId';
import { COL_MATERIE } from '../../../../../src/config/schema';

const materia = Materia.fromData({
  [COL_MATERIE.ID]: 'ITA',
  [COL_MATERIE.NOME]: 'Lingua italiana',
  [COL_MATERIE.SINTESI]: 'Italiano',
  [COL_MATERIE.COLORE_1]: '#111111',
  [COL_MATERIE.COLORE_2]: '#eeeeee',
  [COL_MATERIE.ESAME_CFG]: JSON.stringify({ primaProva: ['LC'], secondaProva: [] }),
  [COL_MATERIE.EVOLUZIONE]: JSON.stringify({ GST: [1, 2] })
});

test('BASE emits only canonical base fields', () => {
  const vm = buildMateriaVm(materia, 'BASE', { indirizzo: IndirizzoId.of('LC'), isItp: false });
  expect(vm).toMatchObject({
    sigla: 'ITA',
    nome: 'Lingua italiana',
    nomeSintetico: 'Italiano',
    hasSpecificita: false,
    nomeConSpecificita: 'Lingua italiana',
    isItp: false,
    isMateriaPrimaProva: true
  });
  expect(vm.evoluzione).toEqual({
    siglePrecedenti: [{ sigla: 'GST', anni: [1, 2], anniDescrizione: '1, 2' }],
    hasSiglePrecedenti: true
  });
  expect(vm).not.toHaveProperty('docenti');
  expect(vm).not.toHaveProperty('continuita');
});

test('CON_DOCENTI adds the complete teacher projection and descriptions', () => {
  const docente = buildPersonaVm({ nome: 'Mario', cognome: 'Rossi', email: 'm@x.it', genere: 'M' });
  const vm = buildMateriaVm(materia, 'CON_DOCENTI', { docenti: [docente], hasCattedraItp: true });
  expect(vm).toMatchObject({
    docenti: [docente],
    hasDocenti: true,
    docentiDescrizione: 'Prof. Rossi Mario',
    docentiDescrizioneEstesa: 'Il prof. Rossi Mario',
    hasCattedraItp: true
  });
});

test('sorts historical subject years deterministically', () => {
  const disordinata = Materia.fromData({
    [COL_MATERIE.ID]: 'STO',
    [COL_MATERIE.NOME]: 'Storia',
    [COL_MATERIE.EVOLUZIONE]: JSON.stringify({ GST: [2, 1] })
  });

  expect(buildMateriaVm(disordinata, 'BASE', {}).evoluzione.siglePrecedenti[0]).toMatchObject({
    sigla: 'GST',
    anni: [1, 2],
    anniDescrizione: '1, 2'
  });
});
