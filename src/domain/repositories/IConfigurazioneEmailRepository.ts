import type { ConfigurazioneEmail } from '../entities/ConfigurazioneEmail';

export interface IConfigurazioneEmailRepository {
  /** Inherited from GasLibraryFactory's ambient base `Repository<ConfigurazioneEmail>`. */
  findById(id: string): ConfigurazioneEmail | null;
}
