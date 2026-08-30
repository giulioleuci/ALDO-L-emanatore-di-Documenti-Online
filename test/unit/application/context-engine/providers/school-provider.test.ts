import { SchoolProvider } from '../../../../../src/application/context-engine/providers/SchoolProvider';
import type { Cdu } from '../../../../../src/application/context-engine/Cdu';
import type { IMasterSheetRepository } from '../../../../../src/domain/repositories/IMasterSheetRepository';
import type { IRuoloSpecialeRepository } from '../../../../../src/domain/repositories/IRuoloSpecialeRepository';
import type { IDocenteRepository } from '../../../../../src/domain/repositories/IDocenteRepository';

function makeCdu(): Cdu {
  return { meta: {} as never, focus: {}, tech: {} as never };
}

describe('SchoolProvider', () => {
  it('builds istituto.organizzazione.dirigente as an object and staff as PersonVM', () => {
    const master: Pick<IMasterSheetRepository, 'findConfigAnnoCorrente'> = {
      findConfigAnnoCorrente: () =>
        ({ annoScolasticoRaw: '2025-2026', dirigente: 'Prof.ssa Maria Bianchi' }) as never
    };
    const ruoli: Pick<IRuoloSpecialeRepository, 'findAllCached'> = {
      findAllCached: () =>
        [
          { id: 'REF_BES', getEmails: () => [{ value: 'mario.rossi@scuola.edu.it' }] },
          { id: 'AN_DIG', getEmails: () => [] },
          { id: 'RSPP', getEmails: () => [{ value: 'mario.rossi@scuola.edu.it' }] }
        ] as never
    };
    const docenti: Pick<IDocenteRepository, 'findById'> = {
      findById: (email: string) =>
        (email === 'mario.rossi@scuola.edu.it'
          ? { nome: 'Mario', cognome: 'Rossi', genere: 'M', id: email }
          : null) as never
    };
    const provider = new SchoolProvider(master as never, ruoli as never, docenti as never);
    const cdu = makeCdu();
    provider.provide(cdu);
    expect(cdu.istituto?.annoScolastico).toBe('2025-2026');
    expect(cdu.istituto?.dirigente).toMatchObject({ nomeCompleto: 'Prof.ssa Maria Bianchi' });
    expect(cdu.istituto?.staff.perId.REF_BES?.persona?.appellativoCompleto).toBe('Prof. Rossi Mario');
    expect(cdu.istituto?.staff.perId.AN_DIG?.persona).toBeNull();
  });

  it('also exposes every RUOLI row under its raw ID, alongside the conventional aliases', () => {
    const master: Pick<IMasterSheetRepository, 'findConfigAnnoCorrente'> = {
      findConfigAnnoCorrente: () => ({ annoScolasticoRaw: '2025-2026', dirigente: '' }) as never
    };
    const ruoli: Pick<IRuoloSpecialeRepository, 'findAllCached'> = {
      findAllCached: () =>
        [
          { id: 'REF_BES', getEmails: () => [{ value: 'mario.rossi@scuola.edu.it' }] },
          { id: 'AN_DIG', getEmails: () => [] },
          { id: 'RSPP', getEmails: () => [{ value: 'mario.rossi@scuola.edu.it' }] }
        ] as never
    };
    const docenti: Pick<IDocenteRepository, 'findById'> = {
      findById: (email: string) =>
        (email === 'mario.rossi@scuola.edu.it'
          ? { nome: 'Mario', cognome: 'Rossi', genere: 'M', id: email }
          : null) as never
    };
    const provider = new SchoolProvider(master as never, ruoli as never, docenti as never);
    const cdu = makeCdu();
    provider.provide(cdu);
    expect(cdu.istituto?.staff.perId.REF_BES?.persona?.appellativoCompleto).toBe('Prof. Rossi Mario');
    expect(cdu.istituto?.staff.perId.AN_DIG?.persona).toBeNull();
    expect(cdu.istituto?.staff.perId.RSPP?.persona?.appellativoCompleto).toBe('Prof. Rossi Mario');
  });
});
