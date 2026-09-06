# Audit — Validazione DB e righe completamente vuote

## Scopo

Le funzioni di validazione del database devono ignorare le righe completamente
vuote (righe che non contengono alcun record), perché non hanno bisogno di
essere validate. Questo documento descrive **dove** risiede il problema, **perché**
può manifestarsi, e **come** risolverlo.

**Nota:** questo audit non modifica alcun codice. Propone solo l'analisi.

---

## Funzioni coinvolte

### ALDO (`src/`)

| Funzione | File | Ruolo |
|----------|------|-------|
| `DatabaseValidationService.esegui()` | `src/application/services/DatabaseValidationService.ts:48` | Orchestra la validazione: legge i dataset, invoca la rule engine, genera il report |
| `DatabaseValidationService.leggiTabelle()` | `src/application/services/DatabaseValidationService.ts:78` | Legge le righe di ogni tabella via `db.table(t).findAll()` |
| `regoleValidazione()` | `src/config/validationRules.ts:87` | Definisce le regole di validazione |
| `SheetTableAdapter.findAll()` | `src/infrastructure/db/SheetDbAdapter.ts:89` | Ponte verso la libreria (`getAllRows`) |

### GasLibraryFactory (`GasLibraryFactory/`)

| Funzione | File | Ruolo |
|----------|------|-------|
| `TableService.getAllRows()` / `getRows()` | `SheetDBLib/src/TableService.js:897 / 640` | Restituisce le righe lette dal foglio |
| `TableService._processRawData()` | `SheetDBLib/src/TableService.js:953` | Converte la matrice 2D del foglio in righe-oggetto, **saltando le righe vuote** |
| `DatasetValidator.validate()` | `GasSchemaValidatorLib/src/DatasetValidator.js:44` | Engine dichiarativo delle regole; **non controlla mai se una riga è interamente vuota** |
| `DatasetValidator._required/_enum/_json/_foreignKey/_rowPredicate` | `DatasetValidator.js:112-224` | Le singole regole; ognuna itera **tutte** le righe senza filtrare le vuote |

---

## Il problema

### 1. Il filtro anti-righe-vuote esiste SOLO in lettura, ed è fragile

L'unico punto in cui le righe completamente vuote vengono scartate è
`_processRawData` in `TableService.js:962-966`:

```js
// Skip completely empty rows
if (!data[i] || data[i].every((cell) => cell === '' || cell === null || cell === undefined)) {
  continue;
}
```

Il controllo verifica che **ogni cella** sia esattamente `''`, `null` o
`undefined`. Ha due limiti:

- **Whitespace-only:** una cella composta solo da spazi (`' '`) NON è `=== ''`,
  quindi una riga di celle `' '` **non viene saltata** e arriva al validatore.
- **Celle non-`''` vuote:** qualunque rappresentazione di "vuoto" diversa dalla
  stringa vuota esatta (es. `' '`, `'\t'`, valori restituiti dall'API con un
  formato diverso) buca il filtro.

### 2. L'engine `DatasetValidator` non ha una salvaguardia propria

Nessun metodo di `DatasetValidator` (`_required`, `_enum`, `_json`,
`_foreignKey`, `_rowPredicate`, `_columnName`) verifica se la riga corrente è
interamente vuota. Conseguenza: **se una riga vuota comunque raggiunge il
validatore, ogni regola la segnala**, producendo violazioni-spazzatura:

- `_required` → `Campo obbligatorio vuoto: EMAIL` su una riga che non esiste.
- `_foreignKey` / `FK_CLASSI_CATTEDRE` / `ITP_CLASSI` / `CURRICULUM_COVERAGE`
  (tutti `rowPredicate`) → iterano la riga vuota e generano hit falsi.

Il filtro al momento "salva" l'engine, ma è un **filtro fragile in un punto
sbagliato** (a monte, in lettura), non una garanzia al confine di validazione.

### 3. Doppia responsabilità non allineata ("GasLibraryFactory-first")

Per la regola del progetto, la logica riutilizzabile appartiene a
`GasLibraryFactory`, non ad ALDO. La decisione su dove aggiungere la guardia
deve quindi passare da una valutazione esplicita:

- La robustezza "una riga tutta vuota non va validata" è **generica** (qualsiasi
  dataset sheet-based) → appartiene a `DatasetValidator` in GLF.
- Il caso "riga con spazi" (whitespace-only) può essere visto come estensione
  del filtro di lettura di `SheetDBLib` **oppure** come guardia dentro
  `DatasetValidator`.

---

## Come risolverlo (proposta, senza modifiche applicate)

### Opzione raccomandata — guardia in `DatasetValidator` (GLF, gaslibs-first)

Aggiungere, in cima a `validate()` (o come helper riutilizzato da ogni `_rule`),
un controllo di riga-vuota basato su `cellToString`, più robusto del controllo
raw `=== ''`:

```js
// helper
function rowIsEmpty(row) {
  const values = Object.values(row);
  if (values.length === 0) return true;
  return values.every((v) => cellToString(v) === '');
}
```

Poi, in `validate()`, filtrare le righe vuote **prima** di iterare:

```js
const nonEmptyRows = Array.isArray(rows)
  ? rows.filter((r) => !rowIsEmpty(r))
  : rows;
```

Questo:

- copre whitespace-only (grazie a `cellToString` che fa `.trim()`),
- rende la validazione immune a qualunque riga vuota che sfugga alla lettura,
- è **usa-e-getta dentro l'engine**: nessun cambiamento di firma per i chiamanti.

### Opzione complementare — irrobustire il filtro di lettura in `SheetDBLib`

Per chiudere anche il buco a monte in `_processRawData` (`TableService.js:964`),
normalizzare il confronto:

```js
// prima:
if (!data[i] || data[i].every((c) => c === '' || c === null || c === undefined)) continue;
// dopo:
if (!data[i] || data[i].every((c) => c === null || c === undefined || String(c).trim() === '')) continue;
```

Questo evita che righe con soli spazi vengano mai materializzate, con beneficio
su **tutti** i consumatori di `getRows()`, non solo sulla validazione.

### Cosa NON fare

- Non aggiungere smoke-test per-riga in ogni singola regola (ripetizione).
- Non riscrivere la validazione in ALDO: la guardia appartiene a GLF
  (`DatasetValidator`), secondo il principio GasLibraryFactory-first.

---

## Impatto

- **Righe vuote = nessuna violazione spuria.** Il report `Validazione DB`
  riporterà solo problemi reali.
- **Nessuna modifica alla firma** delle funzioni pubbliche (`validate`, `getRows`,
  `findAll`) → nessun impatto sui consumatori esistenti.
- La riga `v.rowIndex + 2` in `DatabaseValidationService.ts:59` resta corretta:
  se le righe vuote vengono escluse prima della numerazione, l'indice fisico si
  mantiene allineato al foglio (header = riga 1).

---

## Riepilogo

| Problema | Dove | Fix |
|----------|------|-----|
| Il solo filtro righe-vuote è in lettura ed è fragile (non gestisce whitespace) | `SheetDBLib/src/TableService.js:964` | Normalizzare il confronto con `.trim()` |
| L'engine di validazione non ignora le righe vuote se gli arrivano | `GasSchemaValidatorLib/src/DatasetValidator.js:44-62` | Filtrare le righe vuote in `validate()` con `cellToString` |
| Nessuna modifica necessaria in ALDO | `DatabaseValidationService.ts` | — |

Proposta: applicare **entrambe** le opzioni (guardia in `DatasetValidator` +
robustezza in `_processRawData`), così la validazione è corretta anche se una
riga vuota supera comunque il filtro di lettura.
