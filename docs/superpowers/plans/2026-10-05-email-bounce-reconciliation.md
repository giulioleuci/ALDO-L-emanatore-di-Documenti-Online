# Email Bounce Reconciliation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A `CONF_AZIONI` action `VERIFICA_EMAIL_INVIATE` that scans the sender's Gmail for NDRs, flips matching `LOG_MAIL` rows from `SUCCESS` to a new `BOUNCED` status, and mails a deduplicated summary to the initiator and `SUPERVISORE_EMAIL`.

**Architecture:** `MailService.searchMessages` (GasLibraryFactory) → `IGmailFacade.searchBounceMessages` → pure `NdrParser` → `BounceReconciliationService` (correlate + mark + notify) → registered as an infra handler in `creaHandlersInfra`, so `ActionBatchService` (job, `LOG_JOB`, "ESEGUI AZIONI" menu) already covers orchestration. No dedicated job/menu entry (user decision, supersedes spec §2.3.B and Task 7 menu).

**Tech Stack:** TypeScript (GAS V8 target, sync only), Jest (`jest.config.cjs`), GasLibraryFactory JS + Jest.

**Spec:** `docs/superpowers/specs/2026-10-05-email-bounce-reconciliation-and-noreply-spec.md`

## Global Constraints

- Native `GmailApp` only inside GoogleApiWrapper `MailService`; ALDO routes through `IGmailFacade`.
- Never edit `dist/*`. After GLF change: build GLF, then `npm run refresh:vendor` in ALDO.
- Status for bounced rows is a **new** `StatoEmail.BOUNCED` (user decision) — `findFailed()` stays `ERROR`-only so `EmailRetryService` never resends to a dead address.
- `NOREPLY` doc warning is written **verbatim as the spec §2.1** (user decision), even though the claim is unverified.
- Timestamp format `"GG-MM-AAAA HH:MM:SS"`; `lookbackGiorni` default 2.
- Log lines containing addresses go through `PiiRedactor.redact(...)`; HTML interpolation of free text through `escapeHtml` (as `EmailRetryService` does).
- New services wired in `src/config/Bootstrap.ts`, never constructed ad hoc.
- Docs in `SPECS_ALDO/` are Italian.

## Review Focus

- NDR for an address that appears in no `LOG_MAIL` row → counted as anomaly, no row touched, no crash.
- Same NDR processed twice (re-run) → second run changes nothing, sends no second summary (rows already `BOUNCED`).
- Multi-recipient `LOG_MAIL` row where only one address bounced → row flagged `BOUNCED`, `ERRORE` names the bounced address.
- Transient (4xx "delivery delayed") or non-NDR mailer-daemon mail → ignored as unparseable, never marks a row.
- `SUPERVISORE_EMAIL` blank, or equal to the initiator → no crash, no duplicate recipient.
- Pattern with `NOREPLY=TRUE` / zero NDRs found → returns 0, logs an info line, sends no summary.

---

### Task 1: Docs + `BOUNCED` status + repository seam

**Files:**
- Modify: `SPECS_ALDO/01_SCHEMA_DATABASE.md` (rows: `NOREPLY` ≈l.427, `LOG_MAIL.STATO` ≈l.549, action catalog ≈l.489-491)
- Modify: `src/domain/value-objects/enums.ts:80-84`
- Modify: `src/domain/repositories/ILogEmailRepository.ts`
- Modify: `src/infrastructure/repositories/LogEmailRepository.ts`
- Test: `test/unit/infrastructure/log-email-repository-bounce.test.ts` (new)

**Interfaces:**
- Produces: `StatoEmail.BOUNCED = 'BOUNCED'`; on `ILogEmailRepository`: `findByStato(stato: StatoEmail): LogEmail[]` (already on the class, add to interface) and `marcaRimbalzo(log: LogEmail, diagnostica: string, meta: Record<string, unknown>): void`.

- [ ] **Step 1: Failing test.** Look at how `test/unit/application/email-retry-service.test.ts` builds a `FakeDatabase` + `LogEmailRepository` and copy that setup.

```ts
// test/unit/infrastructure/log-email-repository-bounce.test.ts
import { LogEmailRepository } from '../../../src/infrastructure/repositories/LogEmailRepository';
import { StatoEmail } from '../../../src/domain/value-objects/enums';
import { Email } from '../../../src/domain/value-objects/Email';
// + FakeDatabase import/setup exactly as in email-retry-service.test.ts

describe('LogEmailRepository.marcaRimbalzo', () => {
  it('flips SUCCESS to BOUNCED, appends diagnostic and merges meta into ALLEGATI', () => {
    const repo = new LogEmailRepository(makeDb()); // makeDb(): same helper as email-retry-service.test.ts
    const log = repo.registraInvio('NOTIFICA_PDP', [Email.create('a@x.it')], StatoEmail.SUCCESS, '<p>hi</p>', {
      logicalTargetId: 't1'
    });
    repo.marcaRimbalzo(log, '550 5.1.1 User unknown', { bouncedAt: '2026-10-05T08:00:00.000Z', bounceMessageId: 'm1' });
    const [row] = repo.findByStato(StatoEmail.BOUNCED);
    expect(row!.errore).toBe('Bounce: 550 5.1.1 User unknown');
    expect(row!.getAllegati()).toEqual({
      logicalTargetId: 't1',
      bouncedAt: '2026-10-05T08:00:00.000Z',
      bounceMessageId: 'm1'
    });
    expect(repo.findFailed()).toHaveLength(0);
  });
});
```

- [ ] **Step 2:** `npx jest --config jest.config.cjs test/unit/infrastructure/log-email-repository-bounce.test.ts` → FAIL (`marcaRimbalzo` / `BOUNCED` missing).

- [ ] **Step 3: Implement.**

`enums.ts`: add `BOUNCED = 'BOUNCED'` to `StatoEmail`. Then `grep -rn "StatoEmail" src config 2>/dev/null` and `grep -rn "SUCCESS.*ERROR.*PENDING" src` — if a schema/validation enum lists the allowed `LOG_MAIL.STATO` values, add `BOUNCED` there too.

`ILogEmailRepository.ts`: add
```ts
findByStato(stato: StatoEmail): LogEmail[];
/** SUCCESS → BOUNCED after an NDR; ERRORE = "Bounce: <diagnostica>", meta merged into ALLEGATI. */
marcaRimbalzo(log: LogEmail, diagnostica: string, meta: Record<string, unknown>): void;
```

`LogEmailRepository.ts` (after `marcaSuccesso`):
```ts
marcaRimbalzo(log: LogEmail, diagnostica: string, meta: Record<string, unknown>): void {
  this.database.tables[TABLE.LOG_MAIL]!.updateRowWhere(
    {
      [COL_LOG_MAIL.PATTERN]: log.pattern,
      [COL_LOG_MAIL.DESTINATARI]: log.destinatariRaw,
      [COL_LOG_MAIL.DATA]: log.data
    },
    {
      ...log.toData(),
      [COL_LOG_MAIL.STATO]: StatoEmail.BOUNCED,
      [COL_LOG_MAIL.ERRORE]: `Bounce: ${diagnostica}`,
      [COL_LOG_MAIL.ALLEGATI]: JSON.stringify({ ...log.getAllegati(), ...meta })
    }
  );
  this.database.save();
}
```

- [ ] **Step 4:** rerun the test → PASS. Run `npm run typecheck` (other `ILogEmailRepository` implementers/fakes must gain the two methods — fix any compile error).

- [ ] **Step 5: Docs (Italian).** In `01_SCHEMA_DATABASE.md`:
  - `NOREPLY` row description → `Aggiunge disclaimer no-reply nel footer. **Attenzione:** se \`NOREPLY = TRUE\`, Google Workspace invia con Return-Path no-reply e, secondo gli standard RFC, i rimbalzi MTA (NDR) vengono soppressi o scartati: **è strutturalmente impossibile rilevare o riconciliare la mancata consegna verso indirizzi inesistenti**. Se per un pattern serve l'auditabilità dei fallimenti di consegna, \`NOREPLY\` deve restare \`FALSE\` o vuoto.`
  - `LOG_MAIL.STATO` row → `Enum: \`SUCCESS\` / \`ERROR\` / \`PENDING\` / \`BOUNCED\`. \`SUCCESS\` significa solo "accettata dai server di posta in uscita di Google"; \`BOUNCED\` è impostato a posteriori da \`VERIFICA_EMAIL_INVIATE\` quando arriva un NDR (\`ERRORE\` = "Bounce: <diagnostica SMTP>", \`ALLEGATI\` arricchito con \`bouncedAt\`, \`bounceMessageId\`). \`BOUNCED\` non è ritentato da \`EmailRetryService\`.`
  - Catalog table: add row `VERIFICA_EMAIL_INVIATE` — "Cerca nella casella del mittente gli NDR di `mailer-daemon` e porta a `BOUNCED` le righe `LOG_MAIL` (`STATO=SUCCESS`) corrispondenti; parametri opzionali `daTimestamp`/`aTimestamp` (`GG-MM-AAAA HH:MM:SS`), `lookbackGiorni` (default 2), `pattern` (stringa o array di `CONF_MAIL.ID`). Invia un riepilogo a chi esegue e a `SUPERVISORE_EMAIL` (deduplicati). Ritorna il numero di righe aggiornate." Fix the sentence at l.491: "i quattro tipi infra" → "i cinque tipi infra" and list `VERIFICA_EMAIL_INVIATE`.

- [ ] **Step 6: Commit**
```bash
git add SPECS_ALDO src test && git commit -m "feat(log-mail): BOUNCED status, marcaRimbalzo seam, bounce docs"
```

---

### Task 2: Gmail search seam (GasLibraryFactory → facade)

**Files:**
- Modify: `GasLibraryFactory/GoogleApiWrapper/src/services/MailService.js`
- Test: `GasLibraryFactory/GoogleApiWrapper/src/services/__tests__/MailService.test.js`
- Modify: `types/gaslibs/index.d.ts` (`class MailService`, ≈l.1201)
- Modify: `src/infrastructure/facades/GmailServiceFacade.ts`
- Modify: `test/fakes/FakeGmailFacade.ts`
- Test: `test/unit/infrastructure/gmail-service-facade.test.ts` (new, small)

**Interfaces:**
- Produces (GLF): `MailService.searchMessages(query: string, maxResults?: number): Array<{id: string; threadId: string; subject: string; from: string; date: Date; plainBody: string}>` — returns `[]` and logs on error, never throws.
- Produces (ALDO): `export interface BounceMessage { id: string; date: Date; subject: string; body: string }`; `IGmailFacade.searchBounceMessages(lookbackDays: number): BounceMessage[]`; `FakeGmailFacade.bounces: BounceMessage[]` (+ records `lastLookbackDays`).

- [ ] **Step 1: Failing GLF test** (add to `MailService.test.js`; add `search: jest.fn(() => [])` to the `global.GmailApp` mock in `beforeEach`).

```js
describe('searchMessages()', () => {
  it('flattens threads to message summaries and honours maxResults', () => {
    const msg = (id) => ({
      getId: () => id, getSubject: () => 'Delivery Status Notification (Failure)',
      getFrom: () => 'Mail Delivery Subsystem <mailer-daemon@googlemail.com>',
      getDate: () => new Date('2026-10-05T08:00:00Z'), getPlainBody: () => 'body ' + id
    });
    GmailApp.search.mockReturnValue([
      { getId: () => 't1', getMessages: () => [msg('m1'), msg('m2')] },
      { getId: () => 't2', getMessages: () => [msg('m3')] }
    ]);
    const out = service.searchMessages('from:mailer-daemon', 2);
    expect(GmailApp.search).toHaveBeenCalledWith('from:mailer-daemon', 0, 2);
    expect(out.map((m) => m.id)).toEqual(['m1', 'm2']);
    expect(out[0]).toMatchObject({ threadId: 't1', plainBody: 'body m1' });
  });

  it('returns [] and logs when GmailApp throws', () => {
    GmailApp.search.mockImplementation(() => { throw new Error('quota'); });
    expect(service.searchMessages('x')).toEqual([]);
    expect(logger.error).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2:** `cd GasLibraryFactory && npx jest GoogleApiWrapper/src/services/__tests__/MailService.test.js -t searchMessages` → FAIL.

- [ ] **Step 3: Implement** in `MailService.js` (after `getQuotaUsage`), with JSDoc in the file's style:

```js
/**
 * @description Searches the user's mailbox with Gmail search syntax and flattens the matching threads to message summaries.
 * @param {string} query Gmail search query (e.g. 'from:mailer-daemon newer_than:2d').
 * @param {number} [maxResults=50] Maximum messages returned.
 * @returns {Array<{id: string, threadId: string, subject: string, from: string, date: Date, plainBody: string}>} Never throws; [] on error.
 */
searchMessages(query, maxResults = 50) {
  try {
    const out = [];
    for (const thread of GmailApp.search(query, 0, maxResults)) {
      for (const m of thread.getMessages()) {
        if (out.length >= maxResults) return out;
        out.push({
          id: m.getId(), threadId: thread.getId(), subject: m.getSubject(),
          from: m.getFrom(), date: m.getDate(), plainBody: m.getPlainBody()
        });
      }
    }
    return out;
  } catch (error) {
    this._logger.error(`Error searching messages: ${error.message}`);
    return [];
  }
}
```
(`maxResults` is a thread cap for `GmailApp.search` and a message cap on output — fine for NDRs, one message per thread.)

- [ ] **Step 4:** test passes. Then `cd GasLibraryFactory && npm run build`, back in ALDO `npm run refresh:vendor && npm run verify:vendor`. Check `GasLibraryFactory/DOCS_LIBS/GoogleApiWrapper.md` is regenerated by GLF's own docs script (see `GasLibraryFactory/CLAUDE.md`); if it is manual, add a `MailService.searchMessages` entry.

- [ ] **Step 5: ALDO side.**
`types/gaslibs/index.d.ts`, inside `class MailService`:
```ts
searchMessages(query: string, maxResults?: number): Array<{
  id: string; threadId: string; subject: string; from: string; date: Date; plainBody: string;
}>;
```
`GmailServiceFacade.ts`: add the `BounceMessage` interface, extend `IGmailFacade`, and implement:
```ts
searchBounceMessages(lookbackDays: number): BounceMessage[] {
  return this.mail
    .searchMessages(`from:mailer-daemon newer_than:${Math.max(1, Math.ceil(lookbackDays))}d`, 100)
    .map((m) => ({ id: m.id, date: m.date, subject: m.subject, body: m.plainBody }));
}
```
`FakeGmailFacade.ts`:
```ts
public bounces: BounceMessage[] = [];
public lastLookbackDays = 0;
searchBounceMessages(lookbackDays: number): BounceMessage[] {
  this.lastLookbackDays = lookbackDays;
  return this.bounces;
}
```
Facade test: build `new GmailServiceFacade({ searchMessages: jest.fn(() => [{ id: 'm', threadId: 't', subject: 's', from: 'f', date: new Date(0), plainBody: 'b' }]) } as unknown as MailService)`, assert `searchBounceMessages(1.2)` calls `searchMessages('from:mailer-daemon newer_than:2d', 100)` and maps `plainBody`→`body`.

- [ ] **Step 6:** `npm run typecheck && npx jest --config jest.config.cjs test/unit/infrastructure/gmail-service-facade.test.ts` → PASS.

- [ ] **Step 7: Commit** (GLF is its own git repo — commit there first, then ALDO incl. `vendor/`):
```bash
cd GasLibraryFactory && git add -A && git commit -m "feat(GoogleApiWrapper): MailService.searchMessages" && cd ..
git add types src test vendor && git commit -m "feat(gmail): searchBounceMessages facade seam"
```

---

### Task 3: `NdrParser` + `BounceReconciliationService`

**Files:**
- Create: `src/application/email/NdrParser.ts`
- Create: `src/application/email/BounceReconciliationService.ts`
- Test: `test/unit/application/email/ndr-parser.test.ts`, `test/unit/application/email/bounce-reconciliation-service.test.ts`

**Interfaces:**
- Consumes: `IGmailFacade.searchBounceMessages`, `ILogEmailRepository.findByStato/marcaRimbalzo`, `IMasterSheetRepository.findConfigAnnoCorrente()` (`.hasSupervisore()`, `.supervisoreEmail`), `IActiveUserFacade.getEmail()`.
- Produces:
```ts
export interface ParsedNdr { recipient: string; code: string; reason: string }
export function parseNdr(body: string): ParsedNdr | null; // null = not a permanent (5xx) NDR

export interface BounceFilters { da?: Date; a?: Date; patterns?: string[]; lookbackGiorni?: number }
export interface BounceDetail { pattern: string; destinatari: string; rejected: string; diagnostica: string }
export interface BounceSummary { ispezionati: number; riconciliati: number; anomalie: number; dettagli: BounceDetail[] }
export class BounceReconciliationService {
  constructor(deps: { gmail: IGmailFacade; logMail: ILogEmailRepository; master: IMasterSheetRepository;
                      activeUser: IActiveUserFacade; logger: LoggerService; now: () => Date });
  riconcilia(f: BounceFilters): BounceSummary;
}
```

- [ ] **Step 1: Failing parser tests** (three provider formats):

```ts
import { parseNdr } from '../../../../src/application/email/NdrParser';

const GOOGLE = `Address not found
Your message wasn't delivered to nobody.123@scuola.it because the address couldn't be found, or is unable to receive mail.
The response was:
550 5.1.1 The email account that you tried to reach does not exist.`;
const RFC3464 = `Final-Recipient: rfc822; mario.rossi@dominio.it
Action: failed
Status: 5.1.1
Diagnostic-Code: smtp; 550 5.1.1 User unknown`;
const M365 = `Delivery has failed to these recipients or groups:
anna@azienda.com
The email address you entered couldn't be found.
Remote Server returned '550 5.1.10 RESOLVER.ADR.RecipientNotFound; Recipient not found by SMTP address lookup'`;
const TRANSIENT = `Delivery incomplete
There was a temporary problem delivering your message to a@b.it.
The response was:
452 4.2.2 Mailbox full`;

describe('parseNdr', () => {
  it('Google format', () => expect(parseNdr(GOOGLE)).toEqual({
    recipient: 'nobody.123@scuola.it', code: '550',
    reason: '550 5.1.1 The email account that you tried to reach does not exist.' }));
  it('RFC 3464', () => expect(parseNdr(RFC3464)).toMatchObject({ recipient: 'mario.rossi@dominio.it', code: '550' }));
  it('Microsoft 365', () => expect(parseNdr(M365)).toMatchObject({ recipient: 'anna@azienda.com', code: '550' }));
  it('ignores transient 4xx', () => expect(parseNdr(TRANSIENT)).toBeNull());
  it('ignores non-NDR text', () => expect(parseNdr('hello')).toBeNull());
});
```

- [ ] **Step 2:** `npx jest --config jest.config.cjs test/unit/application/email/ndr-parser.test.ts` → FAIL (module missing).

- [ ] **Step 3: Implement `NdrParser.ts`:**

```ts
export interface ParsedNdr { recipient: string; code: string; reason: string }

const EMAIL = '[\\w.+\'-]+@[\\w.-]+\\.[A-Za-z]{2,}';
const RECIPIENT = [
  new RegExp(`Final-Recipient:\\s*rfc822;\\s*(${EMAIL})`, 'i'),
  new RegExp(`wasn't delivered to\\s+<?(${EMAIL})`, 'i'),
  new RegExp(`(?:recipients or groups:|failed:)\\s*<?(${EMAIL})`, 'i')
];
const STATUS = /\b([45]\d{2})[ -]([45]\.\d{1,3}\.\d{1,3})\b[^\n']*/;

/** Permanent (5xx) NDR → failed recipient + SMTP diagnostic; null for transient (4xx) or non-NDR text. */
export function parseNdr(body: string): ParsedNdr | null {
  const status = STATUS.exec(body);
  if (status === null || !status[1]!.startsWith('5')) return null;
  for (const re of RECIPIENT) {
    const m = re.exec(body);
    if (m !== null) return { recipient: m[1]!.toLowerCase(), code: status[1]!, reason: status[0].trim() };
  }
  return null;
}
```
Adjust the regexes until all five tests pass (the Google `reason` must equal the full `550 5.1.1 …does not exist.` line).

- [ ] **Step 4: Failing service tests** — use plain stub objects (no FakeDatabase), a `logMail` stub with an array of `LogEmail.fromData({...})` rows whose `marcaRimbalzo` is a `jest.fn` that records calls; `FakeGmailFacade` for gmail (set `.bounces`); `gmail.sent` captures the summary. Cases (one `it` each):
  1. matching NDR → `marcaRimbalzo` called once with `('550 5.1.1 …', { bouncedAt: <ISO of now>, bounceMessageId: 'm1' })`; summary `{ispezionati:1, riconciliati:1, anomalie:0}`.
  2. NDR for unknown address → `anomalie:1`, no mark, no email sent.
  3. only `STATO=SUCCESS` rows considered (a `BOUNCED` row with same address ignored → re-run is a no-op, no summary mail).
  4. `patterns:['A']` excludes a row of pattern `B`; `da`/`a` exclude rows outside the window; row `DATA` later than the NDR date is excluded.
  5. multi-recipient row `a@x.it,b@x.it`, NDR for `b@x.it` → row marked; `diagnostica` argument mentions `b@x.it`.
  6. summary mail goes to `[initiator, supervisor]` deduplicated; supervisor blank → only initiator; both equal → one recipient.
  7. `lookbackGiorni` omitted and `da` omitted → `gmail.lastLookbackDays === 2`; `da` = now−5d → `lastLookbackDays >= 5`.
  8. zero NDRs → returns zeros, `logger.info` called, no mail.
  Construct rows: `LogEmail.fromData({ PATTERN:'NOTIFICA_PDP', DESTINATARI:'a@x.it', DATA:'2026-10-05T07:00:00.000Z', STATO:'SUCCESS' })` (use the `COL_LOG_MAIL` keys).

- [ ] **Step 5:** run → FAIL.

- [ ] **Step 6: Implement `BounceReconciliationService.ts`:**

```ts
const DAY_MS = 86_400_000;

riconcilia(f: BounceFilters): BounceSummary {
  const { gmail, logMail, master, activeUser, logger, now } = this.deps;
  const t = now();
  const giorni = f.da !== undefined ? Math.ceil((t.getTime() - f.da.getTime()) / DAY_MS) + 1 : (f.lookbackGiorni ?? 2);
  const da = f.da ?? new Date(t.getTime() - (f.lookbackGiorni ?? 2) * DAY_MS);
  const ndrs = gmail.searchBounceMessages(giorni);
  const summary: BounceSummary = { ispezionati: ndrs.length, riconciliati: 0, anomalie: 0, dettagli: [] };
  if (ndrs.length === 0) {
    logger.info('VERIFICA_EMAIL_INVIATE: nessun NDR trovato (pattern con NOREPLY=TRUE non generano NDR)');
    return summary;
  }
  const candidati = logMail.findByStato(StatoEmail.SUCCESS).filter(
    (l) => (f.patterns === undefined || f.patterns.includes(l.pattern)) &&
           new Date(l.data) >= da && (f.a === undefined || new Date(l.data) <= f.a)
  );
  for (const ndr of ndrs) {
    const p = parseNdr(ndr.body);
    const hit = p === null ? undefined : candidati
      .filter((l) => new Date(l.data) <= ndr.date && l.getDestinatari().some((d) => d.toLowerCase() === p.recipient))
      .sort((x, y) => y.data.localeCompare(x.data))[0];
    if (p === null || hit === undefined) { summary.anomalie++; continue; }
    const diagnostica = `${p.reason} (${p.recipient})`;
    logMail.marcaRimbalzo(hit, diagnostica, { bouncedAt: t.toISOString(), bounceMessageId: ndr.id });
    candidati.splice(candidati.indexOf(hit), 1); // one NDR → one row
    summary.riconciliati++;
    summary.dettagli.push({ pattern: hit.pattern, destinatari: hit.destinatariRaw, rejected: p.recipient, diagnostica: p.reason });
  }
  logger.info(PiiRedactor.redact(`VERIFICA_EMAIL_INVIATE: ${summary.riconciliati}/${summary.ispezionati} NDR riconciliati, ${summary.anomalie} anomalie`));
  if (summary.riconciliati > 0) this.notifica(summary);
  return summary;
}

private notifica(s: BounceSummary): void {
  const cfg = this.deps.master.findConfigAnnoCorrente();
  const to = [...new Set([this.deps.activeUser.getEmail(), cfg.hasSupervisore() ? cfg.supervisoreEmail : ''].filter((e) => e !== ''))];
  if (to.length === 0) return;
  const righe = s.dettagli.map((d) => `<li>${escapeHtml(d.pattern)} → ${escapeHtml(d.rejected)}: ${escapeHtml(d.diagnostica)}</li>`).join('');
  this.deps.gmail.sendEmail({
    to,
    subject: `[SGSA] ${s.riconciliati} email non recapitate (rimbalzi)`,
    htmlBody: `<p>NDR ispezionati: ${s.ispezionati}, rimbalzi correlati: ${s.riconciliati}, anomalie: ${s.anomalie}.</p><ul>${righe}</ul><p>Correggere gli indirizzi nel database.</p>`
  });
}
```
Import `escapeHtml`/`PiiRedactor` exactly as `EmailRetryService.ts` does (check its import lines). Idempotency comes from only scanning `SUCCESS` rows; `bounceMessageId` is the audit trail.

- [ ] **Step 7:** `npx jest --config jest.config.cjs test/unit/application/email` → PASS; `npm run typecheck && npm run lint`.

- [ ] **Step 8: Commit**
```bash
git add src/application/email test/unit/application/email && git commit -m "feat(email): NdrParser and BounceReconciliationService"
```

---

### Task 4: `VERIFICA_EMAIL_INVIATE` handler, wiring, seeds

**Files:**
- Modify: `src/application/pipelines/standaloneActions.ts` (`Azione`, ≈l.22-43)
- Modify: `src/application/pipelines/azioniInfra.ts` (`AzioniInfraDeps`, `creaHandlersInfra` map)
- Modify: `src/application/services/ActionBatchService.ts` (deps ≈l.80-90, `creaHandlersInfra({...})` ≈l.251)
- Modify: `src/config/Bootstrap.ts` (register service; pass to `actionBatchService` ≈l.385)
- Modify: `src/onlinetests/data/SharedTestDatabaseBuilder.ts`, `src/onlinetests/data/Seeders.ts` (CONF_AZIONI sample row)
- Test: `test/unit/application/pipelines/azioni-infra-verifica-email.test.ts` (new)

**Interfaces:**
- Consumes: `BounceReconciliationService.riconcilia(f): BounceSummary`, `BounceFilters`.
- Produces: `Azione` fields `daTimestamp?: string; aTimestamp?: string; lookbackGiorni?: number; pattern?: string | string[]`; `AzioniInfraDeps.bounces?: { riconcilia(f: BounceFilters): BounceSummary }`; handler `VERIFICA_EMAIL_INVIATE` returns `summary.riconciliati`; Bootstrap key `'bounceReconciliationService'`; `ActionBatchDeps.bounces?`.

- [ ] **Step 1: Failing test.** Copy the `creaHandlersInfra` setup from `test/unit/application/pipelines/standalone-actions.test.ts` (db/drive/roles/cdu/logger stubs), add `bounces: { riconcilia: jest.fn(() => ({ ispezionati: 3, riconciliati: 2, anomalie: 1, dettagli: [] })) }`. Cases:
  1. `{tipo:'VERIFICA_EMAIL_INVIATE', daTimestamp:'01-10-2026 08:30:00', aTimestamp:'05-10-2026 23:59:59', pattern:'NOTIFICA_PDP'}` → returns `2`; `riconcilia` called with `{ da: new Date(2026,9,1,8,30,0), a: new Date(2026,9,5,23,59,59), patterns:['NOTIFICA_PDP'] }`.
  2. `lookbackGiorni:3`, no timestamps → called with `{ lookbackGiorni:3 }` (no `da`/`a`/`patterns` keys).
  3. `pattern:['A','B']` → `patterns:['A','B']`.
  4. malformed `daTimestamp:'2026-10-01'` → throws `ConfigurationError` mentioning `daTimestamp`.
  5. `bounces` absent → returns `0`, `logger.warn` called (mirrors `VALIDA_DB`).

- [ ] **Step 2:** `npx jest --config jest.config.cjs test/unit/application/pipelines/azioni-infra-verifica-email.test.ts` → FAIL.

- [ ] **Step 3: Implement.**
`standaloneActions.ts` — append to `Azione`:
```ts
/** VERIFICA_EMAIL_INVIATE: "GG-MM-AAAA HH:MM:SS" bounds, relative lookback (default 2) and CONF_MAIL id filter. */
daTimestamp?: string;
aTimestamp?: string;
lookbackGiorni?: number;
pattern?: string | string[];
```
`azioniInfra.ts` — add dep + parser + handler:
```ts
import type { BounceFilters, BounceSummary } from '../email/BounceReconciliationService';
// in AzioniInfraDeps:
/** Needed only by VERIFICA_EMAIL_INVIATE. */
bounces?: { riconcilia(f: BounceFilters): BounceSummary };

const TS_IT = /^(\d{2})-(\d{2})-(\d{4})\s+(\d{2}):(\d{2}):(\d{2})$/;
/** "GG-MM-AAAA HH:MM:SS" → Date in the script timezone (Rome on GAS). */
function parseTimestampIt(campo: string, raw: string): Date {
  const m = TS_IT.exec(raw.trim());
  if (m === null) throw new ConfigurationError(`AZIONE VERIFICA_EMAIL_INVIATE: ${campo} "${raw}" non è nel formato GG-MM-AAAA HH:MM:SS`);
  return new Date(+m[3]!, +m[2]! - 1, +m[1]!, +m[4]!, +m[5]!, +m[6]!);
}
```
handler (in the returned map, next to `VALIDA_DB`):
```ts
VERIFICA_EMAIL_INVIATE: (azione) => {
  if (bounces === undefined) {
    logger.warn('AZIONE VERIFICA_EMAIL_INVIATE: servizio non disponibile — saltata');
    return 0;
  }
  const f: BounceFilters = {};
  if (azione.daTimestamp !== undefined) f.da = parseTimestampIt('daTimestamp', azione.daTimestamp);
  if (azione.aTimestamp !== undefined) f.a = parseTimestampIt('aTimestamp', azione.aTimestamp);
  if (azione.lookbackGiorni !== undefined) f.lookbackGiorni = azione.lookbackGiorni;
  if (azione.pattern !== undefined) f.patterns = Array.isArray(azione.pattern) ? azione.pattern : [azione.pattern];
  return bounces.riconcilia(f).riconciliati;
},
```
Destructure `bounces` from `deps`. `ActionBatchService.ts`: add `bounces?: { riconcilia(f: BounceFilters): BounceSummary }` to its deps and pass `...(this.deps.bounces !== undefined ? { bounces: this.deps.bounces } : {})` in the `creaHandlersInfra` call (same exactOptionalPropertyTypes pattern as `validator`).
`Bootstrap.ts`: register
```ts
c.register('bounceReconciliationService', () =>
  new BounceReconciliationService({
    gmail: deps.gmail, logMail: new LogEmailRepository(deps.db), master: deps.master,
    activeUser, logger, now: () => new Date()
  })
);
```
(match how `activeUser` is obtained for `emailRetryService`; if `deps.now` is a fixed `Date`, use `() => deps.now`-style consistent with neighbours), then in the `actionBatchService` factory add `bounces: container.get<BounceReconciliationService>('bounceReconciliationService'),`.

- [ ] **Step 4:** new test PASS; full `npm test` (adds to existing 1945+), `npm run typecheck`, `npm run lint`.

- [ ] **Step 5: Seeds + docs.** `grep -n "CONF_AZIONI" src/onlinetests/data/*.ts` and append a row alike the existing ones: `ID: 'VERIFICA_EMAIL_INVIATE'`, `TIPO: 'VERIFICA_EMAIL'`, `ASSE: 'SINGOLA'`, `CONDIZIONE: ''`, `ATTIVO: true`, `AZIONI: JSON.stringify([{ tipo: 'VERIFICA_EMAIL_INVIATE', lookbackGiorni: 2 }])`, `PERIODICITA: 'DAILY'` (use the `COL_CONF_AZIONI` constants). If an online-test counts CONF_AZIONI rows, update the count. Add the same example JSON to `SPECS_ALDO/00_AZIONI.md` if it lists action examples. No `Menu.ts` change — "ESEGUI AZIONI" already lists active `CONF_AZIONI`.

- [ ] **Step 6:** `npm test && npm run test:integration && npm run test:build && npm run build:readable` → all green.

- [ ] **Step 7: Commit**
```bash
git add -A && git commit -m "feat(azioni): VERIFICA_EMAIL_INVIATE bounce reconciliation action"
```

---

## Self-Review notes

- **Spec coverage:** §2.1 docs → T1; §2.2 seam → T2; §2.3 reconciliation + dual notification + idempotency → T3; §2.4 action/timestamps/pattern/lookback → T4; §5.3 NOREPLY graceful (zero NDRs → info log) → T3 step 6; §5.2 PII → T3 logger. **Deviations (user-approved):** no `RECONCILE_BOUNCES` job/menu (ActionBatchService covers `LOG_JOB`); `BOUNCED` enum chosen.
- **Skipped (not in spec's tests, add on request):** student/teacher names in the summary (needs `ALUNNI`/`DOCENTI` lookup by email); multi-recipient rows flag the whole row; timestamps interpreted in script timezone; `PERIODICITA` trigger automation (spec: ignored in v1).
- **Risk:** the `NOREPLY` claim is unverified; if online testing shows NDRs still arrive with `noReply`, soften the doc.
