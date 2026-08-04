import { resolveSetupAction as importedResolver } from '../../../scripts/setup-testonline-project.cjs';

type SetupAction = 'existing' | 'create' | 'partial-error';
type ResolveSetupAction = (
  existing: object | null,
  partial: { claspExists: boolean; trackingExists: boolean },
  replace: boolean
) => SetupAction;

const resolveSetupAction = importedResolver as unknown as ResolveSetupAction;

const existing = {
  scriptId: 'existing-script',
  masterSpreadsheetId: 'existing-sheet',
  createdAt: '2026-08-04T00:00:00.000Z'
};

describe('resolveSetupAction', () => {
  test('keeps an existing tracked project when replacement is not requested', () => {
    expect(resolveSetupAction(existing, { claspExists: true, trackingExists: true }, false)).toBe('existing');
  });

  test('creates a replacement only when explicitly requested', () => {
    expect(resolveSetupAction(existing, { claspExists: true, trackingExists: true }, true)).toBe('create');
  });

  test('refuses a partial untracked setup unless replacement is explicitly requested', () => {
    expect(resolveSetupAction(null, { claspExists: true, trackingExists: false }, false)).toBe('partial-error');
  });

  test('refuses mismatched local pointers unless replacement is explicitly requested', () => {
    expect(resolveSetupAction(null, { claspExists: true, trackingExists: true }, false)).toBe('partial-error');
  });

  test('refuses tracking-only local state unless replacement is explicitly requested', () => {
    expect(resolveSetupAction(null, { claspExists: false, trackingExists: true }, false)).toBe('partial-error');
  });
});
