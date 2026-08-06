import type { StoricoDatabaseProvider } from './StoricoDatabaseProvider';
import { ClasseRepository } from '../../infrastructure/repositories/ClasseRepository';
import type { IClasseRepository } from '../../domain/repositories/IClasseRepository';
import { ClasseId } from '../../domain/value-objects/ClasseId';

export interface DocenteMateriaStorico {
  docenteEmail: string;
  materia: string;
  isItp: boolean;
}

export interface AnnoClasseStorico {
  anno: string;
  nomeStorico: string | null;
  docenti: DocenteMateriaStorico[];
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
        out.push({ anno, nomeStorico: null, docenti: [] });
        continue;
      }
      const classi: IClasseRepository = new ClasseRepository(db);
      const classe = classi.findById(nomeStorico);
      const docenti: DocenteMateriaStorico[] = [];
      if (classe !== null) {
        for (const d of classi.getAllDocentiCDC(classe)) {
          for (const m of classi.getMaterieDelDocente(classe, d.id ?? '')) {
            docenti.push({ docenteEmail: d.id ?? '', materia: m.sigla, isItp: m.isItp });
          }
        }
      }
      out.push({ anno, nomeStorico: nomeStorico.value, docenti });
    }
    return out;
  }
}
