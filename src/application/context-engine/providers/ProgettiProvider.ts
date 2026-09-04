import type { ContextProvider } from '../ContextProvider';
import type { Cdu, PersonaVM, ProgettoVM } from '../Cdu';
import type { ProgettoRepository } from '../../../infrastructure/repositories/ProgettoRepository';
import type { IDocenteRepository } from '../../../domain/repositories/IDocenteRepository';
import { getClasseEntity } from '../techEntities';
import { buildPersonaVm } from '../mappers/personVmMapper';
import { elencoVm } from '../mappers/elencoVm';
import { tipoProgettoLabel } from '../mappers/labels';

export class ProgettiProvider implements ContextProvider {
  constructor(private readonly progetti: ProgettoRepository, private readonly docenti: IDocenteRepository) {}

  provide(cdu: Cdu): void {
    const focus = cdu.focus.classe;
    if (focus === undefined) return;
    const elenco: ProgettoVM[] = this.progetti.findByClasse(getClasseEntity(cdu))
      .map((progetto) => ({
        tipo: progetto.tipo,
        tipoLabel: tipoProgettoLabel(progetto.tipo),
        nome: progetto.nome,
        referente: this.referente(progetto.referente),
        ore: progetto.getOre(),
        oreAsl: progetto.getOreASLEffettive(),
        isAsl: progetto.isASL(),
        isOrientamento: String(progetto.tipo) === 'ORIENTAMENTO',
        isAltro: String(progetto.tipo) === 'ALTRO'
      }))
      .sort((a, b) => a.nome.localeCompare(b.nome));
    const asl = elenco.filter((progetto) => progetto.isAsl);
    const orientamento = elenco.filter((progetto) => progetto.isOrientamento);
    const altro = elenco.filter((progetto) => progetto.isAltro);
    focus.progetti = {
      ...elencoVm(elenco),
      asl,
      orientamento,
      altro,
      hasAsl: asl.length > 0,
      hasOrientamento: orientamento.length > 0,
      hasAltro: altro.length > 0,
      oreAslTotali: elenco.reduce((totale, progetto) => totale + progetto.oreAsl, 0)
    };
  }

  private referente(raw: string): PersonaVM {
    const docente = this.docenti.findById(raw);
    return docente === null
      ? buildPersonaVm({ nome: raw, cognome: null, email: null, genere: null, isEsterno: true })
      : buildPersonaVm({ nome: docente.nome, cognome: docente.cognome, email: docente.id, genere: docente.genere, isEsterno: false });
  }
}
