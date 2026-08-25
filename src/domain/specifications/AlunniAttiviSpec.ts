import { Specification } from './Specification';
import { COL_ALUNNI } from '../../config/schema';

type RowLike = Record<string, string | number | boolean | null>;

export class AlunniAttiviSpec extends Specification<RowLike> {
  isSatisfiedBy(candidate: RowLike): boolean {
    return candidate[COL_ALUNNI.ATTIVO] === true;
  }

  override toQueryObject(): Record<string, unknown> {
    return { [COL_ALUNNI.ATTIVO]: true };
  }
}
