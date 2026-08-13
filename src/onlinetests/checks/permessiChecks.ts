import type { ServiceContainer } from '../../config/ServiceContainer';
import { ValidationError } from '../../domain/errors/DomainError';
import {
  SessionActiveUserFacade,
  type IActiveUserFacade
} from '../../infrastructure/facades/ActiveUserFacade';
import type { DrivePermissionEvidence } from './aclRealiChecks';
import type { SharedTestDatabase } from '../data/SharedTestDatabaseBuilder';
import { groupName, type TestRunner } from '../report/OnlineTestReport';

export interface PermessiChecksDeps {
  activeUser: IActiveUserFacade;
  readPermissions: (fileId: string) => DrivePermissionEvidence[];
}

function realDeps(): PermessiChecksDeps {
  return {
    activeUser: new SessionActiveUserFacade(),
    // Strict GLF Drive read-back: quota/auth/network errors deliberately propagate.
    readPermissions: (fileId) => ServiceFactory.getDriveService().getPermissions(fileId)
  };
}

function directUserPermissions(
  permissions: DrivePermissionEvidence[],
  email: string
): DrivePermissionEvidence[] {
  return permissions.filter(
    (permission) =>
      permission.deleted !== true &&
      permission.type === 'user' &&
      permission.emailAddress?.trim().toLowerCase() === email.toLowerCase() &&
      permission.role !== undefined
  );
}

/**
 * Active-user visibility can only be proven from a direct user ACL. Workspace installations that
 * hide the active identity or grant access only through group/domain ACLs report an explicit,
 * documented skip; operational Drive failures stay failures.
 */
export function registerPermessiChecks(
  runner: TestRunner,
  _container: ServiceContainer,
  sample: SharedTestDatabase,
  injected: Partial<PermessiChecksDeps> = {}
): void {
  const deps = { ...realDeps(), ...injected };
  const name = groupName('permessi.attivi', 'visibilità utente attivo (gated)');

  if (!sample.masterTestMode) {
    runner.skip(name, sample.sampleSpreadsheetUrl, 'SKIPPED: MASTER.TEST_MODE=false.');
    return;
  }

  const email = deps.activeUser.getEmail().trim();
  if (email === '') {
    runner.skip(
      name,
      sample.sampleSpreadsheetUrl,
      'SKIPPED: identità utente Workspace attivo non disponibile per policy.'
    );
    return;
  }

  // This read is intentionally outside a fail-soft catch: auth/quota/network errors prove no ACL
  // evidence was obtained and must surface as test failures instead of a false-green skip.
  const permissions = deps.readPermissions(sample.sampleSpreadsheetId);
  if (directUserPermissions(permissions, email).length === 0) {
    runner.skip(
      name,
      sample.sampleSpreadsheetUrl,
      'SKIPPED: ACL leggibile solo come group/domain; accesso individuale non attribuibile.'
    );
    return;
  }

  runner.add(name, sample.sampleSpreadsheetUrl, () => {
    const direct = directUserPermissions(permissions, email);
    if (direct.length === 0) {
      throw new ValidationError(`ACL utente attivo ${email} assente dal file test-mode.`);
    }
  });
}
