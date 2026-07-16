# MAT_NON_STANDARD — Specifica Placeholder {{focus.classe.elencoMaterieConPermessi}}

Questo documento descrive la logica e i requisiti tecnici per l'implementazione del placeholder speciale `{{focus.classe.elencoMaterieConPermessi}}`, progettato per l'espansione orizzontale in Google Sheets con gestione granulare dei permessi.

---

## 1. Obiettivo Funzionale

Creare un'intestazione dinamica orizzontale in un foglio di calcolo che:

1.  **Accorpi** le materie di Religione (colonna speciale `CLASSI.IRC`) e Alternativa (colonna speciale `CLASSI.ALT`) nella prima cella generata, con etichetta visualizzata `REL/ALT`; se `CLASSI.ALT` non è presente nella classe, l'etichetta mostra solo `REL`. `REL/ALT` è esclusivamente un'etichetta di visualizzazione: gli identificatori tecnici delle colonne restano `IRC` e `ALT` (vedi `01_SCHEMA_DATABASE.md`).
2.  **Elenchi** tutte le altre sigle delle materie del Consiglio di Classe in ordine alfabetico (per sigla).
3.  **Protegga** le colonne risultanti permettendo l'editing della colonna solo ai docenti titolari delle rispettive materie (con gestione supplenti) e al coordinatore della classe.

---

## 2. Architettura di Implementazione

L'aggiunta DEVE seguire il flusso standard del sistema, attraversando i livelli **da L2 a L4** (arricchimento del CDU in L3, espansione del placeholder in L2, protezione ACL in L4).

### A. Livello L3 — Context Engine (CDU Enrichment)

La logica di preparazione dell'array DEVE risiedere in un `ViewModelMapper` o in un Interceptor del `ContextEngine` (vedi `09_CONTEXT_ENGINE.md`).

**Logica di trasformazione:**

1.  Recupero di tutti i docenti dal `consiglioDiClasse` nel CDU.
2.  **Filtro:** Escludere le materie con ID `IRC` e `ALT` dalla lista standard.
3.  **Ordinamento:** Ordinare le restanti materie alfabeticamente per `sigla`.
4.  **Iniezione:** Prependere all'array un oggetto speciale:
    ```json
    {
      "sigla": "REL/ALT",
      "isSpecial": true,
      "roles": ["IRC", "ALT"],
      "colore": "#E0E0E0"
    }
    ```
5.  **Output:** L'array risultante viene mappato in `cdu.focus.classe.elencoMaterieConPermessi`.

### B. Livello L2 — Workspace Template Engine (Espansione)

Il motore DEVE gestire l'espansione orizzontale del placeholder.

- **Trigger:** Presenza del placeholder `{{focus.classe.elencoMaterieConPermessi}}` in una cella di Google Sheets.
- **Azione:** Inserimento di N colonne a destra della posizione del placeholder, dove N è la lunghezza dell'array.
- **Rendering:** Inserimento della `sigla` (o `nomeSintetico`) nell'intestazione di ogni colonna.

### C. Livello L4 — DocumentoPipeline (Strategy)

La gestione dei permessi DEVE usare la strategia `SheetMaterieConPermessiGeneratorStrategy` o una sua estensione (vedi `10_PIPELINE_DOCUMENTI.md`).

**Logica di protezione (Step 8 — ApplyPermissions):**
Per ogni colonna generata:

1.  **Caso Materia Standard:**
    - Risolvere il docente tramite `RisolutoreRuoliService.risolvi("DOCENTE_MATERIA", cdu)` passando la sigla specifica.
    - Applicare protezione range alla colonna per l'email ottenuta.
2.  **Caso Speciale "REL/ALT":**
    - Recuperare i docenti direttamente dalle colonne speciali della classe tramite il repository:
      - `docentiIRC = ClasseRepository.getDocentiIRC(classe)` — colonna speciale `CLASSI.IRC`
      - `docentiALT = ClasseRepository.getDocentiALT(classe)` — colonna speciale `CLASSI.ALT`; array vuoto se la classe non prevede attività alternativa
    - **Merge:** Concatenare i due array e deduplicare per email. Per ciascun docente risultante, applicare la risoluzione supplenze tramite `RisolutoreRuoliService` (regola `ENTRAMBI` raccomandata per garantire copertura sia al titolare che all'eventuale supplente).
    - **ACL:** Applicare la protezione della colonna a tutti i docenti risultanti dall'unione.

> **NOTA DI IMPLEMENTAZIONE:** Le colonne `IRC` e `ALT` **NON** sono materie standard e **NON DEVONO** essere risolte tramite `RisolutoreRuoliService.risolvi("DOCENTE_MATERIA", cdu)`: quella strategy legge `meta.parametriInput.materiaCorrente` e lo usa per cercare la corrispondente colonna in `MATERIE`, dove `IRC` e `ALT` non esistono. I metodi `getDocentiIRC(classe)` e `getDocentiALT(classe)` fanno parte del contratto di `ClasseRepository` (vedi `06_REPOSITORY.md`), analogamente a come `getAllDocentiCDC()` gestisce già internamente queste colonne speciali.

---

## 3. Fonti Dati e Invarianti

- **Sorgente:** Tabella `CLASSI` (colonne dinamiche materie + colonne speciali `IRC` e `ALT`).
- **Resilienza:** La risoluzione DEVE SEMPRE passare per `RoleResolutionLib` per onorare la gerarchia di Priority (Supplenti > Variazioni > Titolari).
- **Invariante Permessi:** Il Coordinatore di classe (`CLASSI.COORD`) DEVE SEMPRE mantenere l'accesso in scrittura su tutte le colonne generate, indipendentemente dalla materia.

---

## 4. Esempio di Risultato Atteso

|   Cella Placeholder    |         Colonna 1         |    Colonna 2     |     Colonna 3      |      ...       |
| :--------------------: | :-----------------------: | :--------------: | :----------------: | :------------: |
| **Sigla visualizzata** |          REL/ALT          |       ITA        |        MAT         |      STO       |
|  **Editor Abilitati**  | Docente IRC + Docente ALT | Docente Italiano | Docente Matematica | Docente Storia |

---

_Documento di specifica per lo sviluppo del modulo Materie Orizzontali Speciali._
