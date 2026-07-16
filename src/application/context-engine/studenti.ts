import type { IClasseRepository } from '../../domain/repositories/IClasseRepository';
import type { Classe } from '../../domain/entities/Classe';
import type { Alunno } from '../../domain/entities/Alunno';

/**
 * Students of a class (09 §10). For the parent of an articulated class the
 * students live under the partner classes, so they are aggregated across both
 * partners; for a partner or a standard class it is the plain roster.
 */
export function studentiDellaClasse(
  classi: IClasseRepository,
  classe: Classe,
  soloAttivi: boolean
): Alunno[] {
  const config = classi.getArticolazione(classe);
  if (config?.isParent() === true) {
    return classi.getClassiPartner(classe).flatMap((p) => classi.getStudenti(p, soloAttivi));
  }
  return classi.getStudenti(classe, soloAttivi);
}
