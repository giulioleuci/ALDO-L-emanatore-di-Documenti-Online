# `CONF_MAIL.ALLEGATI`: static Drive attachments

> Implementation plan only. It deliberately does not change the SGSA specifications.

## Goal

Let a mail pattern attach Drive files even when no email box represents those files.  A
pattern author explicitly lists the files in the new `CONF_MAIL.ALLEGATI` column; the
mailer fetches their blobs and includes them in the outgoing Gmail message.

This preserves the safety rule introduced for document boxes: `BOX_CFG` never attaches
anything by itself.  A dynamic, class-document attachment still requires
`ALLEGA: true` on the relevant box.

## Agreed data contract

`CONF_MAIL.ALLEGATI` is optional JSON containing a list of Drive file IDs:

```json
["1AbCdEf...", "1GhIjKl..."]
```

- Empty cell, `null`, or `[]` means no static attachments.
- Entries must be non-empty strings. Invalid JSON, a non-array value, or an invalid
  entry is a configuration error and must stop the send before Gmail is called.
- Duplicate IDs are removed while retaining their first occurrence.
- The list is intentionally static: no CDU placeholders, filters, conditional logic,
  folder expansion, or auto-generated documents in this first increment.
- An uploaded `.doc` / `.docx` file is sent as that stored file's blob. Native Google
  Docs retain the existing Apps Script blob behaviour (typically a PDF conversion), so
  an original Word file must be uploaded to Drive when Word format is required.

## Attachment and audit behaviour

1. Resolve `CONF_MAIL.ALLEGATI` first and obtain one blob for each configured ID through
   the existing `IDriveFacade.getFileBlob` capability.
2. Resolve box-originated documents only when their `BOX_CFG` explicitly contains
   `ALLEGA: true`.
3. Combine the two sets by Drive file ID, removing duplicates before calling Gmail.
   The static-list order comes first, followed by opted-in box documents.
4. Keep body-link audit fields separate from actual attachments:
   - `LOG_MAIL.ALLEGATI.docs` and `.folders` remain IDs shown in the rendered HTML.
   - `LOG_MAIL.ALLEGATI.attach` contains links for every blob actually passed to Gmail,
     including static attachments that do not appear in any box.
5. For static IDs, write the canonical Drive URL
   `https://drive.google.com/open?id=<encoded-id>` into `attach`; dynamic documents
   continue using their `LOG_DOCS` link. This avoids a new Drive metadata API solely for
   audit logging.

## Implementation steps

1. **Write failing domain tests first.**
   - Extend the `ConfigurazioneEmail` tests with empty values, valid parsing, preserved
     order/deduplication, and malformed/non-string input.
   - Add `COL_CONF_MAIL.ALLEGATI` to `src/config/schema.ts`.
   - In `src/domain/entities/ConfigurazioneEmail.ts`, retain the raw column value,
     expose `getAllegati(): string[]`, validate the JSON contract above, and round-trip
     the raw value from `toData()`.

2. **Make configuration storage schema-complete.**
   - Add the new header to every `CONF_MAIL` fixture/table definition, particularly
     `test/fixtures/tables.ts` and the repository test fixtures.
   - Update both online sample builders:
     `src/onlinetests/SampleDatabaseBuilder.ts` and
     `src/onlinetests/E2eSampleDatabaseBuilder.ts`.
   - Seed `[]` for existing test patterns so the new column is explicit and no existing
     sample silently exercises an attachment. Add one dedicated pattern/test row with a
     known fixture Drive file ID to exercise the feature end-to-end.

3. **Refactor attachment resolution in `ComposeEmailStep` with tests first.**
   - Replace the current dynamic-only `resolveAllegati` result with a resolver that
     starts from `conf.getAllegati()` and then appends the existing, explicitly
     `ALLEGA: true` class-document IDs.
   - Deduplicate before invoking `drive.getFileBlob`; do not call Drive for an empty ID.
   - Produce aligned `ids`, `blobs`, and `links`: static IDs use the canonical Drive
     URL, dynamic IDs retain `LOG_DOCS.getLink()`.
   - Preserve the current no-focus-class behaviour for dynamic attachments while still
     allowing static attachments for every mail process.
   - Do not add a native GAS call or a new `GasLibraryFactory` feature: the existing
     facade method already retrieves file blobs, and constructing the deterministic
     Drive link is ALDO mail-audit policy.

4. **Keep logging unchanged in shape, expand its proven input.**
   - `LogEmailStep` continues writing `{ docs, folders, attach }`.
   - Its added tests must prove `attach` has every real attachment and that a static
     attachment is absent from `docs`/`folders` unless it is also represented in HTML.

5. **Cover delivery and regression cases.**
   In `test/unit/application/pipelines/email-steps.test.ts` and the notification-service
   tests, add cases for:
   - a static `.doc` blob attaches without any box;
   - an empty column sends no attachment;
   - a document box without `ALLEGA: true` still sends no generated PDF;
   - static plus opted-in dynamic attachments both send, once each, in deterministic
     order;
   - malformed configuration prevents the Gmail send and yields a diagnosable error;
   - the audit JSON separates rendered link IDs from actual `attach` links.

6. **Extend the online e2e data and checks.**
   - Put a real uploaded test document into the e2e Drive artifacts and reference its ID
     from an e2e `CONF_MAIL.ALLEGATI` cell.
   - Assert the received email has that non-box attachment, while the existing
     work-plan/minutes scenario still has no PDF unless its configuration explicitly
     asks for one.
   - Assert `LOG_MAIL.ALLEGATI.attach` contains the static file's Drive URL and that
     `.docs`/`.folders` continue reflecting only links rendered in the message body.

## Verification sequence

Run after implementation, stopping at the first failure:

1. Focused domain, pipeline, notification-service, configuration-repository, and online
   sample/check Jest files.
2. `npm run typecheck`
3. `npm run lint`
4. `npm test`
5. `npm run test:build`
6. `npm run build:online`, then deploy/run the live `testE2eScenarios` only after the
   project is configured for the online test target.

## Out of scope

- Attaching an entire folder, document-type query results, or files selected from CDU.
- Templated/conditional `ALLEGATI` values.
- Changing the meaning of `BOX_CFG`, `CONF_DOC`, or `LOG_MAIL.ALLEGATI.docs` and
  `.folders`.
- Any implicit PDF attachment behaviour.
