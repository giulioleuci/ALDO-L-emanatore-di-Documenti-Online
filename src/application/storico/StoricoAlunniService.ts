import type { StoricoDatabaseProvider } from './StoricoDatabaseProvider';
import { AlunnoRepository } from '../../infrastructure/repositories/AlunnoRepository';
import { ClasseRepository } from '../../infrastructure/repositories/ClasseRepository';
import { CarenzaRepository } from '../../infrastructure/repositories/CarenzaRepository';
import type { ICarenzaRepository } from '../../domain/repositories/ICarenzaRepository';
import { PianoRepository } from '../../infrastructure/repositories/PianoRepository';
import { MovimentoAlunnoRepository } from '../../infrastructure/repositories/MovimentoAlunnoRepository';
import { MateriaRepository } from '../../infrastructure/repositories/MateriaRepository';
import { Email } from '../../domain/value-objects/Email';
import { ClasseId } from '../../domain/value-objects/ClasseId';
import { TipoMovimento } from '../../domain/value-objects/enums';
import { reconcileSigla } from './reconcileSigla';

export type Esito = 'PROMOSSO' | 'NON_PROMOSSO' | 'RITIRATO' | 'SCONOSCIUTO';

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
}

/**
 * StoricoAlunniService (13 §3): per prior school year, the student's class,
 * end-of-year outcome, last-measurement shortfalls (sigle reconciled to the
 * current MATERIE catalogue) and active personalized plans.
 *
 * Esito derivation: MOV_ALUNNI has no explicit outcome column (ref 01), so the
 * outcome is inferred from that year's movement records — an OUT movement is
 * RITIRATO; a CAMBIO into a class whose numeric year is not higher than the
 * source is NON_PROMOSSO (repeated); a CAMBIO into a strictly higher year is
 * PROMOSSO; no movement at all yields SCONOSCIUTO (nothing recorded to infer
 * from). This rule is a ReportService/StoricoAlunniService-level policy since
 * the spec does not fix one.
 */
export class StoricoAlunniService {
  constructor(private readonly provider: StoricoDatabaseProvider) {}

  perAlunno(alunnoEmail: string, profondita = 1): AnnoAlunnoStorico[] {
    const out: AnnoAlunnoStorico[] = [];
    for (const { anno, db } of this.provider.anniStorici(profondita)) {
      const alunni = new AlunnoRepository(db);
      const classi = new ClasseRepository(db);
      const carenze: ICarenzaRepository = new CarenzaRepository(db);
      const piani = new PianoRepository(db);
      const movimenti = new MovimentoAlunnoRepository(db);
      const materie = new MateriaRepository(db);

      const alunno = alunni.findById(alunnoEmail);
      const classe =
        alunno !== null && alunno.classe !== ''
          ? classi.findById(ClasseId.of(alunno.classe))
          : null;
      const annoCorso = classe?.anno.value ?? null;

      const carenzeStoriche: CarenzaStorica[] = [];
      if (alunno !== null) {
        for (const c of carenze.findByAlunno(alunno)) {
          for (const [materiaId, valore] of carenze.getCarenzePerMateria(c)) {
            const sigla =
              annoCorso !== null
                ? reconcileSigla(materiaId.value, annoCorso, materie.findAllCached())
                : materiaId.value;
            carenzeStoriche.push({ materiaSigla: sigla, valore: valore.toString() });
          }
        }
      }

      out.push({
        anno,
        classe: alunno?.classe ?? null,
        esito: alunno === null ? 'SCONOSCIUTO' : this.esito(movimenti, alunno),
        carenze: carenzeStoriche,
        piani:
          alunno !== null
            ? piani.findByAlunno(Email.of(alunno.id ?? alunnoEmail)).map((p) => p.tipo)
            : []
      });
    }
    return out;
  }

  private esito(
    movimenti: MovimentoAlunnoRepository,
    alunno: Parameters<MovimentoAlunnoRepository['findByAlunno']>[0]
  ): Esito {
    const storia = movimenti.findByAlunno(alunno);
    if (storia.some((m) => m.tipo === TipoMovimento.OUT)) return 'RITIRATO';
    const cambio = storia.find((m) => m.tipo === TipoMovimento.CAMBIO);
    if (cambio === undefined) return 'SCONOSCIUTO';
    const annoDa = Number(cambio.da.match(/^\d+/)?.[0]);
    const annoA = Number(cambio.a.match(/^\d+/)?.[0]);
    if (!Number.isFinite(annoDa) || !Number.isFinite(annoA)) return 'SCONOSCIUTO';
    return annoA > annoDa ? 'PROMOSSO' : 'NON_PROMOSSO';
  }
}
