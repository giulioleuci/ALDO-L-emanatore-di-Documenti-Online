# MAT_NON_STANDARD — Specifica Placeholder {{focus.classe.elencoMaterieConPermessi}}

Questo documento descrive la logica e i requisiti tecnici per l'implementazione del placeholder speciale `{{focus.classe.elencoMaterieConPermessi}}`, progettato per l'espansione orizzontale in Google Sheets con gestione granulare dei permessi.

---

## 1. Obiettivo Funzionale

Creare un'intestazione dinamica orizzontale in un foglio di calcolo che:

1.  **Accorpi** le materie IRC e ALT nella prima cella generata, con etichetta visualizzata `REL/ALT`; se ALT non è presente nella classe, l'etichetta mostra solo `REL`. IRC e ALT sono righe della tabella `MATERIE` con `IS_RELIGIONE_ALT=true` e sono risolte separatamente dalla stessa pipeline GLF delle altre cattedre. `REL/ALT` è esclusivamente un'etichetta combinata di presentazione/ACL: gli identificatori tecnici restano `IRC` e `ALT` (vedi `01_SCHEMA_DATABASE.md`).
2.  **Elenchi** tutte le altre sigle delle materie del Consiglio di Classe in ordine alfabetico (per sigla).
3.  **Protegga** le colonne risultanti permettendo l'editing della colonna solo ai docenti titolari delle rispettive materie (con gestione supplenti) e al coordinatore della classe.

---

## 2. Architettura di Implementazione

L'aggiunta DEVE seguire il flusso standard del sistema, attraversando i livelli **da L2 a L4** (arricchimento del CDU in L3, espansione del placeholder in L2, protezione ACL in L4).

### A. Livello L3 — Context Engine (CDU Enrichment)

La logica di preparazione dell'array DEVE risiedere in un `ViewModelMapper` o in un Interceptor del `ContextEngine`, nel rispetto della struttura CDU canonica in `02_CDU_STRUTTURA.md`.

**Logica di trasformazione:**

1.  Recupero di tutti i docenti dal `consiglioDiClasse` nel CDU.
2.  **Filtro:** Escludere le materie con ID `IRC` e `ALT` dalla lista standard.
3.  **Ordinamento:** Ordinare le restanti materie alfabeticamente per `sigla`.
4.  **Iniezione:** Prependere all'array un oggetto speciale solo per i ruoli realmente presenti. Con ALT presente:
    ```json
    {
      "sigla": "REL/ALT",
      "isSpecial": true,
      "roles": ["IRC", "ALT"],
      "colore": "#E0E0E0"
    }
    ```
    Senza ALT, l'oggetto è invece `{ "sigla": "REL", "isSpecial": true, "roles": ["IRC"], "colore": "#E0E0E0" }`: non è lecito esporre né autorizzare ALT per una classe che non la possiede.
5.  **Output:** L'array risultante viene mappato in `cdu.focus.classe.elencoMaterieConPermessi`.

**Derivazione di `focus.classe.sheet.materieColonne`:** `focus.classe.sheet.materieColonne` (campi `group1`/`group2`/`group3`/`group2Label`/`group3Label`, vedi `02_CDU_STRUTTURA.md` §4.1) deriva dalla stessa computazione di `elencoMaterieConPermessi`, tramite `SheetMaterieConPermessiGeneratorStrategy.buildGroups()`: l'elemento speciale `REL/ALT` prodotto da `elencoMaterieConPermessi` viene anteposto a `group1`, sopra ai gruppi base già costruiti da `SheetMaterieGeneratorStrategy.buildGroups()`. `elencoMaterieConPermessi` resta invariato come sorgente grezza; `materieColonne` ne è la proiezione raggruppata, pronta per `dynamic_columns`.

### B. Livello L2 — Workspace Template Engine (Espansione)

Il motore DEVE gestire l'espansione orizzontale del placeholder.

- **Trigger:** Presenza del placeholder `{{focus.classe.elencoMaterieConPermessi}}` in una cella di Google Sheets.
- **Azione:** Inserimento di N colonne a destra della posizione del placeholder, dove N è la lunghezza dell'array.
- **Rendering:** Inserimento della `sigla` (o `nomeSintetico`) nell'intestazione di ogni colonna.

### C. Livello L4 — DocumentoPipeline (Strategy)

La gestione dei permessi DEVE usare la strategia `SheetMaterieConPermessiGeneratorStrategy` o una sua estensione, coerente con le configurazioni `CONF_DOC` definite in `01_SCHEMA_DATABASE.md`.

**Logica di protezione (Step 8 — ApplyPermissions):**
Per ogni colonna generata:

1.  **Caso Materia:**
    - Risolvere tutte le cattedre della materia tramite `RisolutoreRuoliService.risolvi("DOCENTE_MATERIA", cdu)` passando la sigla specifica. Sono incluse le dimensioni di slot di prima classe `MAIN`, `ITP` (`MATERIA.itp`) e `SPECIFICA` (`MATERIA.<specifica>`).
    - Il valore `<specifica>` è arbitrario e non appartiene a un catalogo tecnico chiuso. Gli strumenti musicali (`CHITARRA`, `PIANOFORTE`, ecc.) sono esempi, non l'unico uso ammesso.
    - Applicare protezione range alla colonna per l'email ottenuta.
2.  **Caso Speciale "REL/ALT":**
    - Risolvere indipendentemente `IRC` e `ALT` tramite la stessa pipeline di assegnazione GLF (`SUPPLENZE` → `VARIAZIONI_CATTEDRA` → fallback `CLASSI`).
    - **Merge:** Concatenare gli attori già risolti e deduplicare per email. La regola `ENTRAMBI` è raccomandata per garantire copertura sia al titolare sia all'eventuale supplente.
    - **ACL:** Applicare la protezione della colonna a tutti i docenti risultanti dall'unione.

> **NOTA DI IMPLEMENTAZIONE:** Non esiste un percorso di risoluzione diretto o alternativo per IRC/ALT. Entrambe devono esistere in `MATERIE` con `IS_RELIGIONE_ALT=true` e passare per `ITeachingAssignmentResolver`; solo la proiezione finale le combina sotto l'etichetta `REL/ALT`.

---

## 3. Fonti Dati e Invarianti

- **Sorgente:** Tabella `CLASSI` (colonne dinamiche materie + colonne speciali `IRC` e `ALT`).
- **Resilienza:** La risoluzione DEVE SEMPRE passare per `RoleResolutionLib` per onorare la gerarchia di Priority (Supplenti > Variazioni > Titolari).
- **Granularità degli override (slot-targeting):** una riga `VARIAZIONI_CATTEDRA`/`SUPPLENZE` può indirizzare l'intera materia (tutti gli slot `MAIN`/`ITP`/`SPECIFICA`) oppure uno slot specifico tramite `MATERIE` in forma `MATERIA.itp`/`MATERIA.SPECIFICA` — vedi progetto 3 (slot-targeting) e progetto 4 (catalogo `MATERIE` composito) del 2026-07-30. Un valore `SPECIFICA` usato in questo modo DEVE corrispondere a una riga `MATERIE` reale con `ID = MATERIA.SPECIFICA` (invariante del catalogo composito, `01_SCHEMA_DATABASE.md` §MATERIE) — un filtro di specificità che non corrisponde a nessuna riga `MATERIE` non è lecito.
- **Invariante Permessi:** Il Coordinatore di classe (`CLASSI.COORD`) DEVE SEMPRE mantenere l'accesso in scrittura su tutte le colonne generate, indipendentemente dalla materia.

---

## 4. Esempio di Risultato Atteso

|   Cella Placeholder    |         Colonna 1         |    Colonna 2     |     Colonna 3      |      ...       |
| :--------------------: | :-----------------------: | :--------------: | :----------------: | :------------: |
| **Sigla visualizzata** |          REL/ALT          |       ITA        |        MAT         |      STO       |
|  **Editor Abilitati**  | Docente IRC + Docente ALT | Docente Italiano | Docente Matematica | Docente Storia |

---

_Documento di specifica per lo sviluppo del modulo Materie Orizzontali Speciali._
