# Allineamento AS 2526 → ALLY Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Produrre `DATABASES_TO_CONVERT/ALLY/AS 2526 per ALDO.xlsx` allineato alle specifiche SGSA + `REPORT_ALLINEAMENTO.md`, tramite script deterministico versionato.

**Architecture:** Script Python one-off `convert_to_ally.py` che carica l'xlsx sorgente con openpyxl, applica regole di trasformazione pure (una funzione per regola, ognuna registra le modifiche in un `ChangeLog`), ricalcola i residui FK attesi e scrive output + report Markdown. Testabile con `unittest` su workbook sintetici.

**Tech Stack:** Python 3 stdlib (`unittest`, `json`, `argparse`, `pathlib`) + `openpyxl` (già installato nel sistema).

**Spec:** `docs/superpowers/specs/2026-08-24-database-ally-alignment-design.md`

## Global Constraints

- NON modificare mai il file sorgente `DATABASES_TO_CONVERT/AS 2526 per ALDO.xlsx`; scrivere solo in `DATABASES_TO_CONVERT/ALLY/`.
- Dipendenza esterna ammessa SOLO `openpyxl`; tutto il resto stdlib.
- Preservare header, ordine dei fogli e delle righe; nessuna riga aggiunta/rimossa.
- Preservare i tipi nativi delle celle (date `datetime`, booleani bool).
- I timestamp esistenti restano in formato `dd/MM/yyyy HH:mm:ss` (scelta utente).
- Elementi da NON toccare (scelta utente): harry.potter/HOGWARTS, classe ALTRO ISTITUTO, righe TEST_DOC_TABELLE_*, righe fantasma vuote, chiavi PARAMETRI inerti, ramo PEI assente.
- Ogni modifica deve comparire nel report con `{regola, foglio, riga, colonna, vecchio, nuovo}`.
- Codice/commenti/report in italiano, senza emoji.

---

### Task 1: Scheletro script + copia passante

**Files:**

- Create: `DATABASES_TO_CONVERT/convert_to_ally.py`
- Create: `DATABASES_TO_CONVERT/tests/test_convert_to_ally.py`

**Interfaces:**

- Produces: `main(source: Path, out_dir: Path) -> Path` (restituisce l'xlsx scritto); `load_workbook(path) -> openpyxl.Workbook`; costanti `SOURCE_DEFAULT`, `OUT_DIR_DEFAULT`, `REPORT_NAME = "REPORT_ALLINEAMENTO.md"` usate da tutti i task successivi.

- [ ] **Step 1: Scrivere il test fallente (roundtrip)**

```python
# DATABASES_TO_CONVERT/tests/test_convert_to_ally.py
import sys, tempfile, unittest
from pathlib import Path

import openxl_guard  # noqa: F401  (verifica dipendenza)

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import convert_to_ally as conv


def make_wb(sheets):
    """sheets: {nome: (headers, [tuple])} -> Workbook apribile/salvabile."""
    wb = openxl_guard.Workbook()
    wb.remove(wb.active)
    for name, (headers, rows) in sheets.items():
        ws = wb.create_sheet(name)
        ws.append(headers)
        for r in rows:
            ws.append(list(r))
    return wb


class RoundtripTest(unittest.TestCase):
    def test_main_copia_tutti_i_fogli_senza_modifiche(self):
        src_wb = make_wb({
            "ALUNNI": (("EMAIL", "ATTIVO"), (("a@x.it", True),)),
            "DOCENTI": (("EMAIL",), (("d@x.it",),)),
        })
        with tempfile.TemporaryDirectory() as tmp:
            src = Path(tmp) / "src.xlsx"
            out_dir = Path(tmp) / "out"
            src_wb.save(src)
                # main deve creare out_dir, salvare l'xlsx col nome del sorgente
            written = conv.main(src, out_dir)
            self.assertEqual(written.parent, out_dir)
            self.assertEqual(written.name, src.name)
            got = openxl_guard.load_workbook(written)
            self.assertEqual(got.sheetnames, ["ALUNNI", "DOCENTI"])
            self.assertEqual([c.value for c in got["ALUNNI"][1]], ["EMAIL", "ATTIVO"])
            self.assertEqual([c.value for c in got["ALUNNI"][2]], ["a@x.it", True])


if __name__ == "__main__":
    unittest.main()
```

Nota: `openxl_guard` non esiste — è un errore voluto per vedere il test fallire; nello Step 3 sostituire l'import con `import openpyxl as xl` e usare `xl.Workbook()` / `xl.load_workbook(...)` (aggiornare anche `make_wb` e il test).

- [ ] **Step 2: Eseguire il test e verificare che fallisca**

Run: `cd "DATABASES_TO_CONVERT" && python3 -m unittest tests.test_convert_to_ally -v`
Expected: FAIL (`ModuleNotFoundError: No module named 'openxl_guard'` oppure `No module named 'convert_to_ally'`)

- [ ] **Step 3: Implementare lo scheletro**

```python
# DATABASES_TO_CONVERT/convert_to_ally.py
#!/usr/bin/env python3
"""Allinea 'AS 2526 per ALDO.xlsx' alle specifiche SGSA (vedi spec 2026-08-24).

Scrive <out_dir>/<stesso nome sorgente> + REPORT_ALLINEAMENTO.md.
Non modifica mai il sorgente.
"""
from __future__ import annotations

import argparse
from pathlib import Path

import openpyxl as xl

SOURCE_DEFAULT = Path(__file__).resolve().parent / "AS 2526 per ALDO.xlsx"
OUT_DIR_DEFAULT = Path(__file__).resolve().parent / "ALLY"
REPORT_NAME = "REPORT_ALLINEAMENTO.md"


def load_workbook(path: Path) -> xl.Workbook:
    """Carica il workbook con tipi nativi (date/bool), formule risolte."""
    return xl.load_workbook(path, data_only=True)


def apply_rules(wb: xl.Workbook, log: "ChangeLog") -> None:
    """Punto di estensione: le regole dei task seguenti si agganciano qui."""


def main(source: Path, out_dir: Path) -> Path:
    out_dir.mkdir(parents=True, exist_ok=True)
    wb = load_workbook(source)
    apply_rules(wb, ChangeLog())
    dest = out_dir / source.name
    wb.save(dest)
    return dest


class ChangeLog:
    """Registro di tutte le modifiche applicate (una voce per cella)."""

    def __init__(self) -> None:
        self.entries: list[dict] = []

    def add(self, rule: str, sheet: str, row_key: str, column: str, old, new) -> None:
        self.entries.append(
            {"rule": rule, "sheet": sheet, "row": row_key,
             "column": column, "old": "" if old is None else old,
             "new": "" if new is None else new}
        )

    def count(self, rule: str) -> int:
        return sum(1 for e in self.entries if e["rule"] == rule)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", type=Path, default=SOURCE_DEFAULT)
    parser.add_argument("--out-dir", type=Path, default=OUT_DIR_DEFAULT)
    args = parser.parse_args()
    print(f"Scritto: {main(args.source, args.out_dir)}")
```

Correggere il test come da nota dello Step 1 (sostituire `openxl_guard` con `openpyxl as xl`); `ChangeLog` va definita PRIMA di `apply_rules`/`main`.

- [ ] **Step 4: Eseguire il test e verificare che passi**

Run: `cd "DATABASES_TO_CONVERT" && python3 -m unittest tests.test_convert_to_ally -v`
Expected: PASS (1 test)

- [ ] **Step 5: Commit**

```bash
git add DATABASES_TO_CONVERT/convert_to_ally.py DATABASES_TO_CONVERT/tests/test_convert_to_ally.py
git commit -m "feat(ally): scheletro convert_to_ally con copia passante e changelog"
```

---

### Task 2: Validatore residui + scrittura report

**Files:**

- Modify: `DATABASES_TO_CONVERT/convert_to_ally.py`
- Modify: `DATABASES_TO_CONVERT/tests/test_convert_to_ally.py`

**Interfaces:**

- Consumes: `ChangeLog` (Task 1).
- Produces: `collect_residuals(wb) -> list[dict]` con voci `{sheet, field, value, count}`; `EXPECTED_RESIDUAL_KEYS: set[tuple[str, str]]` (coppie ammesse sheet+field); `write_report(log, residuals, path) -> None`. `main` li integra: dopo `apply_rules` calcola residui e scrive anche il report.

- [ ] **Step 1: Scrivere i test fallenti**

Aggiungere al file di test:

```python
RESIDUALS_TEST_SHEETS = {
    "ALUNNI": (("EMAIL", "CLASSE"), (("a@x.it", "1A"),)),
    "CLASSI": (("ID",), (("1A",),)),
    "CARENZE": (("STUDENTE", "PROGRESSIVO"), (("orphan@x.it", 1),)),
    "CONF_DOC": (("ID", "TIPO"), (("PIANI_PERSONALIZZATI", "PIANO_PERS"),)),
    "LOG_DOCS": (
        ("ID", "ID_GEN", "TIPO", "STATO"),
        (("f1", "PCTO", "PCTO", "GENERATO"),),          # ok
        (("f2", "GHOST", "VERBALE", "GENERATO"),),      # residuo
        (("f3", None, "VERBALE", "GENERATO"),),         # residuo (vuoto)
    ),
    "LOG_FOLD": (
        ("ID", "TIPO"),
        (("k1", "PCTO"),),               # ok
        (("k2", "SPARITO"),),            # residuo
    ),
    "LOG_MAIL": (
        ("PATTERN", "DESTINATARI", "DATA", "STATO"),
        (("CDC_X", "a@x.it", "01/01/2026 10:00:00", "SUCCESS"),),
        (("GHOST_P", "a@x.it", "01/01/2026 10:00:00", "SUCCESS"),),  # residuo
    ),
}


class ResidualsTest(unittest.TestCase):
    def test_collect_residuals(self):
        wb = make_wb(RESIDUALS_TEST_SHEETS)
        res = conv.collect_residuals(wb)
        keys = {(r["sheet"], r["field"], r["value"]) for r in res}
        self.assertIn(("CARENZE", "STUDENTE", "orphan@x.it"), keys)
        self.assertIn(("LOG_DOCS", "ID_GEN", "GHOST"), keys)
        self.assertIn(("LOG_DOCS", "ID_GEN", "<VUOTO>"), keys)
        self.assertIn(("LOG_FOLD", "TIPO", "SPARITO"), keys)
        self.assertIn(("LOG_MAIL", "PATTERN", "GHOST_P"), keys)
        self.assertNotIn(("LOG_DOCS", "ID_GEN", "PCTO"), keys)

    def test_write_report_contiene_sezioni_e_residui(self):
        wb = make_wb(RESIDUALS_TEST_SHEETS)
        log = conv.ChangeLog()
        log.add("TEST", "CLASSI", "1A", "TERMINALE", None, True)
        with tempfile.TemporaryDirectory() as tmp:
            rep = Path(tmp) / conv.REPORT_NAME
            conv.write_report(log, conv.collect_residuals(wb), rep)
            txt = rep.read_text(encoding="utf-8")
        for frag in ("# Report allineamento", "## Modifiche", "## Residui",
                     "Deviazioni accettate", "orphan@x.it"):
            self.assertIn(frag, txt)
```

- [ ] **Step 2: Eseguire i test e verificare che falliscano**

Run: `cd "DATABASES_TO_CONVERT" && python3 -m unittest tests.test_convert_to_ally -v`
Expected: FAIL (`AttributeError: ... collect_residuals`)

- [ ] **Step 3: Implementare validatore e report**

In `convert_to_ally.py`:

```python
def _col_index(headers: tuple, name: str) -> int:
    return list(headers).index(name)


def collect_residuals(wb: xl.Workbook) -> list[dict]:
    """Violazioni FK residue DOPO le regole (solo quelle attese vanno bene)."""
    def ids(sheet_name: str) -> set:
        ws = wb[sheet_name]
        return {r[0] for r in ws.iter_rows(min_row=2, values_only=True) if r[0]}

    confdoc_ids = ids("CONF_DOC")
    confmail_ids = ids("CONF_MAIL")
    alunni = ids("ALUNNI")
    out: list[dict] = []

    def tally(sheet, field, values):
        from collections import Counter
        for value, count in Counter(v for v in values if v).items():
            out.append({"sheet": sheet, "field": field,
                        "value": str(value), "count": count})

    ws = wb["CARENZE"]
    i_st = _col_index(tuple(next(ws.iter_rows(min_row=1, max_row=1, values_only=True))), "STUDENTE")
    tally("CARENZE", "STUDENTE",
          (r[i_st] for r in ws.iter_rows(min_row=2, values_only=True) if r[i_st] not in alunni))

    ws = wb["LOG_DOCS"]
    hdr = tuple(next(ws.iter_rows(min_row=1, max_row=1, values_only=True)))
    i_ig = _col_index(hdr, "ID_GEN")
    empties, unknown = [], []
    for r in ws.iter_rows(min_row=2, values_only=True):
        ig = r[i_ig]
        if ig is None or str(ig).strip() == "":
            empties.append("<VUOTO>")
        elif ig not in confdoc_ids:
            unknown.append(ig)
    tally("LOG_DOCS", "ID_GEN", empties + unknown)

    ws = wb["LOG_FOLD"]
    hdr = tuple(next(ws.iter_rows(min_row=1, max_row=1, values_only=True)))
    i_ti = _col_index(hdr, "TIPO")
    tally("LOG_FOLD", "TIPO",
          (r[i_ti] for r in ws.iter_rows(min_row=2, values_only=True) if r[i_ti] not in confdoc_ids))

    ws = wb["LOG_MAIL"]
    hdr = tuple(next(ws.iter_rows(min_row=1, max_row=1, values_only=True)))
    i_pa = _col_index(hdr, "PATTERN")
    tally("LOG_MAIL", "PATTERN",
          (r[i_pa] for r in ws.iter_rows(min_row=2, values_only=True) if r[i_pa] not in confmail_ids))
    return out


# Coppie (sheet, field) i cui residui sono ACCETTATI dalla spec (§5/§6).
EXPECTED_RESIDUAL_KEYS = {
    ("CARENZE", "STUDENTE"),
    ("LOG_DOCS", "ID_GEN"),
    ("LOG_FOLD", "TIPO"),
    ("LOG_MAIL", "PATTERN"),
}


def write_report(log: ChangeLog, residuals: list[dict], path: Path) -> None:
    lines: list[str] = [
        "# Report allineamento AS 2526 per ALDO",
        "",
        "Generato da `convert_to_ally.py` — vedi spec "
        "`docs/superpowers/specs/2026-08-24-database-ally-alignment-design.md`.",
        "",
        "## Modifiche",
        "",
    ]
    by_rule: dict[str, list[dict]] = {}
    for e in log.entries:
        by_rule.setdefault(e["rule"], []).append(e)
    if not by_rule:
        lines.append("(nessuna modifica)")
    for rule in sorted(by_rule):
        entries = by_rule[rule]
        lines += [f"### {rule} — {len(entries)} modifiche", "",
                  "| Foglio | Riga | Colonna | Vecchio | Nuovo |",
                  "| --- | --- | --- | --- | --- |"]
        for e in entries[:100]:
            lines.append(f"| {e['sheet']} | {e['row']} | {e['column']} "
                         f"| `{e['old']}` | `{e['new']}` |")
        if len(entries) > 100:
            lines.append(f"| … | … | … | … ({len(entries) - 100} omesse) | ")
        lines.append("")

    lines += ["## Residui non risolti (attesi)", ""]
    unexpected = [r for r in residuals
                  if (r["sheet"], r["field"]) not in EXPECTED_RESIDUAL_KEYS]
    for r in sorted(residuals, key=lambda r: (r["sheet"], r["field"], r["value"])):
        lines.append(f"- `{r['sheet']}.{r['field']}` = `{r['value']}` — {r['count']} righe")
    if unexpected:
        lines += ["", "### RESIDUI NON ATTESI (richiedono attenzione)", ""]
        for r in unexpected:
            lines.append(f"- `{r['sheet']}.{r['field']}` = `{r['value']}` — {r['count']} righe")

    lines += [
        "",
        "## Deviazioni accettate",
        "",
        "- `PIANI_PERSONALIZZATI.MODELLI`: 4 rami anziché 5 (ramo PEI non previsto per scelta "
        "dell'utente): una generazione PEI produce errore esplicito.",
        "- Audit trail storici rimappati ai nuovi ID su richiesta esplicita (violazione locale "
        "dell'immutabilità append-only).",
        "- Dati di test mantenuti: harry.potter/HOGWARTS, classe ALTRO ISTITUTO, righe "
        "TEST_DOC_TABELLE_*, righe fantasma vuote.",
        "- Timestamp storici in formato `dd/MM/yyyy HH:mm:ss` (le nuove scritture saranno ISO).",
        "- Chiavi PARAMETRI inerti presenti (`colonneMaterie`, `schede`, `anniCorso`, "
        "`configurazionePipeline`): non lette da alcuno strategy.",
        "- `DIPART.CAPO` lasciato vuoto in attesa di nomi reali.",
    ]
    path.write_text("\n".join(lines) + "\n", encoding="utf-8")
```

Aggiornare `main` per usarli (il report va scritto anche dal Task 1 main):

```python
def main(source: Path, out_dir: Path) -> Path:
    out_dir.mkdir(parents=True, exist_ok=True)
    wb = load_workbook(source)
    log = ChangeLog()
    apply_rules(wb, log)
    dest = out_dir / source.name
    wb.save(dest)
    write_report(log, collect_residuals(load_workbook(dest)), out_dir / REPORT_NAME)
    return dest
```

- [ ] **Step 4: Eseguire i test e verificare che passino**

Run: `cd "DATABASES_TO_CONVERT" && python3 -m unittest tests.test_convert_to_ally -v`
Expected: PASS (3 test)

- [ ] **Step 5: Commit**

```bash
git add DATABASES_TO_CONVERT/convert_to_ally.py DATABASES_TO_CONVERT/tests/test_convert_to_ally.py
git commit -m "feat(ally): validatore residui e generazione report allineamento"
```

---

### Task 3: Regole INDIRIZZI e CONF_DOC (enum, PERMISSII, GENERATORE, asse per-cattedra)

**Files:**

- Modify: `DATABASES_TO_CONVERT/convert_to_ally.py`
- Modify: `DATABASES_TO_CONVERT/tests/test_convert_to_ally.py`

**Interfaces:**

- Consumes: `ChangeLog.add(rule, sheet, row_key, column, old, new)`.
- Produces: `rule_indirizzi(wb, log)`, `rule_conf_doc(wb, log)` — firmate `(Workbook, ChangeLog) -> None`, registrate da `apply_rules`. Costanti: `LICEO_MAP`, `GENERIC_FILL`, `DOCENTE_MATERIA_IDS`, `PLACEHOLDER_FIXES`.

- [ ] **Step 1: Scrivere i test fallenti**

```python
class ConfDocRulesTest(unittest.TestCase):
    def _confdoc_wb(self):
        return make_wb({
            "INDIRIZZI": (
                ("ID", "NOME", "NOME_SINTETICO", "TIPO"),
                (("LC", "Liceo Classico", "Classico", "CLASSICO"),),
                (("LS", "Liceo Scientifico", "Scientifico", "SCIENTIFICO"),),
            ),
            "CONF_DOC": (
                ("ID", "TIPO", "GENERATORE", "FORMATO", "MODELLI", "PERMESSI", "FILE_NAME"),
                (("CONDOTTA", "CONDOTTA", None, "GSHEET",
                  '[{"templateId":"T1"}]',
                  '{"file":[{"ruolo":"COORDINATORI","permesso":"scrittura"}]}',
                  None),),
                (("RELAZIONE_FINALE", "RELAZIONE_FINALE", "DOCUMENTO_GENERICO", "GDOC",
                  '[{"templateId":"T2"}]', '{"file":[],"cartella":[]}',
                  "Relazione - {{materia.sigla}} - {{docente.nomeCompleto}}"),),
                (("DOC15MAGGIO", "DOC_15_MAGGIO", None, "GDOC",
                  '[{"condizione":"{{classe.indirizzoSigla}} == \'LC\'","templateId":"T3"},'
                  '{"templateId":"T4"}]',
                  '{"file":[{"ruolo":"COORDINATORI","permesso":"lettura"}],'
                  '"regolaSupplente":{"file":"ENTRAMBI","cartella":"SOLO_TITOLARI"}}',
                  None),),
            ),
        })

    def test_regole_conf_doc_e_indirizzi(self):
        wb = self._confdoc_wb()
        log = conv.ChangeLog()
        conv.rule_indirizzi(wb, log)
        conv.rule_conf_doc(wb, log)
        ind = wb["INDIRIZZI"]
        self.assertEqual(ind.cell(2, 4).value, "LICEO")
        self.assertEqual(ind.cell(3, 4).value, "LICEO")
        cd = wb["CONF_DOC"]
        # CONDOTTA: generatore + permesso maiuscolo
        self.assertEqual(cd.cell(2, 3).value, "SHEET_CON_MATERIE_E_PERMESSI")
        self.assertEqual(
            [e["permesso"] for e in json.loads(cd.cell(2, 6).value)["file"]],
            ["SCRITTURA"])
        # RELAZIONE_FINALE: TIPO asse + placeholder focus.*
        self.assertEqual(cd.cell(3, 2).value, "DOCUMENTO_DOCENTE_MATERIA")
        self.assertIn("{{focus.materia.sigla}}", cd.cell(3, 7).value)
        self.assertIn("{{focus.docente.nomeCompleto}}", cd.cell(3, 7).value)
        self.assertNotIn('"cartella"', cd.cell(3, 6).value)
        # DOC15MAGGIO: generatore, condizione canonica, folder/regolaSupplente
        self.assertEqual(cd.cell(4, 3).value, "DOCUMENTO_CON_TABELLE_IMPORTATE")
        modelli = json.loads(cd.cell(4, 5).value)
        self.assertEqual(modelli[0]["condizione"],
                         "{{focus.classe.anagrafica.indirizzo.sigla}} == 'LC'")
        pm = json.loads(cd.cell(4, 6).value)
        self.assertEqual(pm["file"][0]["permesso"], "LETTURA")
        self.assertEqual(pm["regolaSupplente"]["folder"], "SOLO_TITOLARI")
        self.assertEqual(log.count("indirizzi.tipo"), 2)
        self.assertEqual(log.count("confdoc.generatore"), 2)
        self.assertEqual(log.count("confdoc.permessi"), 3)
        self.assertEqual(log.count("confdoc.tipo-per-cattedra"), 1)
        self.assertEqual(log.count("confdoc.placeholder-file-name"), 2)
        self.assertEqual(log.count("confdoc.condizione-doc15maggio"), 1)
```

(aggiungere `import json` in testa al file di test)

- [ ] **Step 2: Eseguire i test e verificare che falliscano**

Run: `cd "DATABASES_TO_CONVERT" && python3 -m unittest tests.test_convert_to_ally -v`
Expected: FAIL (`AttributeError: ... rule_indirizzi`)

- [ ] **Step 3: Implementare le regole**

In `convert_to_ally.py`:

```python
import json
import re

LICEO_MAP = {"CLASSICO": "LICEO", "SCIENTIFICO": "LICEO"}

# (ID_CONF_DOC) con GENERATORE vuoto da completare (spec §4.2).
GENERIC_FILL = {
    "CONDOTTA": "SHEET_CON_MATERIE_E_PERMESSI",
    "COMPETENZE": "SHEET_CON_MATERIE_E_PERMESSI",
    "CARENZE_SEGNALATORE_NOVEMBRE": "SHEET_CON_MATERIE_E_PERMESSI",
    "CARENZE_SEGNALATORE_FEBBRAIO": "SHEET_CON_MATERIE_E_PERMESSI",
    "DOC15MAGGIO": "DOCUMENTO_CON_TABELLE_IMPORTATE",
}

# Righe da spostare sull'asse batch DOCUMENTO_DOCENTE_MATERIA (spec §4.3).
DOCENTE_MATERIA_IDS = {"RELAZIONE_FINALE", "PROGRAMMA", "PROGRAMMA_RELAZIONI_QUINTE"}
PLACEHOLDER_FIXES = {
    "{{materia.sigla}}": "{{focus.materia.sigla}}",
    "{{docente.nomeCompleto}}": "{{focus.docente.nomeCompleto}}",
}
COND_TOKEN_OLD = "{{classe.indirizzoSigla}}"
COND_TOKEN_NEW = "{{focus.classe.anagrafica.indirizzo.sigla}}"
PERMESSO_CASE = {"scrittura": "SCRITTURA", "lettura": "LETTURA"}


def _rows(ws):
    """Itera (numero_riga, {header: valore}) a partire dalla riga 2."""
    it = ws.iter_rows(values_only=False)
    headers = [c.value for c in next(it)]
    for row in it:
        yield row[0].row, dict(zip(headers, row))


def _cell(ws, row_num: int, header: str):
    return ws.cell(row=row_num, column=[c.value for c in ws[1]].index(header) + 1)


def rule_indirizzi(wb: xl.Workbook, log: ChangeLog) -> None:
    ws = wb["INDIRIZZI"]
    for row_num, rec in _rows(ws):
        old = rec.get("TIPO")
        new = LICEO_MAP.get(str(old).strip()) if old else None
        if new and old != new:
            c = _cell(ws, row_num, "TIPO")
            log.add("indirizzi.tipo", "INDIRIZZI", rec["ID"], "TIPO", old, new)
            c.value = new


def _fix_permessi_obj(obj):
    """Rende maiuscoli i permessi e rinomina cartella->folder (anche annidati)."""
    changed = False
    if isinstance(obj, dict):
        for key in list(obj.keys()):
            val = obj[key]
            if key == "cartella":
                obj["folder"] = obj.pop("cartella")
                changed = True
                key = "folder"
                val = obj[key]
            if key == "permesso" and isinstance(val, str):
                fixed = PERMESSO_CASE.get(val, val)
                if fixed != val:
                    obj[key] = fixed
                    changed = True
            if isinstance(val, list):
                for item in val:
                    changed = _fix_permessi_obj(item) or changed
            elif isinstance(val, dict):
                changed = _fix_permessi_obj(val) or changed
    return changed


def rule_conf_doc(wb: xl.Workbook, log: ChangeLog) -> None:
    ws = wb["CONF_DOC"]
    for row_num, rec in _rows(ws):
        cid = rec.get("ID")
        if not cid:
            continue  # righe fantasma/test: intatte (spec §5)
        # GENERATORE mancante
        gen = rec.get("GENERATORE")
        target_gen = GENERIC_FILL.get(cid)
        if target_gen and gen != target_gen:
            c = _cell(ws, row_num, "GENERATORE")
            log.add("confdoc.generatore", "CONF_DOC", cid, "GENERATORE", gen, target_gen)
            c.value = target_gen
        # PERMESSI: casing + chiavi
        raw_pm = rec.get("PERMESSI")
        if raw_pm:
            obj = json.loads(raw_pm)
            if _fix_permessi_obj(obj):
                c = _cell(ws, row_num, "PERMESSI")
                log.add("confdoc.permessi", "CONF_DOC", cid, "PERMESSI",
                        raw_pm, json.dumps(obj, ensure_ascii=False))
                c.value = json.dumps(obj, ensure_ascii=False)
        # Asse per-cattedra: TIPO + placeholder in FILE_NAME
        if cid in DOCENTE_MATERIA_IDS:
            c_tipo = _cell(ws, row_num, "TIPO")
            if c_tipo.value != "DOCUMENTO_DOCENTE_MATERIA":
                log.add("confdoc.tipo-per-cattedra", "CONF_DOC", cid, "TIPO",
                        c_tipo.value, "DOCUMENTO_DOCENTE_MATERIA")
                c_tipo.value = "DOCUMENTO_DOCENTE_MATERIA"
            c_fn = _cell(ws, row_num, "FILE_NAME")
            new_fn = c_fn.value
            for old_tok, new_tok in PLACEHOLDER_FIXES.items():
                new_fn = new_fn.replace(old_tok, new_tok)
            if new_fn != c_fn.value:
                log.add("confdoc.placeholder-file-name", "CONF_DOC", cid, "FILE_NAME",
                        c_fn.value, new_fn)
                c_fn.value = new_fn
        # Condizione MODELLI con percorso CDU inesistente
        raw_mod = rec.get("MODELLI")
        if raw_mod and COND_TOKEN_OLD in raw_mod:
            obj = json.loads(raw_mod)
            for branch in obj:
                if isinstance(branch, dict) and isinstance(branch.get("condizione"), str):
                    branch["condizione"] = branch["condizione"].replace(
                        COND_TOKEN_OLD, COND_TOKEN_NEW)
            new_raw = json.dumps(obj, ensure_ascii=False)
            c = _cell(ws, row_num, "MODELLI")
            log.add("confdoc.condizione-doc15maggio", "CONF_DOC", cid, "MODELLI",
                    raw_mod, new_raw)
            c.value = new_raw


def apply_rules(wb: xl.Workbook, log: ChangeLog) -> None:
    rule_indirizzi(wb, log)
    rule_conf_doc(wb, log)
```

- [ ] **Step 4: Eseguire i test e verificare che passino**

Run: `cd "DATABASES_TO_CONVERT" && python3 -m unittest tests.test_convert_to_ally -v`
Expected: PASS (4 test)

- [ ] **Step 5: Commit**

```bash
git add DATABASES_TO_CONVERT/convert_to_ally.py DATABASES_TO_CONVERT/tests/test_convert_to_ally.py
git commit -m "feat(ally): regole enum/permessi/generatore e asse documento-docente-materia"
```

---

### Task 4: Rimappatura audit trail (LOG_DOCS, LOG_FOLD)

**Files:**

- Modify: `DATABASES_TO_CONVERT/convert_to_ally.py`
- Modify: `DATABASES_TO_CONVERT/tests/test_convert_to_ally.py`

**Interfaces:**

- Consumes: `_rows`, `_cell`, `ChangeLog`.
- Produces: `rule_logs(wb, log)` registrata in `apply_rules` DOPO `rule_conf_doc`. Costanti: `LOG_DOCS_IDGEN_MAP`, `LOG_DOCS_TIPO_MAP`, `VERBALE_MONTH_MAP`, `LOG_FOLD_MAP`, `SOTTOTIPO_NORMALIZE`.

- [ ] **Step 1: Scrivere il test fallente**

```python
class LogsRemapTest(unittest.TestCase):
    def _wb(self):
        return make_wb({
            "CONF_DOC": (("ID",), (("PCTO",), ("PIANO_LAVORO",),
                                   ("PIANI_PERSONALIZZATI",), ("VERBALE_CDC_OTTOBRE",))),
            "LOG_DOCS": (
                ("ID", "ID_GEN", "TIPO", "SOTTOTIPO", "DATA_CREAZ"),
                (("d1", "DOCUMENTO_PERSONALIZZATO", "PIANO_PERS", "PDP BES", None),),
                (("d2", None, "PIANO_PERS", "PDP DSA", None),),
                (("d3", None, "PCTO", None, None),),
                (("d4", None, "PIANO_LAVORO", None, None),),
                (("d5", None, "VERBALE_CDC", None, "13/10/2025 09:00:00"),),
                (("d6", None, "VERBALE_CDC", None, "13/01/2026 09:00:00"),),  # mese non mappabile
                (("d7", "RIEPILOGO_QUINTA", "DATI_OGGETTIVI_CLASSE", None, None),),  # intatto
            ),
            "LOG_FOLD": (
                ("ID", "TIPO"),
                (("f1", "DOCUMENTO_PERSONALIZZATO"),),
                (("f2", "VERBALE_ASSEMBLEA_CLASSE"),),  # intatto
                (("f3", "PROGRAMMI_SVOLTI"),),
                (("f4", "RELAZIONI_FINALI"),),
                (("f5", "DOCUMENTO_15_MAGGIO"),),
                (("f6", "VERBALE_CDC"),),
            ),
            "LOG_MAIL": (("PATTERN",), (("X",),)),
        })

    def test_remap_logs(self):
        wb = self._wb()
        log = conv.ChangeLog()
        conv.rule_logs(wb, log)
        docs = wb["LOG_DOCS"]
        self.assertEqual(docs.cell(2, 2).value, "PIANI_PERSONALIZZATI")
        self.assertEqual(docs.cell(2, 4).value, "PDP_BES")       # normalizzato
        self.assertEqual(docs.cell(3, 2).value, "PIANI_PERSONALIZZATI")
        self.assertEqual(docs.cell(3, 4).value, "PDP_DSA")
        self.assertEqual(docs.cell(4, 2).value, "PCTO")
        self.assertEqual(docs.cell(5, 2).value, "PIANO_LAVORO")
        self.assertEqual(docs.cell(6, 2).value, "VERBALE_CDC_OTTOBRE")
        self.assertIsNone(docs.cell(7, 2).value)                  # mese non in mappa
        self.assertEqual(docs.cell(8, 2).value, "RIEPILOGO_QUINTA")  # intatto
        fold = wb["LOG_FOLD"]
        self.assertEqual(fold.cell(2, 2).value, "PIANI_PERSONALIZZATI")
        self.assertEqual(fold.cell(3, 2).value, "VERBALE_ASSEMBLEA_CLASSE")
        self.assertEqual(fold.cell(4, 2).value, "PROGRAMMA")
        self.assertEqual(fold.cell(5, 2).value, "RELAZIONE_FINALE")
        self.assertEqual(fold.cell(6, 2).value, "DOC15MAGGIO")
        self.assertEqual(fold.cell(7, 2).value, "VERBALE_CDC_OTTOBRE")
        self.assertEqual(log.count("log.docs-idgen"), 5)
        self.assertEqual(log.count("log.docs-sottotipo"), 2)
        self.assertEqual(log.count("log.fold-tipo"), 4)
```

- [ ] **Step 2: Eseguire il test e verificare che fallisca**

Run: `cd "DATABASES_TO_CONVERT" && python3 -m unittest tests.test_convert_to_ally -v`
Expected: FAIL (`AttributeError: ... rule_logs`)

- [ ] **Step 3: Implementare rule_logs**

In `convert_to_ally.py`:

```python
LOG_DOCS_TIPO_MAP = {
    "PIANO_PERS": "PIANI_PERSONALIZZATI",
    "PCTO": "PCTO",
    "PIANO_LAVORO": "PIANO_LAVORO",
}
VERBALE_MONTH_MAP = {
    "10": "VERBALE_CDC_OTTOBRE",
    "11": "VERBALE_CDC_NOVEMBRE",
    "02": "VERBALE_CDC_FEBBRAIO",
    "04": "VERBALE_CDC_APRILE",
    "05": "VERBALE_CDC_MAGGIO",
}
LOG_DOCS_IDGEN_MAP = {"DOCUMENTO_PERSONALIZZATO": "PIANI_PERSONALIZZATI"}
LOG_FOLD_MAP = {
    "DOCUMENTO_PERSONALIZZATO": "PIANI_PERSONALIZZATI",
    "VERBALE_CDC": "VERBALE_CDC_OTTOBRE",
    "PROGRAMMI_SVOLTI": "PROGRAMMA",
    "RELAZIONI_FINALI": "RELAZIONE_FINALE",
    "DOCUMENTO_15_MAGGIO": "DOC15MAGGIO",
}
SOTTOTIPO_NORMALIZE = {
    "PDP BES": "PDP_BES",
    "PDP DSA": "PDP_DSA",
    "PDP STRANIERI": "PDP_STRANIERI",
}


def rule_logs(wb: xl.Workbook, log: ChangeLog) -> None:
    ws = wb["LOG_DOCS"]
    for row_num, rec in _rows(ws):
        ig = rec.get("ID_GEN")
        tipo = rec.get("TIPO")
        new_id = LOG_DOCS_IDGEN_MAP.get(str(ig) if ig else "")
        if new_id is None and (ig is None or str(ig).strip() == ""):
            if tipo == "VERBALE_CDC":
                data = str(rec.get("DATA_CREAZ") or "")
                new_id = VERBALE_MONTH_MAP.get(data[3:5])
            else:
                new_id = LOG_DOCS_TIPO_MAP.get(tipo)
        if new_id and new_id != ig:
            c = _cell(ws, row_num, "ID_GEN")
            log.add("log.docs-idgen", "LOG_DOCS", rec.get("ID"), "ID_GEN", ig, new_id)
            c.value = new_id
            st = rec.get("SOTTOTIPO")
            fixed = SOTTOTIPO_NORMALIZE.get(str(st) if st else "")
            if fixed:
                cs = _cell(ws, row_num, "SOTTOTIPO")
                log.add("log.docs-sottotipo", "LOG_DOCS", rec.get("ID"),
                        "SOTTOTIPO", st, fixed)
                cs.value = fixed
    ws = wb["LOG_FOLD"]
    for row_num, rec in _rows(ws):
        old = rec.get("TIPO")
        new = LOG_FOLD_MAP.get(str(old) if old else "")
        if new and new != old:
            c = _cell(ws, row_num, "TIPO")
            log.add("log.fold-tipo", "LOG_FOLD", rec.get("ID"), "TIPO", old, new)
            c.value = new
```

Aggiornare `apply_rules`:

```python
def apply_rules(wb: xl.Workbook, log: ChangeLog) -> None:
    rule_indirizzi(wb, log)
    rule_conf_doc(wb, log)
    rule_logs(wb, log)
```

- [ ] **Step 4: Eseguire i test e verificare che passino**

Run: `cd "DATABASES_TO_CONVERT" && python3 -m unittest tests.test_convert_to_ally -v`
Expected: PASS (5 test)

- [ ] **Step 5: Commit**

```bash
git add DATABASES_TO_CONVERT/convert_to_ally.py DATABASES_TO_CONVERT/tests/test_convert_to_ally.py
git commit -m "feat(ally): rimappatura audit trail LOG_DOCS/LOG_FOLD ai nuovi ID"
```

---

### Task 5: Regole anagrafiche (DIPART, RUOLI, CLASSI, MOV_ALUNNI)

**Files:**

- Modify: `DATABASES_TO_CONVERT/convert_to_ally.py`
- Modify: `DATABASES_TO_CONVERT/tests/test_convert_to_ally.py`

**Interfaces:**

- Consumes: `_rows`, `_cell`, `ChangeLog`.
- Produces: `rule_anagrafica(wb, log)` registrata in `apply_rules` per ultima. Costanti: `RUOLI_NOME_FILL`, `MOV_FIXES`.

- [ ] **Step 1: Scrivere il test fallente**

```python
class AnagraficaTest(unittest.TestCase):
    def test_regole_anagrafiche(self):
        wb = make_wb({
            "DIPART": (
                ("ID", "NOME", "CAPO", "MATERIE"),
                (("LETT", "Lettere", "docente1@scuola.edu", "ITA,LAT"),),
            ),
            "RUOLI": (
                ("ID", "NOME", "DOCENTE"),
                (("REF_ORIENTAMENTO", None, None),),
                (("DOCENTE_PRIMA_PROVA", None, None),),
                (("DOCENTE_SECONDA_PROVA", None, None),),
                (("ALUNNO", None, None),),
                (("RAPPRESENTANTE_GENITORI", "Rappresentante di classedei genitori", None),),
            ),
            "CLASSI": (
                ("ID", "ANNO", "TERMINALE"),
                (("5ALC", 5, None),),
                (("2E", 2, None),),
            ),
            "MOV_ALUNNI": (
                ("STUDENTE", "TIPO", "DATA", "DA", "A"),
                (("vittorio.dantonio@x.it", "OUT", "2026-01-09", "4G", "RITIRO FREQUENZA"),),
                (("aurora.petrini@x.it", "OUT", "2026-02-02", "4BLC", None),),
                (("michelle.dellamora@x.it", "OUT", "2025-12-01", "2E", "2E"),),
            ),
        })
        log = conv.ChangeLog()
        conv.rule_anagrafica(wb, log)
        self.assertIsNone(wb["DIPART"].cell(2, 3).value)
        ruoli = wb["RUOLI"]
        self.assertEqual(ruoli.cell(2, 2).value, "Referente Orientamento")
        self.assertEqual(ruoli.cell(3, 2).value, "Docente della prima prova d'esame")
        self.assertEqual(ruoli.cell(4, 2).value, "Docente della seconda prova d'esame")
        self.assertEqual(ruoli.cell(5, 2).value, "Alunno")
        self.assertEqual(ruoli.cell(6, 2).value, "Rappresentante di classe dei genitori")
        classi = wb["CLASSI"]
        self.assertTrue(classi.cell(2, 3).value)
        self.assertIsNone(classi.cell(3, 3).value)
        mov = wb["MOV_ALUNNI"]
        self.assertEqual((mov.cell(2, 2).value, mov.cell(2, 5).value),
                         ("RITIRATO", "RITIRO"))
        self.assertEqual(mov.cell(3, 5).value, "ALTRO ISTITUTO")
        self.assertEqual((mov.cell(4, 2).value, mov.cell(4, 5).value), ("OUT", "2E"))
        self.assertEqual(log.count("dipart.capo"), 1)
        self.assertEqual(log.count("ruoli.nome"), 5)
        self.assertEqual(log.count("classi.terminale"), 1)
        self.assertEqual(log.count("mov.tipomovimento"), 2)
```

- [ ] **Step 2: Eseguire il test e verificare che fallisca**

Run: `cd "DATABASES_TO_CONVERT" && python3 -m unittest tests.test_convert_to_ally -v`
Expected: FAIL (`AttributeError: ... rule_anagrafica`)

- [ ] **Step 3: Implementare rule_anagrafica**

In `convert_to_ally.py`:

```python
RUOLI_NOME_FILL = {
    "REF_ORIENTAMENTO": "Referente Orientamento",
    "DOCENTE_PRIMA_PROVA": "Docente della prima prova d'esame",
    "DOCENTE_SECONDA_PROVA": "Docente della seconda prova d'esame",
    "ALUNNO": "Alunno",
}
RUOLI_TYPO_FIXES = {"classedei": "classe dei"}
MOV_FIXES = [
    # (studente, tipo_attuale, a_attuale|None, nuovi valori)
    {"studente": "vittorio.dantonio@pietroaldi.com", "tipo": "OUT",
     "match_a": "RITIRO FREQUENZA", "set": {"TIPO": "RITIRATO", "A": "RITIRO"}},
    {"studente": "aurora.petrini@pietroaldi.com", "tipo": "OUT",
     "match_a": "", "set": {"A": "ALTRO ISTITUTO"}},
]


def rule_anagrafica(wb: xl.Workbook, log: ChangeLog) -> None:
    ws = wb["DIPART"]
    for row_num, rec in _rows(ws):
        capo = rec.get("CAPO")
        if capo and "@scuola.edu" in str(capo):
            c = _cell(ws, row_num, "CAPO")
            log.add("dipart.capo", "DIPART", rec["ID"], "CAPO", capo, "")
            c.value = None

    ws = wb["RUOLI"]
    for row_num, rec in _rows(ws):
        rid = rec.get("ID")
        nome = rec.get("NOME")
        new_nome = nome
        if rid in RUOLI_NOME_FILL and not nome:
            new_nome = RUOLI_NOME_FILL[rid]
        if new_nome:
            for old_frag, new_frag in RUOLI_TYPO_FIXES.items():
                new_nome = new_nome.replace(old_frag, new_frag)
        if new_nome != nome:
            c = _cell(ws, row_num, "NOME")
            log.add("ruoli.nome", "RUOLI", rid, "NOME", nome, new_nome)
            c.value = new_nome

    ws = wb["CLASSI"]
    for row_num, rec in _rows(ws):
        anno = rec.get("ANNO")
        term = rec.get("TERMINALE")
        if anno == 5 and term is not True:
            c = _cell(ws, row_num, "TERMINALE")
            log.add("classi.terminale", "CLASSI", rec["ID"], "TERMINALE", term, True)
            c.value = True

    ws = wb["MOV_ALUNNI"]
    for row_num, rec in _rows(ws):
        for fix in MOV_FIXES:
            if (rec.get("STUDENTE") == fix["studente"] and rec.get("TIPO") == fix["tipo"]
                    and str(rec.get("A") or "").strip() == fix["match_a"]):
                for col, val in fix["set"].items():
                    c = _cell(ws, row_num, col)
                    log.add("mov.tipomovimento", "MOV_ALUNNI",
                            rec["STUDENTE"], col, rec.get(col), val)
                    c.value = val


def apply_rules(wb: xl.Workbook, log: ChangeLog) -> None:
    rule_indirizzi(wb, log)
    rule_conf_doc(wb, log)
    rule_logs(wb, log)
    rule_anagrafica(wb, log)
```

- [ ] **Step 4: Eseguire i test e verificare che passino**

Run: `cd "DATABASES_TO_CONVERT" && python3 -m unittest tests.test_convert_to_ally -v`
Expected: PASS (6 test)

- [ ] **Step 5: Commit**

```bash
git add DATABASES_TO_CONVERT/convert_to_ally.py DATABASES_TO_CONVERT/tests/test_convert_to_ally.py
git commit -m "feat(ally): regole anagrafiche DIPART/RUOLI/CLASSI/MOV_ALUNNI"
```

---

### Task 6: Esecuzione reale, verifica d'accettazione e consegna

**Files:**

- Generate (non committare finché verificato): `DATABASES_TO_CONVERT/ALLY/AS 2526 per ALDO.xlsx`, `DATABASES_TO_CONVERT/ALLY/REPORT_ALLINEAMENTO.md`

**Interfaces:**

- Consumes: script completo dei Task 1–5.

- [ ] **Step 1: Suite completa verde**

Run: `cd "DATABASES_TO_CONVERT" && python3 -m unittest discover -s tests -v`
Expected: PASS (tutti i test)

- [ ] **Step 2: Eseguire la conversione sul file reale**

Run: `cd "DATABASES_TO_CONVERT" && python3 convert_to_ally.py`
Expected output: `Scritto: …/DATABASES_TO_CONVERT/ALLY/AS 2526 per ALDO.xlsx`

- [ ] **Step 3: Verificare conteggi e residui attesi**

```bash
python3 - <<'EOF'
import openpyxl as xl
src = xl.load_workbook("AS 2526 per ALDO.xlsx", data_only=True)
out = xl.load_workbook("ALLY/AS 2526 per ALDO.xlsx", data_only=True)
assert src.sheetnames == out.sheetnames
for name in src.sheetnames:
    sr, orr = src[name].max_row, out[name].max_row
    assert sr == orr, (name, sr, orr)          # nessuna riga persa/aggiunta
    h1 = [c.value for c in src[name][1]]
    h2 = [c.value for c in out[name][1]]
    assert h1 == h2, name                       # header intatti
rep = open("ALLY/REPORT_ALLINEAMENTO.md", encoding="utf-8").read()
attesi = ["### indirizzi.tipo — 2 modifiche",
          "### confdoc.generatore — 5 modifiche",
          "### confdoc.tipo-per-cattedra — 1 modifiche",
          "### classi.terminale — 10 modifiche",
          "### dipart.capo — 12 modifiche",
          "### ruoli.nome — 5 modifiche",
          "### mov.tipomovimento — 2 modifiche"]
for a in attesi:
    assert a in rep, a
assert "RESIDUI NON ATTESI" not in rep
print("OK: fogli/header/righe preservati, conteggi attesi presenti")
EOF
```

Attenzione: i conteggi `confdoc.permessi` e `confdoc.placeholder-file-name` dipendono dai dati reali (≈19 e ≥2); verificarli nel report, non come uguaglianze rigide. Verificare inoltre che `log.docs-idgen` sia 241 e `log.fold-tipo` 158 (valori dell'analisi preliminare).

Expected: `OK: fogli/header/righe preservati, conteggi attesi presenti`

- [ ] **Step 4: Spot-check mirato dell'output**

```bash
python3 - <<'EOF'
import openpyxl as xl, json
out = xl.load_workbook("ALLY/AS 2526 per ALDO.xlsx", data_only=True)
cd = out["CONF_DOC"]; hdr=[c.value for c in cd[1]]; ix={h:i+1 for i,h in enumerate(hdr)}
rows={cd.cell(r,ix['ID']).value: r for r in range(2, cd.max_row+1)}
assert cd.cell(rows['RELAZIONE_FINALE'], ix['TIPO']).value == 'DOCUMENTO_DOCENTE_MATERIA'
pm=json.loads(cd.cell(rows['VERBALE_CDC_OTTOBRE'], ix['PERMESSI']).value)
assert pm['file'][0]['permesso']=='SCRITTURA'
mod=json.loads(cd.cell(rows['DOC15MAGGIO'], ix['MODELLI']).value)
assert mod[0]['condizione'].startswith('{{focus.classe.anagrafica.indirizzo.sigla}}')
ld=out['LOG_DOCS']; hl=[c.value for c in ld[1]]; jx={h:i+1 for i,h in enumerate(hl)}
igs=set(ld.cell(r,jx['ID_GEN']).value for r in range(2,ld.max_row+1))
assert 'DOCUMENTO_PERSONALIZZATO' not in igs
lf=out['LOG_FOLD']; tis=set(lf.cell(r,2).value for r in range(2,lf.max_row+1))
assert 'VERBALE_ASSEMBLEA_CLASSE' in tis           # residuo atteso, intatto
mv=out['MOV_ALUNNI']
vals=[tuple(c.value for c in r)[:2] for r in mv.iter_rows(min_row=2)]
assert ('vittorio.dantonio@pietroaldi.com','RITIRATO') in vals
print("OK: spot-check")
EOF
```

Expected: `OK: spot-check`

- [ ] **Step 5: Leggere il report e verificare le sezioni**

Aprire `DATABASES_TO_CONVERT/ALLY/REPORT_ALLINEAMENTO.md` e controllare: sezioni Modifiche per ogni regola, elenco Residui limitato alle 4 categorie attese (CARENZE.STUDENTE matias.veliaj; LOG_DOCS.ID_GEN RIEPILOGO_QUINTA/<VUOTO>-RIEPILOGO_QUINTA; LOG_FOLD.TIPO VERBALE_ASSEMBLEA_CLASSE; LOG_MAIL.PATTERN NOTIFICA_CARENZE_FAMIGLIE/_AUTO), sezione Deviazioni accettate presente.

- [ ] **Step 6: Commit**

```bash
git add DATABASES_TO_CONVERT/ALLY/AS\ 2526\ per\ ALDO.xlsx DATABASES_TO_CONVERT/ALLY/REPORT_ALLINEAMENTO.md
git commit -m "feat(ally): database AS 2526 allineato alle specifiche + report"
```

---

## Self-review effettuata

- Copertura spec: §4.1→Task 3; §4.2→Task 3; §4.3→Task 3; §4.4→deviazione (nessun codice); §4.5→Task 4; §4.6→Task 5; §5→vincoli globali + Task 2 (report); §6→report statico (Task 2); §7→Task 1/2/6; §8→Task 6.
- Placeholder scan: nessun TBD/TODO; ogni step contiene codice completo.
- Type consistency: firme `(wb, log)`, `ChangeLog.add(...)`, costanti citate coerenti tra Tasks.
