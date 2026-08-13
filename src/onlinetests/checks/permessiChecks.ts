import type { ServiceContainer } from '../../config/ServiceContainer';
import { ValidationError } from '../../domain/errors/DomainError';
import {
  SessionActiveUserFacade,
  type IActiveUserFacade
} from '../../infrastructure/facades/ActiveUserFacade';
import type { DrivePermissionEvidence } from './aclRealiChecks';
import type { SharedTestDatabase } from '../data/SharedTestDatabaseBuilder';
import { groupName, skippedOutcome, type TestRunner } from '../report/OnlineTestReport';

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

function livePermissions(permissions: DrivePermissionEvidence[]): DrivePermissionEvidence[] {
  return permissions.filter((permission) => permission.deleted !== true);
}

function isIndirectWorkspacePermission(permission: DrivePermissionEvidence): boolean {
  return permission.type === 'group' || permission.type === 'domain';
}

function isActiveUser(permission: DrivePermissionEvidence, email: string): boolean {
  return (
    permission.type === 'user' &&
    permission.emailAddress?.trim().toLowerCase() === email.toLowerCase()
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

  runner.add(name, sample.sampleSpreadsheetUrl, () => {
    // Strict lookup is deliberately inside TestRunner: operational failures become a failed
    // report result and never escape registration or turn into a policy skip.
    const permissions = livePermissions(deps.readPermissions(sample.sampleSpreadsheetId));
    if (permissions.length > 0 && permissions.every(isIndirectWorkspacePermission)) {
      return skippedOutcome(
        'SKIPPED: ACL leggibile solo come group/domain; accesso individuale non attribuibile.'
      );
    }
    const unexpected = permissions.filter((permission) => !isActiveUser(permission, email));
    if (permissions.length === 0 || unexpected.length > 0) {
      const principals = unexpected
        .map(
          (permission) =>
            `${permission.type ?? 'unknown'}:${permission.emailAddress ?? permission.domain ?? '*'}`
        )
        .join(',');
      throw new ValidationError(
        `ACL utente attivo ${email} non esatta: inattesi=${principals || '-'} totale=${permissions.length}.`
      );
    }
    return undefined;
  });
}
