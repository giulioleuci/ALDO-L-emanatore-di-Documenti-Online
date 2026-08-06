import type { ContextProvider } from '../ContextProvider';
import type { Cdu } from '../Cdu';
import type { Progetto } from '../../../domain/entities/Progetto';
import type { TipoProgetto } from '../../../domain/value-objects/enums';
import type { ProgettoRepository } from '../../../infrastructure/repositories/ProgettoRepository';
import type { IDocenteRepository } from '../../../domain/repositories/IDocenteRepository';
import type { PersonVM } from '../mappers/personVmMapper';
import { buildPersonVm, buildPersonVmFromDocente } from '../mappers/personVmMapper';
import { tipoProgettoLabel } from '../mappers/labels';
import { getClasseEntity } from '../techEntities';

export interface ProgettoVM {
  tipo: TipoProgetto;
  tipoLabel: string;
  nome: string;
  referente: PersonVM;
  ore: number;
  oreAsl: number;
  isAsl: boolean;
}

/**
 * Builds `focus.classe.progetti[]`/`hasProgetti` from PROGETTI (02 §2.10,
 * §4.1). `REFERENTE` is a free-text cell that is usually a DOCENTI email but
 * may name an external expert — resolved to PersonVM either way, degrading
 * to an external-expert PersonVM (no email/genere) when the lookup misses.
 * Runs AFTER `class` (Recipe.ts token order): reads `tech.entita.classe`.
 */
export class ProgettiProvider implements ContextProvider {
  constructor(
    private readonly progetti: ProgettoRepository,
    private readonly docenti: IDocenteRepository
  ) {}

  provide(cdu: Cdu): void {
    const focusClasse = cdu.focus.classe;
    if (focusClasse === undefined) return;
    const classe = getClasseEntity(cdu);
    const rows: Progetto[] = this.progetti.findByClasse(classe);
    const progetti: ProgettoVM[] = rows.map((p) => ({
      tipo: p.tipo,
      tipoLabel: tipoProgettoLabel(p.tipo),
      nome: p.nome,
      referente: this.resolveReferente(p.referente),
      ore: p.getOre(),
      oreAsl: p.getOreASLEffettive(),
      isAsl: p.isASL()
    }));
    focusClasse.hasProgetti = progetti.length > 0;
    focusClasse.progetti = progetti;
  }

  private resolveReferente(raw: string): PersonVM {
    const docente = this.docenti.findById(raw);
    if (docente !== null) return buildPersonVmFromDocente(docente);
    return buildPersonVm({ nome: raw, cognome: null, email: null, genere: null });
  }
}
