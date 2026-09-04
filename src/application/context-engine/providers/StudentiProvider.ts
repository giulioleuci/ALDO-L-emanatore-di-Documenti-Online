import type { ContextProvider } from '../ContextProvider';
import type { AlunnoVM, Cdu, PianoVM, StudentiClasseVM } from '../Cdu';
import type { BuildParams, RecipeOptions } from '../Recipe';
import type { IClasseRepository } from '../../../domain/repositories/IClasseRepository';
import type { IAlunnoRepository } from '../../../domain/repositories/IAlunnoRepository';
import type { IMateriaRepository } from '../../../domain/repositories/IMateriaRepository';
import type { IOreASLRepository } from '../../../domain/repositories/IOreASLRepository';
import type { Alunno } from '../../../domain/entities/Alunno';
import type { Classe } from '../../../domain/entities/Classe';
import type { StoricoDatabaseProvider } from '../../storico/StoricoDatabaseProvider';
import { AlunnoRepository } from '../../../infrastructure/repositories/AlunnoRepository';
import { AnnoScolastico } from '../../../domain/value-objects/AnnoScolastico';
import { TipoPiano } from '../../../domain/value-objects/enums';
import { getClasseEntity } from '../techEntities';
import { buildElencoCarenzeVm, curriculumArray } from '../mappers/carenzeMapper';
import { tipoPianoLabel, religioneLabel, indirizzoTipoLabel } from '../mappers/labels';
import { buildPerSpecificita } from '../mappers/specificitaAlunniMapper';
import { elencoVm } from '../mappers/elencoVm';

export class StudentiProvider implements ContextProvider {
  constructor(
    private readonly classi: IClasseRepository,
    private readonly alunni: IAlunnoRepository,
    private readonly materie: IMateriaRepository,
    private readonly oreAsl: IOreASLRepository,
    private readonly storicoDb: StoricoDatabaseProvider
  ) {}

  provide(cdu: Cdu, _params: BuildParams, options: RecipeOptions): void {
    const classeFocus = getClasseEntity(cdu);
    const focus = cdu.focus.classe;
    if (focus === undefined) return;
    const storico = this.alunniAnnoPrecedente(options);
    const classi = this.classi.getArticolazione(classeFocus)?.isParent()
      ? this.classi.getClassiPartner(classeFocus)
      : [classeFocus];
    const elenco = classi
      .flatMap((classe) =>
        this.classi
          .getStudenti(classe)
          .filter((alunno) => alunno.isAttivo())
          .map((alunno) => this.studente(alunno, classe, cdu, storico))
      )
      .sort((a, b) => a.nomeCompleto.localeCompare(b.nomeCompleto));
    focus.studenti = this.container(elenco);
  }

  private container(elenco: AlunnoVM[]): StudentiClasseVM {
    const perStato = {
      bes: elenco.filter((alunno) => alunno.isBes),
      dsa: elenco.filter((alunno) => alunno.isDsa),
      pfp: elenco.filter((alunno) => alunno.isPfp),
      pei: elenco.filter((alunno) => alunno.isPei),
      ripetenti: elenco.filter((alunno) => alunno.isRipetente),
      rappresentanti: elenco.filter((alunno) => alunno.isRappresentante),
      conPiani: elenco.filter((alunno) => alunno.piani.hasElenco)
    };
    const irc = elenco.filter((alunno) => alunno.isIrc);
    const alt = elenco.filter((alunno) => alunno.isAlt);
    const no = elenco.filter((alunno) => alunno.isSenzaReligione);
    const perReligione = {
      irc,
      alt,
      no,
      hasIrc: irc.length > 0,
      hasAlt: alt.length > 0,
      hasNo: no.length > 0,
      ircDescrizione: irc.map((alunno) => alunno.nomeCompleto).join(', '),
      altDescrizione: alt.map((alunno) => alunno.nomeCompleto).join(', '),
      noDescrizione: no.map((alunno) => alunno.nomeCompleto).join(', '),
      elenco: [
        {
          codice: 'IRC' as const,
          label: 'Religione cattolica',
          alunni: irc,
          hasAlunni: irc.length > 0,
          numero: irc.length
        },
        {
          codice: 'ALT' as const,
          label: 'Attività alternativa',
          alunni: alt,
          hasAlunni: alt.length > 0,
          numero: alt.length
        },
        {
          codice: 'NO' as const,
          label: 'Non si avvale',
          alunni: no,
          hasAlunni: no.length > 0,
          numero: no.length
        }
      ]
    };
    const perSpecificita = buildPerSpecificita(elenco);
    return {
      ...elencoVm(elenco),
      elencoDescrizione: elenco.map((alunno) => alunno.nomeCompleto).join(', '),
      statistiche: {
        totale: 0,
        conPiani: 0,
        conBes: 0,
        conDsa: 0,
        ripetenti: 0,
        rappresentanti: 0
      },
      perStato: {
        ...perStato,
        hasBes: perStato.bes.length > 0,
        hasDsa: perStato.dsa.length > 0,
        hasPfp: perStato.pfp.length > 0,
        hasPei: perStato.pei.length > 0,
        hasRipetenti: perStato.ripetenti.length > 0,
        hasRappresentanti: perStato.rappresentanti.length > 0,
        hasConPiani: perStato.conPiani.length > 0
      },
      perReligione,
      perSpecificita,
      hasPerSpecificita: perSpecificita.length > 0
    };
  }

  private studente(
    alunno: Alunno,
    classe: Classe,
    cdu: Cdu,
    storico: IAlunnoRepository | null
  ): AlunnoVM {
    const indirizzo = this.classi.getIndirizzo(classe);
    const curriculum = curriculumArray(alunno, this.materie);
    const piani: PianoVM[] = this.alunni
      .getPiani(alunno)
      .map((piano) => ({
        tipo: piano.tipo,
        tipoLabel: tipoPianoLabel(piano.tipo),
        isBes: piano.isBES(),
        link: null,
        hasLink: false,
        parametriGenerazione: null,
        hasParametriGenerazione: false
      }))
      .sort((a, b) => a.tipo.localeCompare(b.tipo));
    const anno = cdu.istituto?.annoScolastico;
    return {
      nomeCompleto: alunno.cognomeNome,
      email: alunno.email.value,
      classe: {
        nome: classe.nome,
        indirizzo: {
          sigla: classe.indirizzo,
          nome: indirizzo.nome,
          nomeSintetico: indirizzo.nomeSintetico,
          tipo: indirizzo.tipo,
          tipoLabel: indirizzoTipoLabel(indirizzo.tipo)
        }
      },
      religione: alunno.religione,
      religioneLabel: religioneLabel(alunno.religione),
      isIrc: String(alunno.religione) === 'IRC',
      isAlt: String(alunno.religione) === 'ALT',
      isSenzaReligione: String(alunno.religione) === 'NO',
      isBes: piani.some((piano) => piano.isBes),
      isDsa: piani.some((piano) => piano.tipo === String(TipoPiano.PDP_DSA)),
      isPei: piani.some((piano) => piano.tipo === String(TipoPiano.PEI)),
      isPfp: piani.some((piano) => piano.tipo === String(TipoPiano.PFP)),
      isRipetente: alunno.isRipetente(),
      isRappresentante: alunno.isRappresentante(),
      presenza: {
        annoPrecedente: {
          isCalcolato: storico !== null,
          isPresente: storico !== null && storico.findById(alunno.email.value) !== null
        },
        isPresenteTuttoAnno: true,
        hasCambiatoClasse: false,
        classePrecedente: null,
        hasClassePrecedente: false
      },
      movimenti: elencoVm([]),
      curriculum,
      hasCurriculum: curriculum.length > 0,
      curriculumDescrizione: curriculum
        .map(
          (item) =>
            `${item.materiaNome}${item.hasSpecifiche ? ` (${item.specificheDescrizione})` : ''}`
        )
        .join(', '),
      carenze: buildElencoCarenzeVm(
        this.alunni.getCarenze(alunno),
        this.materie.findAllSigle(),
        this.materie
      ),
      piani: {
        ...elencoVm(piani),
        elencoDescrizione: piani.map((piano) => piano.tipoLabel).join(', '),
        hasBes: piani.some((piano) => piano.isBes)
      },
      asl: {
        oreCumulate: this.oreAsl.getTotaleOre(alunno),
        oreAnnoCorrente:
          anno === undefined ? 0 : this.oreAsl.getOrCreate(alunno, AnnoScolastico.of(anno)).getOre()
      }
    };
  }

  private alunniAnnoPrecedente(options: RecipeOptions): IAlunnoRepository | null {
    if (!options.includiStorico) return null;
    const anno = this.storicoDb.anniStorici(1)[0];
    return anno === undefined ? null : new AlunnoRepository(anno.db);
  }
}
