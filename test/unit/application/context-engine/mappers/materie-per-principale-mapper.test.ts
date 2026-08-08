import { buildMateriePerPrincipale } from '../../../../../src/application/context-engine/mappers/materiePerPrincipaleMapper';
import type { SubjectVM } from '../../../../../src/application/context-engine/mappers/subjectVmMapper';

function subject(sigla: string, nome: string, principale: string | null = null): SubjectVM {
  return { sigla, nome, nomeSintetico: nome, colore1: '', colore2: '', isMateriaPrimaProva: false, isMateriaSecondaProva: false, principale, specificita: null, isITP: false, evoluzione: null };
}

describe('buildMateriePerPrincipale', () => {
  it('keeps a non-composite subject as its own single-item group', () => {
    const result = buildMateriePerPrincipale([subject('ITA', 'Italiano')]);
    expect(result).toEqual([{ idFittizio: 'ITA', nome: 'Italiano', materie: [subject('ITA', 'Italiano')] }]);
  });

  it('groups composite specificità subjects under their base materia name', () => {
    // NOTE: the brief's illustrative example used "INTERPRETAZIONE" (15 chars)
    // as the base sigla, but MateriaId.of() enforces `^[A-Z]{2,10}$` — adapted
    // to "INTERPRET", matching the existing composite-id fixture convention
    // already established in test/fixtures/tables.ts (teachingSlotFixtureTables).
    const chitarra = subject('INTERPRET.CHITARRA', 'Esecuzione ed interpretazione (chitarra)', 'Esecuzione ed interpretazione');
    const flauto = subject('INTERPRET.FLAUTO', 'Esecuzione ed interpretazione (flauto)', 'Esecuzione ed interpretazione');
    const result = buildMateriePerPrincipale([chitarra, flauto]);
    expect(result).toEqual([{ idFittizio: 'INTERPRET', nome: 'Esecuzione ed interpretazione', materie: [chitarra, flauto] }]);
  });

  it('reads the composite group name from .principale, not a base-row lookup', () => {
    const materie: SubjectVM[] = [
      {
        sigla: 'INTERPRET.CHITARRA',
        nome: 'Interpretazione ed esecuzione (Chitarra)',
        nomeSintetico: 'Interpretazione ed esecuzione (Chitarra)',
        colore1: '#1565C0',
        colore2: '#90CAF9',
        isMateriaPrimaProva: false,
        isMateriaSecondaProva: false,
        principale: 'Interpretazione ed esecuzione',
        specificita: 'Chitarra',
        isITP: false,
        evoluzione: null
      }
    ];
    const groups = buildMateriePerPrincipale(materie);

    expect(groups).toEqual([
      {
        idFittizio: 'INTERPRET',
        nome: 'Interpretazione ed esecuzione',
        materie
      }
    ]);
  });
});
