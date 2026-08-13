import { ClasseId } from '../../domain/value-objects/ClasseId';
import type { ClasseRepository } from '../../infrastructure/repositories/ClasseRepository';
import type { IPropertiesFacade } from '../../infrastructure/facades/PropertiesFacade';
import type { ServiceContainer } from '../../config/ServiceContainer';
import { ValidationError } from '../../domain/errors/DomainError';
import type { SharedTestDatabase } from '../data/SharedTestDatabaseBuilder';
import { groupName, type TestRunner } from '../report/OnlineTestReport';

/** Runtime seams keep real GAS container/cache lifecycle testable offline. */
export interface CacheIsolationDeps {
  initAldo: (
    now?: Date,
    properties?: IPropertiesFacade,
    masterSpreadsheetId?: string
  ) => ServiceContainer;
  resetAldo: () => void;
  properties: IPropertiesFacade;
  clock: () => Date;
  secondMasterSpreadsheetId: string;
}

function classi(container: ServiceContainer): ClasseRepository {
  return container.get<ClasseRepository>('classi');
}

/**
 * Warms the real Script Cache through SheetDBLib on the shared fixture, then opens a separate
 * master/database where `1A` does not exist. A cache key missing its spreadsheet identity would
 * make the second lookup return the warmed row instead of `null`.
 */
export function registerCacheIsolamentoChecks(
  runner: TestRunner,
  firstContainer: ServiceContainer,
  sample: SharedTestDatabase,
  deps: CacheIsolationDeps
): void {
  runner.add(
    groupName('cache.isolamento', 'secondo fixture non riusa righe cached'),
    sample.sampleSpreadsheetUrl,
    () => {
      const warmed = classi(firstContainer).findById(ClasseId.of('1A'));
      if (warmed === null) {
        throw new ValidationError('Cache isolation setup: fixture condivisa priva della riga 1A.');
      }

      try {
        deps.resetAldo();
        const secondContainer = deps.initAldo(
          deps.clock(),
          deps.properties,
          deps.secondMasterSpreadsheetId
        );
        const leaked = classi(secondContainer).findById(ClasseId.of('1A'));
        if (leaked !== null) {
          throw new ValidationError(
            'Cache isolation: seconda fixture ha letto 1A, riga assente nel suo database.'
          );
        }
      } finally {
        // Leave subsequent aggregate checks bound to their persisted shared fixture.
        deps.resetAldo();
        deps.initAldo(deps.clock(), deps.properties, sample.masterSpreadsheetId);
      }
    }
  );
}
