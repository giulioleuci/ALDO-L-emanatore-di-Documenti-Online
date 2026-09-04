# Permessi storici dei piani personalizzati

## Obiettivo

Quando viene generato un piano personalizzato per un alunno nella classe corrente,
assegnare ai ruoli correnti configurati anche il permesso sui documenti omologhi
registrati negli anni precedenti. Questo permette ai coordinatori della nuova
classe di leggere il piano storico da inviare tramite `CONF_MAIL`.

## Configurazione

`CONF_DOC.POST_PROCESSO` supporta l'azione documentale:

```json
{
  "tipo": "AGGIORNA_PERMESSI_STORICI",
  "ruolo": "COORDINATORI",
  "permesso": "LETTURA",
  "target": "PIANI_PERSONALIZZATI",
  "criteri": {
    "UTENTI": "{{focus.alunno.email}}",
    "SOTTOTIPO": "{{focus.piano.tipo}}"
  },
  "profondita": 1
}
```

`criteri` è facoltativo. Può contenere `UTENTI`, `SOTTOTIPO`, `TIPO`, `CLASSI`
e `MATERIE` in qualsiasi combinazione. `UTENTI`, `CLASSI` e `MATERIE` fanno
matching per contenimento CSV; `TIPO` e `SOTTOTIPO` per uguaglianza esatta.
I valori sono risolti da `WorkspaceTemplateEngine` sul CDU corrente.

`ID_GEN=target` è sempre aggiunto dal sistema; senza criteri l'azione seleziona
tutti i documenti storici di quel generatore entro `profondita`.

## Architettura

`Bootstrap` registra un solo `MasterStoricoDatabaseProvider`, condiviso dal
`ContextEngine` e da `StoricoDocumentiService`. Il provider riusa il Master
Sheet esistente: `profondita=1` legge la prima riga storica, `profondita=n` le
prime `n` righe storiche.

`StoricoDocumentiService` espone il minimo necessario per ricavare gli ID Drive
dei `LOG_DOCS` storici che rispettano `ID_GEN` e i criteri. La query resta nel
perimetro dello storico esistente: non apre fogli tramite API native e non
duplica la logica di lettura del Master.

`executePostProcess` conserva la grammatica e le azioni condivise esistenti.
`PostProcessStep` documentale gli fornisce l'handler di
`AGGIORNA_PERMESSI_STORICI`; il percorso `CONF_MAIL` non riceve tale handler e
non cambia comportamento.

L'handler:

1. risolve i criteri sul CDU e aggiunge `ID_GEN=target`;
2. cerca gli ID storici fino alla profondità configurata;
3. esclude `newFileId`;
4. risolve `ruolo` dal CDU corrente tramite `RisolutoreRuoliService`;
5. invia a `IDriveFacade.setPermissions()` i grant file storico × email, con
   `permesso` configurato.

La facciata Drive già raggruppa i grant per file e permesso, quindi non serve un
nuovo batching locale.

## Errori

`target`, `ruolo`, `permesso` e una `profondita` positiva sono richiesti;
`criteri` non lo è. Una configurazione non valida, una lettura storica fallita o
un errore Drive falliscono solo il `PostProcessStep`: il documento corrente è
già registrato e non viene annullato, mentre il fallimento resta nella telemetria
della pipeline.

## Verifiche

- Unit: riconoscimento dell'azione, template, profondità, tutti i criteri e la
  loro congiunzione, assenza di criteri, esclusione del file corrente, ruolo dal
  CDU corrente e grant Drive corretti.
- Integrazione: piano `PDP_BES` 3D → 4D aggiorna lo storico; tipo diverso o
  alunno diverso non produce grant.
- Aggiornare lo schema e il seed online di `PIANI_PERSONALIZZATI` con l'azione.

## Fuori ambito

Nessuna estensione di `GasLibraryFactory`: `WorkspaceTemplateEngine`,
`SheetDBLib`, `RoleResolutionLib`, `PipelineFramework` e la facciata Drive
coprono già le rispettive responsabilità.
