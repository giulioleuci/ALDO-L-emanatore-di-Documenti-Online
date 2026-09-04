scope: GasLibraryFactory/CoreUtilsLib source, tests, index, and README (excluding generated/dist/node_modules); audited lines: 12051.

yagni: Collapse the unexported SystemUtils → SystemEnvironmentUtils/SystemScriptSettings façade chain and its characterisation-only test. Bind the existing helpers directly behind UtilsService’s sole public surface. [GasLibraryFactory/CoreUtilsLib/src/utils/SystemUtils.js:35] (~150 lines).
native: Remove TypeGuards.isTruthy/isFalsy, their aliases, and tests. Use Boolean(value) and !value. [GasLibraryFactory/CoreUtilsLib/src/TypeGuards.js:444] (~65 lines).
delete: Remove isValidObject, its alias, and duplicate tests. Use isObject, which has the identical predicate. [GasLibraryFactory/CoreUtilsLib/src/TypeGuards.js:199] (~30 lines).
delete: Remove MyUtilsService’s four static time aliases and their tests. Use the existing TimeConstants public object. [GasLibraryFactory/CoreUtilsLib/src/UtilsService.js:14] (~30 lines).

net: -275 lines, -0 deps possible.
