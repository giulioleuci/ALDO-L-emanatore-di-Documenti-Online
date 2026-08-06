import { buildMateriePerPrincipale } from '../../../../../src/application/context-engine/mappers/materiePerPrincipaleMapper';
import type { SubjectVM } from '../../../../../src/application/context-engine/mappers/subjectVmMapper';

function subject(sigla: string, nome: string): SubjectVM {
  return { sigla, nome, nomeSintetico: nome, colore1: '', colore2: '', isMateriaPrimaProva: false, isMateriaSecondaProva: false, principale: null, specificita: null, isITP: false, evoluzione: null };
}

describe('buildMateriePerPrincipale', () => {
  it('keeps a non-composite subject as its own single-item group', () => {
    const materie = { findByIdCached: () => null };
    const result = buildMateriePerPrincipale([subject('ITA', 'Italiano')], materie as never);
    expect(result).toEqual([{ idFittizio: 'ITA', nome: 'Italiano', materie: [subject('ITA', 'Italiano')] }]);
  });

  it('groups composite specificità subjects under their base materia name', () => {
    // NOTE: the brief's illustrative example used "INTERPRETAZIONE" (15 chars)
    // as the base sigla, but MateriaId.of() enforces `^[A-Z]{2,10}$` — adapted
    // to "INTERPRET", matching the existing composite-id fixture convention
    // already established in test/fixtures/tables.ts (teachingSlotFixtureTables).
    const chitarra = subject('INTERPRET.CHITARRA', 'Esecuzione ed interpretazione (chitarra)');
    const flauto = subject('INTERPRET.FLAUTO', 'Esecuzione ed interpretazione (flauto)');
    const materie = { findByIdCached: (id: { value: string }) => (id.value === 'INTERPRET' ? { nome: 'Esecuzione ed interpretazione' } : null) };
    const result = buildMateriePerPrincipale([chitarra, flauto], materie as never);
    expect(result).toEqual([{ idFittizio: 'INTERPRET', nome: 'Esecuzione ed interpretazione', materie: [chitarra, flauto] }]);
  });
});
