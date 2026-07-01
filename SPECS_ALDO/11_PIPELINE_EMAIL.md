# 11 — Pipeline Email e Box Rendering System

La `NotificaPipeline` governa la preparazione e l'invio massivo o singolo di email HTML basate sui pattern configurati in `CONF_MAIL`. La pipeline DEVE essere **data-driven**: il suo comportamento DEVE essere interamente governato dai record `CONF_MAIL`, senza alcuna logica hard-coded.

**Libreria di riferimento:** `PipelineFramework` (L3), `ComposableContentLib` (L4) per i box renderer.

---

## 1. Architettura

```
EmailNotificationService
        ↓
  NotificaPipeline (8 step, incluso ValutaCondizioniInvioStep condizionale)
        ↓
  Box Rendering System (renderer modulari per tipo box)
        ↓
  GmailServiceFacade (invio via GmailApp)
```

---

## 2. Flusso completo — Riepilogo

```
NotificaPipeline (8 step):

  1. BuildCDUStep              → CDU per destinatario, legge CONF_MAIL.PROCESSO
  2. ValutaCondizioniInvioStep → condizioni dinamiche invio (skip silenzioso se false)
  3. RenderBoxesStep           → HTML box da CONF_MAIL.BOX_CFG (ordinati per ORDINE)
  4. ComposeEmailStep          → msgstart + header + saluto + TESTO + box + footer + msgend
  5. ResolveRecipientsStep     → destinatari finali da CONF_MAIL.SUPPLENTI + SUPPLENZE
  6. SendEmailStep             → invio via GmailServiceFacade (BCC supervisore hardcoded)
  7. LogEmailStep              → record in LOG_MAIL
  8. PostProcessEmailStep      → azioni CONF_MAIL.POST_PROCESSO (solo se successo)
```

---

## 3. Step 1 — BuildCDUStep

**Scopo:** Costruire il CDU specifico per il destinatario corrente e arricchire `cdu.destinatario`.

**Colonne DB lette:** `CONF_MAIL.PROCESSO`

**Logica:**
- Determina la recipe in base a `CONF_MAIL.PROCESSO`:
  - `PER_COORDINATORE` / `PER_DOCENTE` / `PER_CDC` → `DOCENTE_COMPLETO`
  - `PER_ALUNNO` → `ALUNNO_COMPLETO`
  - `PER_GENITORI_ALUNNO` → `FAMIGLIA_COMPLETO`
  - `PER_CARENZA` → `CARENZA_COMPLETO`
- Costruisce il CDU tramite `contextBuilder.build(entryPoint, recipe)`
- Arricchisce `cdu.destinatario` con ruoli, flags e comunicazione personalizzata

**Valori `CONF_MAIL.PROCESSO` e relativi comportamenti:**

| Valore | Iterazione | Destinatario singolo | Gestione supplenze |
|--------|-----------|----------------------|--------------------|
| `PER_COORDINATORE` | Una email per Coordinatore | set Docente coordinatore | Sì — multi-classe |
| `PER_DOCENTE` | Una email per Docente con almeno una classe attiva | Docente (singolo) | Sì |
| `PER_CDC` | Una email per classe | Set docenti (TO multiplo) | Sì |
| `PER_ALUNNO` | Una email per ogni alunno attivo | Alunno | No |
| `PER_GENITORI_ALUNNO` | Una email per ogni Tutore per ogni alunno | Genitori (TO multiplo, deduplicati per famiglie con più figli) | No |
| `PER_CARENZA` | Una email per ogni record `CARENZE` con `NOTIFICATO` null o vuoto (via `CarenzeNonNotificateSpec`) | Genitori dell'alunno con carenze | No |

**Nota `PER_CARENZA`:** priorità genitore su alunno — se `genitoreOggetto` è presente nel contesto, è usato come destinatario, non `alunnoOggetto`.

---

## 4. Step 2 — ValutaCondizioniInvioStep

**Scopo:** Valutare se la notifica deve essere inviata in base a condizioni configurate. Consente di saltare silenziosamente la pipeline per destinatari che non soddisfano certi criteri. Eseguito **dopo** `BuildCDUStep` perché le condizioni possono fare riferimento a percorsi del CDU del destinatario (es. `{{focus.alunno.status.isBes}}`), non ancora disponibili prima della costruzione del CDU.

**Colonne DB lette:** `CONF_MAIL.CONDIZIONE`

**Logica:**
- Se `CONF_MAIL.CONDIZIONE` è null o vuoto → `shouldSend = true`
- Altrimenti → valuta l'espressione tramite `GasExpressionEngineLib` (L2) con il CDU del destinatario corrente come contesto (stesso meccanismo di `CONF_DOC.CONDIZIONE`)
- Tutti gli step successivi verificano `shouldSend = true`

---

## 5. Step 3 — RenderBoxesStep

**Scopo:** Generare l'HTML per ogni box dinamico configurato in `CONF_MAIL.BOX_CFG`.

**Colonne DB lette:** `CONF_MAIL.BOX_CFG`, `CONF_MAIL.OGGETTO`  
**Tabelle sorgente dati dei box:** `ALUNNI`, `CLASSI`, `DOCENTI`, `CARENZE`, `LOG_DOCS`, `PIANI`

**Logica:**
1. Parsa `BOX_CFG` come array di `BoxConfig`
2. Per ogni `boxConfig` (ordinati per `ORDINE`):
   - Se `boxConfig.PREREQUISITI` è definito, valuta ciascun prerequisito (stesso meccanismo di `DATI_SORGENTE`); se almeno uno non è soddisfatto, il box è skippato (`html = ""`) senza invocare il renderer
   - Recupera il renderer dal `boxRendererRegistry` tramite `TIPO_BOX`
   - Se non trovato → warning, skip
   - `html = renderer.render(cdu, boxConfig)`
   - Se `html === ""` e `boxConfig.MOSTRA_SE_VUOTO === true` → sostituisce `html` con `boxConfig.TESTO_VUOTO` risolto tramite `WorkspaceTemplateEngine`
   - Scrive in `cdu.render.boxes[TIPO_BOX]`: `{ id, titolo, html, isEmpty, visibile }` (`isEmpty` riflette l'output originale del renderer; `visibile` riflette l'`html` finale dopo l'eventuale fallback)
3. Risolve l'oggetto email tramite `WorkspaceTemplateEngine`

---

## 6. Step 4 — ComposeEmailStep

**Scopo:** Assemblare il corpo HTML completo dell'email.

**Struttura dell'email assemblata:**

```
1. msgstart — DOCTYPE html, head, body max-width 600px, box-shadow
2. header colorato — colore da `CONF_MAIL.COLORE_HEADER` (default `#007bff` se non specificato, vedi `01_SCHEMA_DATABASE.md`); titolo = OGGETTO risolto
3. <div padding 20px>
4.   saluto — _renderSaluto() polimorfico
5.   testo statico — WorkspaceTemplateEngine.render(CONF_MAIL.TESTO, cdu)
6.   box dinamici — ordinati per BOX_CFG[].ORDINE, skippati se vuoti
                    (eccetto TIPO_BOX = 'testo_dinamico', sempre incluso)
7.   footer — disclaimer "comunicazione automatica" + eventuale noReply
8. </div>
9. msgend — chiusura contenitore, body, html
```

**Saluto polimorfico:**
- 0 destinatari → `"Gentile Utente"`
- 1 destinatario → `dest.ottieniStringaSaluti()`:
  - Docente → `"Gentile Prof. Rossi"` / `"Gentile Prof.ssa Bianchi"`
  - Alunno → `"Gentile Mario"`
  - Genitore → `"Gentili Genitori"`
- N destinatari (TO multiplo) → saluto plurale se uniforme, altrimenti `"Gentili Destinatari"`

**Footer noReply:**
```html
<div>
  <p>Questa è una comunicazione automatica.</p>
  <!-- Se CONF_MAIL.NOREPLY = true: -->
  <p><strong>⚠️ La risposta a questa email non sarà monitorata.</strong></p>
</div>
```

**Supervisore in BCC:** ogni email inviata DEVE includere automaticamente in BCC l'indirizzo del supervisore di sistema, letto dalla colonna `SUPERVISORE_EMAIL` del Master Sheet (vedi `01_SCHEMA_DATABASE.md`). Questo comportamento è hardcoded in `SendEmailStep` e NON DEVE essere configurabile da `CONF_MAIL`.

> **NOTA DI IMPLEMENTAZIONE:** Se `SUPERVISORE_EMAIL` è vuoto per l'anno scolastico corrente, `SendEmailStep` DEVE loggare un warning tramite `LoggerService` (L0) con livello `WARN` e NON DEVE interrompere il flusso: l'email viene consegnata normalmente senza BCC. L'assenza del supervisore NON è un errore critico di invio.

---

## 7. Step 5 — ResolveRecipientsStep

**Scopo:** Applicare le regole di gestione supplenze per determinare i destinatari finali.

**Colonne DB lette:** `CONF_MAIL.SUPPLENTI`, `SUPPLENZE`

**Logica per destinatari docenti:**

*Caso standard:*
- Cerca `SupplenzaRepository.findSupplenzaSpecifica(docente, oggi, classeId)`
- Se il supplente trovato è a sua volta titolare di un'altra supplenza attiva per lo stesso contesto, la ricerca segue la catena ricorsivamente fino al sostituto effettivo (vedi `06_REPOSITORY.md`)
- Applica `CONF_MAIL.SUPPLENTI`:
  - `SOLO_TITOLARI` → `[titolare.email]`
  - `SOLO_SUPPLENTI` → `[supplente.email]`
  - `ENTRAMBI` → `[titolare.email, supplente.email]`

*Caso coordinatore multi-classe:*
- Per ogni classe coordinata, determina separatamente la presenza di una supplenza
- `GestoreSupplenze.ottieniClassiNonSostituite()` e `ottieniSupplentiPerClasse()` gestiscono la distribuzione per classe

**Logica per PER_CDC:**
- Destinatari finali = `[{ emailsMultiple: docentiClasse.map(d => d.email) }]`
- Non soggetto a regola SUPPLENTI

**Logica per genitori/alunni:**
- `PER_GENITORI_ALUNNO` / `PER_CARENZA` → `[{ emailsMultiple: [TUTOR_1, TUTOR_2] }]`

---

## 8. Step 6 — SendEmailStep

**Scopo:** Inviare fisicamente l'email tramite `GmailServiceFacade`.

**Colonne DB lette:** `CONF_MAIL.NOREPLY`

**Logica:**
- Per ogni destinatario in `destinatariFinali`:
  - `emailTo = destinatario.emailsMultiple ?? [destinatario.email]`
  - Try: `gmailFacade.sendEmail(emailTo, oggetto, '', { htmlBody, attachments, noReply, bcc: [SUPERVISORE_EMAIL] })`
  - Catch: DEVE loggare l'errore, aggiungerlo a `context.errori` e NON DEVE interrompere la pipeline

---

## 9. Step 7 — LogEmailStep

**Scopo:** Registrare l'invio in `LOG_MAIL`.

**Colonne DB scritte in LOG_MAIL:** `PATTERN`, `DESTINATARI`, `DATA`, `STATO`, `ALLEGATI`, `ERRORE` (LOG_MAIL non ha colonna `ID`: la chiave primaria è composita `(PATTERN, DESTINATARI, DATA)`, vedi `01_SCHEMA_DATABASE.md`)

**Logica:**
- `STATO = errori.length > 0 ? ERROR : SUCCESS`
- `allegatiInfo = { docs: [...driveFileIds], folders: [] }`
- `logMailRepository.registraInvio(patternId, destinatariFinali, stato, allegatiInfo, messaggioErrore)`
- `database.save()`

---

## 10. Step 8 — PostProcessEmailStep

**Scopo:** Eseguire le azioni post-invio configurate in `CONF_MAIL.POST_PROCESSO`, SOLO se almeno un invio è riuscito.

**Azioni supportate:** `INSERISCI_TIMESTAMP`, `AGGIORNA_CAMPO`, `AGGIORNA_STATO_DOC` (stesso meccanismo di `CONF_DOC.POST_PROCESSO`)

**Caso d'uso principale:** marcatura delle carenze come notificate.

Esempio:
```json
[
  {
    "tipo": "INSERISCI_TIMESTAMP",
    "tab": "CARENZE",
    "col": "NOTIFICATO",
    "criteri": {
      "STUDENTE": "{{focus.alunno.anagrafica.email}}",
      "DATA": "{{focus.carenza.data}}"
    }
  }
]
```

Questo garantisce che successive esecuzioni del processo `PER_CARENZA` non inviino email duplicate (la `CarenzeNonNotificateSpec` filtra per `NOTIFICATO IS NULL`).

**Persistenza:** ogni azione marca dirty il record corrispondente; lo step termina con una chiamata esplicita a `database.save()`, poiché queste modifiche avvengono dopo il `database.save()` già eseguito in `LogEmailStep` (Step 7).

---

## 11. Box Rendering System

### Modello del renderer

Ogni renderer DEVE essere una **funzione pura** registrata nel `RegistroRendererBox`:

```
renderer(boxConfig, dati, contesto): string
  — boxConfig: configurazione del box (TIPO_BOX, TITOLO, ORDINE, …)
  — dati: array di dati fornito da aggregatoreDati (già filtrato per destinatario)
  — contesto: CDU arricchito + { servizi: { logger, placeholderService, gestoreDocumenti } }
  — return: stringa HTML interna al box, o "" per nascondere il box
```

Il `FormattatoreDatiEmail` wrappa ogni stringa non vuota in un contenitore standard:

```html
<div style="margin:20px 0; padding:15px; border-left:4px solid {coloreBordo}; background-color:#f9f9f9;">
  <h3 style="margin:0 0 10px 0; color:#333; font-size:16px;">{TITOLO}</h3>
  {contenutoInterno}
</div>
```

Il `coloreBordo` viene risolto da `MATERIE.COLORE_1` tramite `gestoreDocumenti.ottieniPerTipoDocumento(TIPO_BOX)`; default `#ddd`.

I box vengono ordinati per `BOX_CFG[].ORDINE` crescente prima del rendering.

---

### Box registrati

| `TIPO_BOX` | Renderer | Visibile se |
|------------|----------|-------------|
| `carenze` | `renderCarenzeBox` | Almeno una materia con carenza |
| `documenti` | `renderDocumentiBox` | Almeno un documento |
| `cartelle` | `renderDocumentiBox` | Almeno una cartella |
| `note` | `renderNoteBox` | Campo `NOTE` della carenza valorizzato |
| `assenze` | `renderAssenzeBox` | Flag `ASSENZE = true` |
| `testo_dinamico` | `renderTestoDinamicoBox` | Sempre visibile (MOSTRA_SE_VUOTO implicito) |

---

### `renderCarenzeBox`

Visualizza ogni materia con carenza in un **box stilizzato separato** con colore specifico per materia.

Colori da `MATERIE.COLORE_1` (bordo) e `MATERIE.COLORE_2` (sfondo). Simbolo da `MATERIE.SIMBOLO`.

Supporta due formati input:
- **Formato A** (`dettagliMaterie`): oggetti con `materia.COLORE_1`, `materia.NOME`, ecc.
- **Formato B** (output di `CarenzeMapper`): oggetti con `sigla`, `nome`, `colore`, `colore2`, `simbolo`, `nomeSintesi`, `descrizione`

Output HTML esempio (singola materia):
```html
<div style="border-left:4px solid #c0392b; padding:12px 12px 12px 16px; margin-bottom:10px;">
  <h3 style="margin:0 0 8px 0; font-size:16px; color:#333;">📐 Matematica</h3>
  <div style="font-size:14px; color:#555; line-height:1.5;">
    Voto 4 nel secondo quadrimestre.
  </div>
</div>
```

---

### `renderDocumentiBox`

Visualizza documenti Google Drive con link. Due modalità:

**Modalità standard:** ogni item ha `ottieniLink()`, `ottieniNome()`, `ottieniClasseAssociata()`. I documenti vengono raggruppati per classe in liste `<ul>`.

**Modalità arricchita** (`arricchisciConStorico`): ogni item ha `{ corrente: DocumentoEntity, storico: LazyRef }`. Il renderer esegue il lazy loading dello storico e usa `configArricchimento.templateRiga` (template Mustache) per costruire ogni riga con accesso a `{{corrente.*}}` e `{{storico.*}}`.

---

### `renderNoteBox`

Visualizza il testo libero del campo `CARENZE.NOTE` della carenza corrente. Restituisce `""` se il campo è vuoto.

---

### `renderAssenzeBox`

Visualizza una segnalazione standardizzata di assenze elevate se `CARENZE.ASSENZE = true`. Non mostra testo libero. Restituisce `""` se il flag è `false` o assente.

---

### `renderTestoDinamicoBox`

Renderizza il template HTML configurato in `boxConfig.CONTENUTO`, risolvendo i placeholder Mustache tramite `placeholderService`. Sempre visibile indipendentemente dai dati (`MOSTRA_SE_VUOTO` implicito).

---

## 12. Risoluzione Destinatari per Processo — Note Implementative

**`PER_COORDINATORE`:** un coordinatore che gestisce più classi può avere supplenti diversi per classi diverse. Il sistema determina separatamente le classi non sostituite e quelle coperte da supplenti.

**`PER_CDC`:** destinatari = email di tutti i docenti CDC concatenate in un unico messaggio TO multiplo. Non soggetto a regola SUPPLENTI.

**`PER_GENITORI_ALUNNO`:** quando un genitore ha più figli nella stessa classe, viene deduplicato. Ogni famiglia riceve un'unica email con TO multiplo e saluto `"Gentili Genitori"`.

**`PER_CARENZA`:** priorità genitore su alunno — se `genitoreOggetto` è presente, è usato come destinatario (non `alunnoOggetto`).

**Classi articolate:** `CONF_MAIL` non ha un campo equivalente a `CONF_DOC.GESTIONE_ARTICOLAZIONE`. Per i processi `PER_CDC` e `PER_COORDINATORE`, l'entry point su una classe articolata è sempre la classe parent: viene generata una sola email aggregata per l'intero gruppo (vedi `05_AGGREGATI_E_CLASSI_ARTICOLATE.md` §5).

---

## 13. Allegati

Gli allegati vengono risolti nel `ComposeEmailStep`:

```
resolveAllegati(cdu, pattern):
  Se cdu.focus.classe:
    documenti = logDocRepository.findByClasse(classe)
    filtra per tipo o stato se configurato tramite i campi opzionali in BOX_CFG.DATI_SORGENTE.filtri
    carica ogni file da Drive tramite DriveServiceFacade → getBlob()
  Return array di Blob
```

---

## 14. Gestione Quote Gmail e Processi Lunghi

| Account | Email/giorno |
|---------|-------------|
| Google gratuito | 100 |
| Google Workspace | 1.500 |

Per volumi > 500 email, l'`EmailNotificationService` usa `JobRunnerLib` (L3): chunking in gruppi da 100, checkpoint `yield` dopo ogni gruppo, pausa configurabile tra chunk. Dettagli in `15_UI_E_JOB_RUNNER.md`.

---

## 15. Test Mode

L'`EmailNotificationService` espone `enableTestMode(email)`. Se attivo, tutte le email vengono inviate al destinatario di test invece che a quelli reali, permettendo di eseguire l'intera pipeline senza impatto sulla produzione.

---

## 16. Retry Invii Falliti

L'`EmailRetryService` scandisce `LOG_MAIL` per record con `STATO = ERROR`. Per ogni record con meno di `maxTentativi` (default 3) tentativi precedenti, tenta il re-invio; in caso di successo DEVE aggiornare `STATO = SUCCESS`. Dopo `maxTentativi` fallimenti, DEVE registrare l'errore come permanente e notificare l'admin.
