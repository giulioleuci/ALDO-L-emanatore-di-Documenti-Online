# 2026-07-23 — Drive links, deficiency box styling, mock-data variety, RIEPILOGO_CLASSE doc, LOG_MAIL.TESTO

Five independent fixes/features against the ALDO email/document-generation system and its testonline mock data. Each section below is independently implementable and testable; they are bundled in one spec only because they were requested together.

## 1. Type-aware Drive links for generated documents

**Problem:** `CloneTemplateStep._executeLogic` (`src/application/pipelines/documentSteps.ts:215`) hardcodes every generated file's link as `https://drive.google.com/file/d/{fileId}/edit`, regardless of whether the file is a Google Doc or a Google Sheet. Folder links (`AlberoCartelle.ts:44`, `https://drive.google.com/drive/folders/{id}`) are already correct and out of scope.

**Fix:** `ConfigurazioneDocumento.formato` (CONF_DOC.FORMATO: `GDOC`/`GSHEET`/`PDF`/`TEXT`) already declares, per CONF_DOC row, what kind of file the template produces — confirmed already populated correctly in `E2eSampleDatabaseBuilder`'s CONF_DOC seeds (`FOGLIO_GENERICO` → `GSHEET`, doc generators → `GDOC`). Add a small pure function (e.g. `buildFileLink(fileId, formato)` in `documentSteps.ts`) mapping:

- `GSHEET` → `https://docs.google.com/spreadsheets/d/{fileId}/edit?gid=0#gid=0`
- `GDOC` → `https://docs.google.com/document/d/{fileId}/edit`
- `PDF`/`TEXT`/anything else → unchanged fallback `https://drive.google.com/file/d/{fileId}/edit` (the cloned artifact is still a live Drive file at this point in the pipeline, regardless of eventual export format)

`CloneTemplateStep` already has `confDoc(ctx)` available in the shared pipeline context (set by the caller before `execute()`), so no new dependency is needed — just call `confDoc(ctx).formato` instead of hardcoding the template string.

## 2. Deficiency-box styling + full subject name

**Problem:** `renderCarenzeBox` (`src/application/email/boxes.ts:109-123`):
- already renders `border-left` only (no full border) — no change needed there
- fills a `background-color` from `MATERIE.COLORE_2` (the `sfondo` variable) — this is the "aesthetically unappealing" full-tint effect the user wants gone; only the left border should carry color
- titles each box with `nomeSintesi` (MATERIE short name/abbreviation, falling back to the subject's sigla/ID) instead of `nome` (MATERIE.NOME, the full subject name)

**Fix:** in `renderCarenzeBox`, drop the `sfondo`/`colore2` background entirely (keep only the `border-left` styling), and switch the title from `r.nomeSintesi` to `r.nome`. `CarenzaFormatoB.nome` is already populated correctly by `mapCarenzeFormatoB` from `MATERIE.NOME` — no data-layer change needed, this is a render-only fix. The `simbolo` prefix (e.g. "🔴") stays as-is since the user only flagged the border/name, not the symbol.

## 3. Mock-data variety: class reps + religion exceptions

**Scope:** `E2eSampleDatabaseBuilder.seedAlunni` (`src/onlinetests/E2eSampleDatabaseBuilder.ts`), the mock DB actively used by the e2e/online test scenarios. (`SampleDatabaseBuilder.ts`, the smaller legacy smoke-test builder, gets the same `RELIGIONE` enum-value fix since its current seed (`RELIGIONE: true`) is a real bug — a boolean where `ReligioneScelta` expects `'SI'|'NO'|'ALT'` — but does not get rep/religion variety, since it isn't exercised by class-level scenario assertions.)

**Bug found:** both builders currently seed `[COL_ALUNNI.RELIGIONE]: true` — a boolean literal cast into a field typed `ReligioneScelta` (`'SI'|'NO'|'ALT'`, `Alunno.ts:33`). This mismatches the enum outright (not even a valid fallback case) and will render wrong in the new RIEPILOGO_CLASSE table (§4). Fixing this is a prerequisite for §3, not optional.

**Fix, per the 4 seeded classes** (`CLASSE_A`=20 students, `CLASSE_B`=20, `CLASSE_C`=8, `CLASSE_C_PARTNER`=12), deterministic assignment (first N students of each class, by existing seed order):

| Class | Student reps (RAPPR_STUD=true) | Parent reps (RAPPR_GEN=name) | Religion exceptions |
|---|---|---|---|
| CLASSE_A | 0 | 0 | 1 student `NO`, 1 student `ALT`, rest `SI` |
| CLASSE_B | 1 | 1 | 1 student `NO`, rest `SI` |
| CLASSE_C | 2 | 1 | 1 student `ALT`, rest `SI` |
| CLASSE_C_PARTNER | 1 | 2 | 1 `NO`, 1 `ALT`, rest `SI` |

This exercises 0/1/2 for both rep dimensions independently, and at least one `NO` and one `ALT` religion case, while leaving the majority-`SI`/no-reps baseline intact everywhere else. Parent-rep names are free text (`RAPPR_GEN`); build them deterministically from the existing `ALUNNO_COGNOMI`/`ALUNNO_NOMI` pools already in the file, offset from the student's own index so a parent name never collides with an actual student's name.

## 4. New CONF_DOC: `RIEPILOGO_CLASSE`

**Scope:** per-class document (confirmed: `DocumentGenerationService.generateForClasse` always builds the CDU with `recipe('CLASSE_COMPLETA')` regardless of which CONF_DOC is being generated — that recipe already runs `school, class, students, tutor, consiglio, rappresentanti, statistiche`, which is **every** CDU field this document needs. No new context-engine provider or recipe change required.**

Content, mapped to already-existing CDU paths (`SPECS_ALDO/02_CDU_STRUTTURA.md` §4.1):

- **Subjects + teacher (bullet list):** `focus.classe.consiglioDiClasse[].materie[].nome` + `.anagrafica.nome`/`.cognome` — one bullet per (docente × materia) pair (a docente can have >1 materia entry), via the engine's `{{#bullet_list:source}}...{{/bullet_list}}` tag over a flattened list.
- **Student table (name, religion, email, plans):** `focus.classe.studenti.listaCompleta[].anagrafica.{nomeCompleto,email}`, `.status.religione` (mapped to a short Italian label: `SI`→"Sì", `NO`→"No", `ALT`→"Alternativa"), `.didattica.piani.items[].tipo` (comma-joined, "—" if empty).
- **Total student count:** `focus.classe.studenti.statistiche.totale`.
- **Teachers without tutoring (bullet list):** `focus.classe.consiglioDiClasse[]` filtered where `.ruoli.isTutorAsl` is `false` — this field is already computed per-teacher by `CdcAssembler` from `CLASSI.RUOLI.TUTOR_ASL`.
- **Student + parent reps (bullet lists):** `focus.classe.rappresentanti.studenti[].nomeCompleto` and `.genitori[].nomeCompleto` — already populated by `RappresentantiProvider`, exactly this shape.

**Implementation:** two things aren't directly renderable by `{{#bullet_list:...}}`/`{{path}}` tags against the raw CDU shape: the student table (needs a 2D array) and the "subjects + teacher" bullet (needs one entry per materia×docente pair, but `consiglioDiClasse` is grouped per docente, with `materie[]` as a sub-array — a docente teaching >1 materia in this class must still produce >1 bullet). Rather than growing the CDU itself with presentation-shaped fields (view formatting — enum→label, list-join, materia flattening — has no place in the domain-neutral CDU per `SPECS_ALDO/02_CDU_STRUTTURA.md`), add a new `GeneratorStrategy`, `RiepilogoClasseGeneratorStrategy`, that implements `GeneratorStrategy` directly (not by subclassing `DocumentoGenericoGeneratorStrategy` — its `render()` forwards `cdu` unchanged, which can't carry the extra flattened-bullet field through). It does its own pre-pass, builds a small **document-scoped** projection (never written back onto the shared `Cdu` object, so nothing else observes it), then makes the same `templates.processDocument` call `DocumentoGenericoGeneratorStrategy` would:

```ts
export class RiepilogoClasseGeneratorStrategy implements GeneratorStrategy {
  constructor(
    private readonly templates: ITemplateEngine,
    private readonly tables: IDocumentTableFacade
  ) {}
  render(fileId: string, cdu: Cdu): void {
    const marker = '{{TABELLA_ALUNNI}}';
    this.tables.insertTableAtMarker(fileId, marker, buildRosterRows(cdu), { headerRow: true });
    this.tables.removeText(fileId, marker);
    const context = {
      ...(cdu as unknown as Record<string, unknown>),
      riepilogoMaterieDocenti: buildMaterieDocenti(cdu) // one entry per (docente, materia) pair
    };
    this.templates.processDocument(fileId, context);
  }
}
```

`buildRosterRows(cdu)` and `buildMaterieDocenti(cdu)` are small pure functions (co-located in the same file) mapping `focus.classe.studenti.listaCompleta` → `string[][]` (header `['Nome', 'Religione', 'Email', 'Piani']`) and `focus.classe.consiglioDiClasse` → a flat `{ nomeMateria, nomeDocente }[]` respectively. `RiepilogoClasseGeneratorStrategy` is the only place this SGSA-specific view formatting lives, per CLAUDE.md's carve-out for logic that "has no place in a general-purpose GAS library." The template's bullet list then reads `{{#bullet_list:riepilogoMaterieDocenti}}{{nomeMateria}} — {{nomeDocente}}{{/bullet_list}}`.

Registered as `GENERATORE = 'RIEPILOGO_CLASSE'` in `Bootstrap.ts`'s strategy registry, alongside the existing `DOCUMENTO_CON_TABELLE_IMPORTATE` wiring (same `IDocumentTableFacade` dependency, already constructed there).

**New CONF_DOC row + Drive template**, in `E2eSampleDatabaseBuilder.seedConfDoc`/`E2eTemplateProvisioner` (the only place CONF_DOC rows and their Drive templates exist as code in this repo — real production CONF_DOC rows are admin-entered directly into the live spreadsheet, out of this repo's scope): `ID='RIEPILOGO_CLASSE'`, `TIPO='RIEPILOGO_CLASSE'`, `GENERATORE='RIEPILOGO_CLASSE'`, `FORMATO='GDOC'`, one Drive Doc template with the marker + bullet-list + plain-field paragraphs described above, provisioned the same way `VERBALE_PARAGRAPHS` is today.

## 5. `LOG_MAIL.TESTO` — plain-text audit column

**New column:** `TESTO` on `LOG_MAIL`, the email's composed body (already available as `corpoHtml` in the pipeline context, set by `ComposeEmailStep` at `emailSteps.ts:327` and read by `SendEmailStep`), stripped of all HTML tags, converted to plain text with line breaks preserved, truncated to a max length so it survives as a single Google Sheets cell.

**GasLibraryFactory extension (per CLAUDE.md GasLibraryFactory-first rule — confirmed no existing match: `CoreUtilsLib.HtmlSanitizer` only escapes/validates, has no tag-stripping method):** add `HtmlSanitizer.stripToPlainText(html, options)` in `GasLibraryFactory/CoreUtilsLib/src/utils/HtmlSanitizer.js`:

- Converts block-level boundaries (`<br>`, `</p>`, `</div>`, `</li>`, `</tr>`) to `\n` *before* stripping remaining tags, so paragraph/list/row structure survives as line breaks (not word-run-together text).
- Strips all remaining tags, decodes the handful of HTML entities `escapeHtml` itself produces (`&amp;`, `&lt;`, `&gt;`, `&quot;`, `&#39;`) plus `&nbsp;`.
- Collapses runs of blank lines, trims.
- `options: { maxLength?: number; truncationMode?: 'marker' | 'cut' | 'none' }` — default `maxLength=2000`, `truncationMode='marker'` (cuts to `maxLength - 1` chars and appends `…`, total ≤ `maxLength`). ALDO always calls with defaults (no options passed) — the configurability is a library-level generality concern, not something ALDO's call site needs to expose.

**ALDO wiring:**
- `COL_LOG_MAIL.TESTO` in `src/config/schema.ts`.
- `LogEmail` entity (`src/domain/entities/LogEmail.ts`): new `testo: string` field, read/written in `fromData`/`toData`.
- `LogEmailRepository.registraInvio` (`src/infrastructure/repositories/LogEmailRepository.ts`): new `corpoHtml: string` parameter, stores `HtmlSanitizer.stripToPlainText(corpoHtml)` into `COL_LOG_MAIL.TESTO`.
- `LogEmailStep._executeLogic` (`src/application/pipelines/emailSteps.ts:463`): pass `ctx.get<string>('corpoHtml') ?? ''` through to `registraInvio`.
- `SheetDbAdapter.ts` / test fixtures / `SampleDatabaseBuilder.ts` / `E2eSampleDatabaseBuilder.ts`: add `TESTO` to `COL_LOG_MAIL` header seeding (`Object.values(COL_LOG_MAIL)` already picks it up automatically once the column is added to the const, no separate seed-data change needed since `HEADERS[TABLE.LOG_MAIL]` is derived from the same map).
- `vendor/gaslibs.Code.js` will need `npm run refresh:vendor` after the GasLibraryFactory change lands, per the existing vendor-refresh flow.

## Out of scope / explicitly not changed
- Folder links (`AlberoCartelle.ts`) — already correct.
- `renderCarenzeBox`'s `simbolo` prefix and overall box container (`wrapBox`) — untouched.
- `SampleDatabaseBuilder.ts` rep/religion variety — only the `RELIGIONE` enum-value bug is fixed there; no rep/religion distribution changes since it isn't scenario-tested per class.
- No new CDU provider/recipe/mapper for item 4 — `CLASSE_COMPLETA` already covers it.
