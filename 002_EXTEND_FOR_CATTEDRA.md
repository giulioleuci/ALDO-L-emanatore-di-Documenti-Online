# Technical prompt: teacher chair summary email

Extend ALDO so that a `CONF_MAIL` pattern with `PROCESSO = PER_DOCENTE` can send **one email per teacher** containing the classes in which that teacher holds a chair and, under each class, the subjects of that chair.

The requested business meaning is deliberately narrower than the current effective-teacher resolution:

- include the original nominal assignments in `CLASSI`;
- apply the permanent changes in `VARIAZIONI_CATTEDRA` that are effective at the email execution date;
- completely ignore `SUPPLENZE`, even when a temporary replacement is active;
- a teacher who has lost a chair through a permanent variation must not see it, and the new holder must see it;
- send no empty summary email to a teacher with no resulting chair.

The desired output is equivalent to:

```html
<ul>
  <li>5A
    <ul>
      <li>Italian</li>
      <li>History</li>
    </ul>
  </li>
  <li>4B
    <ul>
      <li>Latin</li>
    </ul>
  </li>
</ul>
```

## Constraints and architectural decisions

1. Do **not** introduce a new `TIPO_BOX`. Reuse the existing `testo_dinamico` box, which renders an HTML Mustache template against the complete CDU.
2. Do **not** reimplement role-resolution rules by reading Sheets or native GAS globals from application code. Preserve Clean Architecture and use the existing repositories/resolution port through the composition root.
3. Before implementing, inspect `GasLibraryFactory/DOCS_LIBS`, especially `RoleResolutionLib.md` and `ContextEngine.md`. If the existing reusable resolution API cannot select `CLASSI + VARIAZIONI_CATTEDRA` while excluding `SUPPLENZE`, stop and ask whether `GasLibraryFactory` should be extended. Do not silently fork or copy the resolver logic into ALDO.
4. The final ALDO mapping from resolved assignments to the email-specific view model is domain-specific and belongs in ALDO. It must be fed by the reusable resolver rather than duplicate its precedence, scope, specificity, or articulated-class logic.
5. Keep `src/domain/` free of infrastructure/GAS imports. Wire any new provider/service through `src/config/Bootstrap.ts` and `ServiceContainer`; never construct it ad hoc in a pipeline step.
6. Use the execution date (`now`) consistently for all variation lookups. A variation with `DAL <= now` applies; where several variations affect the same slot, retain the resolver's established chronological/scope/specificity semantics.

## Required CDU contract

Add a serializable, template-oriented property to the recipient section of the email CDU:

```ts
destinatario.contesto.cattedre: Array<{
  id: string;                    // ClasseId, e.g. "5A"
  nome: string;                  // display name; use id when no other name exists
  materie: Array<{
    sigla: string;               // MateriaId, e.g. "ITA"
    nome: string;                // human-readable subject name
    specificita: string | null;  // e.g. a musical specialisation, otherwise null
  }>;
}>;
```

Populate it only for a teacher-targeted email. The target teacher must be the recipient identified by `destinatario.anagrafica.email`, not merely a member of the focus class council. This is important because `PER_DOCENTE` aggregates classes before the pipeline runs.

Build the view model from the nominal-plus-variation assignment result as of `now`:

- enumerate the active relevant teaching slots and use the existing resolver/port with a mode that excludes the `SUPPLENZE` source;
- retain only slots whose resolved nominal holder is the recipient teacher;
- preserve distinct class/materia/specificita combinations; do not duplicate a subject because a class is reached through an articulated-group entry point;
- group by actual `ClasseId`, then collect the subject display data through `IMateriaRepository`;
- sort classes deterministically by display name (then id), and subjects by subject name (then code and specificity);
- include IRC/ALT and ITP slots only when the normal `PER_DOCENTE` recipient semantics include them. Do not make an accidental change to their current routing policy.

Update the canonical CDU documentation in `SPECS_ALDO/02_CDU_STRUTTURA.md` to describe this property and its availability for `PER_DOCENTE` emails.

## Recipient enumeration

Review `EmailNotificationService.targetsPerDocente()` and its `cdcEmails()` dependency. It already aggregates class identifiers for a teacher target, but the implementation must be verified against this feature's policy:

- recipients are nominal holders after applicable permanent chair variations;
- temporary substitutes never become recipients merely because of `SUPPLENZE`;
- a permanent new holder becomes a recipient even if the original holder remains listed in `CLASSI`;
- `SUPPLENTI` configuration must not reintroduce a substitute into this specific summary. The expected configuration uses `SOLO_TITOLARI`.

Avoid changing the recipient behaviour of unrelated `CONF_MAIL` patterns. If a narrowly scoped target flag or a distinct resolution option is needed, make that option explicit and cover it with tests.

## Rendering and configuration

`renderBoxes()` and `createBoxComposer()` already support `testo_dinamico`: it calls the template facade on the entire CDU and emits HTML. Supply the following template through `BOX_CFG.CONTENUTO` after the CDU property exists:

```html
<p>Le classi e le materie della sua cattedra sono:</p>
<ul>
{{#destinatario.contesto.cattedre}}
  <li>{{nome}}
    <ul>
    {{#materie}}
      <li>{{nome}}{{#specificita}} — {{specificita}}{{/specificita}}</li>
    {{/materie}}
    </ul>
  </li>
{{/destinatario.contesto.cattedre}}
</ul>
```

Keep normal Mustache interpolation (`{{...}}`) for all names: the template facade escapes data values. Literal HTML is authored only by the trusted `CONF_MAIL` administrator. Do not use raw/triple-mustache interpolation for values from Sheets.

The box should be hidden when no chairs exist. Prefer a `CONF_MAIL.CONDIZIONE` based on `destinatario.contesto.cattedre.length > 0`, so the full email is skipped; do not send an email containing an empty `<ul>`.

## Tests and verification

Add focused unit tests for the CDU projection and the email target enumeration, plus an integration test through the email pipeline. Cover at least:

1. nominal holder with two classes and multiple subjects produces one grouped, sorted list;
2. a `VARIAZIONI_CATTEDRA` record effective before `now` removes the old holder and adds the new holder;
3. a future variation has no effect;
4. a live `SUPPLENZE` record has no effect on either recipient or displayed chair;
5. variation scope (`CLASSI`, `MATERIE`, wildcard/omission) and subject specificity follow the existing resolver;
6. articulated classes do not generate duplicate class-subject entries;
7. no chair means the pattern is skipped by the condition;
8. the rendered `testo_dinamico` HTML has one outer `<ul>`, one inner `<ul>` per class, and escaped subject data.

Run the smallest relevant Jest tests while developing, then run `npm run typecheck`, `npm run lint`, `npm test`, `npm run test:integration`, and the appropriate build test. Do not edit generated `dist/` files.
