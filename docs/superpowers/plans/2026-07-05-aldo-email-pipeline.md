# ALDO — Email Pipeline (SPECS_ALDO/11) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the complete email-notification subsystem of SGSA: the 8-step `NotificaPipeline`, the Box Rendering System on `ComposableContentLib`, `EmailNotificationService` (all six `CONF_MAIL.PROCESSO` values, test mode), `EmailRetryService`, the shared `POST_PROCESSO` action executor (also completing the document pipeline's 10 §12 stub), and JobRunner-based batch sending.

**Architecture:** Steps extend the vendored PipelineFramework `Step` (same pattern as `documentSteps.ts`); the pipeline runs **without** a DB transaction (sends are irreversible; spec 11 §9/§10 mandates explicit `save()` in steps 7–8). Box renderers are ALDO template *functions* registered on a ComposableContentLib `HtmlRenderer`; each `TIPO_BOX` is a `SimpleContentBlock` in the library `BlockRegistry`; `RenderBoxesStep` maps `CONF_MAIL.BOX_CFG` → `CompositionRecipe` and runs `ContentComposer`. Recipient enumeration lives in `EmailNotificationService`; supplente resolution reuses `SupplenzaRepository.findSupplenzaSpecifica`. Physical send goes through a new `IGmailFacade` port over the vendored GoogleApiWrapper `MailService`.

**Tech Stack:** TypeScript 5 max-strict, Jest 30, vendored GasLibraryFactory bundle (PipelineFramework L3, ComposableContentLib L4, GoogleApiWrapper L2, GasExpressionEngineLib L2, WorkspaceTemplateEngine L2, JobRunnerLib L3).

## Global Constraints

- GAS V8, synchronous only; native GAS globals only under `src/infrastructure/facades/**` (ESLint-enforced).
- Table/column names verbatim UPPERCASE from `01_SCHEMA_DATABASE.md`; CDU paths verbatim from `02_CDU_STRUTTURA.md`.
- No `throw new Error` outside facades/tests — typed `DomainError` subclasses.
- Never reimplement GasLibraryFactory functionality (composition, pipeline, expression eval, placeholder render, mail send, job resume are ALL library concerns).
- `LOG_MAIL` has composite PK `(PATTERN, DESTINATARI, DATA)` — no ID column.
- Supervisor BCC is hardcoded behavior (spec 11 §6), read from `MASTER.SUPERVISORE_EMAIL` of the current year; empty ⇒ WARN log, send proceeds without BCC.
- `SheetDBLib` forbids `save()` during an open transaction ⇒ email pipeline uses **no transaction**; `LogEmailRepository.registraInvio` already calls `database.save()`.
- Branch: `aldo-email-pipeline`, merged to master when green.

## Context keys contract (across all 8 steps)

Seeded by the service: `config` (CONF_MAIL Row), `confMail` (ConfigurazioneEmail), `emailTarget` (EmailTarget), `now` (Date), `testEmail` (string|null).
Produced: `cdu` (Step 1), `shouldSend` (Step 2), `oggettoRisolto` (Step 3), `corpoHtml`, `allegati` (Step 4), `destinatariFinali: Array<{emails: string[]}>` (Step 5), `sendErrors: string[]`, `sentCount: number` (Step 6), `logStato` (Step 7).

Recipe per PROCESSO (spec 11 §3): PER_COORDINATORE/PER_DOCENTE/PER_CDC → `DOCENTE_COMPLETO`; PER_ALUNNO → `ALUNNO_COMPLETO`; PER_GENITORI_ALUNNO → `FAMIGLIA_COMPLETO`; PER_CARENZA → `CARENZA_COMPLETO`.

`EmailTarget` (produced by service enumeration, consumed by steps 1/5):
```ts
export interface EmailTarget {
  tipo: 'docente' | 'cdc' | 'alunno' | 'genitori';
  tipoTarget: 'classe' | 'alunno';
  /** ClasseId value or alunno email — the CDU build entry point. */
  target: string;
  /** For docente targets: the titolare being addressed. */
  docenteEmail?: string;
  /** Raw candidate emails (docente/cdc docenti/alunno/tutors). */
  emails: string[];
  /** For coordinatore multi-classe: all coordinated class ids. */
  classiCompetenza: string[];
  carenzaProgressivo?: number;
}
```

---

### Task 1: Ambient types + harness assertions for MailService & ComposableContentLib globals

**Files:** Modify `types/gaslibs/index.d.ts`, `test/unit/harness/gaslibs.test.ts`.
**Produces:** globals `MailService` (`send(opts)→{success,error?}`, `sendBatch`, `getQuotaUsage`), `ContentComposer` (`compose(recipe,ctx,opts?)→CompositionResult`, `composeToString`), `BlockRegistry` (`register({definition,factory})`, `has`), `RendererRegistry` (`register`, `get`), `HtmlRenderer` (ctor `{logger?,templates?}` — template values may be `(data, options) => string` functions), `SimpleContentBlock` (ctor `(definition, {dataExtractor, emptyChecker?, templates})`), `BlockDataContext`, `CompositionResult`/`BlockResult` views.
Steps: extend harness test asserting `typeof <global> === 'function'` for each; run (should PASS against the real bundle — this validates the bundle exposes them); add ambient declarations; `npm run typecheck && npm run lint`; commit.

### Task 2: GmailServiceFacade port + FakeGmailFacade

**Files:** Create `src/infrastructure/facades/GmailServiceFacade.ts`, `test/fakes/FakeGmailFacade.ts`; Test `test/unit/infrastructure/gmail-facade.test.ts`.
**Produces:**
```ts
export interface EmailSendOptions {
  to: string[]; subject: string; htmlBody: string;
  bcc?: string[]; noReply?: boolean; attachments?: unknown[];
}
export interface IGmailFacade { sendEmail(opts: EmailSendOptions): { success: boolean; error?: string }; }
export class GmailServiceFacade implements IGmailFacade { constructor(private readonly mail: MailService) {...} } // maps to mail.send({to, subject, body:'', htmlBody, bcc, noReply, attachments})
```
`FakeGmailFacade`: `sent: EmailSendOptions[]`, `failFor: Set<string>` (any `to` in set ⇒ `{success:false,error:'simulated'}`). TDD cycle + commit.

### Task 3: Saluto polimorfico

**Files:** Create `src/application/email/saluto.ts`; Test `test/unit/application/email-saluto.test.ts`.
**Produces:** `salutoPerTarget(target: EmailTarget, docente: Docente|null, alunno: Alunno|null): string` implementing spec 11 §6: docente→`Gentile Prof./Prof.ssa <NomeCompleto>`; alunno→`Gentile <nome>`; genitori→`Gentili Genitori`; cdc/multiple non-uniform→`Gentili Destinatari`; 0 emails→`Gentile Utente`. Also `export interface EmailTarget` lives here (shared vocabulary). TDD + commit.

### Task 4: Box Rendering System on ComposableContentLib

**Files:** Create `src/application/email/boxes.ts`; Test `test/unit/application/email-boxes.test.ts`.
**Produces:** `createBoxComposer(logger, templates: ITemplateEngine): { composer: ContentComposer; }` registering the six blocks (`carenze`, `documenti`, `cartelle`, `note`, `assenze`, `testo_dinamico`) as `SimpleContentBlock`s with data extractors over serializable CDU paths (carenze → `focus.alunno.carenze` in CarenzeMapper format B; documenti/cartelle → `focus.alunno.documenti`; note/assenze → `focus.carenza`), emptyCheckers per the spec visibility table, and template functions producing the spec HTML. `wrapBox(titolo, coloreBordo, inner): string` = FormattatoreDatiEmail container (`border-left:4px solid`, `#f9f9f9`, h3 16px). `renderBoxes(composer, confMail, cdu, templates): { ordered: string[]; boxes: Record<string,{id,titolo,html,isEmpty,visibile}> }` mapping BOX_CFG → `CompositionRecipe` (`instanceId=tipo_i`, `blockType=tipo`, `order=ORDINE??index`, `visibility=PREREQUISITI??'always'`, `config=whole box cfg`), honoring `MOSTRA_SE_VUOTO`/`TESTO_VUOTO` fallback via `templates.processString`. `testo_dinamico` renders `CONTENUTO` via `templates.processString` closure and is always visible. TDD (one test per box + ordering + fallback) + commit.

### Task 5: Steps 1–2 — BuildCDUStep + ValutaCondizioniInvioStep

**Files:** Create `src/infrastructure/steps/emailSteps.ts`; Test `test/unit/infrastructure/email-steps.test.ts`.
**Produces:** `BuildCDUStep(logger, contextBuilder, docenti: DocenteRepository, alunni: AlunnoRepository)` — recipe per PROCESSO table above, `contextBuilder.build({target, tipoTarget, now, idConfigurazione, tipoOperazione:'INVIO_EMAIL', carenzaProgressivo?}, recipe(name))`, then fills `cdu.destinatario` (anagrafica from Docente/Alunno entity, `flags.isSupplente:false`, `contesto.classiCompetenza`, `comunicazione.salutoIniziale` via Task 3) and sets `cdu` in context. `ValutaCondizioniInvioStep(logger, engine: IExpressionEngine)` — `shouldSend = condizione==null ? true : engine.evaluateBoolean(condizione, cduRecord)`; all later steps use gate `sendGate = ctx.get('shouldSend')===true`. TDD + commit.

### Task 6: Steps 3–4 — RenderBoxesStep + ComposeEmailStep

**Files:** Modify `src/infrastructure/steps/emailSteps.ts`; Test extend `email-steps.test.ts`.
**Produces:** `RenderBoxesStep(logger, composer deps from Task 4, templates)` — writes `cdu.render.boxes`, sets `oggettoRisolto = templates.processString(OGGETTO, cdu)`. `ComposeEmailStep(logger, templates)` — assembles msgstart (DOCTYPE, 600px container) + colored header (`getColoreHeader()`, title = oggettoRisolto) + saluto (`cdu.destinatario.comunicazione.salutoIniziale`, fallback `Gentile Utente`) + testo (`templates.processString(TESTO, cdu)`) + ordered boxes + footer (comunicazione automatica; NOREPLY warning block when `isNoreply()`) + msgend; sets `corpoHtml`, `allegati: []` (attachment blobs land with the real-GAS composition root; the port method `IDriveFacade.getFileBlob` is out of slice scope per §13 note). TDD (header color default `#007bff`, noReply block presence, box order) + commit.

### Task 7: Steps 5–6 — ResolveRecipientsStep + SendEmailStep

**Files:** Modify `src/infrastructure/steps/emailSteps.ts`; Test extend `email-steps.test.ts`.
**Produces:** `ResolveRecipientsStep(logger, docenti, supplenze: SupplenzaRepository)`:
- tipo `docente`: per classe in `classiCompetenza` (or the single target classe) resolve `findSupplenzaSpecifica(titolare, now, classeId)`; apply SUPPLENTI: SOLO_TITOLARI→`[{emails:[titolare]}]`; SOLO_SUPPLENTI→supplente per classe (falling back to titolare for uncovered classes — coordinatore multi-classe §12); ENTRAMBI→titolare + each distinct supplente as separate destinations; dedupe.
- tipo `cdc`/`genitori`/`alunno`: single destination `{emails: target.emails}` — not subject to SUPPLENTI (spec §7).
`SendEmailStep(logger, gmail: IGmailFacade, master: MasterSheetRepository)`: per destination, `to = testEmail ?? emails`; BCC = supervisore of current year (WARN + no BCC if empty — spec §6 nota); on `{success:false}` push into `sendErrors`, never throw (spec §8); sets `sentCount`. TDD (supplenti rules ×3, test-mode redirect, BCC, missing supervisore warns, failure collected) + commit.

### Task 8: Shared POST_PROCESSO action executor (+ complete document PostProcessStep)

**Files:** Create `src/infrastructure/steps/postProcessActions.ts`; Modify `src/infrastructure/steps/documentSteps.ts` (PostProcessStep body); Tests `test/unit/infrastructure/post-process-actions.test.ts`, extend `document-steps.test.ts`.
**Produces:**
```ts
export interface PostProcessAction { tipo: string; tab: string; col?: string; valore?: unknown; stato?: string; criteri: Record<string, string>; }
export function executePostProcess(rawJson: string, cdu: Record<string, unknown>, db: IDatabase, templates: ITemplateEngine, now: Date, logger: LoggerService): number;
```
Supports `INSERISCI_TIMESTAMP` (set `col` to `now.toISOString()` on rows matching criteri), `AGGIORNA_CAMPO` (set `col` to resolved `valore`), `AGGIORNA_STATO_DOC` (set `STATO` on LOG_DOCS rows). Criteri values are `{{path}}` templates resolved via `templates.processString` against the CDU; matching rows found via `db.table(tab)` scan; mutation via `IDatabase` update seam (`updateWhere` — verify existing port surface; extend fake if needed). Returns count of updated rows. Document `PostProcessStep` now calls it (transaction-owned persistence — no save). TDD (each action type + template criteria + no-match) + commit.

### Task 9: Steps 7–8 — LogEmailStep + PostProcessEmailStep

**Files:** Modify `src/infrastructure/steps/emailSteps.ts`; Test extend `email-steps.test.ts`.
**Produces:** `LogEmailStep(logger, logMail: LogEmailRepository)` — `stato = sendErrors.length>0 ? ERROR : SUCCESS`; destinatari = flat unique emails of `destinatariFinali` as `Email[]`; `registraInvio(patternId, destinatari, stato, {docs:[],folders:[]}, errore?)` (repo already saves). `PostProcessEmailStep(logger, db, templates)` — gate: `shouldSend && sentCount>0 && POST_PROCESSO!=null` (spec §10: only on success); calls `executePostProcess`; ends with `db.save()` (spec §10 persistenza — legal because no transaction is open). TDD + commit.

### Task 10: EmailNotificationService

**Files:** Create `src/application/services/EmailNotificationService.ts`; Test `test/unit/application/email-notification-service.test.ts`.
**Produces:** `EmailNotificationService(deps: {db, gmail, contextBuilder, templates, expressionEngine, boxTemplates(=ITemplateEngine), repos: {docenti, alunni, classi, carenze, confMail: ConfigurazioneEmailRepository, logMail, master, supplenze}, now, logger?})` with:
- `enableTestMode(email: string)` / `disableTestMode()` (spec §15);
- `sendPattern(patternId: string, opts?: {onlyRecipients?: string[]}): { targets: number; sent: number; errors: string[] }` — loads CONF_MAIL, enumerates `EmailTarget[]` per PROCESSO (spec §3 table + §12):
  - PER_COORDINATORE: group active classes by COORD email (articulated: parent classes only), one target per coordinatore with `classiCompetenza`;
  - PER_DOCENTE: dedupe docenti of all active-class CdCs (via `ClasseRepository.getConsiglioDiClasse`), one target each;
  - PER_CDC: one target per active (parent) class, `tipo:'cdc'`, emails = CdC docenti;
  - PER_ALUNNO: `alunni.findAttivi()`;
  - PER_GENITORI_ALUNNO: per alunno attivo → tutors; families deduped by identical tutor sets (one email per family, spec §12);
  - PER_CARENZA: `carenze.findNonNotificate()` → target alunno with `carenzaProgressivo`, emails = tutors (genitore priority §3), fallback alunno email when no tutors;
  then runs the 8-step pipeline per target (stopOnError:false; no transaction), aggregating results. `onlyRecipients` filters targets whose emails intersect (consumed by retry). TDD (one test per PROCESSO enumeration + test mode + aggregate result) + commit.

### Task 11: EmailRetryService

**Files:** Create `src/application/services/EmailRetryService.ts`; Test `test/unit/application/email-retry-service.test.ts`.
**Produces:** `EmailRetryService(logMail, emailService, gmail, master, {maxTentativi=3})` with `retryFailed(): {retried: number; permanent: number}` — groups `logMail.findFailed()` by `(pattern, destinatari)`; attempts = count of ERROR records in group; `< max` ⇒ `emailService.sendPattern(pattern, {onlyRecipients})` and on success update the original records' STATO→SUCCESS (via repository save seam); `>= max` ⇒ log permanent + notify supervisore via gmail facade (spec §16). TDD + commit.

### Task 12: JobRunner batch email (spec §14)

**Files:** Create `src/application/services/EmailBatchService.ts`; Test `test/unit/application/email-batch-service.test.ts`.
**Produces:** mirror of `DocumentBatchService`: job type `INVIO_EMAIL_BATCH`, generator handler chunking pipeline runs in groups of 100 targets with `yield {percentage, nextIndex, processed}` checkpoints, resume from `params.resumeState.nextIndex`. TDD (checkpoint cadence + resume skip) + commit.

### Task 13: End-to-end integration + full gated build

**Files:** Create `test/integration/notifica-email.test.ts`; possibly extend `test/fixtures/tables.ts` (PER_CARENZA pattern with POST_PROCESSO INSERISCI_TIMESTAMP on CARENZE.NOTIFICATO).
**Proves:** (a) PER_CARENZA end-to-end: carenze box HTML rendered with MATERIE colors, genitori as TO, supervisore BCC, LOG_MAIL SUCCESS row, `CARENZE.NOTIFICATO` timestamped, second run sends nothing (CarenzeNonNotificateSpec); (b) PER_CDC: single multi-TO email per class, ENTRAMBI supplenti included, NOREPLY footer; (c) send failure ⇒ LOG_MAIL ERROR + post-process skipped. Then `npm test && npm run test:integration && npm run lint && npm run typecheck && npm run build:testoffline` all green; merge branch to master; commit.

---

## Self-Review notes

- **Spec coverage:** §1–2 architecture → Tasks 5–9 composition in Task 10; §3 BuildCDU/PROCESSO table → Tasks 5, 10; §4 condizioni → Task 5; §5 boxes → Task 4+6; §6 compose/saluto/BCC → Tasks 3, 6, 7; §7 recipients/supplenti → Task 7; §8 send → Task 7; §9 log → Task 9; §10 post-processo → Tasks 8–9; §11 renderer system → Task 4; §12 note per processo → Task 10; §13 allegati → Task 6 (scoped: empty list + port note, real blobs need live GAS); §14 quote/JobRunner → Task 12; §15 test mode → Task 10; §16 retry → Task 11.
- **Type consistency:** `EmailTarget` defined once (Task 3 file), consumed by Tasks 5, 7, 10, 12; context keys per the contract section; `IGmailFacade.sendEmail` used by Tasks 7, 11.
- **Placeholder scan:** attachments deliberately scoped (stated in Task 6 with rationale); everything else concrete.
