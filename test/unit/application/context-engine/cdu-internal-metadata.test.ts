import {
  attachCduArticolazionePartners,
  attachCduMateriaAssignmentIdentity,
  getCduArticolazionePartners,
  getCduMateriaAssignmentIdentity
} from '../../../../src/application/context-engine/CduInternalMetadata';

describe('CDU internal metadata', () => {
  it('keeps assignment metadata attached to its own subject object', () => {
    const first = { codice: 'MAT' };
    const second = { codice: 'MAT' };
    const identity = { docenteEmail: 'docente@example.edu', materiaCodice: 'MAT' };

    expect(attachCduMateriaAssignmentIdentity(first, identity)).toBe(first);
    expect(getCduMateriaAssignmentIdentity(first)).toEqual(identity);
    expect(getCduMateriaAssignmentIdentity(second)).toBeUndefined();
  });

  it('keeps articulation partners outside the serialized CDU object', () => {
    const articolazione = { codice: 'A' };

    expect(attachCduArticolazionePartners(articolazione, ['B', 'C'])).toBe(articolazione);
    expect(getCduArticolazionePartners(articolazione)).toEqual(['B', 'C']);
    expect(articolazione).toEqual({ codice: 'A' });
  });
});
