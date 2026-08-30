import type { ContextProvider } from '../ContextProvider';
import type { Cdu, PersonaVM } from '../Cdu';
import type { IMasterSheetRepository } from '../../../domain/repositories/IMasterSheetRepository';
import type { IRuoloSpecialeRepository } from '../../../domain/repositories/IRuoloSpecialeRepository';
import type { IDocenteRepository } from '../../../domain/repositories/IDocenteRepository';
import { buildPersonaVm } from '../mappers/personVmMapper';
import { elencoVm } from '../mappers/elencoVm';

export class SchoolProvider implements ContextProvider {
  constructor(
    private readonly master: IMasterSheetRepository,
    private readonly ruoli: IRuoloSpecialeRepository,
    private readonly docenti: IDocenteRepository
  ) {}

  provide(cdu: Cdu): void {
    const config = this.master.findConfigAnnoCorrente();
    const elenco = this.ruoli.findAllCached().map((ruolo) => {
      const persona = this.persona(ruolo.getEmails()[0]?.value);
      return {
        ruoloId: ruolo.id ?? '',
        ruoloNome: ruolo.nome,
        persona,
        hasPersona: persona !== null
      };
    });
    cdu.istituto = {
      annoScolastico: config.annoScolasticoRaw,
      dirigente: buildPersonaVm({ nome: config.dirigente, cognome: null, email: null, genere: null, isEsterno: true }),
      staff: { ...elencoVm(elenco), perId: Object.fromEntries(elenco.map((ruolo) => [ruolo.ruoloId, ruolo])) }
    };
  }

  private persona(email: string | undefined): PersonaVM | null {
    if (email === undefined) return null;
    const docente = this.docenti.findById(email);
    return docente === null
      ? null
      : buildPersonaVm({ nome: docente.nome, cognome: docente.cognome, email: docente.id, genere: docente.genere, isEsterno: false });
  }
}
