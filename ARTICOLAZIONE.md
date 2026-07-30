# Gestione delle classi articolate in ALDO

Questo documento descrive come SGSA/ALDO gestisce le **classi articolate**
(una classe "parent" — es. `3C` — unione di due classi "partner" con
indirizzi di studio diversi, es. `3C-S`/`3C-C`) lungo tre assi: generazione
documenti, invio email, costruzione del CDU. Include le lacune trovate
durante lo sviluppo di `DOCUMENTO_COMPLESSO_CLASSE_ARTICOLATA`
(`docs/superpowers/specs/2026-07-30-classe-articolata-report-design.md`).

## 1. Generatori di documenti

Un `CONF_DOC` separa due concetti (`ConfigurazioneDocumento.ts:17-32`):
- `TIPO` — etichetta descrittiva libera (es. `REPORT_COMPLESSO`,
  `DOCUMENTO_COMPLESSO_CLASSE_ARTICOLATA`).
- `GENERATORE` — chiave nel registro delle `GeneratorStrategy`
  (`DocumentGenerationService.ts:96`, `strategyRegistry.has(config.generatore)`).

Non esiste una `GeneratorStrategy` dedicata alle classi articolate: sia
`REPORT_COMPLESSO` che `DOCUMENTO_COMPLESSO_CLASSE_ARTICOLATA` usano
`DOCUMENTO_GENERICO` (`DocumentoGenericoGeneratorStrategy.ts`) — pura
sostituzione di placeholder via `WorkspaceTemplateEngine`, nessuna logica
di generazione specifica per l'articolazione.

`DocumentGenerationService.generateForClasse` (`DocumentGenerationService.ts:88-141`)
accetta un singolo `ClasseId`. Non esiste un concetto di "genera un
documento per l'intero gruppo articolato": quando il target è la classe
parent, il documento viene generato UNA volta, e tutto il contenuto
multi-gruppo (studenti, docenti, rappresentanti, coordinatori di entrambe
le partner) deve arrivare attraverso il CDU — vedi sezione 2. Puntare un
`CONF_DOC` a una classe partner invece che al parent produce un documento
che vede solo quella metà del gruppo.

**`COL_CONF_DOC.GESTIONE_ARTICOLAZIONE` è una colonna morta.** È presente
nello schema, viene seminata in ogni riga `CONF_DOC` di test (sempre `''`,
salvo un `'COMPLETA'` isolato in alcuni fixture di `contextEngineChecks.ts`),
ma non viene letta da nessun punto di `src/application` — grep su
`gestioneArticolazione`/`GESTIONE_ARTICOLAZIONE` in quella directory non
produce risultati. Non ha alcun effetto sul comportamento attuale.

`ApplyPermissionsStep`/`RegisterDocumentStep` (`documentSteps.ts`) non
contengono alcuna logica di articolazione — operano genericamente sul CDU
via `CONF_DOC.PERMESSI`/`REGISTRA_DOC` (placeholder come
`{{focus.classe.anagrafica.nome}}`), quindi per un target parent
registrano/applicano permessi sul nome della classe parent, correttamente
e senza bisogno di codice dedicato. Non è una lacuna: è un'area
confermata "non ne ha bisogno" durante questo lavoro.

## 2. Costruzione del CDU

Il pattern generale per una classe parent è: **il provider deve espandersi
esplicitamente sulle classi partner**, perché nessuno studente ha mai
`ALUNNI.CLASSE` uguale all'id della classe parent — solo le due classi
partner hanno studenti reali.

- `studentiDellaClasse` (`src/application/context-engine/studenti.ts:10-20`)
  fa già questa espansione: se `getArticolazione(classe).isParent()`,
  concatena `getStudenti` su ciascun `getClassiPartner(classe)`.
  `StudentiProvider` (`providers/StudentiProvider.ts`) segue lo stesso
  pattern per costruire `studenti.listaCompleta`/`.perIndirizzo`, e — da
  questo lavoro — ogni `AlunnoContestoVM` porta anche il proprio
  `indirizzo` (major), quello della classe partner di appartenenza, non
  quello (inesistente/ambiguo) della parent.

- **`RappresentantiProvider` e `ClasseProvider.coordinatori` NON facevano
  questa espansione fino a questo lavoro** — leggevano rispettivamente
  `classi.getStudenti(classe)` e `classi.getCoordinatori(classe)`
  direttamente sulla classe focus. Per una classe parent, questo
  significava:
  - `rappresentanti.studenti`/`.genitori` sempre vuoti (nessuno studente
    appartiene mai alla parent).
  - `coordinatori` vuoto o errato (la riga `COORD` della parent è
    tipicamente vuota — vedi `E2eSampleDatabaseBuilder.ts:470` — mentre i
    coordinatori reali vivono sulle righe partner, distinti per gruppo fin
    dai commit `f01e3e6`/`b771f6d`, ma mai letti dal CDU).

  Questo era un bug generale: **qualunque documento** puntato alla classe
  parent (non solo `DOCUMENTO_COMPLESSO_CLASSE_ARTICOLATA`) riceveva
  rappresentanti/coordinatori vuoti o sbagliati. Fixato in questo lavoro:
  entrambi i provider ora seguono lo stesso pattern di
  `studentiDellaClasse` (iterano `getClassiPartner`), taggando ogni
  voce con `indirizzo: { nome }` del gruppo di provenienza.

- `consiglioDiClasse` (`DocenteCdcVM[]`, costruito da
  `TeachingCouncilProjection.councilVmStrategy`) era invece **già
  corretto** per il gruppo articolato: il resolver GLF sottostante
  (`AldoTeachingAssignmentResolver`/`CattedraResolver`, delegato via GLF —
  commit `5051dfc "refactor: delegate teaching resolution to GLF"`) risolve
  già gli assignment su entrambe le classi partner quando il focus è la
  parent, e ogni docente viene taggato `tipoArticolazione`:
  `'COMUNE'` (stesso docente/materia in entrambe le partner),
  `'SEPARATO_PRIMO'`/`'SEPARATO_SECONDO'` (solo in una), calcolato
  confrontando gli id-classe degli assignment con
  `orderedPartners(classe)` (`TeachingCouncilProjection.ts:169-184`).
  Mancava solo la ***risoluzione del nome*** del gruppo (il tag era
  puramente simbolico) e una stringa già pronta delle materie per
  docente — aggiunte in questo lavoro come `gruppoNome`/
  `materieDescrizione`, oltre a due array già filtrati
  (`consiglioDiClasseComune`/`consiglioDiClasseSeparato`) così che i
  template non debbano fare filtering lato placeholder.

- La divisione materie condivise/separate a livello di classe (non di
  singolo docente) vive in
  `ClasseRepository.getMaterieArticolazione` (`ClasseRepository.ts`,
  confronta gli insiemi di docenti per materia tra le due partner
  ordinate via `orderedPartners`) ed è esposta in CDU come
  `focus.classe.articolazione.{materieCondivise,materieSeparatePrimoGruppo,materieSeparateSecondoGruppo}`
  (solo sigle di materia, non nomi di docenti).

## 3. Invio email

L'instradamento email era già "articulation-aware" prima di questo
lavoro, indipendentemente dal CDU documentale:

- `RisolutoreRuoliService.genitoriClasse` (`RisolutoreRuoliService.ts:267-269`)
  usa `classi.getStudenti(ctx.classe, true).flatMap(getTutors)` — nota che
  usa i tutor (`TUTOR_1`/`TUTOR_2`), non `RAPPR_GEN`, e comunque opera
  sulla classe passata nel contesto di invio (che per gli scenari
  coordinatore-aggregato è già la classe corretta, non la parent vuota).
- `EmailNotificationService.classiCompetenza`/`targetsPerCoordinatore`
  (`EmailNotificationService.ts:292-297,331-365`) instradano
  esplicitamente per partner — è il fix "route articulated coordinators
  by partner" (commit `f01e3e6`), con relativo modello di dati
  "distinct articulated coordinators" (commit `b771f6d`, che ha esteso
  anche `E2eSampleDatabaseBuilder`/`e2eScenarioChecks` per i due
  coordinatori realmente distinti di `3C-S`/`3C-C`, usati anche dallo
  scenario e2e di questo lavoro come prova che il merge CDU funziona).

Il contrasto prima di questo lavoro era quindi: **l'invio email sapeva
già gestire coordinatori distinti per partner; la costruzione del CDU
documentale no.** Le due cose vivevano in codice completamente separato
(`EmailNotificationService` vs. `ClasseProvider`) e non condividevano
alcuna logica di espansione — motivo per cui il bug in sezione 2 è potuto
restare latente: nessuno scenario e2e esistente generava mai un
documento puntato alla classe parent e ne ispezionava
rappresentanti/coordinatori.

## 4. Lacune (aggiornato dopo il fix)

| Lacuna | Stato |
|---|---|
| `COL_CONF_DOC.GESTIONE_ARTICOLAZIONE` mai letta in `src/application` | Aperta — non affrontata in questo lavoro (fuori scope, richiede una vera decisione di design su cosa dovrebbe fare) |
| `RappresentantiProvider` non espandeva sulle partner per una classe parent | **Fixata** in questo lavoro (Task 2) |
| `ClasseProvider.coordinatori` non espandeva sulle partner per una classe parent | **Fixata** in questo lavoro (Task 3) |
| `consiglioDiClasse` mancava nome del gruppo/major e stringa materie pronta | **Fixata** in questo lavoro (Task 4) |
| Nessun modo di generare "un solo documento per il gruppo" diverso da puntare alla parent + CDU espanso | Aperta — architetturalmente non esiste un target "gruppo articolato" di prima classe in `DocumentGenerationService`; funziona solo perché i provider ora si espandono internamente quando il focus è la parent |
| Fixture e2e: tutte le classi (comprese le due partner di `3C`) condividono lo stesso `INDIRIZZI` id (`IND_E2E`) | Aperta — non blocca la correttezza (ogni entità viene comunque taggata con l'indirizzo della propria classe di provenienza), ma rende la demo del nuovo documento meno leggibile: entrambi i gruppi mostrano lo stesso nome di indirizzo tra parentesi. Non affrontata in questo lavoro per non toccare il seeding condiviso da tutti gli altri scenari e2e. |
