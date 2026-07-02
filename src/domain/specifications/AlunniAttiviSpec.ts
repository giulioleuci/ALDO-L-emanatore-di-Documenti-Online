import type { Specification } from './Specification';
import { COL_ALUNNI } from '../../config/schema';

type RowLike = Record<string, string | number | boolean | null>;

export class AlunniAttiviSpec implements Specification<RowLike> {
  isSatisfiedBy(candidate: RowLike): boolean {
    return candidate[COL_ALUNNI.ATTIVO] === true;
  }

  toQueryObject(): Record<string, unknown> {
    return { [COL_ALUNNI.ATTIVO]: true };
  }
}
