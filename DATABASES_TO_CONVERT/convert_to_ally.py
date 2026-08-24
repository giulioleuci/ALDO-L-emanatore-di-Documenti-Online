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


def apply_rules(wb: xl.Workbook, log: ChangeLog) -> None:
    """Punto di estensione: le regole dei task seguenti si agganciano qui."""


def main(source: Path, out_dir: Path) -> Path:
    out_dir.mkdir(parents=True, exist_ok=True)
    wb = load_workbook(source)
    apply_rules(wb, ChangeLog())
    dest = out_dir / source.name
    wb.save(dest)
    return dest


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", type=Path, default=SOURCE_DEFAULT)
    parser.add_argument("--out-dir", type=Path, default=OUT_DIR_DEFAULT)
    args = parser.parse_args()
    print(f"Scritto: {main(args.source, args.out_dir)}")
