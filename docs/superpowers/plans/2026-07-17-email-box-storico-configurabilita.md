# Box Email: Storico Documenti + Display Mode Configurabile — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire up the already-spec'd (`11_PIPELINE_EMAIL.md` §11, `13_SERVIZI_STORICI.md`) but never-connected "modalità arricchita" of the email `documenti` box — prior-year documents shown alongside current ones — and add a configurable link-display mode, both driven entirely by new keys inside the existing `CONF_MAIL.BOX_CFG` JSON column. No DB schema change.

**Architecture:** `StoricoDocumentiService` (exists, unwired) gets a new non-breaking method that returns prior-year documents tagged with their generator id. A new `ContextProvider` (`DocumentiStoricoProvider`), mirroring the existing `StoricoProvider`, attaches a `LazyRef` to `focus.alunno.didattica.documenti.storico`. `boxes.ts`'s `renderDocumentiBox` becomes mode-aware: it reads two new optional `BOX_CFG` keys (`arricchisciConStorico`, `configArricchimento.templateRiga`) plus a `displayMode` key, and falls back to the exact current markup when they're absent — so every existing test keeps passing unchanged except one, which gains one new field it must now assert.

**Tech Stack:** TypeScript (GAS V8 target), Jest (`ts-jest`), existing `ComposableContentLib` (`ContentComposer`/`HtmlRenderer`), existing `ITemplateEngine` (Mustache-style `processString`).

## Global Constraints

- Never touch `dist/*`. Fix source under `src/` only.
- `CONF_MAIL.BOX_CFG` is a JSON column (`01_SCHEMA_DATABASE.md` L337) — new behaviour must live inside its JSON shape, not as new DB columns.
- Native GAS globals stay inside `GoogleApiWrapper`; nothing here touches them.
- Run `npm run typecheck && npm run lint && npm test` before every commit in this plan.
- Every task must leave `npm test` fully green — no `.skip`, no pre-existing test deleted without an equivalent replacement.

---

## Task 1: `StoricoDocumentiService` — add a non-breaking "all types" query

**Files:**
- Modify: `src/application/storico/StoricoDocumentiService.ts`
- Test: `test/unit/application/storico-services.test.ts` (add only; do not touch the existing test at lines 189-196)

**Interfaces:**
- Consumes: `StoricoDatabaseProvider.anniStorici(profondita)` (existing), `ILogDocumentoRepository.findByUtente(Email)` (existing), `LogDocumento.idGen`/`nome`/`getLink()` (existing).
- Produces: `StoricoDocumentiService.perAlunnoConTipo(alunnoEmail: string, profondita?: number): DocumentoStoricoConTipo[]`, where `DocumentoStoricoConTipo = DocumentoStorico & { tipo: string }`. Task 2 consumes this exact signature.

The existing `perAlunno(alunnoEmail, tipo, profondita)` filters by `doc.idGen === tipo` and returns `{anno, nome, link}` only. `storico-services.test.ts:194` asserts that shape with a strict `toEqual` — it must not change. We refactor the shared loop into a private helper so both methods stay in sync without duplicating the DB-walking logic.

- [ ] **Step 1: Write the failing test for the new method**

Add to `test/unit/application/storico-services.test.ts`, directly after the existing `StoricoDocumentiService` test (after line 196):

```typescript
test('StoricoDocumentiService.perAlunnoConTipo returns every prior-year document tagged with its TIPO/ID_GEN, unfiltered (11 §11 arricchisciConStorico)', () => {
  const anni = [annoStorico('2025-2026', annoPrecedente())];
  const service = new StoricoDocumentiService(fakeProvider(anni));
  expect(service.perAlunnoConTipo('a1@school.it', 1)).toEqual([
    { anno: '2025-2026', nome: '', link: '', tipo: 'CD_PDP' }
  ]);
  expect(service.perAlunnoConTipo('nope@school.it', 1)).toEqual([]);
});
```

Check `annoPrecedente()`'s fixture in the same file to confirm the `ID_GEN` value it seeds for `a1@school.it` — if it seeds something other than `'CD_PDP'`, use that exact value instead (it must match whatever `perAlunno('a1@school.it', 'CD_PDP', 1)` already asserts against two tests above).

- [ ] **Step 2: Run it to confirm it fails**

Run: `npx jest --config jest.config.cjs test/unit/application/storico-services.test.ts -t "perAlunnoConTipo"`
Expected: FAIL — `service.perAlunnoConTipo is not a function`

- [ ] **Step 3: Refactor the service**

Replace the full body of `src/application/storico/StoricoDocumentiService.ts` with:

```typescript
import type { StoricoDatabaseProvider } from './StoricoDatabaseProvider';
import { LogDocumentoRepository } from '../../infrastructure/repositories/LogDocumentoRepository';
import type { ILogDocumentoRepository } from '../../domain/repositories/ILogDocumentoRepository';
import { Email } from '../../domain/value-objects/Email';

export interface DocumentoStorico {
  anno: string;
  nome: string;
  link: string;
}

/** `DocumentoStorico` tagged with its generator id (`LOG_DOCS.ID_GEN`, matched against `CONF_DOC.TIPO`) — feeds `perAlunnoConTipo` (11 §11). */
export interface DocumentoStoricoConTipo extends DocumentoStorico {
  tipo: string;
}

/**
 * StoricoDocumentiService (13 §4): documents already generated for a student
 * of a given type (`CONF_DOC.TIPO`, matched against `LOG_DOCS.ID_GEN`) in
 * prior school years. Feeds the `documenti` box's `arricchisciConStorico`
 * mode (11 §11, 14 §3) as `{ corrente, storico: LazyRef }` — the LazyRef
 * wrapping is the caller's job (`DocumentiStoricoProvider`).
 */
export class StoricoDocumentiService {
  constructor(private readonly provider: StoricoDatabaseProvider) {}

  perAlunno(alunnoEmail: string, tipo: string, profondita = 1): DocumentoStorico[] {
    return this.tutti(alunnoEmail, profondita)
      .filter((d) => d.tipo === tipo)
      .map(({ anno, nome, link }) => ({ anno, nome, link }));
  }

  /** Every prior-year document regardless of TIPO, each tagged with its ID_GEN — the `documenti` box groups these by the current item's `idGen` at render time (11 §11). */
  perAlunnoConTipo(alunnoEmail: string, profondita = 1): DocumentoStoricoConTipo[] {
    return this.tutti(alunnoEmail, profondita);
  }

  private tutti(alunnoEmail: string, profondita: number): DocumentoStoricoConTipo[] {
    const out: DocumentoStoricoConTipo[] = [];
    for (const { anno, db } of this.provider.anniStorici(profondita)) {
      const logDocs: ILogDocumentoRepository = new LogDocumentoRepository(db);
      for (const doc of logDocs.findByUtente(Email.of(alunnoEmail))) {
        out.push({ anno, nome: doc.nome, link: doc.getLink(), tipo: doc.idGen });
      }
    }
    return out;
  }
}
```

- [ ] **Step 4: Run the whole file to confirm both old and new tests pass**

Run: `npx jest --config jest.config.cjs test/unit/application/storico-services.test.ts -v`
Expected: PASS — all tests, including the untouched `perAlunno` one at line 189.

- [ ] **Step 5: Commit**

```bash
git add src/application/storico/StoricoDocumentiService.ts test/unit/application/storico-services.test.ts
git commit -m "feat: add StoricoDocumentiService.perAlunnoConTipo for box-level storico grouping"
```

---

## Task 2: `DocumentiStoricoProvider` — attach the lazy storico ref to the CDU

**Files:**
- Modify: `src/application/context-engine/Cdu.ts`
- Modify: `src/application/context-engine/providers/DocumentiProvider.ts`
- Modify: `src/application/context-engine/ContextEngineFactory.ts`
- Modify: `src/application/context-engine/Recipe.ts`
- Create: `src/application/context-engine/providers/DocumentiStoricoProvider.ts`
- Test: `test/unit/application/context-engine/documenti-carenzafocus.test.ts` (update one existing assertion)
- Create: `test/unit/application/context-engine/documenti-storico-provider.test.ts`
- Modify: `test/unit/application/context-engine/recipes-e2e.test.ts` (add one test)

**Interfaces:**
- Consumes: `StoricoDocumentiService.perAlunnoConTipo` (Task 1), `LazyRef<T>` (existing), `MasterStoricoDatabaseProvider` (existing).
- Produces: `Cdu.focus.alunno.didattica.documenti.storico?: LazyRef<DocumentoStoricoConTipo[]>`; `Cdu.focus.alunno.didattica.documenti.items[].idGen: string`. Task 3 consumes both.

**Important subtlety:** the CDU's current document items expose `tipo` (`LOG_DOCS.TIPO`, a free descriptive label, e.g. `"PDP"`), but `StoricoDocumentiService` groups by `idGen` (`LOG_DOCS.ID_GEN`, the generator id, e.g. `"CD_PDP"`). Those are different columns. To correlate a current item with its historical counterparts, the CDU item needs its own `idGen` — it doesn't have one today. This task adds it.

- [ ] **Step 1: Write the failing provider test**

Create `test/unit/application/context-engine/documenti-storico-provider.test.ts`:

```typescript
import { DocumentiProvider } from '../../../../src/application/context-engine/providers/DocumentiProvider';
import { DocumentiStoricoProvider } from '../../../../src/application/context-engine/providers/DocumentiStoricoProvider';
import { ClasseProvider } from '../../../../src/application/context-engine/providers/ClasseProvider';
import { AlunnoProvider } from '../../../../src/application/context-engine/providers/AlunnoProvider';
import { ContextBuilder } from '../../../../src/application/context-engine/ContextBuilder';
import { makeOptions } from '../../../../src/application/context-engine/Recipe';
import type { BuildParams, Recipe, StoricoDatabaseProvider } from '../../../../src/application/context-engine/Recipe';
import type { AnnoStorico } from '../../../../src/application/storico/StoricoDatabaseProvider';
import { ClasseRepository } from '../../../../src/infrastructure/repositories/ClasseRepository';
import { AlunnoRepository } from '../../../../src/infrastructure/repositories/AlunnoRepository';
import { OreASLRepository } from '../../../../src/infrastructure/repositories/OreASLRepository';
import { LogDocumentoRepository } from '../../../../src/infrastructure/repositories/LogDocumentoRepository';
import { FakeDatabase } from '../../../fakes/FakeDatabase';
import { fixtureTables } from '../../../fixtures/tables';
import type { Row } from '../../../../src/infrastructure/db/Database';

function tablesWithDocs(): Record<string, Row[]> {
  const t = fixtureTables();
  (t['LOG_DOCS'] as Row[]).push({
    ID: 'doc1',
    ID_GEN: 'CD_PDP',
    TIPO: 'PDP',
    NOME: 'PDP a1',
    STATO: 'GENERATO',
    NOTIFICATO: '',
    LINK: 'http://d/1',
    UTENTI: 'a1@school.it',
    DATA_CREAZ: '2026-03-01'
  });
  return t;
}

function fakeStoricoProvider(anni: AnnoStorico[]): StoricoDatabaseProvider {
  return { anniStorici: () => anni };
}

function build(providers: string[], databases: StoricoDatabaseProvider, options = makeOptions()) {
  const db = new FakeDatabase(tablesWithDocs());
  const classi = new ClasseRepository(db);
  const alunni = new AlunnoRepository(db);
  const b = new ContextBuilder();
  b.registerProvider('class', new ClasseProvider(classi, alunni));
  b.registerProvider('student', new AlunnoProvider(alunni, classi, new OreASLRepository(db)));
  b.registerProvider('documenti', new DocumentiProvider(new LogDocumentoRepository(db)));
  b.registerProvider('documentiStorico', new DocumentiStoricoProvider(databases));
  const params: BuildParams = { target: 'a1@school.it', tipoTarget: 'alunno', now: new Date('2026-07-01T09:00:00Z') };
  const recipe: Recipe = { providers, options };
  return b.build(params, recipe);
}

test('DocumentiStoricoProvider: includiStorico false ⇒ no storico key, no historical database opened (11 §11, 13 §4)', () => {
  let opened = false;
  const databases: StoricoDatabaseProvider = {
    anniStorici: () => {
      opened = true;
      return [];
    }
  };
  const cdu = build(['class', 'student', 'documenti', 'documentiStorico'], databases);
  expect(cdu.focus.alunno!.didattica.documenti).toEqual({
    hasDocumenti: true,
    items: [
      {
        nome: 'PDP a1',
        link: 'http://d/1',
        tipo: 'PDP',
        idGen: 'CD_PDP',
        stato: 'GENERATO',
        dataCreazione: '2026-03-01'
      }
    ]
  });
  expect(opened).toBe(false);
});

test('DocumentiStoricoProvider: includiStorico true attaches an unresolved LazyRef (13 §2)', () => {
  const anno: AnnoStorico = { anno: '2025-2026', db: new FakeDatabase(fixtureTables()) };
  const databases = fakeStoricoProvider([anno]);
  const cdu = build(
    ['class', 'student', 'documenti', 'documentiStorico'],
    databases,
    makeOptions({ includiStorico: true, profonditaAnniDocumenti: 1 })
  );
  const storico = cdu.focus.alunno!.didattica.documenti!.storico!;
  expect(storico).toBeDefined();
  expect(storico.isResolved()).toBe(false);
});

test('DocumentiStoricoProvider: resolving the LazyRef returns documents tagged with idGen', () => {
  const t = fixtureTables();
  (t['LOG_DOCS'] as Row[]).push({
    ID: 'old1',
    ID_GEN: 'CD_PDP',
    TIPO: 'PDP',
    NOME: 'PDP a1 anno scorso',
    STATO: 'GENERATO',
    NOTIFICATO: '',
    LINK: 'http://d/old',
    UTENTI: 'a1@school.it',
    DATA_CREAZ: '2025-03-01'
  });
  const anno: AnnoStorico = { anno: '2025-2026', db: new FakeDatabase(t) };
  const databases = fakeStoricoProvider([anno]);
  const cdu = build(
    ['class', 'student', 'documenti', 'documentiStorico'],
    databases,
    makeOptions({ includiStorico: true, profonditaAnniDocumenti: 1 })
  );
  const storico = cdu.focus.alunno!.didattica.documenti!.storico!.get();
  expect(storico).toEqual([
    { anno: '2025-2026', nome: 'PDP a1 anno scorso', link: 'http://d/old', tipo: 'CD_PDP' }
  ]);
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `npx jest --config jest.config.cjs test/unit/application/context-engine/documenti-storico-provider.test.ts -v`
Expected: FAIL — `Cannot find module '.../DocumentiStoricoProvider'` and `idGen` missing from the DocumentiProvider assertion.

- [ ] **Step 3: Add `idGen` to the CDU document item shape**

In `src/application/context-engine/Cdu.ts`, inside `CduAlunno.didattica.documenti.items`, change:

```typescript
    documenti?: {
      items: Array<{
        nome: string;
        link: string;
        tipo: string;
        stato: string;
        dataCreazione: string;
      }>;
      hasDocumenti: boolean;
    };
```

to:

```typescript
    documenti?: {
      items: Array<{
        nome: string;
        link: string;
        tipo: string;
        idGen: string;
        stato: string;
        dataCreazione: string;
      }>;
      hasDocumenti: boolean;
      /** Lazy prior-year documents grouped by ID_GEN at render time (11 §11 arricchisciConStorico, 13 §4). */
      storico?: import('../storico/LazyRef').LazyRef<
        import('../storico/StoricoDocumentiService').DocumentoStoricoConTipo[]
      >;
    };
```

- [ ] **Step 4: Add `idGen` to `DocumentiProvider`'s mapping**

In `src/application/context-engine/providers/DocumentiProvider.ts`, change the `.map(...)` call:

```typescript
    const items = this.logDocs.findByUtente(getAlunnoEntity(cdu).email).map((l) => ({
      nome: l.nome,
      link: l.getLink(),
      tipo: l.tipo,
      idGen: l.idGen,
      stato: l.getStato(),
      dataCreazione: l.getDataCreazione()
    }));
```

- [ ] **Step 5: Update the one existing test this breaks**

In `test/unit/application/context-engine/documenti-carenzafocus.test.ts`, the test `'DocumentiProvider: items of the student from LOG_DOCS (02 §4.2)'` (around line 69) asserts a strict `toEqual` without `idGen`. Update it:

```typescript
test('DocumentiProvider: items of the student from LOG_DOCS (02 §4.2)', () => {
  const d = build('a1@school.it', ['class', 'student', 'documenti'], {}, withDocs()).focus.alunno!
    .didattica.documenti;
  expect(d).toEqual({
    hasDocumenti: true,
    items: [
      {
        nome: 'PDP a1',
        link: 'http://d/1',
        tipo: 'PDP',
        idGen: 'g1',
        stato: 'GENERATO',
        dataCreazione: '2026-03-01'
      }
    ]
  });
});
```

(`ID_GEN: 'g1'` is already in that file's `withDocs()` fixture — only the assertion needs the new field.)

- [ ] **Step 6: Create `DocumentiStoricoProvider`**

Create `src/application/context-engine/providers/DocumentiStoricoProvider.ts`:

```typescript
import type { ContextProvider } from '../ContextProvider';
import type { Cdu } from '../Cdu';
import type { BuildParams, RecipeOptions } from '../Recipe';
import type { StoricoDatabaseProvider } from '../../storico/StoricoDatabaseProvider';
import { StoricoDocumentiService } from '../../storico/StoricoDocumentiService';
import { LazyRef } from '../../storico/LazyRef';

/**
 * Fills `focus.alunno.didattica.documenti.storico` (11 §11, 13 §4) with a
 * LazyRef over every prior-year document tagged with its ID_GEN, feeding the
 * `documenti` box's `arricchisciConStorico` render mode. Runs after
 * `documenti` in the recipe (needs `focus.alunno.didattica.documenti`
 * already populated). Mirrors `StoricoProvider`: skipped entirely when
 * `includiStorico` is false, so no historical database is opened.
 */
export class DocumentiStoricoProvider implements ContextProvider {
  constructor(private readonly databases: StoricoDatabaseProvider) {}

  provide(cdu: Cdu, _params: BuildParams, options: RecipeOptions): void {
    if (!options.includiStorico) return;
    const alunno = cdu.focus.alunno;
    if (alunno === undefined || alunno.didattica.documenti === undefined) return;
    const email = alunno.anagrafica.email;
    const profondita = options.profonditaAnniDocumenti;
    const service = new StoricoDocumentiService(this.databases);
    alunno.didattica.documenti.storico = new LazyRef(() =>
      service.perAlunnoConTipo(email, profondita)
    );
  }
}
```

- [ ] **Step 7: Wire it into `ContextEngineFactory`**

In `src/application/context-engine/ContextEngineFactory.ts`, add the import:

```typescript
import { DocumentiStoricoProvider } from './providers/DocumentiStoricoProvider';
```

Then, right before the `return new ContextBuilder()` line, hoist the shared historical-database provider:

```typescript
    const storicoDb = new MasterStoricoDatabaseProvider(master, new LoggerService());

    return new ContextBuilder()
```

And change the tail of the chain from:

```typescript
      .registerProvider(
        'storico',
        new StoricoProvider(new MasterStoricoDatabaseProvider(master, new LoggerService()))
      );
```

to:

```typescript
      .registerProvider('storico', new StoricoProvider(storicoDb))
      .registerProvider('documentiStorico', new DocumentiStoricoProvider(storicoDb));
```

- [ ] **Step 8: Add the token to the two recipes that use `documenti`**

In `src/application/context-engine/Recipe.ts`, change:

```typescript
  ALUNNO_DETTAGLIATO: ['school', 'class', 'student', 'carenze', 'piani', 'documenti', 'storico'],
```

to:

```typescript
  ALUNNO_DETTAGLIATO: [
    'school',
    'class',
    'student',
    'carenze',
    'piani',
    'documenti',
    'documentiStorico',
    'storico'
  ],
```

and:

```typescript
  FAMIGLIA_COMPLETO: ['school', 'class', 'student', 'carenze', 'piani', 'documenti'],
```

to:

```typescript
  FAMIGLIA_COMPLETO: ['school', 'class', 'student', 'carenze', 'piani', 'documenti', 'documentiStorico'],
```

Also add a row to the provider dependency table comment above `RECIPES` (right after the `documenti` row):

```
 * | documentiStorico | focus.alunno.didattica.documenti.storico (LazyRef, only if options.includiStorico) | focus.alunno.didattica.documenti (documenti) — must run after it |
```

- [ ] **Step 9: Run the new test file, then the full provider/recipe suites**

Run: `npx jest --config jest.config.cjs test/unit/application/context-engine/documenti-storico-provider.test.ts test/unit/application/context-engine/documenti-carenzafocus.test.ts test/unit/application/context-engine/recipes-e2e.test.ts -v`
Expected: PASS, all tests.

- [ ] **Step 10: Add one end-to-end recipe test**

In `test/unit/application/context-engine/recipes-e2e.test.ts`, after the `'includiStorico:true attaches a LazyRef...'` test (after line 62), add:

```typescript
test('ALUNNO_DETTAGLIATO with includiStorico:true also attaches documenti.storico as an unresolved LazyRef (11 §11)', () => {
  const params: BuildParams = { target: 'a1@school.it', tipoTarget: 'alunno', now };
  const cdu = factory().build(
    params,
    recipe('ALUNNO_DETTAGLIATO', { includiStorico: true, profonditaAnniDocumenti: 1 })
  );
  const storico = cdu.focus.alunno!.didattica.documenti!.storico;
  expect(storico).toBeDefined();
  expect(storico!.isResolved()).toBe(false);
});
```

- [ ] **Step 11: Run the full unit suite**

Run: `npm test`
Expected: PASS, 0 failures.

- [ ] **Step 12: Typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 13: Commit**

```bash
git add src/application/context-engine/Cdu.ts \
        src/application/context-engine/providers/DocumentiProvider.ts \
        src/application/context-engine/providers/DocumentiStoricoProvider.ts \
        src/application/context-engine/ContextEngineFactory.ts \
        src/application/context-engine/Recipe.ts \
        test/unit/application/context-engine/documenti-carenzafocus.test.ts \
        test/unit/application/context-engine/documenti-storico-provider.test.ts \
        test/unit/application/context-engine/recipes-e2e.test.ts
git commit -m "feat: attach lazy documenti.storico to the CDU via DocumentiStoricoProvider"
```

---

## Task 3: `boxes.ts` — render `arricchisciConStorico` mode

**Files:**
- Modify: `src/application/email/boxes.ts`
- Test: `test/unit/application/email-boxes.test.ts`

**Interfaces:**
- Consumes: `DocumentoStoricoConTipo` (Task 1), `documenti.items[].idGen` / `documenti.storico` (Task 2), `ITemplateEngine.processString` (existing).
- Produces: `renderDocumentiBox` becomes mode-aware but keeps its export surface (`createBoxComposer`, `renderBoxes` signatures unchanged) — no consumer outside this file needs to change.

**Design:** two new optional `BOX_CFG` keys, named exactly as the spec text at `11_PIPELINE_EMAIL.md` L315 calls them (camelCase, unlike the other UPPERCASE `BOX_CFG` keys — this is a direct quote of the authoritative spec, not a new convention):

```json
{ "TIPO_BOX": "documenti", "arricchisciConStorico": true, "configArricchimento": { "templateRiga": "<li>{{corrente.nome}} ({{#storico}}v. anche {{nome}} del {{anno}}{{/storico}})</li>" } }
```

If `arricchisciConStorico` is absent/false, or `templateRiga` is empty, or no `storico` LazyRef was attached to the CDU (`includiStorico` was false) — render falls back to the current plain-list markup untouched. This is a deliberate safety net: a misconfigured `BOX_CFG` row must never render blank rows silently.

- [ ] **Step 1: Write the failing tests**

Add to `test/unit/application/email-boxes.test.ts`, after the existing `'documenti box neutralises javascript: links and hostile colours'` test (after line 212):

```typescript
function cduWithStorico(storico: Array<{ anno: string; nome: string; link: string; tipo: string }>) {
  const cdu = cduRecord();
  const didattica = (
    cdu['focus'] as {
      alunno: { didattica: { documenti: { items: Array<Record<string, unknown>>; storico?: unknown } } };
    }
  ).alunno.didattica;
  didattica.documenti.items[0]!['idGen'] = 'CD_PDP';
  didattica.documenti.storico = { get: () => storico, isResolved: () => true };
  return cdu;
}

test('documenti box in arricchisciConStorico mode renders templateRiga, matching storico by idGen (11 §11)', () => {
  const templates = new FakeTemplateEngine();
  const composer = createBoxComposer(logger, templates);
  const cdu = cduWithStorico([
    { anno: '2025-2026', nome: 'PDP Anna (vecchio)', link: 'https://drive/old', tipo: 'CD_PDP' },
    { anno: '2025-2026', nome: 'Altro doc', link: 'https://drive/altro', tipo: 'ALTRO_TIPO' }
  ]);
  const out = renderBoxes(
    composer,
    confMail([
      {
        TIPO_BOX: 'documenti',
        arricchisciConStorico: true,
        configArricchimento: {
          templateRiga: '<li>{{corrente.nome}} — storico: {{#storico}}{{nome}} ({{anno}}){{/storico}}</li>'
        }
      }
    ]),
    cdu,
    materie(),
    templates
  );
  const html = out.boxes['documenti']!.html;
  expect(html).toContain('PDP Anna — storico: PDP Anna (vecchio) (2025-2026)');
  expect(html).not.toContain('Altro doc'); // different idGen, must not match
});

test('documenti box falls back to standard rendering when templateRiga is empty (safety net)', () => {
  const templates = new FakeTemplateEngine();
  const composer = createBoxComposer(logger, templates);
  const cdu = cduWithStorico([{ anno: '2025-2026', nome: 'x', link: 'https://drive/x', tipo: 'CD_PDP' }]);
  const out = renderBoxes(
    composer,
    confMail([{ TIPO_BOX: 'documenti', arricchisciConStorico: true }]),
    cdu,
    materie(),
    templates
  );
  expect(out.boxes['documenti']!.html).toContain('<a href="https://drive/x"');
  expect(out.boxes['documenti']!.html).toContain('PDP Anna'); // current item's plain markup, unchanged
});

test('documenti box falls back to standard rendering when includiStorico was false (no LazyRef attached)', () => {
  const templates = new FakeTemplateEngine();
  const composer = createBoxComposer(logger, templates);
  const out = renderBoxes(
    composer,
    confMail([
      {
        TIPO_BOX: 'documenti',
        arricchisciConStorico: true,
        configArricchimento: { templateRiga: '<li>{{corrente.nome}}</li>' }
      }
    ]),
    cduRecord(), // no .storico attached
    materie(),
    templates
  );
  expect(out.boxes['documenti']!.html).toContain('<a href="https://drive/x"');
});

test('documenti box arricchisciConStorico templateRiga escapes hostile storico nome (security parity with standard mode)', () => {
  const templates = new FakeTemplateEngine();
  const composer = createBoxComposer(logger, templates);
  const cdu = cduWithStorico([
    { anno: '2025-2026', nome: '<script>alert(1)</script>', link: 'https://drive/old', tipo: 'CD_PDP' }
  ]);
  const out = renderBoxes(
    composer,
    confMail([
      {
        TIPO_BOX: 'documenti',
        arricchisciConStorico: true,
        configArricchimento: { templateRiga: '<li>{{#storico}}{{nome}}{{/storico}}</li>' }
      }
    ]),
    cdu,
    materie(),
    templates
  );
  expect(out.boxes['documenti']!.html).toContain('&lt;script&gt;');
  expect(out.boxes['documenti']!.html).not.toContain('<script>alert(1)</script>');
});
```

- [ ] **Step 2: Run to confirm they fail**

Run: `npx jest --config jest.config.cjs test/unit/application/email-boxes.test.ts -v`
Expected: FAIL on all four new tests (either a TypeError reading `idGen`/`storico`, or the rendered HTML not containing the expected `templateRiga` output — plain-list markup instead).

- [ ] **Step 3: Update `DocumentoItem` and imports**

In `src/application/email/boxes.ts`, change:

```typescript
interface DocumentoItem {
  nome: string;
  link: string;
  tipo: string;
  stato: string;
  dataCreazione: string;
}
```

to:

```typescript
interface DocumentoItem {
  nome: string;
  link: string;
  tipo: string;
  idGen: string;
  stato: string;
  dataCreazione: string;
}
```

Add these imports near the top of the file (after the existing three):

```typescript
import type { LazyRef } from '../storico/LazyRef';
import type { DocumentoStoricoConTipo } from '../storico/StoricoDocumentiService';
```

- [ ] **Step 4: Make `aggregaDati` pass the storico ref through**

Replace `aggregaDati`:

```typescript
function aggregaDati(
  cdu: Record<string, unknown>,
  materie: IMateriaRepository
): Record<string, unknown> {
  const focus = cdu['focus'] as
    | {
        alunno?: {
          didattica?: {
            carenze?: { dettaglio?: Array<{ materia: string; voto: string }> };
            documenti?: {
              items?: DocumentoItem[];
              storico?: LazyRef<DocumentoStoricoConTipo[]>;
            };
          };
        };
      }
    | undefined;
  const dettaglio = focus?.alunno?.didattica?.carenze?.dettaglio ?? [];
  const items = focus?.alunno?.didattica?.documenti?.items ?? [];
  const storicoRef = focus?.alunno?.didattica?.documenti?.storico;
  return {
    carenze: mapCarenzeFormatoB(dettaglio, materie),
    documenti: { items: items.filter((i) => i.tipo !== 'CARTELLA'), storicoRef },
    cartelle: { items: items.filter((i) => i.tipo === 'CARTELLA'), storicoRef: undefined }
  };
}
```

- [ ] **Step 5: Update `renderDocumentiBox` to be mode-aware**

Replace the standalone `renderDocumentiBox` function:

```typescript
function renderRigaStandard(items: DocumentoItem[]): string {
  const righe = items
    .map(
      (d) =>
        `<li><a href="${escapeHtml(safeUrl(d.link))}" target="_blank">${escapeHtml(d.nome)}</a></li>`
    )
    .join('');
  return `<ul style="margin:0; padding-left:20px; font-size:14px; color:#555;">${righe}</ul>`;
}

function renderDocumentiBox(
  data: unknown,
  options: { config: Record<string, unknown> },
  templates: ITemplateEngine
): string {
  const { items, storicoRef } = data as {
    items: DocumentoItem[];
    storicoRef?: LazyRef<DocumentoStoricoConTipo[]>;
  };
  const arricchisci = options.config['arricchisciConStorico'] === true;
  const configArricchimento = options.config['configArricchimento'] as
    | Record<string, unknown>
    | undefined;
  const templateRiga = arricchisci ? str(configArricchimento?.['templateRiga']) : '';

  if (templateRiga === '' || storicoRef === undefined) return renderRigaStandard(items);

  // arricchisciConStorico (11 §11, 13 §4): storico entries are matched to the
  // current item by ID_GEN, not the display TIPO — StoricoDocumentiService
  // groups by CONF_DOC.TIPO/LOG_DOCS.ID_GEN, which the CDU item carries as `idGen`.
  const storico = storicoRef.get();
  const righe = items
    .map((corrente) => {
      const storicoCorrente = storico.filter((s) => s.tipo === corrente.idGen);
      return templates.processString(templateRiga, { corrente, storico: storicoCorrente });
    })
    .join('');
  return `<ul style="margin:0; padding-left:20px; font-size:14px; color:#555;">${righe}</ul>`;
}
```

- [ ] **Step 6: Thread `templates` and the new data shape through `createBoxComposer`**

In `createBoxComposer`, change the two `simple(...)` registrations for `documenti`/`cartelle`:

```typescript
  simple(
    'documenti',
    'Documenti',
    (ctx) => ctx.get('boxdata.documenti', { items: [], storicoRef: undefined }),
    (d) => (d as { items: unknown[] }).items.length === 0
  );
```

```typescript
  simple(
    'cartelle',
    'Cartelle',
    (ctx) => ctx.get('boxdata.cartelle', { items: [], storicoRef: undefined }),
    (d) => (d as { items: unknown[] }).items.length === 0
  );
```

And in the `HtmlRenderer` templates map, change:

```typescript
        documenti: (data) => renderDocumentiBox(data),
        cartelle: (data) => renderDocumentiBox(data),
```

to:

```typescript
        documenti: (data, options) => renderDocumentiBox(data, options, templates),
        cartelle: (data, options) => renderDocumentiBox(data, options, templates),
```

- [ ] **Step 7: Run the box test suite**

Run: `npx jest --config jest.config.cjs test/unit/application/email-boxes.test.ts -v`
Expected: PASS — all 15 tests (11 existing + 4 new).

- [ ] **Step 8: Run the full unit suite + typecheck + lint**

Run: `npm test && npm run typecheck && npm run lint`
Expected: all green.

- [ ] **Step 9: Commit**

```bash
git add src/application/email/boxes.ts test/unit/application/email-boxes.test.ts
git commit -m "feat: render documenti box arricchisciConStorico mode from BOX_CFG"
```

---

## Task 4: `boxes.ts` — configurable link `displayMode`

**Files:**
- Modify: `src/application/email/boxes.ts`
- Test: `test/unit/application/email-boxes.test.ts`

**Interfaces:**
- Consumes: `DocumentoItem` (Task 3).
- Produces: nothing new consumed by later tasks — this is the last code task.

Adds a `displayMode` (`'nome' | 'link' | 'nome+link' | 'sololink'`) `BOX_CFG` key read by the standard (non-arricchita) rendering branch. Default (key absent) reproduces today's exact markup.

- [ ] **Step 1: Write the failing tests**

Add to `test/unit/application/email-boxes.test.ts`, after the tests added in Task 3:

```typescript
test('documenti box displayMode "link" shows the URL as link text', () => {
  const out = render([{ TIPO_BOX: 'documenti', displayMode: 'link' }]);
  const html = out.boxes['documenti']!.html;
  expect(html).toContain('<a href="https://drive/x" target="_blank">https://drive/x</a>');
  expect(html).not.toContain('PDP Anna');
});

test('documenti box displayMode "nome+link" shows both nome and the link', () => {
  const out = render([{ TIPO_BOX: 'documenti', displayMode: 'nome+link' }]);
  const html = out.boxes['documenti']!.html;
  expect(html).toContain('PDP Anna');
  expect(html).toContain('<a href="https://drive/x" target="_blank">https://drive/x</a>');
});

test('documenti box displayMode "sololink" shows a generic "Apri" label', () => {
  const out = render([{ TIPO_BOX: 'documenti', displayMode: 'sololink' }]);
  const html = out.boxes['documenti']!.html;
  expect(html).toContain('<a href="https://drive/x" target="_blank">Apri</a>');
  expect(html).not.toContain('PDP Anna');
});

test('documenti box with no displayMode keeps the current default markup ("nome")', () => {
  const out = render([{ TIPO_BOX: 'documenti' }]);
  expect(out.boxes['documenti']!.html).toContain(
    '<a href="https://drive/x" target="_blank">PDP Anna</a>'
  );
});
```

- [ ] **Step 2: Run to confirm the mode-specific ones fail**

Run: `npx jest --config jest.config.cjs test/unit/application/email-boxes.test.ts -t "displayMode"`
Expected: FAIL for `"link"`, `"nome+link"`, `"sololink"` (all currently render the `"nome"` markup regardless of config); PASS for the default one (already true today).

- [ ] **Step 3: Implement `displayMode` in `renderRigaStandard`**

Replace `renderRigaStandard` and its call site in `renderDocumentiBox`:

```typescript
function renderRigaStandard(items: DocumentoItem[], displayMode: string): string {
  const righe = items
    .map((d) => {
      const href = escapeHtml(safeUrl(d.link));
      switch (displayMode) {
        case 'link':
          return `<li><a href="${href}" target="_blank">${href}</a></li>`;
        case 'nome+link':
          return `<li>${escapeHtml(d.nome)} — <a href="${href}" target="_blank">${href}</a></li>`;
        case 'sololink':
          return `<li><a href="${href}" target="_blank">Apri</a></li>`;
        default:
          return `<li><a href="${href}" target="_blank">${escapeHtml(d.nome)}</a></li>`;
      }
    })
    .join('');
  return `<ul style="margin:0; padding-left:20px; font-size:14px; color:#555;">${righe}</ul>`;
}
```

In `renderDocumentiBox`, change the fallback call:

```typescript
  if (templateRiga === '' || storicoRef === undefined)
    return renderRigaStandard(items, str(options.config['displayMode']));
```

- [ ] **Step 4: Run the full box test suite**

Run: `npx jest --config jest.config.cjs test/unit/application/email-boxes.test.ts -v`
Expected: PASS — all 19 tests.

- [ ] **Step 5: Run the full unit suite + typecheck + lint**

Run: `npm test && npm run typecheck && npm run lint`
Expected: all green.

- [ ] **Step 6: Commit**

```bash
git add src/application/email/boxes.ts test/unit/application/email-boxes.test.ts
git commit -m "feat: configurable documenti/cartelle link displayMode via BOX_CFG"
```

---

## Task 5: Update the CDU spec doc to match reality

**Files:**
- Modify: `SPECS_ALDO/02_CDU_STRUTTURA.md`

`02_CDU_STRUTTURA.md` is a project source of truth (`CLAUDE.md`: "when any SGSA spec document conflicts with another, `02_CDU_STRUTTURA.md` wins"). Task 2 adds `documenti.storico` and `documenti.items[].idGen` to the real CDU shape; the spec's §4.2 listing (lines 252-254) must say so, or the next reader will trust the doc over the code and miss the field.

- [ ] **Step 1: Update §4.2**

In `SPECS_ALDO/02_CDU_STRUTTURA.md`, change:

```
    documenti:               — popolato da `DocumentiProvider`, attivo in `ALUNNO_DETTAGLIATO` e `FAMIGLIA_COMPLETO`
      items: array di { nome, link, tipo, stato, dataCreazione }
      hasDocumenti: boolean
```

to:

```
    documenti:               — popolato da `DocumentiProvider`, attivo in `ALUNNO_DETTAGLIATO` e `FAMIGLIA_COMPLETO`
      items: array di { nome, link, tipo, idGen, stato, dataCreazione }
      hasDocumenti: boolean
      storico:                — LazyRef, popolato da `DocumentiStoricoProvider` solo se includiStorico=true (13 §4)
        array di { anno, nome, link, tipo }  — `tipo` qui è l'ID_GEN del generatore, per il match con `idGen` corrente
```

- [ ] **Step 2: Commit**

```bash
git add "SPECS_ALDO/02_CDU_STRUTTURA.md"
git commit -m "docs: document documenti.storico and items[].idGen in the CDU spec (02 §4.2)"
```

---

## Task 6: Investigate `ComposableContentLib` before scoping generic declarative filtering/sections

**Do not write implementation code in this task.** Its only deliverable is a documented decision. This corresponds to point 3 of the original proposal (`AGGIORNAMENTI_DA_FARE.md` §"Proposta di estensione: più configurabilità del sistema email" — generic `sezioni`/`blocchi`, `provieneDa`, arbitrary `filtri` on any field, multi-level aggregation, external layout config).

**Why this is gated, unlike Tasks 1-4:** `CLAUDE.md`'s GasLibraryFactory-first rule requires checking `GasLibraryFactory/DOCS_LIBS` for existing coverage *before* designing new logic in `src/`, and stopping to ask the user if only a partial match exists rather than silently writing ALDO-local code. Tasks 1-4 above are safe to plan directly because they're either (a) already fully spec'd ALDO-domain wiring (CDU shape, provider composition — genuinely SGSA-specific, no place in a general-purpose library) or (b) a couple of BOX_CFG-read `switch` branches with no generic reusable shape. Point 3 is different in kind: "filter an array of objects by arbitrary field/value pairs", "aggregate by class/subject/year", "declarative section ordering with visibility rules" are not CDU-shape-specific — they're exactly the kind of generic content-composition logic `ComposableContentLib` (`GasLibraryFactory/DOCS_LIBS/ComposableContentLib_docs.md`) already exists to own, and `boxes.ts`'s own header comment says as much: "ordering, visibility, empty-hiding, error isolation all come from the library. ALDO owns only the HTML of each box and the data aggregation." Writing a second, ALDO-local, generic filter/aggregation engine here would be exactly the kind of "coverage `GasLibraryFactory` permanently doesn't gain" `CLAUDE.md` warns against — and would duplicate logic the library facade (`ContentComposer`) already coordinates per its own docs ("Il `ContentComposer` coordina valutazione, filtraggio e rendering in un unico metodo").

- [ ] **Step 1: Read the full library doc**

Read `GasLibraryFactory/DOCS_LIBS/ComposableContentLib_docs.md` in full (not just the section headers). Note specifically: what shape of "filtro" it already coordinates today, whether the current ALDO usage (`PREREQUISITI`-driven visibility, `ORDINE`-driven sort, `MOSTRA_SE_VUOTO`/`TESTO_VUOTO` empty-handling — all in `boxes.ts`'s `renderBoxes`) already uses the library's filtering capability or reimplements it locally, and whether the library exposes a generic per-field filter predicate over an arbitrary data array (what §"Casi utili da supportare" in `AGGIORNAMENTI_DA_FARE.md` needs for "filtri applicabili al blocco: tipo, stato, classe, anno, materia, priorità").

- [ ] **Step 2: Query the indexed library graph for existing filter/aggregation surface**

Run, against the `home-giulio-Desktop-ALDO-implementing-GasLibraryFactory` project:

```
search_graph(project="home-giulio-Desktop-ALDO-implementing-GasLibraryFactory", query="filter blocks by field composition recipe")
search_graph(project="home-giulio-Desktop-ALDO-implementing-GasLibraryFactory", name_pattern=".*[Ff]ilter.*")
```

For every result that looks like a generic (non-ALDO) filtering/aggregation entry point, pull its exact signature with `get_code_snippet` and read the surrounding class's doc section in `ComposableContentLib_docs.md` (Step 1) to understand its intended usage — do not guess from the function name alone.

- [ ] **Step 3: Cross-check current ALDO usage for reimplementation**

Run, against the `home-giulio-Desktop-ALDO-implementing` project:

```
search_code(project="home-giulio-Desktop-ALDO-implementing", pattern="filtri", path_filter="^src/")
search_code(project="home-giulio-Desktop-ALDO-implementing", pattern="DATI_SORGENTE", path_filter="^src/")
```

`11_PIPELINE_EMAIL.md` §13 (line 359) already references `BOX_CFG.DATI_SORGENTE.filtri` for attachment resolution — check whether that's implemented anywhere in `src/emailSteps.ts`'s `resolveAllegati`-equivalent code, or whether it's spec'd but unwired like the storico mode was before this plan. This tells you whether ALDO already has a bespoke ad-hoc filter reader that a generic library facade should replace, or whether this would be greenfield.

- [ ] **Step 4: Classify and record the finding**

Write a short note (2-4 sentences, in the PR description or a scratch note — not a new committed doc, this is a decision record, not a spec) classifying each of the three proposal pieces (generic per-field `filtri`, declarative `sezioni`/`blocchi` composition, external `LAYOUT_CFG`) as one of:

- **Full match** — `ComposableContentLib` already exposes this; use it directly, do not wrap it.
- **Partial match** — the library covers part of it (e.g. it already does generic block composition/ordering/visibility, per its docs, but not per-field data filtering) — **stop here and ask the user** whether `GasLibraryFactory` should be extended to cover the gap, per `CLAUDE.md`. Do not proceed to write ALDO-local filtering code without that answer.
- **No match / genuinely SGSA-specific** — e.g. anything that depends on CDU shape knowledge (`focus.alunno.didattica.*` paths) rather than generic array filtering — safe to implement ALDO-locally, following the same task-planning process as Tasks 1-4 above (a follow-up plan, once scoped).

- [ ] **Step 5: Present the finding to the user before any further planning**

Do not write a Task 7+ implementation plan for point 3 in this document. Once Step 4's classification is available, ask the user directly (per `CLAUDE.md`: "When in doubt about whether something belongs in the library or in ALDO, ask — don't guess") whether to (a) scope a `GasLibraryFactory` extension first, (b) proceed with ALDO-local code for the no-match pieces only, or (c) drop this piece of the proposal. Only after that answer should a new implementation plan be written for whichever pieces are confirmed in-scope.

---

## Self-Review

**Spec coverage:**
- `11_PIPELINE_EMAIL.md` §11 "Modalità arricchita" (`arricchisciConStorico`, `configArricchimento.templateRiga`) → Tasks 1-3.
- `13_SERVIZI_STORICI.md` L98 (`profonditaAnniDocumenti` → `StoricoDocumentiService`) → Task 2.
- `AGGIORNAMENTI_DA_FARE.md` priority #1 (storico nel box documenti) → Tasks 1-3.
- `AGGIORNAMENTI_DA_FARE.md` priority #2 (link display mode) → Task 4.
- `AGGIORNAMENTI_DA_FARE.md` priority #3 (template di riga personalizzati) → Task 3 (`templateRiga` *is* the custom row template mechanism).
- `AGGIORNAMENTI_DA_FARE.md` "più configurabilità" generic `sezioni`/`filtri`/`LAYOUT_CFG` → Task 6 (investigation gate, per explicit user request not to implement it directly).
- `02_CDU_STRUTTURA.md` staying in sync with the new CDU shape → Task 5.

**Placeholder scan:** every step above contains complete, runnable code or an exact command with expected output; Task 6 intentionally has no implementation code because its deliverable is a decision, not software — this is called out explicitly rather than left implicit.

**Type consistency:** `DocumentoStoricoConTipo` (Task 1) is the exact type used by `DocumentiStoricoProvider` (Task 2) and imported by `boxes.ts` (Task 3). `documenti.items[].idGen` (Task 2) is the exact field `renderDocumentiBox` reads in Task 3. `LazyRef<DocumentoStoricoConTipo[]>` is consistent across `Cdu.ts`, `DocumentiStoricoProvider.ts`, and `boxes.ts`.
