import type { ServiceContainer } from '../../config/ServiceContainer';
import type { ContextBuilder } from '../../application/context-engine/ContextBuilder';
import type { Cdu } from '../../application/context-engine/Cdu';
import { recipe } from '../../application/context-engine/Recipe';
import type { DocumentGenerationService } from '../../application/services/DocumentGenerationService';
import type { RisolutoreRuoliService } from '../../application/services/RisolutoreRuoliService';
import { ClasseId } from '../../domain/value-objects/ClasseId';
import { GestioneSupplenti } from '../../domain/value-objects/enums';
import { ValidationError } from '../../domain/errors/DomainError';
import type { TestRunner } from '../report/OnlineTestReport';
import {
  CONF_DOC_ACL_REALI,
  type SharedTestDatabase
} from '../data/SharedTestDatabaseBuilder';

export interface DrivePermissionEvidence {
  id?: string;
  type?: string;
  role?: string;
  emailAddress?: string;
  domain?: string;
  deleted?: boolean;
}

export interface DrivePermissionExpectation {
  type: 'user' | 'group' | 'domain' | 'anyone';
  principal: string;
  role: string;
}

export interface ProtectedRangeEvidence {
  description?: string;
  editors?: { users?: string[] };
  warningOnly?: boolean;
}

function exact(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter((value) => value !== ''))].sort();
}

function assertExact(label: string, actualValues: string[], expectedValues: string[]): void {
  const actual = exact(actualValues);
  const expected = exact(expectedValues);
  if (JSON.stringify(actual) === JSON.stringify(expected)) return;
  const missing = expected.filter((value) => !actual.includes(value));
  const unexpected = actual.filter((value) => !expected.includes(value));
  throw new ValidationError(
    `${label}: missing=${missing.join(',') || '-'} unexpected=${unexpected.join(',') || '-'}`
  );
}

export function assertExactDrivePermissionPrincipals(
  label: string,
  permissions: DrivePermissionEvidence[],
  expected: DrivePermissionExpectation[]
): void {
  const actual = permissions.flatMap((permission) =>
    permission.deleted === true || permission.role === 'owner'
      ? []
      : [permissionEvidenceKey(permission)]
  );
  assertExact(`${label} Drive ACL`, actual, expected.map(expectationKey));
}

function permissionEvidenceKey(permission: DrivePermissionEvidence): string {
  const type = permission.type ?? 'unknown';
  const principal =
    type === 'user' || type === 'group'
      ? (permission.emailAddress ?? '<missing-email>')
      : type === 'domain'
        ? (permission.domain ?? '<missing-domain>')
        : type === 'anyone'
          ? '*'
          : (permission.emailAddress ?? permission.domain ?? permission.id ?? '<missing-principal>');
  return `${type}:${principal}|${permission.role ?? '<missing-role>'}`;
}

function expectationKey(expectation: DrivePermissionExpectation): string {
  return `${expectation.type}:${expectation.principal}|${expectation.role}`;
}

function userExpectations(emails: string[], role: string): DrivePermissionExpectation[] {
  return emails.map((principal) => ({ type: 'user', principal, role }));
}

export function assertProtectedRangePrincipals(
  ranges: ProtectedRangeEvidence[],
  expected: string[],
  subject: string
): void {
  const focal = ranges.find((range) => range.description?.includes(` ${subject} `));
  if (focal === undefined) {
    throw new ValidationError(`Protected range ${subject} mancante.`);
  }
  if (focal.warningOnly === true) {
    throw new ValidationError(`Protected range ${subject} e solo warningOnly.`);
  }
  assertExact(`Protected range ${subject}`, focal.editors?.users ?? [], expected);
}

function currentCdu(container: ServiceContainer): Cdu {
  return container.get<ContextBuilder>('contextBuilder').build(
    { target: '4A', tipoTarget: 'classe', now: new Date() },
    recipe('CLASSE_COMPLETA')
  );
}

function generateAclArtifact(container: ServiceContainer): { fileId: string; folderId: string } {
  const result = container
    .get<DocumentGenerationService>('documentGenerationService')
    .generateForClasse(ClasseId.of('4A'), CONF_DOC_ACL_REALI);
  if (result.fileId === null) {
    throw new ValidationError(`CONF_DOC ${CONF_DOC_ACL_REALI}: fileId mancante (${result.status}).`);
  }
  // Deliberately use the real factory wrapper. This is evidence read-back,
  // not an ALDO fake or the write-only IDriveFacade.
  const metadata = ServiceFactory.getDriveService().getFiles(result.fileId, {
    fields: 'id,name,mimeType,parents',
    strict: true
  });
  const folderId = metadata.parents?.[0];
  if (folderId === undefined || folderId === '') {
    throw new ValidationError(`CONF_DOC ${CONF_DOC_ACL_REALI}: parent folder mancante.`);
  }
  return { fileId: result.fileId, folderId };
}

function subjectVariant(cdu: Cdu, subject: string): Cdu {
  const variant: Cdu = {
    ...cdu,
    meta: {
      ...cdu.meta,
      parametriInput: { ...cdu.meta.parametriInput, materiaCorrente: subject }
    }
  };
  Object.defineProperty(variant, 'tech', {
    value: cdu.tech,
    enumerable: false,
    writable: true,
    configurable: true
  });
  return variant;
}

export function registerAclRealiChecks(
  runner: TestRunner,
  container: ServiceContainer,
  sample: SharedTestDatabase
): void {
  if (!sample.masterTestMode) {
    runner.add('acl.reali::MASTER.TEST_MODE guard', sample.sampleSpreadsheetUrl, () => {
      throw new ValidationError('ACL_REALI richiede MASTER.TEST_MODE=true.');
    });
    return;
  }

  runner.add('acl.reali::lettura ACL file/cartella', sample.sampleSpreadsheetUrl, () => {
    const { fileId, folderId } = generateAclArtifact(container);
    const cdu = currentCdu(container);
    const roles = container.get<RisolutoreRuoliService>('risolutoreRuoli');
    const drive = ServiceFactory.getDriveService();
    const filePermissions = drive.getPermissions(fileId);
    const folderPermissions = drive.getPermissions(folderId);
    assertExactDrivePermissionPrincipals(
      'file',
      filePermissions,
      userExpectations(
        roles
          .risolvi('CDC', cdu, { regolaSupplente: GestioneSupplenti.ENTRAMBI })
          .map((email) => email.value),
        'writer'
      )
    );
    assertExactDrivePermissionPrincipals(
      'folder',
      folderPermissions,
      userExpectations(
        roles
          .risolvi('COORDINATORI', cdu, { regolaSupplente: GestioneSupplenti.ENTRAMBI })
          .map((email) => email.value),
        'reader'
      )
    );
  });

  runner.add('acl.reali::protected ranges Sheets reali', sample.sampleSpreadsheetUrl, () => {
    const { fileId } = generateAclArtifact(container);
    const cdu = currentCdu(container);
    const roles = container.get<RisolutoreRuoliService>('risolutoreRuoli');
    const expected = [
      ...roles
        .risolvi('DOCENTE_MATERIA', subjectVariant(cdu, 'MAT'), {
          regolaSupplente: GestioneSupplenti.ENTRAMBI
        })
        .map((email) => email.value),
      ...roles.risolvi('COORDINATORI', cdu).map((email) => email.value)
    ];
    // Real Advanced Sheets wrapper: callback reads persisted protections back.
    const ranges = ServiceFactory.getSpreadsheetService().getProtectedRanges(fileId);
    assertProtectedRangePrincipals(ranges, expected, 'MAT');
  });
}
