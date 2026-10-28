# Materie con specifica Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rendere indipendenti le colonne e ACL delle coppie `MATERIA.SPECIFICA`, usando `MATERIE.SINTESI` come intestazione.

**Architecture:** Il CDU conserva gia' `sigla` e `specificita`; le strategie sheet devono mantenere tale identita' fino al layout. `RisolutoreRuoliService` ricevera' filtro slot esplicito perche' `DOCENTE_MATERIA` continua a risolvere la materia base tramite `RoleResolutionLib`, poi ALDO seleziona lo slot corretto.

**Tech Stack:** TypeScript, Jest, `WorkspaceTemplateEngine.processSheet`, `RoleResolutionLib` tramite facade ALDO.

## Global Constraints

- GAS V8 sincrono; nessuna API Node/browser in `src/`.
- Nessuna modifica a `dist/` o sorgenti `GasLibraryFactory/`.
- Intestazione ordinaria: `MATERIE.SINTESI` della riga catalogo `SIGLA.SPECIFICA`; fallback identificativo completo.
- `REL`/`REL/ALT` e `DOCENTI_IRC_ALT` invariati.

---

### Task 1: Identita' specifica in colonne e permessi

**Files:**

- Modify: `test/unit/application/sheet-materie-generator.test.ts`
- Modify: `test/fixtures/tables.ts`
- Modify: `src/application/strategies/SheetMaterieGeneratorStrategy.ts`
- Modify: `src/application/strategies/SheetMaterieConPermessiGeneratorStrategy.ts`
- Modify: `src/application/context-engine/ElencoMaterieConPermessi.ts`
- Modify: `src/application/services/RisolutoreRuoliService.ts`

**Interfaces:**

- Consumes: `DocenteCdcVM.materie: { sigla, specificita }[]`.
- Produces: `MateriaColumn { sigla, specificita?: string, header, classeId?, kind? }`.
- Produces: `RisolviOptions { classeId?, specifica?, kind? }`; `DOCENTE_MATERIA` restituisce solo assegnazioni slot compatibili.

- [ ] **Step 1: Scrivere test rosso per due specifiche stessa materia**

  In `fixtureTables`, aggiungere due righe `MATERIE` catalogo con `ID: 'LAB.GRUPPO_A'`/`'LAB.GRUPPO_B'` e rispettivi `SINTESI: 'Lab A'`/`'Lab B'`. Nel test sheet creare una classe CDU con due slot LAB, specifiche diverse e docenti diversi. Aggiungere test:

  ```ts
  test('renders and protects one column per subject specificity using catalog SINTESI', () => {
    strategy.render('file_1', cdu, confDoc('SHEET_CON_MATERIE_E_PERMESSI'));

    expect(groups.group1).toEqual([
      { sigla: 'LAB', specificita: 'GRUPPO_A', header: 'Lab A' },
      { sigla: 'LAB', specificita: 'GRUPPO_B', header: 'Lab B' }
    ]);
    expect(sheets.protectCalls.find((r) => r.range === 'Sheet1!B:B')?.editors?.users).toEqual(
      expect.arrayContaining(['docente-a@school.it'])
    );
    expect(sheets.protectCalls.find((r) => r.range === 'Sheet1!C:C')?.editors?.users).toEqual(
      expect.arrayContaining(['docente-b@school.it'])
    );
    expect(roles.subjectCduVariants.map((v) => v.meta.parametriInput.materiaCorrente)).toEqual([
      'LAB',
      'LAB'
    ]);
  });
  ```

- [ ] **Step 2: Eseguire test e confermare RED**

  Run: `npx jest --config jest.config.cjs test/unit/application/sheet-materie-generator.test.ts -t "one column per subject specificity"`

  Expected: FAIL: una sola colonna `LAB`, intestazione non `Lab A`/`Lab B`, oppure ACL non separati.

- [ ] **Step 3: Conservare identita' composta durante costruzione colonne**

  In `SheetMaterieGeneratorStrategy`:

  ```ts
  export interface MateriaColumn {
    sigla: string;
    specificita?: string;
    header: string;
    classeId?: string;
    kind?: string;
    isSpecial?: boolean;
    roles?: string[];
  }
  ```

  Per classi non articolate, costruire elementi da `consiglioDiClasse[].materie`, deduplicando chiave `${sigla}.${specificita ?? ''}` e ordinando per identificativo completo. Per ogni elemento, calcolare `catalogId = specificita === null ? sigla : `${sigla}.${specificita}``; leggere `findByIdCached(MateriaId.of(catalogId))?.sintesi`, fallback `catalogId`.

  Per gruppi articolati, convertire ogni ID puntato in `{ sigla, specificita }` e mantenere `classeId`; ID non puntato resta materia base.

- [ ] **Step 4: Rendere elenco placeholder composto**

  In `ElencoMaterieConPermessi.ts`, aggiungere `specificita?: string | null` al VM, sostituire `distinctBy(['sigla'])` con `distinctBy(['sigla', 'specificita'])`, ordinare anche per `specificita`, e mantenere la stessa `sigla`/`specificita` ricevuta dal CDU. Non modificare elemento speciale.

- [ ] **Step 5: Filtrare `DOCENTE_MATERIA` sullo slot**

  In `RisolutoreRuoliService.ts`, estendere `RisolviOptions` e `RoleContext`:

  ```ts
  interface RisolviOptions {
    classeId?: string;
    specifica?: string;
    kind?: string;
  }
  ```

  In `docenteMateria`, salvare risultato `resolveMateria(...)`, filtrare `assignment.slot.specifica === ctx.specifica` quando definita e `assignment.slot.kind === ctx.kind` quando definito, poi passare assegnazioni filtrate a `routedEmails`. In `SheetMaterieConPermessiGeneratorStrategy.resolveDocentiMateria`, passare `specifica: item.specificita` e `kind: item.kind` oltre a `classeId`.

- [ ] **Step 6: Eseguire test e confermare GREEN**

  Run: `npx jest --config jest.config.cjs test/unit/application/sheet-materie-generator.test.ts`

  Expected: PASS; test nuovo prova due colonne e ACL distinti, test REL/ALT e articolazione restano verdi.

- [ ] **Step 7: Verifiche statiche e commit**

  Run: `npm run typecheck && npm run lint && git diff --check`

  Expected: tutti exit 0.

  ```bash
  git add src/application/strategies/SheetMaterieGeneratorStrategy.ts \
    src/application/strategies/SheetMaterieConPermessiGeneratorStrategy.ts \
    src/application/context-engine/ElencoMaterieConPermessi.ts \
    src/application/services/RisolutoreRuoliService.ts \
    test/unit/application/sheet-materie-generator.test.ts test/fixtures/tables.ts
  git commit -m "fix: separate sheet subject specificities"
  ```
