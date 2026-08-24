#!/usr/bin/env python3
"""Allinea 'AS 2526 per ALDO.xlsx' alle specifiche SGSA (vedi spec 2026-08-24).

Scrive <out_dir>/<stesso nome sorgente> + REPORT_ALLINEAMENTO.md.
Non modifica mai il sorgente.
"""
from __future__ import annotations

import argparse
import json
import re
from pathlib import Path

import openpyxl as xl

SOURCE_DEFAULT = Path(__file__).resolve().parent / "AS 2526 per ALDO.xlsx"
OUT_DIR_DEFAULT = Path(__file__).resolve().parent / "ALLY"
REPORT_NAME = "REPORT_ALLINEAMENTO.md"


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


def load_workbook(path: Path) -> xl.Workbook:
    """Carica il workbook con tipi nativi (date/bool), formule risolte."""
    return xl.load_workbook(path, data_only=True)


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
        yield row[0].row, dict(zip(headers, [c.value for c in row]))


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
            # Una voce di log per cella modificata (invariante ChangeLog, ruling P5).
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
    # Fogli assenti dal workbook ignorati (stessa convenzione di collect_residuals).
    if "INDIRIZZI" in wb.sheetnames:
        rule_indirizzi(wb, log)
    if "CONF_DOC" in wb.sheetnames:
        rule_conf_doc(wb, log)
    if "LOG_DOCS" in wb.sheetnames and "LOG_FOLD" in wb.sheetnames:
        rule_logs(wb, log)
    if all(name in wb.sheetnames
           for name in ("DIPART", "RUOLI", "CLASSI", "MOV_ALUNNI")):
        rule_anagrafica(wb, log)


def _col_index(headers: tuple, name: str) -> int:
    return list(headers).index(name)


def collect_residuals(wb: xl.Workbook) -> list[dict]:
    """Violazioni FK residue DOPO le regole (solo quelle attese vanno bene).

    I fogli assenti dal workbook sono ignorati (trattati come nessun dato).
    """
    def has(sheet_name: str) -> bool:
        return sheet_name in wb.sheetnames

    def ids(sheet_name: str) -> set:
        if not has(sheet_name):
            return set()
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

    if has("CARENZE"):
        ws = wb["CARENZE"]
        i_st = _col_index(tuple(next(ws.iter_rows(min_row=1, max_row=1, values_only=True))), "STUDENTE")
        tally("CARENZE", "STUDENTE",
              (r[i_st] for r in ws.iter_rows(min_row=2, values_only=True) if r[i_st] not in alunni))

    if has("LOG_DOCS"):
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

    if has("LOG_FOLD"):
        ws = wb["LOG_FOLD"]
        hdr = tuple(next(ws.iter_rows(min_row=1, max_row=1, values_only=True)))
        i_ti = _col_index(hdr, "TIPO")
        tally("LOG_FOLD", "TIPO",
              (r[i_ti] for r in ws.iter_rows(min_row=2, values_only=True) if r[i_ti] not in confdoc_ids))

    if has("LOG_MAIL"):
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


def main(source: Path, out_dir: Path) -> Path:
    out_dir.mkdir(parents=True, exist_ok=True)
    wb = load_workbook(source)
    log = ChangeLog()
    apply_rules(wb, log)
    dest = out_dir / source.name
    wb.save(dest)
    write_report(log, collect_residuals(load_workbook(dest)), out_dir / REPORT_NAME)
    return dest


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", type=Path, default=SOURCE_DEFAULT)
    parser.add_argument("--out-dir", type=Path, default=OUT_DIR_DEFAULT)
    args = parser.parse_args()
    print(f"Scritto: {main(args.source, args.out_dir)}")
