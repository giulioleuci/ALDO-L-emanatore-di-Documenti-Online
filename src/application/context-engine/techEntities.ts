import type { Cdu, CduAlunno as CduAlunnoFocus } from './Cdu';
import type { Classe } from '../../domain/entities/Classe';
import type { Alunno } from '../../domain/entities/Alunno';
import { EntityNotFoundError } from '../../domain/errors/DomainError';

/**
 * Typed access to the live entities parked in `cdu.tech.entita` (02 §7). Early
 * providers stash the focus entities here so later providers can read them
 * (respecting the recipe ordering) without re-fetching from the repositories.
 * `tech` is non-enumerable, so these values never leak into serialized output.
 */

export function setClasseEntity(cdu: Cdu, classe: Classe): void {
  cdu.tech.entita.classe = classe;
}

export function getClasseEntity(cdu: Cdu): Classe {
  const classe = cdu.tech.entita.classe;
  if (classe === undefined) {
    throw new EntityNotFoundError(
      'CDU: entità classe non disponibile (ClasseProvider non eseguito prima?)'
    );
  }
  return classe as Classe;
}

export function setAlunnoEntity(cdu: Cdu, alunno: Alunno): void {
  cdu.tech.entita.alunno = alunno;
}

export function getAlunnoEntity(cdu: Cdu): Alunno {
  const alunno = cdu.tech.entita.alunno;
  if (alunno === undefined) {
    throw new EntityNotFoundError(
      'CDU: entità alunno non disponibile (AlunnoProvider non eseguito prima?)'
    );
  }
  return alunno as Alunno;
}

/** Esegue `fn` solo quando il CDU ha un alunno in focus. */
export function withFocusAlunno(cdu: Cdu, fn: (alunno: CduAlunnoFocus) => void): void {
  const alunno = cdu.focus.alunno;
  if (alunno !== undefined) fn(alunno);
}
