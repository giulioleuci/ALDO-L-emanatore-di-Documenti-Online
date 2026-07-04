import type { ContextProvider } from '../ContextProvider';
import type { Cdu } from '../Cdu';
import type { MasterSheetRepository } from '../../../infrastructure/repositories/MasterSheetRepository';
import type { RuoloSpecialeRepository } from '../../../infrastructure/repositories/RuoloSpecialeRepository';
import type { DocenteRepository } from '../../../infrastructure/repositories/DocenteRepository';

/** Conventional RUOLI ids for the two institute-wide staff roles (02 §3). */
const RUOLO_REFERENTE_BES = 'REF_BES';
const RUOLO_ANIMATORE_DIGITALE = 'AN_DIG';

/**
 * Populates `cdu.istituto` (09 §4 → SchoolProvider). Organisation data comes from
 * the current-year Master Sheet row; the two staff names are resolved from the
 * RUOLI table (conventional ids above) through the DOCENTI registry.
 */
export class SchoolProvider implements ContextProvider {
  constructor(
    private readonly master: MasterSheetRepository,
    private readonly ruoli: RuoloSpecialeRepository,
    private readonly docenti: DocenteRepository
  ) {}

  provide(cdu: Cdu): void {
    const cfg = this.master.findConfigAnnoCorrente();
    cdu.istituto = {
      organizzazione: { annoScolastico: cfg.annoScolasticoRaw, dirigente: cfg.dirigente },
      staff: {
        referenteBes: this.nomeRuolo(RUOLO_REFERENTE_BES),
        animatoreDigitale: this.nomeRuolo(RUOLO_ANIMATORE_DIGITALE)
      }
    };
  }

  /** Full name of the first teacher holding `ruoloId`, or '' if unassigned/unknown. */
  private nomeRuolo(ruoloId: string): string {
    const ruolo = this.ruoli.findAllCached().find((r) => r.id === ruoloId);
    if (ruolo === undefined) return '';
    const emails = ruolo.getEmails();
    if (emails.length === 0) return '';
    const docente = this.docenti.findById(emails[0]!.value);
    return docente === null ? '' : docente.getNomeCompleto();
  }
}
