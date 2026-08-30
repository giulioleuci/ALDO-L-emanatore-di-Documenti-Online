import type { ContextProvider } from '../ContextProvider';
import type { Cdu, DocenteCdcVM, MateriaVM } from '../Cdu';
import type { BuildParams, RecipeOptions } from '../Recipe';
import { buildMateriePerPrincipale } from '../mappers/materiePerPrincipaleMapper';
import { buildContinuita } from '../mappers/continuitaMapper';
import { descriviPersone, descriviPersoneEsteso } from '../mappers/personVmMapper';
import { elencoVm } from '../mappers/elencoVm';
import type { IMateriaRepository } from '../../../domain/repositories/IMateriaRepository';
import type { IDocenteRepository } from '../../../domain/repositories/IDocenteRepository';
import type { IClasseRepository } from '../../../domain/repositories/IClasseRepository';
import type { StoricoDatabaseProvider } from '../../storico/StoricoDatabaseProvider';
import { StoricoClassiService } from '../../storico/StoricoClassiService';
import { getClasseEntity } from '../techEntities';

interface RuoliCorrente { titolare: string | null; itp: string | null; }

export class MaterieClasseProvider implements ContextProvider {
  constructor(
    private readonly materie?: IMateriaRepository,
    private readonly docenti?: IDocenteRepository,
    private readonly storicoDb?: StoricoDatabaseProvider,
    private readonly classi?: IClasseRepository
  ) {}

  provide(cdu: Cdu, _params: BuildParams, options: RecipeOptions): void {
    const focus = cdu.focus.classe;
    if (focus?.consiglio === undefined) return;
    const { elenco, ruoli } = this.catalogo(focus.consiglio.elenco);
    focus.materie = {
      ...elencoVm(elenco),
      elencoDescrizione: elenco.map((materia) => materia.nome).join(', '),
      elencoDescrizioneSintesi: elenco.map((materia) => materia.nomeSintetico).join(', '),
      sigle: elenco.map((materia) => materia.sigla).join(', ')
    };
    focus.materiePerPrincipale = buildMateriePerPrincipale(elenco);
    this.continuita(cdu, elenco, ruoli, options);
  }

  private catalogo(consiglio: DocenteCdcVM[]): { elenco: MateriaVM[]; ruoli: Map<string, RuoliCorrente> } {
    const byKey = new Map<string, MateriaVM>();
    const ruoli = new Map<string, RuoliCorrente>();
    for (const docente of consiglio) {
      for (const materia of docente.materie) {
        // Deliberately excludes isItp from the key: MAIN and ITP teachers of the
        // same subject/specificita collapse into ONE catalog row (docenti carries
        // both, hasCattedraItp flags that an ITP cattedra exists for it) — matches
        // materiaVm's docenti-array + hasCattedraItp profile (Cdu.ts), not a
        // separate row per ITP/non-ITP split.
        const key = `${materia.sigla}::${materia.specificita ?? ''}`;
        const existing = byKey.get(key);
        const docenti = [...(existing?.docenti ?? []), docente]
          .filter((persona, index, persone) => persone.findIndex((x) => x.email === persona.email) === index)
          .sort((a, b) => a.nomeCompleto.localeCompare(b.nomeCompleto));
        byKey.set(key, {
          ...materia,
          docenti,
          hasDocenti: docenti.length > 0,
          docentiDescrizione: descriviPersone(docenti),
          docentiDescrizioneEstesa: descriviPersoneEsteso(docenti),
          hasCattedraItp: (existing?.hasCattedraItp ?? false) || materia.isItp
        });
        const corrente = ruoli.get(key) ?? { titolare: null, itp: null };
        if (materia.isItp) corrente.itp ??= docente.email;
        else corrente.titolare ??= docente.email;
        ruoli.set(key, corrente);
      }
    }
    return {
      elenco: [...byKey.values()].sort((a, b) => a.nome.localeCompare(b.nome) || a.sigla.localeCompare(b.sigla)),
      ruoli
    };
  }

  private continuita(cdu: Cdu, materie: MateriaVM[], ruoli: Map<string, RuoliCorrente>, options: RecipeOptions): void {
    if (!options.includiStorico || this.docenti === undefined || this.storicoDb === undefined || this.classi === undefined || this.materie === undefined) return;
    const classe = getClasseEntity(cdu);
    const anniStorici = new StoricoClassiService(this.storicoDb).perClasse(this.classi.getStorico(classe), options.profonditaAnniStorico);
    for (const materiaVm of materie) {
      const materia = this.materie.findById(materiaVm.sigla);
      if (materia === null) continue;
      const ruoliCorrenti = ruoli.get(`${materiaVm.sigla}::${materiaVm.specificita ?? ''}`) ?? { titolare: null, itp: null };
      materiaVm.continuita = buildContinuita({
        siglaCorrente: materiaVm.sigla,
        hasItp: materiaVm.hasCattedraItp ?? false,
        titolareCorrenteEmail: ruoliCorrenti.titolare,
        itpCorrenteEmail: ruoliCorrenti.itp,
        annoCorsoCorrente: classe.anno.value,
        anniStorici,
        materiaCorrente: materia,
        docenti: this.docenti
      });
    }
  }
}
