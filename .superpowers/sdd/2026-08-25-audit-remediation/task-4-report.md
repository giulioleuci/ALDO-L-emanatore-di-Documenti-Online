# Task 4 report

## Status

Completato. Commit implementazione: `06b0bb95fe55f2a8385a8390ed7e4d5355ad1a3a`.

## Affected paths

- `src/domain/value-objects/stringId.ts`
- `src/domain/value-objects/{ClasseId,IndirizzoId,DipartimentoId,MateriaId,MateriaSpecificaId}.ts`
- `src/infrastructure/facades/ProcessMonitorFacade.ts`
- `src/config/Bootstrap.ts`
- `src/application/context-engine/techEntities.ts`
- `src/application/context-engine/providers/{CarenzeProvider,DocumentiProvider,DocumentiStoricoProvider,PianiProvider,PianiPersAlunnoProvider,PianiPersAlunnoStoricoProvider,StoricoProvider}.ts`
- `test/unit/domain/value-objects.test.ts`
- `test/unit/application/context-engine/tech-entities.test.ts`

`PianoFocusProvider` resta invariato: l'assenza dell'alunno produce volutamente un `PipelineError`, quindi non è una guardia no-op convertibile.

## MateriaId trim

Il controllo richiesto (`grep -rn "MateriaId" test/unit/domain/*.ts | grep -n "of("`) non ha trovato un test che fissi il rifiuto di `" ITA "`. `MateriaId` ora usa il trim della factory condivisa, poi applica il pattern maiuscolo. Il regression guard nuovo conserva pattern ed errore nominato `MateriaId`.

## Storico N+1

Misurato temporaneamente il test esistente `StoricoDocentiService scans historical CLASSI for the teacher across all classes (13 §6)`: `perDocente ms: 1`. È sotto la soglia ~200 ms; l'ottimizzazione è stata intenzionalmente omessa. L'istrumentazione `Date.now`/`console.log` è stata rimossa prima del commit e `StoricoDocentiService.ts` non è stata modificata.

## Evidenza test-first / regressione

- `test/unit/domain/value-objects.test.ts` è stato aggiunto e passato contro il comportamento già esistente prima della factory (3/3).
- `withFocusAlunno` ha avuto un test rosso osservato (`TypeError: withFocusAlunno is not a function`) prima dell'implementazione, poi verde; conserva la semantica no-op senza focus.
- I provider sono stati verificati nel gruppo context-engine completo; le guardie con comportamento successivo non sono state avvolte.

## Commands and results

1. `grep -rn "MateriaId" test/unit/domain/*.ts | grep -n "of("` — nessun test di rifiuto whitespace.
2. `npx jest --config jest.config.cjs test/unit/domain/value-objects.test.ts` — PASS, 3 test.
3. `npx jest --config jest.config.cjs test/unit/application/context-engine/tech-entities.test.ts` — RED osservato, poi PASS.
4. `npx jest --config jest.config.cjs test/unit/application/storico-services.test.ts -t "StoricoDocentiService scans"` — PASS, 1 test; 1 ms.
5. `npm run typecheck` — PASS.
6. `npx jest --config jest.config.cjs test/unit/domain/value-objects.test.ts test/unit/domain/identifiers.test.ts test/unit/application/context-engine test/unit/application/storico-services.test.ts test/unit/config/bootstrap.test.ts` — PASS, 41 suite / 234 test.
7. `npm run typecheck && npm run lint && npm test && npm run test:integration && npm run test:build` — typecheck, lint, unit (171/1648) e integrazione (5/14) PASS; build bloccata nel sandbox da `spawnSync ... EPERM`.
8. `npm run test:build` fuori sandbox — PASS, 5 suite / 12 test.

## Explicit staged paths

```
src/application/context-engine/providers/CarenzeProvider.ts
src/application/context-engine/providers/DocumentiProvider.ts
src/application/context-engine/providers/DocumentiStoricoProvider.ts
src/application/context-engine/providers/PianiPersAlunnoProvider.ts
src/application/context-engine/providers/PianiPersAlunnoStoricoProvider.ts
src/application/context-engine/providers/PianiProvider.ts
src/application/context-engine/providers/StoricoProvider.ts
src/application/context-engine/techEntities.ts
src/config/Bootstrap.ts
src/domain/value-objects/ClasseId.ts
src/domain/value-objects/DipartimentoId.ts
src/domain/value-objects/IndirizzoId.ts
src/domain/value-objects/MateriaId.ts
src/domain/value-objects/MateriaSpecificaId.ts
src/domain/value-objects/stringId.ts
src/infrastructure/facades/ProcessMonitorFacade.ts
test/unit/application/context-engine/tech-entities.test.ts
test/unit/domain/value-objects.test.ts
```

## Concerns

- Nessuna concern sul codice Task 4. Il workspace conserva modifiche e cancellazioni non correlate, escluse dallo staging.
- La build-suite richiede esecuzione fuori sandbox perché i suoi test invocano processi Node figli.
