# DATABASES_TO_CONVERT/tests/test_convert_to_ally.py
import json, sys, tempfile, unittest
from pathlib import Path

import openpyxl as xl  # verifica dipendenza

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import convert_to_ally as conv


def make_wb(sheets):
    """sheets: {nome: (headers, [tuple]) oppure (headers, *righe)} -> Workbook apribile/salvabile."""
    wb = xl.Workbook()
    wb.remove(wb.active)
    for name, spec in sheets.items():
        # Forma compatta (headers, righe) se il secondo elemento e' una sequenza di righe;
        # altrimenti ogni elemento dopo il primo e' una riga singola (eventualmente
        # incapsulata in una tupla a un solo elemento).
        if len(spec) == 2 and isinstance(spec[1], (tuple, list)) \
                and all(isinstance(r, (tuple, list)) for r in spec[1]):
            rows = [list(r) for r in spec[1]]
        else:
            rows = []
            for el in spec[1:]:
                if len(el) == 1 and isinstance(el[0], (tuple, list)):
                    rows.append(list(el[0]))
                else:
                    rows.append(list(el))
        ws = wb.create_sheet(name)
        ws.append(spec[0])
        for r in rows:
            ws.append(r)
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
            got = xl.load_workbook(written)
            self.assertEqual(got.sheetnames, ["ALUNNI", "DOCENTI"])
            self.assertEqual([c.value for c in got["ALUNNI"][1]], ["EMAIL", "ATTIVO"])
            self.assertEqual([c.value for c in got["ALUNNI"][2]], ["a@x.it", True])


RESIDUALS_TEST_SHEETS = {
    "ALUNNI": (("EMAIL", "CLASSE"), (("a@x.it", "1A"),)),
    "CLASSI": (("ID",), (("1A",),)),
    "CARENZE": (("STUDENTE", "PROGRESSIVO"), (("orphan@x.it", 1),)),
    "CONF_DOC": (("ID", "TIPO"),
                 (("PIANI_PERSONALIZZATI", "PIANO_PERS"), ("PCTO", "PCTO"))),
    "CONF_MAIL": (("PATTERN",),
                  (("CDC_X", "a@x.it", "01/01/2026 10:00:00", "SUCCESS"),)),
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


if __name__ == "__main__":
    unittest.main()
