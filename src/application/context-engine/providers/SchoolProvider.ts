import type { ContextProvider } from '../ContextProvider';
import type { Cdu, CduIstituto } from '../Cdu';
import type { IMasterSheetRepository } from '../../../domain/repositories/IMasterSheetRepository';
import type { IRuoloSpecialeRepository } from '../../../domain/repositories/IRuoloSpecialeRepository';
import type { IDocenteRepository } from '../../../domain/repositories/IDocenteRepository';
import type { PersonVM } from '../mappers/personVmMapper';
import { buildPersonVmFromDocente } from '../mappers/personVmMapper';

/** Conventional RUOLI ids for the two institute-wide staff roles (02 §3). */
const RUOLO_REFERENTE_BES = 'REF_BES';
const RUOLO_ANIMATORE_DIGITALE = 'AN_DIG';

/**
 * Populates `cdu.istituto` (02 §3 → SchoolProvider). Organisation data comes from
 * the current-year Master Sheet row; the two staff roles resolve to a full
 * PersonVM (or null when unassigned) through the DOCENTI registry.
 */
export class SchoolProvider implements ContextProvider {
  constructor(
    private readonly master: IMasterSheetRepository,
    private readonly ruoli: IRuoloSpecialeRepository,
    private readonly docenti: IDocenteRepository
  ) {}

  provide(cdu: Cdu): void {
    const cfg = this.master.findConfigAnnoCorrente();
    const staff: CduIstituto['staff'] = {
      referenteBes: this.personaRuolo(RUOLO_REFERENTE_BES),
      animatoreDigitale: this.personaRuolo(RUOLO_ANIMATORE_DIGITALE)
    };
    // Every RUOLI row is also reachable by its raw ID (02 §3), so custom
    // institute roles (e.g. RSPP) don't need a SchoolProvider code change.
    for (const ruolo of this.ruoli.findAllCached()) {
      if (ruolo.id !== null) staff[ruolo.id] = this.personaRuolo(ruolo.id);
    }
    cdu.istituto = {
      organizzazione: {
        annoScolastico: cfg.annoScolasticoRaw,
        dirigente: { nomeCompleto: cfg.dirigente }
      },
      staff
    };
  }

  /** PersonVM of the first teacher holding `ruoloId`, or null if unassigned/unknown. */
  private personaRuolo(ruoloId: string): PersonVM | null {
    const ruolo = this.ruoli.findAllCached().find((r) => r.id === ruoloId);
    if (ruolo === undefined) return null;
    const emails = ruolo.getEmails();
    if (emails.length === 0) return null;
    const docente = this.docenti.findById(emails[0]!.value);
    return docente === null ? null : buildPersonVmFromDocente(docente);
  }
}
