import type { StoricoDatabaseProvider } from './StoricoDatabaseProvider';
import { AlunnoRepository } from '../../infrastructure/repositories/AlunnoRepository';
import type { IAlunnoRepository } from '../../domain/repositories/IAlunnoRepository';
import { ClasseRepository } from '../../infrastructure/repositories/ClasseRepository';
import type { IClasseRepository } from '../../domain/repositories/IClasseRepository';
import { CarenzaRepository } from '../../infrastructure/repositories/CarenzaRepository';
import type { ICarenzaRepository } from '../../domain/repositories/ICarenzaRepository';
import { PianoRepository } from '../../infrastructure/repositories/PianoRepository';
import type { IPianoRepository } from '../../domain/repositories/IPianoRepository';
import { MovimentoAlunnoRepository } from '../../infrastructure/repositories/MovimentoAlunnoRepository';
import type { IMovimentoAlunnoRepository } from '../../domain/repositories/IMovimentoAlunnoRepository';
import { MateriaRepository } from '../../infrastructure/repositories/MateriaRepository';
import type { IMateriaRepository } from '../../domain/repositories/IMateriaRepository';
import type { Alunno } from '../../domain/entities/Alunno';
import type { MovimentoAlunno } from '../../domain/entities/MovimentoAlunno';
import { Email } from '../../domain/value-objects/Email';
import { ClasseId } from '../../domain/value-objects/ClasseId';
import { reconcileSigla } from './reconcileSigla';
import { presenteTuttoAnno } from './presenza';

export type Esito = 'PROMOSSO' | 'NON_PROMOSSO' | 'TRASFERITO' | 'RITIRATO' | 'SCONOSCIUTO';

export interface CarenzaStorica {
  materiaSigla: string;
  valore: string;
}

export interface AnnoAlunnoStorico {
  anno: string;
  classe: string | null;
  esito: Esito;
  carenze: CarenzaStorica[];
  piani: string[];
  /** Era già iscritto in questa scuola nell'anno immediatamente precedente a questo? */
  presenteAnnoPrecedente: boolean;
  /** L'anno immediatamente precedente è stato incluso nella consultazione storica. */
  annoPrecedenteCalcolato: boolean;
  /** Nessun IN/CAMBIO datato entro questo anno? (ANALYSIS_HISTORIC_ENRICH_EXTENSION.md §5) */
  presenteTuttoAnno: boolean;
  /** Movimenti effettivi dell'anno della fotografia. */
  movimenti: MovimentoAlunno[];
  /** Identificativi delle classi interne nell'anno della fotografia. */
  classiInterne: string[];
}

interface AnnoRisolto {
  anno: string;
  alunno: Alunno | null;
  classi: IClasseRepository;
  carenze: ICarenzaRepository;
  piani: IPianoRepository;
  movimenti: MovimentoAlunno[];
  materie: IMateriaRepository;
}

/**
 * StoricoAlunniService (13 §3): per prior school year, the student's class,
 * end-of-year outcome, last-measurement shortfalls (sigle reconciled to the
 * current MATERIE catalogue) and active personalized plans.
 *
 * Esito derivation (ANALYSIS_HISTORIC_ENRICH_EXTENSION.md §2-3): an OUT
 * movement in the year is TRASFERITO, a RITIRATO movement is RITIRATO — both
 * take priority since an exit makes "promoted or not" moot. Otherwise, the
 * outcome comes from the STUDENT'S OWN `ALUNNI.RIPETENTE` flag on the
 * IMMEDIATELY FOLLOWING year (this same fetched batch's previous entry, or
 * the current-year `Alunno` passed as `alunnoAnnoSuccessivo` for the most
 * recent historical year): RIPETENTE=true there means this year was
 * NON_PROMOSSO, RIPETENTE=false means PROMOSSO. `CAMBIO` never drives esito —
 * by definition it cannot cross a course-year boundary. No next-year record
 * at all (boundary of the configured/available depth) yields SCONOSCIUTO —
 * an accepted terminal case, not a bug (§7).
 */
export class StoricoAlunniService {
  constructor(private readonly provider: StoricoDatabaseProvider) {}

  perAlunno(
    alunnoEmail: string,
    profondita = 1,
    alunnoAnnoSuccessivo: Alunno | null = null
  ): AnnoAlunnoStorico[] {
    const risolti: AnnoRisolto[] = this.provider.anniStorici(profondita).map(({ anno, db }) => {
      const alunni: IAlunnoRepository = new AlunnoRepository(db);
      const movimentiRepo: IMovimentoAlunnoRepository = new MovimentoAlunnoRepository(db);
      const alunno = alunni.findById(alunnoEmail);
      return {
        anno,
        alunno,
        classi: new ClasseRepository(db),
        carenze: new CarenzaRepository(db),
        piani: new PianoRepository(db),
        movimenti: alunno !== null ? movimentiRepo.findByAlunno(alunno) : [],
        materie: new MateriaRepository(db)
      };
    });

    return risolti.map((corrente, i) => {
      const { anno, alunno, classi, carenze, piani, movimenti, materie } = corrente;
      const annoPrecedenteCalcolato = i + 1 < risolti.length;
      const classiInterne = classi
        .findAll()
        .map((classe) => classe.nome)
        .sort((a, b) => a.localeCompare(b));

      if (alunno === null) {
        return {
          anno,
          classe: null,
          esito: 'SCONOSCIUTO',
          carenze: [],
          piani: [],
          presenteAnnoPrecedente: false,
          annoPrecedenteCalcolato,
          presenteTuttoAnno: false,
          movimenti: [],
          classiInterne
        };
      }

      const classe =
        alunno.classe !== '' ? classi.findById(ClasseId.of(alunno.classe)) : null;
      const annoCorso = classe?.anno.value ?? null;

      const carenzeStoriche: CarenzaStorica[] = [];
      for (const c of carenze.findByAlunno(alunno)) {
        for (const [materiaId, valore] of carenze.getCarenzePerMateria(c)) {
          const sigla =
            annoCorso !== null
              ? reconcileSigla(materiaId.value, annoCorso, materie.findAllCached())
              : materiaId.value;
          carenzeStoriche.push({ materiaSigla: sigla, valore: valore.toString() });
        }
      }

      const successivo = i === 0 ? alunnoAnnoSuccessivo : risolti[i - 1]!.alunno;
      const precedente = risolti[i + 1]?.alunno ?? null;

      return {
        anno,
        classe: alunno.classe,
        esito: this.esito(movimenti, successivo),
        carenze: carenzeStoriche,
        piani: piani.findByAlunno(Email.of(alunno.id ?? alunnoEmail)).map((p) => p.tipo),
        presenteAnnoPrecedente: precedente !== null,
        annoPrecedenteCalcolato,
        presenteTuttoAnno: presenteTuttoAnno(movimenti),
        movimenti,
        classiInterne
      };
    });
  }

  private esito(movimenti: MovimentoAlunno[], alunnoAnnoSuccessivo: Alunno | null): Esito {
    if (movimenti.some((m) => m.isUscita())) return 'TRASFERITO';
    if (movimenti.some((m) => m.isRitirato())) return 'RITIRATO';
    if (alunnoAnnoSuccessivo !== null) {
      return alunnoAnnoSuccessivo.isRipetente() ? 'NON_PROMOSSO' : 'PROMOSSO';
    }
    return 'SCONOSCIUTO';
  }
}
