import type { ContextProvider } from '../ContextProvider';
import type { Cdu, PersonaVM, ProgettoVM, StoricoClasseVM } from '../Cdu';
import type { BuildParams, RecipeOptions } from '../Recipe';
import type { IClasseRepository } from '../../../domain/repositories/IClasseRepository';
import type { StoricoDatabaseProvider } from '../../storico/StoricoDatabaseProvider';
import { ClasseRepository } from '../../../infrastructure/repositories/ClasseRepository';
import { AlunnoRepository } from '../../../infrastructure/repositories/AlunnoRepository';
import { DocenteRepository } from '../../../infrastructure/repositories/DocenteRepository';
import { ProgettoRepository } from '../../../infrastructure/repositories/ProgettoRepository';
import { computeStatisticheAlunni } from '../mappers/statisticheAlunniMapper';
import { buildPersonaVm } from '../mappers/personVmMapper';
import { tipoProgettoLabel } from '../mappers/labels';
import { getClasseEntity } from '../techEntities';
import { TipoProgetto } from '../../../domain/value-objects/enums';

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
      const anni: StoricoClasseVM['anni'] = [];
      const anniStorici = this.databases.anniStorici(profondita);
      for (let i = 0; i < anniStorici.length; i++) {
        const { anno, db } = anniStorici[i]!;
        const nomeStorico = storicoNomi[i];
        if (nomeStorico === undefined) continue;
        const classiStoriche = new ClasseRepository(db);
        const classeStorica = classiStoriche.findById(nomeStorico);
        if (classeStorica === null) continue;
        const alunniStorici = new AlunnoRepository(db);
        const attivi = classiStoriche.getStudenti(classeStorica, true);

        const docentiStorici = new DocenteRepository(db);
        const progettiStorici = new ProgettoRepository(db);
        const progetti: ProgettoVM[] = progettiStorici.findByClasse(classeStorica).map((p) => ({
          tipo: p.tipo,
          tipoLabel: tipoProgettoLabel(p.tipo),
          nome: p.nome,
          referente: this.resolveReferente(p.referente, docentiStorici),
          ore: p.getOre(),
          oreAsl: p.getOreASLEffettive(),
          isAsl: p.isASL(),
          isOrientamento: p.tipo === TipoProgetto.ORIENTAMENTO,
          isAltro: p.tipo === TipoProgetto.ALTRO
        }));

        anni.push({
          annoScolastico: anno,
          classe: { nome: nomeStorico.value },
          statistiche: computeStatisticheAlunni(attivi, alunniStorici),
          progetti,
          hasProgetti: progetti.length > 0
        });
      }
      return { anni, hasAnni: anni.length > 0, numeroAnni: anni.length };
    });
  }

  private resolveReferente(raw: string, docenti: DocenteRepository): PersonaVM {
    const docente = docenti.findById(raw);
    return docente === null
      ? buildPersonaVm({ nome: raw, cognome: null, email: null, genere: null, isEsterno: true })
      : buildPersonaVm({
          nome: docente.nome,
          cognome: docente.cognome,
          email: docente.id,
          genere: docente.genere,
          isEsterno: false
        });
  }
}
