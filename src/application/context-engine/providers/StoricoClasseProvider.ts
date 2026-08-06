import type { ContextProvider } from '../ContextProvider';
import type { Cdu } from '../Cdu';
import type { BuildParams, RecipeOptions } from '../Recipe';
import type { IClasseRepository } from '../../../domain/repositories/IClasseRepository';
import type { StoricoDatabaseProvider } from '../../storico/StoricoDatabaseProvider';
import { ClasseRepository } from '../../../infrastructure/repositories/ClasseRepository';
import { AlunnoRepository } from '../../../infrastructure/repositories/AlunnoRepository';
import { DocenteRepository } from '../../../infrastructure/repositories/DocenteRepository';
import { ProgettoRepository } from '../../../infrastructure/repositories/ProgettoRepository';
import { computeStatisticheAlunni } from '../mappers/statisticheAlunniMapper';
import type { StatisticheAlunniVM } from '../mappers/statisticheAlunniMapper';
import { buildPersonVm, buildPersonVmFromDocente } from '../mappers/personVmMapper';
import type { PersonVM } from '../mappers/personVmMapper';
import { tipoProgettoLabel } from '../mappers/labels';
import { getClasseEntity } from '../techEntities';
import type { ProgettoVM } from './ProgettiProvider';

export interface ClasseStoricoVM {
  statistiche: Array<{ annoScolastico: string; classe: string; statistiche: StatisticheAlunniVM }>;
  progetti: Array<{ annoScolastico: string; classe: string; progetti: ProgettoVM[] }>;
}

/**
 * Builds `focus.classe.storico` (02 §2.11, §8.6) — per-historical-year student
 * statistics and projects for the focused class. `CLASSI.STORICO` (index 0 =
 * immediately-prior year) gives the class's own name in each historical
 * database, opened lazily via `StoricoDatabaseProvider.anniStorici` (the same
 * mechanism `StoricoAlunniService`/`StoricoClassiService` already use).
 */
export class StoricoClasseProvider implements ContextProvider {
  constructor(
    private readonly databases: StoricoDatabaseProvider,
    private readonly classi: IClasseRepository
  ) {}

  provide(cdu: Cdu, _params: BuildParams, options: RecipeOptions): void {
    if (!options.includiStorico) return;
    const focusClasse = cdu.focus.classe;
    if (focusClasse === undefined) return;
    const classe = getClasseEntity(cdu);
    const storicoNomi = this.classi.getStorico(classe);
    const profondita = options.profonditaAnniStorico;

    focusClasse.storico = new LazyRef(() => {
      const statistiche: ClasseStoricoVM['statistiche'] = [];
      const progetti: ClasseStoricoVM['progetti'] = [];
      const anni = this.databases.anniStorici(profondita);
      for (let i = 0; i < anni.length; i++) {
        const { anno, db } = anni[i]!;
        const nomeStorico = storicoNomi[i];
        if (nomeStorico === undefined) continue;
        const classiStoriche = new ClasseRepository(db);
        const classeStorica = classiStoriche.findById(nomeStorico);
        if (classeStorica === null) continue;
        const alunniStorici = new AlunnoRepository(db);
        const attivi = classiStoriche.getStudenti(classeStorica, true);
        statistiche.push({
          annoScolastico: anno,
          classe: nomeStorico.value,
          statistiche: computeStatisticheAlunni(attivi, alunniStorici)
        });

        const docentiStorici = new DocenteRepository(db);
        const progettiStorici = new ProgettoRepository(db);
        const progettiVm = progettiStorici.findByClasse(classeStorica).map((p) => ({
          tipo: p.tipo,
          tipoLabel: tipoProgettoLabel(p.tipo),
          nome: p.nome,
          referente: this.resolveReferente(p.referente, docentiStorici),
          ore: p.getOre(),
          oreAsl: p.getOreASLEffettive(),
          isAsl: p.isASL()
        }));
        progetti.push({ annoScolastico: anno, classe: nomeStorico.value, progetti: progettiVm });
      }
      return { statistiche, progetti };
    });
  }

  private resolveReferente(raw: string, docenti: DocenteRepository): PersonVM {
    const docente = docenti.findById(raw);
    return docente === null
      ? buildPersonVm({ nome: raw, cognome: null, email: null, genere: null })
      : buildPersonVmFromDocente(docente);
  }
}
