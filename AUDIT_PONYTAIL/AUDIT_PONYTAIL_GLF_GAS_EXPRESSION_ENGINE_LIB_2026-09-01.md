Scope: `GasLibraryFactory/GasExpressionEngineLib`; generated output, `dist`, and `node_modules` excluded.
Audited: 25 files, 5,837 lines — source, unit/integration/online tests, index, README, and manifest.

1. `yagni:` Collapse the three single-use private handler classes and their pass-through facade into `ExpressionEvaluatorService`; delete the fake-facade-only `OperatorHandler` suite, retaining its coverage through the existing evaluator suite. [GasLibraryFactory/GasExpressionEngineLib/src/ExpressionEvaluatorService.js:62] (~540 lines)
2. `delete:` Remove `ErrorHelper`, its standalone 266-line test suite, and its unused re-export/docs; no production caller exists, while the engine already creates `Error` directly. Replacement: `new Error(...)`. [GasLibraryFactory/GasExpressionEngineLib/src/handlers/ErrorHelper.js:1] (~345 lines)
3. `yagni:` Inline the two parser-private, one-caller wrappers (`TokenScanner` and `AstBuilder`) into `ExpressionParserService`; their parsing steps remain ordinary private methods. [GasLibraryFactory/GasExpressionEngineLib/src/ExpressionParserService.js:9] (~25 lines)

net: -910 lines, -0 deps possible.
