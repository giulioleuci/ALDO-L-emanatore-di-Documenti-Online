import type { StoricoDatabaseProvider } from './StoricoDatabaseProvider';
import { ClasseRepository } from '../../infrastructure/repositories/ClasseRepository';
import { SupplenzaRepository } from '../../infrastructure/repositories/SupplenzaRepository';
import { VariazioneCattedraRepository } from '../../infrastructure/repositories/VariazioneCattedraRepository';
import type { IClasseRepository } from '../../domain/repositories/IClasseRepository';
import { ClasseId } from '../../domain/value-objects/ClasseId';

export interface DocenteMateriaStorico {
  docenteEmail: string;
  materia: string;
  isItp: boolean;
}

export interface CattedraStorica {
  materia: string;
  isItp: boolean;
  titolareOriginario: string;
  variazioni: { nuovoTitolare: string; dal: Date }[];
  supplenze: { supplente: string; dal: Date; al: Date | null }[];
}

export interface AnnoClasseStorico {
  anno: string;
  nomeStorico: string | null;
  docenti: DocenteMateriaStorico[];
  cattedre: CattedraStorica[];
}

/**
 * StoricoClassiService (13 §5): reconstructs a class's Consiglio di Classe in
 * prior school years. Class names change across years (renumbering, address
 * splits/merges), so `CLASSI.STORICO` on the CURRENT class row — an ordered
 * CSV of past names, index 0 = immediately-prior year — is consulted to know
 * which name to search for in each historical database.
 */
export class StoricoClassiService {
  constructor(private readonly provider: StoricoDatabaseProvider) {}

  /** `storico[i]` is the class's name in the i-th most recent prior year (from `ClasseRepository.getStorico`). */
  perClasse(storico: ClasseId[], profondita = 1): AnnoClasseStorico[] {
    const out: AnnoClasseStorico[] = [];
    const anni = this.provider.anniStorici(profondita);
    for (let i = 0; i < anni.length; i++) {
      const { anno, db } = anni[i]!;
      const nomeStorico = storico[i] ?? null;
      if (nomeStorico === null) {
        out.push({ anno, nomeStorico: null, docenti: [], cattedre: [] });
        continue;
      }
      const classi: IClasseRepository = new ClasseRepository(db);
      const variazioni = new VariazioneCattedraRepository(db);
      const supplenze = new SupplenzaRepository(db);
      const classe = classi.findById(nomeStorico);
      const docenti: DocenteMateriaStorico[] = [];
      const cattedre: CattedraStorica[] = [];
      if (classe !== null) {
        for (const d of classi.getAllDocentiCDC(classe)) {
          for (const m of classi.getMaterieDelDocente(classe, d.id ?? '')) {
            docenti.push({ docenteEmail: d.id ?? '', materia: m.sigla, isItp: m.isItp });
          }
        }
        const variazioniClasse = variazioni.findByClasse(classe.classeId);
        const supplenzeAnno = supplenze.findAll();
        for (const slot of classi.getTeachingSlots(classe)) {
          const materia =
            slot.specifica === null
              ? slot.materia.value
              : `${slot.materia.value}.${slot.specifica}`;
          const variazioniApplicabili = variazioniClasse
            .filter((x) => x.applicaAMateria(slot.materia))
            .sort((a, b) => a.getDecorrenza().getTime() - b.getDecorrenza().getTime());
          const supplenzeApplicabili = supplenzeAnno
            .filter((x) => x.applicaAContesto(classe.classeId, slot.materia))
            .sort((a, b) => a.getPeriodo().dal.getTime() - b.getPeriodo().dal.getTime());
          for (const titolareOriginario of slot.actorEmails) {
            const titolari = new Set([titolareOriginario]);
            const variazioniTimeline = variazioniApplicabili
              .filter((x) => {
                if (!titolari.has(x.titolare)) return false;
                titolari.add(x.nuovoTitolare);
                return true;
              })
              .map((x) => ({ nuovoTitolare: x.nuovoTitolare, dal: x.getDecorrenza() }));
            cattedre.push({
              materia,
              isItp: slot.kind === 'ITP',
              titolareOriginario,
              variazioni: variazioniTimeline,
              supplenze: supplenzeApplicabili
                .filter((x) => titolari.has(x.titolare))
                .map((x) => ({
                  supplente: x.supplente,
                  dal: x.getPeriodo().dal,
                  al: x.getPeriodo().al
                }))
            });
          }
        }
      }
      out.push({ anno, nomeStorico: nomeStorico.value, docenti, cattedre });
    }
    return out;
  }
}
