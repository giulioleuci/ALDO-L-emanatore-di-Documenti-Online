import type { StoricoDatabaseProvider } from './StoricoDatabaseProvider';
import { ClasseRepository } from '../../infrastructure/repositories/ClasseRepository';
import type { IClasseRepository } from '../../domain/repositories/IClasseRepository';

export interface ClasseMateriaStorico {
  classe: string;
  materia: string;
}

export interface AnnoDocenteStorico {
  anno: string;
  classi: ClasseMateriaStorico[];
}

/**
 * StoricoDocentiService (13 §6): for a teacher, the classes and subjects
 * taught in prior school years. Scans every active class's dynamic subject
 * columns of the historical CLASSI table looking for the teacher's email —
 * there is no direct docente→classi index, so this is a full-table scan per
 * year (small, stable tables; acceptable at the school scale ALDO targets).
 */
export class StoricoDocentiService {
  constructor(private readonly provider: StoricoDatabaseProvider) {}

  perDocente(docenteEmail: string, profondita = 1): AnnoDocenteStorico[] {
    const out: AnnoDocenteStorico[] = [];
    for (const { anno, db } of this.provider.anniStorici(profondita)) {
      const classi: IClasseRepository = new ClasseRepository(db);
      const trovate: ClasseMateriaStorico[] = [];
      for (const classe of classi.findAll()) {
        for (const m of classi.getMaterieDelDocente(classe, docenteEmail)) {
          trovate.push({ classe: classe.nome, materia: m.sigla });
        }
      }
      out.push({ anno, classi: trovate });
    }
    return out;
  }
}
