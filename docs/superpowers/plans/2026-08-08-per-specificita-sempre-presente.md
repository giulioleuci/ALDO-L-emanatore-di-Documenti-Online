# `studenti.perSpecificita` Sempre Presente Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rendere `focus.classe.studenti.perSpecificita` sempre disponibile in ogni CDU classe, così i template documentali lo renderizzano senza opzioni speciali.

**Architecture:** Il ramo resta costruito da `StudentiProvider`, ma non è più una feature flag della recipe. Si elimina `includiSpecificita` dal contratto delle opzioni CDU invece di lasciarlo ignorato; forma dati e renderer Mustache rimangono invariati.

**Tech Stack:** TypeScript, GAS V8, Jest/ts-jest, E2E online GAS.

## Global Constraints

- Target GAS V8, solo API sincrone.
- Nessun native GAS global fuori `GoogleApiWrapper`.
- Questo è un dettaglio di forma/costo del CDU SGSA; nessuna estensione `GasLibraryFactory`.
- `perSpecificita` è sempre array: `[]` se non esistono specificità, mai `undefined`.
- Non lasciare `includiSpecificita` ignorato: rimuoverlo da tipi, default, call site e docs.
- Nessuna modifica al renderer Mustache, catalogo `MATERIE` o risoluzione ruoli.

---

## File structure

- `src/application/context-engine/Recipe.ts` — rimuove flag da `RecipeOptions` e `DEFAULT_OPTIONS`.
- `src/application/context-engine/Cdu.ts` — rimuove flag dalla vista serializzata delle opzioni.
- `src/application/context-engine/providers/StudentiProvider.ts` — materializza sempre ramo.
- `test/unit/application/context-engine/studenti-provider.test.ts` — contratto default/array vuoto.
- `src/onlinetests/checks/{contextEngineChecks,articolazioneChecks}.ts` — rimuove override ormai inesistenti.
- `src/onlinetests/E2eTemplateProvisioner.ts` — corregge descrizione template complesso.
- `SPECS_ALDO/02_CDU_STRUTTURA.md` — contratto CDU non condizionale.

### Task 1: Rendere il ramo CDU incondizionato e rimuovere il flag

**Files:**

- Modify: `src/application/context-engine/Recipe.ts:9-65`
- Modify: `src/application/context-engine/Cdu.ts:126-137, 240-243`
- Modify: `src/application/context-engine/providers/StudentiProvider.ts:27-43`
- Modify: `test/unit/application/context-engine/studenti-provider.test.ts:217-243`
- Modify: `src/onlinetests/checks/contextEngineChecks.ts:844-865`
- Modify: `src/onlinetests/checks/articolazioneChecks.ts:57-62`
- Modify: `SPECS_ALDO/02_CDU_STRUTTURA.md:108, 289-293, 945`

**Interfaces:**

- Consumes: `buildPerSpecificita(listaCompleta): SpecificitaAlunniVM[]`.
- Produces: `focus.classe.studenti.perSpecificita: SpecificitaAlunniVM[]` per ogni invocazione di `StudentiProvider` che costruisce `focus.classe.studenti`.
- Removes: `RecipeOptions.includiSpecificita` e `RecipeOptionsView.includiSpecificita`.

- [ ] **Step 1: Scrivere test RED per contratto sempre presente**

Sostituire test condizionale con test default; riusare fixture `5A` e aspettativa strutturale esistente:

```ts
test('StudentiProvider: always populates perSpecificita for a class CDU', () => {
  const cdu = build('5A', fixtureTables());

  expect(cdu.focus.classe!.studenti!.perSpecificita).toEqual([
    {
      materiaId: 'INTERP',
      materiaSigla: 'INTERP',
      materiaNome: 'Interpretazione',
      specifiche: expect.any(Array)
    }
  ]);
});
```

Conservare le aspettative letterali già presenti per le specificità e gli alunni. Aggiungere fixture classe senza curriculum specifico, se già disponibile nel file, con `expect(...perSpecificita).toEqual([])`.

- [ ] **Step 2: Verificare RED**

Run:

```bash
npx jest --config jest.config.cjs test/unit/application/context-engine/studenti-provider.test.ts -t "always populates perSpecificita"
```

Expected: FAIL perché default recipe non aggiunge la proprietà.

- [ ] **Step 3: Eliminare flag e materializzare sempre ramo**

Applicare queste modifiche minime:

```ts
// Recipe.ts e Cdu.ts: eliminare soltanto la proprietà includiSpecificita.

// StudentiProvider.ts
focusClasse.studenti = {
  listaCompleta,
  perSpecificita: buildPerSpecificita(listaCompleta)
};
```

Eliminare tutti gli override `{ includiSpecificita: true }` dai check online; dopo rimozione tipo non devono esistere riferimenti al nome.

- [ ] **Step 4: Aggiornare contratto CDU**

In `02_CDU_STRUTTURA.md`:

- rimuovere riga `includiSpecificita` da recipe options ed esempio JSON;
- sostituire “presente SOLO se opzioni.includiSpecificita = true” con “sempre presente; `[]` se non esistono specificità”;
- mantenere identica forma array e regola `nomeCompleto`.

- [ ] **Step 5: Verificare GREEN e assenza API morta**

Run:

```bash
npx jest --config jest.config.cjs test/unit/application/context-engine/studenti-provider.test.ts
! rg -n "includiSpecificita" src test SPECS_ALDO
npm run typecheck
npm run lint
```

Expected: provider suite PASS; `rg` nessun match; typecheck/lint PASS.

- [ ] **Step 6: Commit**

```bash
git add src/application/context-engine/Recipe.ts src/application/context-engine/Cdu.ts src/application/context-engine/providers/StudentiProvider.ts test/unit/application/context-engine/studenti-provider.test.ts src/onlinetests/checks/contextEngineChecks.ts src/onlinetests/checks/articolazioneChecks.ts SPECS_ALDO/02_CDU_STRUTTURA.md
git commit -m "feat: always include student specificita in class CDU"
```

### Task 2: Rendere il documento complesso prova reale del contratto

**Files:**

- Modify: `src/onlinetests/E2eTemplateProvisioner.ts:188-230`
- Modify: `src/onlinetests/checks/e2eScenarioChecks.ts:489-506`
- Test: `test/unit/onlinetests/e2e-template-provisioner.test.ts:227-255`
- Test: `test/unit/onlinetests/e2e-scenario-checks.test.ts`

**Interfaces:**

- Consumes: template `DOC_COMPLESSO_PARAGRAPHS`, `CONF_DOC_COMPLESSO`, generated document text via existing E2E scenario facade.
- Produces: test live-GAS che prova contenuto renderizzato per classe `1A`, non soltanto presenza sintattica placeholder.

- [ ] **Step 1: Aggiungere test di accettazione del testo documento complesso**

Nel test scenario esistente per `CONF_DOC_COMPLESSO`, aggiungere aspettativa sul documento `1A` dopo `generateForClasse`:

```ts
expect(renderedText).toContain('Laboratorio: GRUPPO_A (');
expect(renderedText).toContain('Interpretazione ed esecuzione: Chitarra (');
expect(renderedText).not.toContain('{{#focus.classe.studenti.perSpecificita}}');
```

Usare l'helper già esistente nel file per leggere testo Drive del file generato; non introdurre fake renderer. Valori esatti devono corrispondere ai dati E2E correnti.

- [ ] **Step 2: Verificare copertura locale**

Run il test unit scenario che modella questa generazione. Expected: PASS — Task 1
ha già reso disponibile il ramo; questo test impedisce che il documento torni
vuoto.

- [ ] **Step 3: Aggiornare template note e test fixture**

Sostituire commenti obsoleti in `E2eTemplateProvisioner.ts`:

```ts
// Il ramo perSpecificita è un array CDU standard: il documento complesso
// prova rendering Mustache a tre livelli su una generazione normale.
```

Aggiornare riga introduttiva da “vuoto salvo includiSpecificita” a “sempre disponibile nel CDU classe”. Mantenere placeholder identico.

- [ ] **Step 4: Verificare GREEN locale**

Run:

```bash
npx jest --config jest.config.cjs test/unit/onlinetests/e2e-template-provisioner.test.ts test/unit/onlinetests/e2e-scenario-checks.test.ts
npm test
npm run test:integration
npm run test:build
```

Expected: tutte suite PASS.

- [ ] **Step 5: Verifica online e commit**

Run gate online, perché solo GAS renderizza template reale:

```bash
npm run build:online
```

Poi:

```bash
git add src/onlinetests/E2eTemplateProvisioner.ts src/onlinetests/checks/e2eScenarioChecks.ts test/unit/onlinetests/e2e-template-provisioner.test.ts test/unit/onlinetests/e2e-scenario-checks.test.ts
git commit -m "test: render class student specificita in complex document"
```
