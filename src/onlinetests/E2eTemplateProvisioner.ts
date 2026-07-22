import type { IDriveFacade } from '../infrastructure/facades/DriveServiceFacade';
import { TIPI_PIANO, type E2eTemplateIds } from './E2eSampleDatabaseBuilder';

/** Port abstracting blank-Drive-artifact creation, so the provisioner is unit-testable offline. */
export interface IArtifactFactory {
  createDocument(name: string, folderId: string): string;
  createSheet(name: string, folderId: string): string;
}

const NAME_VERBALE = 'E2E Verbale Template';
const NAME_CONDOTTA = 'E2E Condotta Template';
function namePiano(tipo: string): string {
  return `E2E Piano ${tipo} Template`;
}

/**
 * Idempotently finds-or-creates the 7 real Drive templates the e2e scenarios generate
 * against (design spec `2026-07-21-testonline-mock-db-e2e-design.md`, "Template
 * provisioning"): a fixed name per template, looked up via `IDriveFacade.findFileByName`
 * before creating — repeated runs reuse the same Drive artifacts, matching the
 * `SampleDatabaseBuilder`/`GasSampleSpreadsheetFactory` reuse-by-fixed-name convention.
 */
export class E2eTemplateProvisioner {
  constructor(
    private readonly artifacts: IArtifactFactory,
    private readonly drive: IDriveFacade
  ) {}

  provision(folderId: string): E2eTemplateIds {
    const verbale = this.findOrCreateDoc(folderId, NAME_VERBALE);
    const condotta = this.findOrCreateSheet(folderId, NAME_CONDOTTA);
    const piani = {} as E2eTemplateIds['piani'];
    for (const tipo of TIPI_PIANO) {
      piani[tipo] = this.findOrCreateDoc(folderId, namePiano(tipo));
    }
    return { verbale, condotta, piani };
  }

  private findOrCreateDoc(folderId: string, name: string): string {
    return this.drive.findFileByName(folderId, name) ?? this.artifacts.createDocument(name, folderId);
  }

  private findOrCreateSheet(folderId: string, name: string): string {
    return this.drive.findFileByName(folderId, name) ?? this.artifacts.createSheet(name, folderId);
  }
}
