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
        # Una sola voce: ChangeLog registra una voce per cella, non per token
        # (ruling P5 — non "correggere" il conteggio a 2).
        self.assertEqual(log.count("confdoc.placeholder-file-name"), 1)
        self.assertEqual(log.count("confdoc.condizione-doc15maggio"), 1)


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
        # ruling P1: la fixture mappa 5 righe LOG_FOLD (f1, f3..f6), non 4.
        self.assertEqual(log.count("log.fold-tipo"), 5)


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
            # ruling P2: le righe toccate da MOV_FIXES usano le email reali
            # @pietroaldi.com del database, non @x.it.
            "MOV_ALUNNI": (
                ("STUDENTE", "TIPO", "DATA", "DA", "A"),
                (("vittorio.dantonio@pietroaldi.com", "OUT",
                  "2026-01-09", "4G", "RITIRO FREQUENZA"),),
                (("aurora.petrini@pietroaldi.com", "OUT",
                  "2026-02-02", "4BLC", None),),
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
        # ruling P3: voci per cella, non per riga (dantonio: TIPO+A = 2 voci;
        # petrini: A = 1 voce) => totale 3.
        self.assertEqual(log.count("mov.tipomovimento"), 3)


if __name__ == "__main__":
    unittest.main()
