import {
  executeCreaDatiMockDrive,
  PROP_ONLINETEST_MASTER_SPREADSHEET_ID
} from '../../../src/onlinetests';
import type { E2eTestDeps } from '../../../src/onlinetests';
import type { IArtifactFactory } from '../../../src/onlinetests/E2eTemplateProvisioner';
import type {
  ISampleSpreadsheet,
  ISampleSpreadsheetFactory
} from '../../../src/onlinetests/SampleDatabaseBuilder';
import { FakeDriveFacade } from '../../fakes/FakeDriveFacade';
import type { IPropertiesFacade } from '../../../src/infrastructure/facades/PropertiesFacade';

class ReusableDriveFacade extends FakeDriveFacade {
  override createFolder(path: string): string {
    return this.folders.get(path) ?? super.createFolder(path);
  }
}

function persistentSpreadsheet(id: string): ISampleSpreadsheet {
  const sheets = new Map<string, Record<string, unknown>[]>();
  return {
    id,
    addSheet: (name: string) => sheets.set(name, []),
    appendRow: (sheetName: string, row: Record<string, unknown>) => {
      sheets.get(sheetName)!.push(row);
    },
    getUrl: () => `https://docs.google.com/spreadsheets/d/${id}`
  };
}

function reusableSpreadsheetFactory(): ISampleSpreadsheetFactory & {
  readonly createdIds: Set<string>;
  readonly openedIds: string[];
} {
  const spreadsheets = new Map<string, ISampleSpreadsheet>();
  const createdIds = new Set<string>();
  const openedIds: string[] = [];

  const getOrCreate = (id: string): ISampleSpreadsheet => {
    if (!spreadsheets.has(id)) {
      spreadsheets.set(id, persistentSpreadsheet(id));
      createdIds.add(id);
    }
    return spreadsheets.get(id)!;
  };

  return {
    createdIds,
    openedIds,
    createSpreadsheet: (name: string) => getOrCreate(`sheet:${name}`),
    openExistingSpreadsheet: (id: string) => {
      openedIds.push(id);
      return getOrCreate(id);
    }
  };
}

function properties(initial: Record<string, string>): IPropertiesFacade & { values: Record<string, string> } {
  const values = { ...initial };
  return {
    values,
    get: (key: string) => values[key] ?? null,
    set: (key: string, value: string) => {
      values[key] = value;
    }
  };
}

function artifactFactory(drive: ReusableDriveFacade): IArtifactFactory {
  let sequence = 0;
  const create = (name: string, folderId: string): string => {
    const id = `artifact:${++sequence}`;
    drive.files.set(`${folderId}::${name}`, id);
    return id;
  };
  return {
    createDocument: create,
    createSheet: create
  };
}

function dependencies(
  propertiesFacade: IPropertiesFacade,
  spreadsheetFactory = reusableSpreadsheetFactory(),
  drive = new ReusableDriveFacade()
): Partial<E2eTestDeps> & {
  spreadsheetFactory: ReturnType<typeof reusableSpreadsheetFactory>;
  drive: ReusableDriveFacade;
} {
  return {
    properties: propertiesFacade,
    spreadsheetFactory,
    drive,
    artifactFactory: artifactFactory(drive)
  };
}

describe('executeCreaDatiMockDrive', () => {
  it('provisions the active master once, persists it, and reuses its named dataset without force', () => {
    const props = properties({});
    const deps = {
      ...dependencies(props),
      activeMasterSpreadsheetId: () => 'master:active'
    };

    const first = executeCreaDatiMockDrive(deps);
    const createdAfterFirst = new Set(deps.spreadsheetFactory.createdIds);
    const second = executeCreaDatiMockDrive(deps);

    expect(first.masterSpreadsheetId).toBe('master:active');
    expect(second).toMatchObject({
      masterSpreadsheetId: 'master:active',
      sampleSpreadsheetId: first.sampleSpreadsheetId
    });
    expect(props.values).toEqual({ [PROP_ONLINETEST_MASTER_SPREADSHEET_ID]: 'master:active' });
    expect(deps.spreadsheetFactory.openedIds).toEqual(['master:active', 'master:active']);
    expect(deps.spreadsheetFactory.createdIds).toEqual(createdAfterFirst);
  });

  it('uses the active master and rebuilds a fresh named sample only when force is true', () => {
    const props = properties({
      [PROP_ONLINETEST_MASTER_SPREADSHEET_ID]: 'master:persisted',
      ALDO_E2E_FORCE_REBUILD: 'true'
    });
    const deps = {
      ...dependencies(props),
      activeMasterSpreadsheetId: () => 'master:active'
    };

    const sample = executeCreaDatiMockDrive(deps);

    expect(sample).toMatchObject({ masterSpreadsheetId: 'master:active' });
    expect(sample.sampleSpreadsheetId).toMatch(/^sheet:_ALDO_E2E_FORCE_/);
    expect(props.values).toEqual({
      [PROP_ONLINETEST_MASTER_SPREADSHEET_ID]: 'master:active',
      ALDO_E2E_FORCE_REBUILD: 'true'
    });
    expect(deps.spreadsheetFactory.openedIds).toEqual(['master:active']);
  });
});
