import type { ConfigurazioneImport } from '../entities/ConfigurazioneImport';

export interface IConfigurazioneImportRepository {
  /** Inherited from GasLibraryFactory's ambient base `Repository<ConfigurazioneImport>`. */
  findById(id: string): ConfigurazioneImport | null;

  /** Enabled import jobs (ref 06 §10). */
  findAttivi(): ConfigurazioneImport[];
}
