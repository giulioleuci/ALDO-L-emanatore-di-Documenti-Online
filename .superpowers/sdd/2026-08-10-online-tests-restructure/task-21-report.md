# Task 21 report — ITP e materie puntate

## Stato

Completato: implementati fondazione composita, sette check reali e launcher persistito.

## Discovery e vincoli

- Letti brief, memorie e percorsi CDU canonici in `SPECS_ALDO/02_CDU_STRUTTURA.md`.
- Discovery e verifica via `codebase-memory-mcp`: repository/role resolver, metadata CDU, batch documenti, entrypoint e audit chiamate GAS native.
- Consultata prima la documentazione `GasLibraryFactory/DOCS_LIBS/RoleResolutionLib.md`: il parsing/scoping delle assegnazioni resta delegato alla libreria esistente. La nuova colonna `BASE.SPECIFICA.itp` e la sua ownership sono dati SGSA della matrice CLASSI, quindi l'estensione autorizzata resta nel repository ALDO.

## TDD e implementazione

RED verificato:

- `getTeachingSlots` trattava `INTERPRET.CHITARRA.itp` come specifica catalogo inesistente;
- `getITPPerMateria` non accettava `MateriaSpecificaId` e leggeva solo `BASE.itp`;
- fixture condivisa priva della colonna/assegnazione ITP puntata e di `CONF_DOC_DOTTED`;
- launcher `testITPeMateriePuntate` restituiva `ConfigurationError: non implementato`.

GREEN:

- `IClasseRepository`/`ClasseRepository` distinguono ITP base e ITP di una specifica; `getTeachingSlots` conserva `kind: ITP`, specifica e colonna esatta;
- dataset 4A contiene quattro materie puntate e `INTERPRET.CHITARRA.itp`; seed dedicato usa il template dotted reale;
- sette check verificano lookup ITP esatto, ownership/ruoli/SOTTOTIPO batch, nomi sintetizzati/espliciti, CDU classe-studente-parent, isolamento supplenze/variazioni, continuita storica e assenza campi ITP, rendering senza placeholder;
- launcher persistito carica MASTER e due DB storici, registra interceptor CDU e usa il reporter comune;
- aggregate suite usa la registrazione reale, non il placeholder pending.

## Verifiche

- Focused Task 21: PASS, 6 suite / 73 test.
- Launcher/aggregate/checks dopo rifinitura batch: PASS, 3 suite / 18 test.
- Full unit: PASS, 159 suite / 1390 test.
- `npm run typecheck`: PASS.
- `npm run lint`: PASS.
- Graph audit: nessuna chiamata GAS nativa nel nuovo check; launcher → registrazione e entrypoint risultano collegati; nessun nuovo confine/ciclo rilevato nell'area onlinetests.
- Verifica live GAS non eseguita: richiede dataset provisionato/deployment online.

## File intenzionali

- `src/domain/repositories/IClasseRepository.ts`
- `src/infrastructure/repositories/ClasseRepository.ts`
- `src/onlinetests/checks/itpDottedChecks.ts`
- `src/onlinetests/data/Seeders.ts`
- `src/onlinetests/data/SharedTestDatabaseBuilder.ts`
- `src/onlinetests/data/SharedTestHeaders.ts`
- `src/onlinetests/index.ts`
- test unitari repository, fixture, seed, check e launcher/aggregate.

Le eliminazioni preesistenti sotto `ESTENSIONI_ALDO/` non sono incluse.
