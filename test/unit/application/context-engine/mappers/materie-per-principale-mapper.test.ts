import { buildMateriePerPrincipale } from '../../../../../src/application/context-engine/mappers/materiePerPrincipaleMapper';
import type { MateriaVM } from '../../../../../src/application/context-engine/Cdu';

const materia = (sigla: string, nome: string, principale: string | null = null): MateriaVM => ({
  sigla,
  nome,
  nomeSintetico: nome,
  colore1: '',
  colore2: '',
  principale,
  specificita: null,
  hasSpecificita: false,
  nomeConSpecificita: nome,
  isItp: false,
  isMateriaPrimaProva: false,
  isMateriaSecondaProva: false,
  evoluzione: { siglePrecedenti: [], hasSiglePrecedenti: false }
});

test('groups and sorts subjects in the canonical collection envelope', () => {
  const italiano = materia('ITA', 'Italiano');
  const chitarra = materia('INTERPRET.CHITARRA', 'Esecuzione (chitarra)', 'Esecuzione');
  expect(buildMateriePerPrincipale([italiano, chitarra])).toEqual({
    elenco: [
      {
        principaleId: 'INTERPRET',
        nome: 'Esecuzione',
        materie: [chitarra],
        hasMaterie: true,
        numero: 1,
        materieDescrizione: 'Esecuzione (chitarra)'
      },
      {
        principaleId: 'ITA',
        nome: 'Italiano',
        materie: [italiano],
        hasMaterie: true,
        numero: 1,
        materieDescrizione: 'Italiano'
      }
    ],
    hasElenco: true,
    numero: 2
  });
});
