# CDU: `focus.classe.supplenze[]` e `pianiPersonalizzati.nonVerbalizzati`

## Obiettivo

Aggiungere al CDU due nuovi path classe-scoped, per consentire ai template di
stampare le supplenze attive della classe e l'elenco dei piani personalizzati
non ancora verbalizzati, senza filtrare su valori di dominio (Principio 3 di
`02_CDU_STRUTTURA.md`).

## Contratto CDU — `focus.classe.supplenze[]`

Elenco delle supplenze **attive di fatto** per la classe focalizzata,
aggregato per coppia (supplente, titolare) e sempre popolato (nessun gate su
`includiSupplenti`), indipendente dal routing `gestioneSupplenti`: riflette le
delegazioni attive (`docenteEffettivo ≠ titolare`) anche sotto
`SOLO_TITOLARI`, dove `consiglioDiClasse[].stato.isSupplente` resta `false`.

```yaml
focus.classe.supplenze:
  - supplente: PersonVM # §8.1 — docente effettivamente attivo (docenteEffettivo)
    titolare: PersonVM # §8.1 — titolare sostituito (assignment.titolare)
    dettaglioMaterie: SubjectVM[] # §8.2 — materie coperte (base VM, senza docenti/continuita)
```

- **`supplente`** = `assignment.docenteEffettivo`, **`titolare`** =
  `assignment.titolare` (il principale sostituito — coerente con
  `DocenteCdcVM.stato.sostituisce`). In una catena di supplenze A→B→C il
  supplente è C (l'ultimo effettivo); gli intermedi sono omessi.
- **`dettaglioMaterie`** riusa il VM canonico `SubjectVM` via l'helper esistente
  `materiaVm` di `TeachingCouncilProjection.ts` (lookup catalogo con risoluzione
  EVOLUZIONE per l'anno di corso e `isITP` dal `kind` dello slot), dedup per
  `sigla + specifica` (riuso di `dedupeMaterie`). Nessun VM minimo ad hoc.
- Per una classe articolata l'aggregazione copre l'intero gruppo partner (come
  `consiglioDiClasse`).

## Contratto CDU — `focus.classe.didattica.pianiPersonalizzati.nonVerbalizzati`

Partizione precalcolata degli stessi LOG_DOCS `PIANO_PERS` di
`pianiPersonalizzati.items`, dove `stato ≠ VERBALIZZATO` (enum `StatoDocumento`:
restano `GENERATO`, `NOTIFICATO`, `ARCHIVIATO`). Nei template è **vietato**
filtrare su `stato` (`where:'stato',...`): il raggruppamento è già precalcolato.

```yaml
focus.classe.didattica.pianiPersonalizzati.nonVerbalizzati:
  isPresenteLista: boolean # true sse elenco non vuoto (companion {{#isPresenteLista}}/{{^}})
  elenco:
    - studente: { nomeCompleto: string, email: string } # stesso shape di PianoPersonalizzatoItem.studente
      tipoLabel: string # da tipoPianoLabel() (labels.ts) sul sottotipo
```

- L'item riusa lo shape `studente` già esposto da `PianoPersonalizzatoItem`
  (`Cdu.ts` §8.11): `nonVerbalizzati` è una partizione di `items`, quindi
  nessun terzo shape per la stessa persona.
- `tipoLabel` usa il mapper standard `tipoPianoLabel`.
- Stesso ordine di `items`.

## Provider, recipe e composizione

- **`focus.classe.supplenze`**: popolato dentro `ConsiglioClasseProvider`
  (che già risolve i `TeachingAssignment[]` in un unico passaggio e dispone di
  `IMateriaRepository` per il lookup). Nuova helper
  `buildSupplenzeAggregate(assignments, materie, classe)` in
  `TeachingCouncilProjection.ts`, che riusa `materiaVm`/`dedupeMaterie` e
  `buildPersonVmFromDocente`. Zero risoluzioni duplicate.
- **`pianiPersonalizzati.nonVerbalizzati`**: popolato dentro
  `PianiPersClasseProvider`, derivato da `items` (stessa sorgente, stesso
  multi-classe `classiCompetenza`).
- Recipe attivate: entrambe le sezioni compaiono in ogni recipe che esegue i
  token `consiglio` / `pianiPersClasse` — `CLASSE_COMPLETA`,
  `CLASSE_DOCENTE_MATERIA`, `DOCENTE_COMPLETO`. Nessun nuovo token recipe,
  nessuna modifica a `RECIPES`.

La risoluzione delle supplenze è già delegata a `RoleResolutionLib` tramite il
port `ITeachingAssignmentResolver`; entrambe le sezioni sono mapping CDU
specifici del dominio SGSA, quindi nessuna estensione di `GasLibraryFactory`.

## Aggiornamenti SPECS_ALDO

- `02_CDU_STRUTTURA.md`:
  - §4.1: `focus.classe.supplenze` (dopo `consiglioDiClasse*`) e
    `didattica.pianiPersonalizzati.nonVerbalizzati`.
  - §8: nuovo §8.12 `SupplenzaAggregataVM`; nota su `nonVerbalizzati` accanto a
    §8.11.
  - §9: voci di catalogo (loop `{{#bullet_list:focus.classe.supplenze}}`,
    sezione `{{#...nonVerbalizzati.isPresenteLista}}`).
  - §10: esempio JSON con entrambe le sezioni.
  - §11: regola di validazione (partizione precalcolata `stato ≠ VERBALIZZATO`,
    divieto `where:'stato'`; PersonVM obbligatorie in `supplenze`).
- `GUIDA_USO_PLACEHOLDER.md`: voci di catalogo placeholder per i due path.
- `src/application/context-engine/Cdu.ts`: `SupplenzaAggregataVM`,
  `focus.classe.supplenze`, `nonVerbalizzati` su `didattica.pianiPersonalizzati`.

## Test

- **Supplenze** (estende `test/unit/application/context-engine/swap-supplenti.test.ts`):
  - popolato anche con `gestioneSupplenti = SOLO_TITOLARI` (nessun swap nel VM
    ma supplenza presente nel nuovo path);
  - aggregazione per coppia: un item con materie combinate quando una
    supplenza copre più slot;
  - proiezione `dettaglioMaterie`: `SubjectVM` base (`sigla`, `nome`,
    `nomeSintetico`) senza `docenti`;
  - forma PersonVM di `supplente`/`titolare` (appellativoCompleto, nomeCompleto);
  - sempre presente, `[]` per classi senza supplenze attive (come
    `focus.classe.studenti.perSpecificita`).
- **nonVerbalizzati** (estende `test/unit/application/context-engine/piani-pers-classe-provider.test.ts`):
  - esclusione di `stato = VERBALIZZATO`, inclusione di `GENERATO`/`NOTIFICATO`;
  - `isPresenteLista` true/false;
  - forma `elenco[]` (`studente.nomeCompleto`/`email`, `tipoLabel`);
  - attivazione nelle recipe `CLASSE_COMPLETA` e `DOCENTE_COMPLETO`.

## Verifica

`npm run typecheck`, `npm run lint`, `npm test` (suite unit con i nuovi casi),
`npm run test:integration` e `npm run test:build`. Se il percorso online viene
toccato dai mock, aggiornare anche `src/onlinetests/` e verificare con
`npm run test:online` locale prima del push.
