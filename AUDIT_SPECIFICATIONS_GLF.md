# Le Specification di ALDO — analisi e piano di contributo a GasLibraryFactory

Commit: `3632e9c`. Data: 2026-08-25.

Documento autonomo. Analizza come funzionano le specification di dominio in ALDO, quali trappole nasconde il contratto attuale, e cosa ha senso contribuire a `DomainRepositoryLib` invece di tenere in `src/`.

---

## Premessa — una correzione importante

Una prima lettura aveva concluso che `toQueryObject()` fosse un hook interamente locale ad ALDO, ignoto alla libreria. **È falso.**

`DomainRepositoryLib/src/internal/query/QueryTranslator.js` supporta `toQueryObject` esplicitamente, e la sua JSDoc nomina ALDO:

> *"Detects whether a specification exposes an equality-criteria fast path via `toQueryObject()`, used by specs that keep the domain layer free of any SheetDBLib/query-builder import (e.g. ALDO's domain `Specification<T>`)."*

Quindi **parte del contributo a GasLibraryFactory è già stata fatta**. Resta vero il fatto letterale che il commento in `src/domain/specifications/Specification.ts` riporta: la *classe base* `Specification.js` non dichiara `toQueryObject`. Il contratto vive nel traduttore ma non nella base — ed è precisamente il buco da cui nasce tutto il resto di questo documento.

---

## Parte 1 — Come funzionano oggi

### 1.1 La forma di una specification

Due metodi che rispondono alla stessa domanda in due contesti. Esempio da `src/domain/specifications/ClasseSpecs.ts`:

```ts
export class ClassiAttiveSpec extends Specification<Classe> {
  isSatisfiedBy(c: Classe): boolean {
    return c.getDynamicColumns()[COL_CLASSI.ATTIVA] === true;
  }
  toQueryObject(): Record<string, unknown> {
    return { [COL_CLASSI.ATTIVA]: true };
  }
}
```

- `isSatisfiedBy` — *"data questa entità già in memoria, la regola vale?"*
- `toQueryObject` — *"la regola è esprimibile come uguaglianze su colonne? Se sì, eccole; se no, `null`."*

### 1.2 Il giro completo

Un repository la usa così:
```ts
findAttive(): Classe[] {
  return this.find(new ClassiAttiveSpec());
}
```

`this.find` viene dalla base `Repository` di `DomainRepositoryLib`:

```js
find(specification) {
  const validation = this.queryTranslator.validate(specification);

  if (validation.valid) {
    // PERCORSO A — pushdown
    const query = this.database.select(['*']).from(this.tableName);
    this.queryTranslator.translate(specification, query);
    rows = query.execute();
  } else {
    // PERCORSO B — in memoria
    rows = this._table.getAllRows();
    const entities = this.hydrationService.hydrateMany(rows, this.EntityClass);
    return entities.filter((entity) => specification.isSatisfiedBy(entity));
  }
  return this.hydrationService.hydrateMany(rows, this.EntityClass);
}
```

**Differenza cruciale: nel percorso A `isSatisfiedBy` non viene mai chiamato.** La query è l'unico filtro.

Il `QueryTranslator` decide quale percorso prendere:
```js
_hasQueryObjectCriteria(specification) {
  return (
    typeof specification.toQueryObject === 'function' &&
    specification.toQueryObject() !== null &&
    specification.toQueryObject() !== undefined
  );
}
```

e applica le uguaglianze:
```js
_applyQueryObject(criteria, queryBuilder) {
  for (const [column, value] of Object.entries(criteria)) {
    queryBuilder.where(column, '=', value);
  }
  return queryBuilder;
}
```

Il `queryBuilder` è ALDO-side, in `src/infrastructure/db/Database.ts`:
```ts
export class EqualityQueryBuilder {
  private readonly wheres: Array<[string, unknown]> = [];

  where(column: string, _operator: string, value: unknown): this {
    this.wheres.push([column, value]);
    return this;
  }

  execute(): Row[] {
    if (this.wheres.length === 1 && this.indexedLookup !== undefined) {
      const [column, value] = this.wheres[0]!;
      const indexed = this.indexedLookup(column, value);
      if (indexed !== null) return indexed;      // ← lookup O(1) su indice
    }
    return this.getRows().filter((row) =>
      this.wheres.every(([column, value]) => row[column] === value)
    );
  }
}
```

**Il guadagno vero del pushdown**: quando la spec produce una singola uguaglianza su una colonna indicizzata, non si scansiona la tabella — si fa un lookup O(1). Su `LOG_DOCS` con migliaia di righe la differenza è sostanziale.

### 1.3 Schema del flusso

```
repository.find(spec)
   │
   ├─ toQueryObject() → oggetto?  ─── SÌ ──→ where() per ogni coppia
   │                                          └→ execute(): indice O(1) o scan filtrato
   │                                          └→ hydrateMany(righe)      [isSatisfiedBy IGNORATO]
   │
   └────────────────────── null ──→ getAllRows()  [tutta la tabella]
                                    └→ hydrateMany(tutto)
                                    └→ .filter(isSatisfiedBy)
```

---

## Parte 2 — Censimento: 32 spec concrete, quattro famiglie

### Famiglia 1 — uguaglianza pura su proprietà semplice (16 spec)

Le due metà sono la stessa cosa scritta due volte:
```ts
isSatisfiedBy(p: Progetto) { return p.classe === this.classeId.value; }
toQueryObject()            { return { [COL_PROGETTI.CLASSE]: this.classeId.value }; }
```

`AlunniInClasseSpec`, `AlunniPerReligioneSpec`, `CarenzePerAlunnoSpec`, `CarenzePerClasseSpec`, `ClassiPerIndirizzoSpec`, `MovimentiPerAlunnoSpec`, `MovimentiPerTipoSpec`, `OreASLPerAlunnoSpec`, `OreASLPerAnnoSpec`, `PianiPerAlunnoSpec`, `PianiPerTipoSpec`, `ProgettiPerClasseSpec`, `ProgettiPerTipoSpec`, `VariazioniPerTitolareSpec`, `VariazioniPerNuovoTitolareSpec`, `IndirizziPerTipoSpec`.

### Famiglia 2 — accessore di entità + uguaglianza (5 spec)

`isSatisfiedBy` chiama un metodo, `toQueryObject` legge la colonna sottostante:
```ts
isSatisfiedBy(d: Docente) { return d.isITP(); }
toQueryObject()           { return { [COL_DOCENTI.ITP]: true }; }
```

`AlunniRipetentiSpec`, `AlunniRappresentantiSpec`, `DocentiITPSpec`, `ClassiAttiveSpec`, `AlunniAttiviSpec`.

### Famiglia 3 — solo in memoria, `toQueryObject(): null` (11 spec)

Con motivazioni **eccellenti**, documentate una per una. Esempio:
```ts
/**
 * Classes for a given school year. Not pushdown-eligible: sheet-sourced ANNO
 * cells may come back as strings, so this needs the numeric coercion the
 * equality-only pushdown builder doesn't perform.
 */
```

Altri motivi ricorrenti: contenimento CSV (`VariazioniPerClasseSpec`, `VariazioniPerMateriaSpec`), negazione (`CarenzeNonNotificateSpec`), appartenenza a `Set` (`AlunniBESSpec`, `MateriePerDipartimentoSpec`), predicato non banale (`MaterieEsamePrimaSpec` / `MaterieEsameSecondaSpec` chiamano `esameConfig?.isPrimaProvaPerIndirizzo()`), JSON non vuoto (`ClassiArticolateSpec`), coercizione numerica (`ClassiPerAnnoSpec`).

### Famiglia 4 — `FiltriSorgente.ts`, 262 righe

Cosa diversa: un parser + validatore del JSON `DATI_SORGENTE.filtri` di `CONF_MAIL`, che costruisce `PredicateSpecification` a runtime. Dominio SGSA puro.

### Verdetto sulla qualità

Le specification ALDO sono **codice ben fatto**. Le motivazioni di non-pushdown sono precise e spiegano il *perché* tecnico, non solo il *cosa*. `AlunniBESSpec` prende un `Set<string>` invece di un repository per restare domain-pure, e offre `static fromPiani(...)` per la costruzione. Scelte competenti.

Il problema è un altro: **c'è un pattern ripetuto 21 volte, e un contratto senza rete.**

---

## Parte 3 — Le tre trappole del contratto attuale

Contano perché determinano *cosa* ha senso dare a GasLibraryFactory.

### Trappola 1 — nessuno verifica che le due metà siano d'accordo

`Repository.find` sceglie **una** delle due metà. Se non dicono la stessa cosa, i risultati sono sbagliati e nessuno se ne accorge.

`RuoliPerDocenteSpec`:
```ts
/**
 * RUOLI held by a given teacher (ref 07 §14). DOCENTE is a CSV, so the match is
 * by containment in memory; toQueryObject is only a SheetDBLib narrowing hint.
 */
isSatisfiedBy(candidate: RuoloSpeciale) { return candidate.hasDocente(this.email); }
toQueryObject() { return { [COL_RUOLI.DOCENTE]: this.email.value }; }
```

`DOCENTE` è un CSV tipo `"a@x.it,b@x.it"`. `isSatisfiedBy` fa contenimento. `toQueryObject` produce **uguaglianza esatta**: una riga con `"a@x.it,b@x.it"` non corrisponde a `"a@x.it"`.

Il commento dice "narrowing hint" — ma nel percorso A non c'è nessun secondo filtro dopo. Chi scrivesse `this.find(spec)` otterrebbe **meno righe del dovuto, in silenzio**.

Perché oggi non esplode:
```ts
findByDocente(email: Email): RuoloSpeciale[] {
  const spec = new RuoliPerDocenteSpec(email);
  return this.all().filter((r) => spec.isSatisfiedBy(r));   // ← bypassa il pushdown
}
```
Mina disinnescata a mano, non dal contratto. Il prossimo che scrive `this.find(spec)` la ricalpesta.

**Caso gemello.** `AlunniAttiviSpec` è tipizzata `Specification<RowLike>` e il suo `isSatisfiedBy` legge `candidate[COL_ALUNNI.ATTIVO]`, cioè una **riga grezza**. Ma viene usata così:
```ts
return this.alunni.find(new AlunniAttiviSpec())   // find() idrata entità Alunno
```
Oggi funziona perché `toQueryObject` non è null, quindi `isSatisfiedBy` non viene mai chiamato. Il giorno in cui `ATTIVO` smettesse di essere pushdownable, `isSatisfiedBy(alunnoEntity)` leggerebbe `undefined`, restituirebbe `false` per tutti, e `getAlunniAttivi` tornerebbe **vuoto senza errori**.

### Trappola 2 — `toQueryObject()` chiamato 5 volte per ogni `find()`

```js
_hasQueryObjectCriteria(spec) {
  return (
    typeof spec.toQueryObject === 'function' &&
    spec.toQueryObject() !== null &&        // ← chiamata 1
    spec.toQueryObject() !== undefined      // ← chiamata 2
  );
}
```

`Repository.find` chiama `validate(spec)` (→ 2), poi `translate(spec, query)` che richiama `_hasQueryObjectCriteria` (→ altre 2), poi `_applyQueryObject(spec.toQueryObject())` (→ 1). **Totale 5.**

Per le spec ALDO il costo è trascurabile — restituiscono letterali. Ma è sciatto, e per una spec che costruisse l'oggetto in modo non banale diventerebbe un problema vero.

### Trappola 3 — le 11 spec in memoria pagano throw/catch a ogni chiamata

Se `toQueryObject()` restituisce `null`, `validate` prosegue:
```js
if (typeof spec.canBeTranslatedToQuery !== 'function' || !spec.canBeTranslatedToQuery()) {
  return { valid: false, reason: `… cannot be translated …` };
}
```

`canBeTranslatedToQuery` è ereditato dalla base GLF e funziona **per tentativo**:
```js
canBeTranslatedToQuery() {
  try {
    const mockBuilder = { where: () => mockBuilder, andWhere: () => mockBuilder, /* … */ };
    this.toQuery(mockBuilder);
    return true;
  } catch (_error) {
    return false;
  }
}
```

La base `toQuery` lancia sempre. Quindi ogni `find()` con una spec in memoria: alloca un mock builder, chiama un metodo che lancia, cattura, restituisce `false`.

**Un'eccezione lanciata e catturata per ogni chiamata, solo per scoprire un fatto che la spec conosce staticamente.** Undici spec, ognuna su ogni chiamata. Su V8 lanciare costa: cattura dello stack trace, deottimizzazione della funzione chiamante. In più, con il debugger su "break on all exceptions" si vedono esplosioni continue e innocue.

---

## Parte 4 — Cosa dare a GasLibraryFactory

Cinque opzioni. Non si escludono: 1 → 5 → 3 → 2 è una progressione naturale.

---

### Opzione 1 — Dichiarare `toQueryObject` sulla classe base

**Cosa.** Il contratto esiste già nel `QueryTranslator` ma non è dichiarato nella base. Chi legge `Specification.js` non può sapere che esiste.

```js
// DomainRepositoryLib/src/specifications/Specification.js
export class Specification {
  // … isSatisfiedBy, and, or, not, toQuery esistenti …

  /**
   * Percorso rapido di pushdown per specification domain-pure.
   *
   * Restituisce un oggetto di uguaglianze `{colonna: valore}` quando la regola
   * è interamente esprimibile come uguaglianze, `null` quando serve la valutazione
   * in memoria. Alternativa a `toQuery(queryBuilder)`: permette al layer di dominio
   * di restare libero da qualsiasi import di query builder.
   *
   * INVARIANTE — quando restituisce un oggetto non-null, il filtro deve essere
   * ESATTAMENTE equivalente a isSatisfiedBy(). Repository.find() applica UNO SOLO
   * dei due: se divergono, il risultato è silenziosamente sbagliato.
   * Nel dubbio, restituire null.
   *
   * @returns {Record<string, unknown>|null}
   */
  toQueryObject() {
    return null;
  }

  /** @override — nessun try/catch: risposta statica, non per tentativo. */
  canBeTranslatedToQuery() {
    if (this.toQueryObject() !== null) return true;
    try { /* … fallback esistente per le spec toQuery-based … */ } catch { return false; }
  }
}
```

Nel `QueryTranslator`, chiamare `toQueryObject()` **una volta sola**:
```js
_queryObjectCriteria(specification) {
  if (typeof specification.toQueryObject !== 'function') return null;
  const criteria = specification.toQueryObject();
  return criteria === null || criteria === undefined ? null : criteria;
}
```

**Pro**
- Risolve trappole 2 e 3 in un colpo. Il default `return null` sulla base fa sì che le spec in memoria non tocchino più `canBeTranslatedToQuery` per tentativo.
- **Documenta l'invariante** — oggi non è scritto da nessuna parte che `toQueryObject` e `isSatisfiedBy` devono coincidere, ed è il presupposto su cui poggia tutto.
- ALDO semplifica: le 11 spec in memoria smettono di dover scrivere `toQueryObject(): null { return null; }` a mano.
- Diff minuscolo, rischio prossimo a zero, nessuna rottura per i consumatori esistenti.

**Contro**
- Le spec GLF esistenti (`FieldSpecification`, `CompositeSpecification`) erediterebbero `toQueryObject() → null` e continuerebbero a usare `toQuery`. Da verificare che `_queryObjectCriteria` restituisca `null` per loro e che il ramo `toQuery` resti raggiungibile. **Va testato**, non è automatico.
- `FieldSpecification` ha già un `toQueryObject` dichiarato nell'ambient `types/gaslibs/index.d.ts` di ALDO ma **non** nel `.js` reale. Discrepanza da risolvere prima di toccare la base.

**Verdetto: farlo. Miglior rapporto valore/rischio.**

---

### Opzione 2 — Una base `EqualityFieldSpec` per la Famiglia 1

**Cosa.** Le 16 spec di Famiglia 1 sono la stessa forma 16 volte. Il pezzo generico produce la coppia coerente **per costruzione**.

```js
// DomainRepositoryLib/src/specifications/equalitySpecification.js

/**
 * Specification di uguaglianza in cui isSatisfiedBy e toQueryObject sono
 * coerenti per costruzione: il valore letto dall'entità e il valore confrontato
 * nella query sono lo stesso.
 *
 * @param {string} column   Nome colonna DB per il pushdown.
 * @param {Function} read   (entity) => valore in memoria.
 * @param {*} expected      Valore atteso.
 */
export class EqualityFieldSpec extends Specification {
  constructor(column, read, expected) {
    super();
    this._column = column; this._read = read; this._expected = expected;
  }
  isSatisfiedBy(entity) { return this._read(entity) === this._expected; }
  toQueryObject()       { return { [this._column]: this._expected }; }
  toString()            { return `${this._column} = ${String(this._expected)}`; }
}
```

ALDO-side, tenendo la classe nominata come guscio:
```ts
// prima — 11 righe
export class ProgettiPerClasseSpec extends Specification<Progetto> {
  constructor(private readonly classeId: ClasseId) { super(); }
  isSatisfiedBy(p: Progetto): boolean { return p.classe === this.classeId.value; }
  toQueryObject(): Record<string, unknown> {
    return { [COL_PROGETTI.CLASSE]: this.classeId.value };
  }
}

// dopo — 5 righe
/** Progetti assegnati a una classe (ref 06 §13). */
export class ProgettiPerClasseSpec extends EqualityFieldSpec<Progetto> {
  constructor(classeId: ClasseId) {
    super(COL_PROGETTI.CLASSE, (p) => p.classe, classeId.value);
  }
}
```

Δ ALDO: circa **−100 righe**. Δ GLF: **+35**.

**Pro**
- **Elimina strutturalmente la trappola 1** per la Famiglia 1: c'è un solo `expected`, usato da entrambe le metà. Non è più *possibile* che divergano.
- Il codice ALDO che resta esprime solo ciò che è specifico: colonna, accessore, valore.
- La Famiglia 2 funziona uguale: `super(COL_DOCENTI.ITP, (d) => d.isITP(), true)`.
- Guadagno per GLF reale: lo scenario "foglio come DB" è comune a tutti i progetti della factory, non specifico di SGSA.

**Contro**
- **Costo sui tipi.** GLF è JavaScript, ALDO è TypeScript `strict`. Serve una firma nell'ambient `.d.ts` che preservi il generico:
  ```ts
  abstract class EqualityFieldSpec<T> extends Specification<T> {
    constructor(column: string, read: (e: T) => unknown, expected: unknown);
  }
  ```
  Fattibile, ma il `.d.ts` diventa un secondo punto di verità da tenere allineato al `.js`. Il progetto lo fa già per un'altra dozzina di classi: costo noto, ma costo.
- **Attenzione al nome della classe.** Il `QueryTranslator` logga per nome (`Translating specification via toQueryObject(): ProgettiPerClasseSpec`). Con una classe anonima quel log diventa inutile — da qui la scelta di tenere il guscio nominato invece di una factory che restituisce classi anonime.
- **Non copre la Famiglia 3**, cioè le 11 più interessanti.

**Verdetto: farlo, ma dopo l'opzione 1 e dopo l'opzione 3, e tenendo le classi nominate.**

---

### Opzione 3 — Una guardia che verifica l'invariante nei test

**Cosa.** L'opzione 2 protegge la Famiglia 1 per costruzione. Le Famiglie 2 e 3 restano scoperte. Serve una guardia eseguibile.

```js
// DomainRepositoryLib/src/testing/specificationContract.js

/**
 * Verifica che le due metà di una specification concordino.
 * Se toQueryObject() è non-null, il filtro di uguaglianza deve selezionare
 * ESATTAMENTE le stesse righe di isSatisfiedBy().
 *
 * @param {Specification} spec
 * @param {Array<Object>} rows   Righe grezze rappresentative (positive E negative).
 * @param {Function} hydrate     (row) => entità.
 * @returns {{ok: boolean, divergenti: Array}}
 */
export function assertSpecificationContract(spec, rows, hydrate) {
  const criteria = spec.toQueryObject();
  if (criteria === null) return { ok: true, divergenti: [] };   // in memoria: niente da verificare

  const divergenti = rows.filter((row) => {
    const viaQuery  = Object.entries(criteria).every(([col, val]) => row[col] === val);
    const viaMemory = spec.isSatisfiedBy(hydrate(row));
    return viaQuery !== viaMemory;
  });

  return { ok: divergenti.length === 0, divergenti };
}
```

Uso ALDO:
```ts
it.each(SPEC_PUSHDOWN)('%s: pushdown e in-memory concordano', (nome, spec, righe) => {
  const { ok, divergenti } = assertSpecificationContract(spec, righe, (r) => Alunno.fromData(r));
  expect(divergenti).toEqual([]);
  expect(ok).toBe(true);
});
```

Su `RuoliPerDocenteSpec` con una riga `DOCENTE: "a@x.it,b@x.it"`: `viaQuery = false`, `viaMemory = true` → divergenza catturata.

**Pro**
- **Cattura la classe di bug che oggi nessuno cattura.** Unica delle cinque opzioni che affronta la trappola 1 in generale.
- Trasforma un invariante scritto in prosa in una verifica eseguibile.
- Va nel modulo `src/testing/` che ogni libreria GLF ha già — collocazione naturale.
- Aggiunge test invece di toglierne.

**Contro**
- Il valore dipende dalla qualità delle righe di prova. Con sole righe positive, `viaQuery` e `viaMemory` concordano sempre e il test passa a vuoto. **Servono righe negative e casi limite** — lavoro reale, non un'annotazione.
- Verifica solo le spec pushdown. Le 11 in memoria restano coperte dai loro test normali, ed è corretto: non c'è divergenza possibile.
- Rischia di diventare cerimoniale se applicato con `rows: []`. Da presidiare in review.

**Verdetto: farlo, ma solo impegnandosi sulle righe negative.** Altrimenti è un test debole in più.

---

### Opzione 4 — Portare il generico `Specification<T>` in GLF

**Contro decisivi**
- **GLF è JavaScript.** Non può *avere* un generico: può solo dichiararlo in un `.d.ts`. Esisterebbe solo per i consumatori TypeScript, cioè oggi solo ALDO.
- **Riproduce il problema `TS2506`** già documentato in ALDO: una `class Specification<T> extends Specification` in un ambient global si auto-riferisce.
- **Non risolve l'unsoundness di varianza**: `isSatisfiedBy(candidate: T)` che restringe `isSatisfiedBy(entity: unknown)` typechecka solo grazie alla bivarianza dei parametri in sintassi-metodo, e resterebbe così ovunque lo si metta.
- Il generico è **valore ALDO**, non valore GLF: nasce dal fatto che ALDO è TypeScript.

**Verdetto: non farlo.** Il generico resta in ALDO.

---

### Opzione 5 — `PredicateSpecification`: c'è da prendere, non da dare

Dentro `FiltriSorgente.ts` c'è un helper di 12 righe:
```ts
class PredicateSpecification<T> extends Specification<T> {
  constructor(private readonly predicate: (candidate: T) => boolean) { super(); }
  isSatisfiedBy(candidate: T): boolean { return this.predicate(candidate); }
  toQueryObject(): null { return null; }
}
```

**GLF ce l'ha già**: `FunctionSpecification.js`, 73 righe. Ed è **già dichiarata** nell'ambient `types/gaslibs/index.d.ts` di ALDO:
```ts
class FunctionSpecification extends Specification {
  constructor(predicate: (entity: unknown) => boolean);
  isSatisfiedBy(entity: unknown): boolean;
}
```
Quindi già visibile al codice ALDO, e non usata.

**Verdetto: niente da dare, c'è da prendere.** Verificare se `FunctionSpecification` copre il caso; se sì, `PredicateSpecification` sparisce (−12 righe). Se non copre — probabilmente per la tipizzazione generica — è un caso da **regola 3 di CLAUDE.md**: chiedere se estendere la libreria invece di tenere il duplicato locale.

**La lezione generale**: il primo passo di "dare a GLF" è controllare cosa GLF ha già. `FunctionSpecification` esisteva, era dichiarata, ed è stata riscritta lo stesso. È lo scenario che la regola GasLibraryFactory-first esiste per prevenire.

---

## Parte 5 — Cosa NON dare

**`FiltriSorgente.ts` (262 righe).** Interpreta il JSON `DATI_SORGENTE.filtri` di `CONF_MAIL`, con chiavi `tipo`/`stato`/`sottotipo`/`idGen`/`idOrig`/`notificato`/`classi`/`utenti`/`materie`/`not` e modalità CSV `any`/`all`. Vocabolario SGSA. Generalizzarlo produrrebbe un mini-linguaggio di query configurabile che nessun altro progetto userebbe — la definizione di over-engineering. **Resta in ALDO.**

**Le 11 spec di Famiglia 3.** Condizioni di dominio scolastico: contenimento CSV nelle variazioni cattedra, prima/seconda prova d'esame per indirizzo, appartenenza BES. **Restano in ALDO**, ed è corretto.

---

## Parte 6 — Piano

| # | Contributo | Δ GLF | Δ ALDO | Rischio | Risolve |
|---|---|---|---|---|---|
| **1** | `toQueryObject` sulla base + `canBeTranslatedToQuery` statico + chiamata singola | +25 | −20 | basso | trappole 2 e 3 |
| **5** | *(prendere)* verificare `FunctionSpecification` vs `PredicateSpecification` | 0 | −12 | nessuno | duplicazione |
| **3** | `assertSpecificationContract` in `src/testing/` | +40 | +60 test | basso | trappola 1 in generale |
| **2** | `EqualityFieldSpec` come base | +35 | −100 | medio (tipi) | trappola 1 su 16 spec |
| **4** | generico `Specification<T>` in GLF | — | — | — | **non fare** |

**Ordine: 1 → 5 → 3 → 2.**

**3 prima di 2** perché la guardia sull'invariante è la rete di sicurezza. Con quella in piedi, la migrazione delle 16 spec alla base comune è verificabile: ogni spec convertita passa o fallisce il contratto in modo dimostrabile. Senza, stai riscrivendo 16 classi affidandoti alla lettura.

**Fatto trasversale**: le opzioni 1, 2, 3 sono tutte modifiche a `DomainRepositoryLib`, quindi soggette allo stesso ciclo di verifica — test della libreria, poi `npm run refresh:vendor && npm run verify:vendor` in ALDO, poi suite offline ALDO completa. **Una modifica di libreria non è finita finché ALDO non è verde contro il vendor bundle ricostruito.** Conviene raggrupparle in un unico ciclo invece di pagarlo tre volte.

---

## Parte 7 — Conseguenza sulla base `Specification` di ALDO

Esiste una proposta separata di **togliere** `extends Specification` dalla base ALDO (`src/domain/specifications/Specification.ts`), motivata dal fatto che `.and()`, `.or()`, `.not()` non sono usati da nessuna parte in `src/` né in `test/`, mentre l'ereditarietà costa un workaround `TS2506` (dichiarare come `AldoSpecification` e riesportare con alias) più un override bivariante non solido, documentati in 22 righe di commento.

Alla luce di questa analisi le due strade diventano:

- **Se fai l'opzione 1** → **tieni `extends`**. L'ereditarietà diventa utile: la base fornirebbe il default `toQueryObject() → null` e un `canBeTranslatedToQuery` senza throw. Il commento di 22 righe si accorcia perché non deve più giustificare un'eredità inutilizzata.
- **Se non fai l'opzione 1** → **togli `extends`**: paghi due trappole documentate per tre metodi che nessuno usa.

Nota tecnica sulla seconda strada: togliendo `extends`, `canBeTranslatedToQuery` diventa `undefined`, quindi `QueryTranslator.validate` restituisce `{valid:false}` e le spec finiscono correttamente sul percorso in memoria — **stesso esito di oggi, senza il throw/catch**. Le spec con `toQueryObject` non-null continuano a funzionare perché `_hasQueryObjectCriteria` viene valutato per primo e struttralmente.

Non c'è terza via sensata.
