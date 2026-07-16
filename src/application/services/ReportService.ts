import { ClasseRepository } from '../../infrastructure/repositories/ClasseRepository';
import { DocenteRepository } from '../../infrastructure/repositories/DocenteRepository';
import { AlunnoRepository } from '../../infrastructure/repositories/AlunnoRepository';
import { CarenzaRepository } from '../../infrastructure/repositories/CarenzaRepository';
import { OreASLRepository } from '../../infrastructure/repositories/OreASLRepository';
import { LogDocumentoRepository } from '../../infrastructure/repositories/LogDocumentoRepository';
import type { ICarenzaRepository } from '../../domain/repositories/ICarenzaRepository';
import type { IDocenteRepository } from '../../domain/repositories/IDocenteRepository';
import type { Classe } from '../../domain/entities/Classe';
import type { ValoreCarenza } from '../../domain/value-objects/ValoreCarenza';
import { ClasseId } from '../../domain/value-objects/ClasseId';
import { TipoPiano } from '../../domain/value-objects/enums';
import { EntityNotFoundError } from '../../domain/errors/DomainError';

export type Severita = 'GRAVE' | 'MEDIA' | 'LIEVE';

export interface StatisticheClasse {
  alunni: { totali: number; attivi: number; conBes: number; conDsa: number; ripetenti: number };
  carenze: { grave: number; media: number; lieve: number; totale: number };
  oreAsl: number;
  documentiPerTipo: Record<string, number>;
}

export interface StatisticheIstituto {
  totaleAlunni: number;
  totaleDocenti: number;
  totaleClassiAttive: number;
  perAnno: Record<number, number>;
  perIndirizzo: Record<string, number>;
}

export interface CarenzaRow {
  studente: string;
  materia: string;
  valore: string;
  severita: Severita;
}
export interface CarenzeReport {
  righe: CarenzaRow[];
  totale: number;
  perSeverita: { grave: number; media: number; lieve: number };
}
export interface ReportCarenzeOptions {
  classe: string;
  materia?: string;
  soloNonNotificate?: boolean;
}

export interface ASLReport {
  perStudente: Array<{ studente: string; ore: number }>;
  totaleClasse: number;
}

/**
 * Read-only reporting service (12 §4): aggregates statistics for the institute,
 * a class and single students over the domain repositories. Never mutates data.
 *
 * Carenza severity is a ReportService business rule (the spec asks for a
 * GRAVE/MEDIA/LIEVE distribution but does not fix thresholds): a numeric grade
 * below 4 is GRAVE, 4–4.99 MEDIA, 5 and above LIEVE; a free-text NOTA (a
 * qualitative shortfall with no grade) counts as GRAVE.
 */
export class ReportService {
  private readonly classi: ClasseRepository;
  private readonly docenti: IDocenteRepository;
  private readonly alunni: AlunnoRepository;
  private readonly carenze: ICarenzaRepository;
  private readonly asl: OreASLRepository;
  private readonly logDocs: LogDocumentoRepository;

  constructor(database: RepositoryDatabase) {
    this.classi = new ClasseRepository(database);
    this.docenti = new DocenteRepository(database);
    this.alunni = new AlunnoRepository(database);
    this.carenze = new CarenzaRepository(database);
    this.asl = new OreASLRepository(database);
    this.logDocs = new LogDocumentoRepository(database);
  }

  getStatisticheClasse(classeId: ClasseId): StatisticheClasse {
    const classe = this.requireClasse(classeId);
    const tutti = this.classi.getStudenti(classe, false);
    const attivi = tutti.filter((a) => a.isAttivo());

    let conBes = 0,
      conDsa = 0,
      ripetenti = 0;
    for (const a of tutti) {
      const piani = this.alunni.getPiani(a);
      if (piani.some((p) => p.isBES())) conBes++;
      if (piani.some((p) => p.tipo === TipoPiano.PDP_DSA)) conDsa++;
      if (a.isRipetente()) ripetenti++;
    }

    const carenze = { grave: 0, media: 0, lieve: 0, totale: 0 };
    for (const c of this.carenze.findByClasse(classe)) {
      for (const valore of this.carenze.getCarenzePerMateria(c).values()) {
        this.bump(carenze, this.severita(valore));
        carenze.totale++;
      }
    }

    const documentiPerTipo: Record<string, number> = {};
    for (const doc of this.logDocs.findByClasse(classe)) {
      documentiPerTipo[doc.tipo] = (documentiPerTipo[doc.tipo] ?? 0) + 1;
    }

    return {
      alunni: { totali: tutti.length, attivi: attivi.length, conBes, conDsa, ripetenti },
      carenze,
      oreAsl: tutti.reduce((sum, a) => sum + this.asl.getTotaleOre(a), 0),
      documentiPerTipo
    };
  }

  getStatisticheIstituto(): StatisticheIstituto {
    const attive = this.classi.findAttive();
    const perAnno: Record<number, number> = {};
    const perIndirizzo: Record<string, number> = {};
    for (const c of attive) {
      perAnno[c.anno.value] = (perAnno[c.anno.value] ?? 0) + 1;
      perIndirizzo[c.indirizzo] = (perIndirizzo[c.indirizzo] ?? 0) + 1;
    }
    return {
      totaleAlunni: this.alunni.findAttivi().length,
      totaleDocenti: this.docenti.findAll().length,
      totaleClassiAttive: attive.length,
      perAnno,
      perIndirizzo
    };
  }

  getReportCarenze(options: ReportCarenzeOptions): CarenzeReport {
    const classe = this.requireClasse(ClasseId.of(options.classe));
    const righe: CarenzaRow[] = [];
    for (const c of this.carenze.findByClasse(classe)) {
      if (options.soloNonNotificate === true && c.isNotificato()) continue;
      for (const [materia, valore] of this.carenze.getCarenzePerMateria(c)) {
        if (options.materia !== undefined && materia.value !== options.materia) continue;
        righe.push({
          studente: c.studente,
          materia: materia.value,
          valore: valore.toString(),
          severita: this.severita(valore)
        });
      }
    }
    const perSeverita = { grave: 0, media: 0, lieve: 0 };
    for (const r of righe) this.bump(perSeverita, r.severita);
    return { righe, totale: righe.length, perSeverita };
  }

  getReportASL(classeId: ClasseId): ASLReport {
    const classe = this.requireClasse(classeId);
    const perStudente = this.classi
      .getStudenti(classe, false)
      .map((a) => ({ studente: a.id ?? '', ore: this.asl.getTotaleOre(a) }));
    return { perStudente, totaleClasse: perStudente.reduce((sum, r) => sum + r.ore, 0) };
  }

  private severita(valore: ValoreCarenza): Severita {
    if (valore.isNota()) return 'GRAVE';
    const voto = Number(valore.valore);
    if (voto < 4) return 'GRAVE';
    if (voto < 5) return 'MEDIA';
    return 'LIEVE';
  }

  private bump(acc: { grave: number; media: number; lieve: number }, s: Severita): void {
    if (s === 'GRAVE') acc.grave++;
    else if (s === 'MEDIA') acc.media++;
    else acc.lieve++;
  }

  private requireClasse(classeId: ClasseId): Classe {
    const classe = this.classi.findById(classeId);
    if (classe === null) throw new EntityNotFoundError(`Classe ${classeId.value} non trovata`);
    return classe;
  }
}
