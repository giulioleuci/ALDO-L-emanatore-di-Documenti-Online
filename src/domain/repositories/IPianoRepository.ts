import type { Piano } from '../entities/Piano';
import type { Email } from '../value-objects/Email';

export interface IPianoRepository {
  findByAlunno(email: Email): Piano[];
}
