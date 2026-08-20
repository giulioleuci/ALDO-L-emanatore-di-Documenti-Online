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
 * Active-user visibility can only be proven from a direct user ACL. Any missing prerequisite or
 * unattributable ACL is a failed acceptance check; Scenario 11 owns the suite's sole documented
 * skip. All validation runs inside TestRunner so operational failures cannot escape the launcher.
 */
export function registerPermessiChecks(
  runner: TestRunner,
  _container: ServiceContainer,
  sample: SharedTestDatabase,
  injected: Partial<PermessiChecksDeps> = {}
): void {
  const deps = { ...realDeps(), ...injected };
  const name = groupName('permessi.attivi', 'visibilità utente attivo (gated)');

  runner.add(name, sample.sampleSpreadsheetUrl, () => {
    if (!sample.masterTestMode) {
      throw new ValidationError('PERMESSI_ATTIVI richiede MASTER.TEST_MODE=true.');
    }
    const email = deps.activeUser.getEmail().trim();
    if (email === '') {
      throw new ValidationError(
        'Identità utente Workspace attivo non disponibile: ACL individuale non verificabile.'
      );
    }
    const permissions = livePermissions(deps.readPermissions(sample.sampleSpreadsheetId));
    if (permissions.length > 0 && permissions.every(isIndirectWorkspacePermission)) {
      throw new ValidationError(
        'ACL leggibile solo come group/domain: accesso individuale non attribuibile.'
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
  });
}
