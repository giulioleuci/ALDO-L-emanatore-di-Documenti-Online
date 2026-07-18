import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier';
import globals from 'globals';

const NATIVE_GAS_GLOBALS = [
  'DriveApp',
  'SpreadsheetApp',
  'DocumentApp',
  'MailApp',
  'GmailApp',
  'PropertiesService',
  'CacheService',
  'UrlFetchApp',
  'Utilities',
  'Session',
  'ScriptApp',
  'LockService',
  'SlidesApp',
  'FormApp'
].map((name) => ({
  name,
  message: `Native GAS global "${name}" is only allowed in src/infrastructure/facades/**`
}));

export default tseslint.config(
  {
    ignores: [
      'dist/**',
      'vendor/**',
      'node_modules/**',
      'coverage/**',
      'types/gaslibs/**',
      'GasLibraryFactory/**',
      '.remember/**'
    ]
  },
  js.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  {
    // Classic project mode, scoped to TS sources only: tsconfig.eslint.json is a
    // superset of tsconfig.json (adds test/**/*.ts) so a single project covers both
    // src and test type-aware linting. Root JS/CJS tooling files are intentionally
    // left unscoped below (no parserOptions.project) so they parse without requiring
    // tsconfig membership.
    files: ['src/**/*.ts', 'test/**/*.ts'],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.eslint.json'],
        tsconfigRootDir: import.meta.dirname
      }
    }
  },
  // Root JS/CJS tooling files are not part of the tsconfig project graph;
  // lint them without type-aware rules so `eslint .` doesn't choke on parserOptions.project resolution.
  // scripts/email-examples/**/*.ts is the same situation for a gitignored, non-shipped
  // dev tool (regenerates HTML_EXAMPLE/*.html) that intentionally isn't part of
  // tsconfig.eslint.json's src/**+test/** scope.
  {
    files: ['*.config.js', '*.config.cjs', 'scripts/**/*.cjs', 'test/**/*.cjs', 'scripts/email-examples/**/*.ts'],
    ...tseslint.configs.disableTypeChecked,
    languageOptions: { globals: { ...globals.node } }
  },
  {
    files: ['*.config.js', '*.config.cjs', 'scripts/**/*.cjs', 'test/**/*.cjs'],
    rules: {
      '@typescript-eslint/no-require-imports': 'off',
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          args: 'all',
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_'
        }
      ]
    }
  },
  // Global gate: native GAS globals forbidden everywhere by default
  {
    files: ['src/**/*.ts'],
    rules: {
      'no-restricted-globals': ['error', ...NATIVE_GAS_GLOBALS],
      'no-restricted-syntax': [
        'error',
        {
          selector: 'ThrowStatement > NewExpression[callee.name="Error"]',
          message: 'Do not throw raw Error; use a typed domain exception (src/domain/errors).'
        }
      ]
    }
  },
  // Facade layer: the ONLY place native globals are allowed
  {
    files: ['src/infrastructure/facades/**/*.ts'],
    rules: { 'no-restricted-globals': 'off', 'no-restricted-syntax': 'off' }
  },
  // Sanctioned exception, scoped to this single file (GasLibraryFactory/CLAUDE.md's
  // "Sanctioned exceptions" list includes GasOnlineTestFramework/** because it "runs inside
  // real GAS by design"; this file is the analogous L2 boundary for src/onlinetests/** — see
  // its class doc comment). Deliberately NOT src/onlinetests/**, to keep the exception as
  // narrow as GoogleApiWrapper's own single-purpose L2 role.
  {
    files: ['src/onlinetests/GasSampleSpreadsheetFactory.ts'],
    rules: { 'no-restricted-globals': 'off', 'no-restricted-syntax': 'off' }
  },
  // Domain layer boundary: no upward/lateral imports
  {
    files: ['src/domain/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: [
                '**/application/**',
                '**/infrastructure/**',
                '**/config/ServiceContainer*',
                '**/config/Bootstrap*',
                '**/ui/**'
              ],
              message:
                'Domain layer must not depend on outer layers (08_ARCHITETTURA_DI_PATTERN.md §1).'
            }
          ]
        }
      ]
    }
  },
  {
    files: ['test/**/*.ts'],
    rules: { 'no-restricted-syntax': 'off', '@typescript-eslint/no-explicit-any': 'off' }
  },
  prettier
);
