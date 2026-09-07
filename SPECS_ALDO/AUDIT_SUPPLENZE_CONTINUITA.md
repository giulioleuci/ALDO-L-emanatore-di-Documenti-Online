# Audit — Continuità didattica per materia (tabella 3 anni)

Stato: **analisi, nessuna modifica al codice**.

## 1. Obiettivo

Generare, per una classe, una tabella di **continuità didattica per materia**
relativa agli ultimi tre anni scolastici (anno corrente + 2 passati).

### 1.1 Struttura della tabella

- **Righe:** materie di insegnamento.
- **Colonne:** i tre anni scolastici (intestazione con il nome di ciascun anno).
- **Contenuto delle celle:**
  1. **Titolare della materia** — docente titolare, risolto considerando le
     eventuali variazioni di cattedra.
  2. **Storico titolari e supplenze** (invii a capo, racchiuso tra parentesi):
     - elenco di tutte le variazioni di cattedra avvenute (incluso il titolare
       originario) con relativa data di decorrenza;
     - elenco di tutte le supplenze effettuate, con data di inizio e data di fine;
     - separazione semplice tra gli elementi, senza elenchi puntati o numerati.

## 2. Cosa la CDU attuale già offre

| Requisito | Stato | Percorso CDU |
|---|---|---|
| Righe = materie | ✅ | `focus.classe.materie.elenco[]` con profilo `CON_CONTINUITA` (02 §8.4) |
| Finestra temporale a più anni | ✅ | `meta.opzioni.profonditaAnniStorico`; `ContinuitaVM.anniPrecedenti[]` con `annoIndietro` 1/2 (02 §8.5) |
| Titolare anno corrente (variazioni applicate) | ✅ | `focus.classe.consiglio.titolari` / `focus.classe.materie.elenco[].docenti` — risoluzione per data di riferimento: SUPPLENZE → VARIAZIONI_CATTEDRA → CLASSI |
| Titolare anni passati | ⚠️ parziale | `continuita.anniPrecedenti[].titolare` — ma ricostruito **solo dalla matrice statica CLASSI** del DB storico (`StoricoClassiService.perClasse`), senza applicare le variazioni di quell'anno |
| Continuità (flag pronti) | ✅ | `isContinuitaUltimiDueAnni` / `isContinuitaUltimiTreAnni` / varianti ITP |

## 3. Cosa manca (bloccante)

1. **Elenco delle variazioni di cattedra con data di decorrenza.**
   Il CDU espone solo il risultato netto (titolare effettivo alla data di
   riferimento). Non esiste la lista delle singole `VARIAZIONI_CATTEDRA` con
   `DAL`, né il titolare originario pre-variazione, né per l'anno corrente né
   per gli anni passati.

2. **Elenco delle supplenze con data di inizio e fine.**
   `focus.classe.consiglio.supplenze` (`SupplenzaAggregataVM`, 02 §8.19)
   contiene **solo la sostituzione attiva aggregata** (supplente / titolare /
   materie), **senza date `DAL`/`AL`**. `DocenteCdcVM.sostituisce` espone il
   titolare sostituito ma nemmeno lì compare alcuna data. Le supplenze storiche
   non sono esposte da nessun nodo.

3. **Le fonti storiche non leggono `VARIAZIONI_CATTEDRA` e `SUPPLENZE`.**
   - `StoricoClassiService.perClasse` (`StoricoClassiService.ts:29`) ricostruisce
     gli anni passati **solo dalla matrice `CLASSI`** del DB storico
     (`getAllDocentiCDC` / `getMaterieDelDocente`).
   - `MasterStoricoDatabaseProvider` apre i DB storici con
     `verifyTables: [CLASSI, LOG_DOCS]`: variazioni e supplenze passate non
     vengono mai lette, quindi non possono comparire né come titolare storico
     né come elenco datato.

## 4. Sintesi

| Dimensione della cella | Generabile oggi? |
|---|---|
| Titolare per anno (3 colonne) | Sì, con limite: anni passati = sola matrice CLASSI, senza variazioni storiche |
| Storico titolari e supplenze (parentesi con invii a capo) | **No** |

## 5. Note per l'implementazione (quando si procederà)

- **Luogo della logica:** è dominio SGSA (CDU per cattedra), non `GasLibraryFactory`
  — l'estensione apparterrebbe ad ALDO.
- **Estensioni necessarie al CDU:** un nodo per materia/anno che esponga
  - variazioni di cattedra (titolare originario → nuovo titolare, `DAL`);
  - supplenze con `DAL`/`AL`.
- **Estensione necessaria alle fonti storiche:** lettura di
  `VARIAZIONI_CATTEDRA` e `SUPPLENZE` dai DB degli anni passati in
  `StoricoClassiService` (attualmente legge solo `CLASSI`).
- **Formattazione a invii a capo:** non è un limite del CDU; è resa del template.

## 6. Riferimenti

- `02_CDU_STRUTTURA.md` §4.1 (consiglio, materie), §8.4/§8.5 (`MateriaVM`, `ContinuitaVM`), §8.19 (`SupplenzaAggregataVM`)
- `PLACEHOLDER_DA_CDU_DOMINIO_SCUOLA.md` §9 (continuità didattica)
- `StoricoClassiService.ts`, `StoricoDatabaseProvider.ts`, `continuitaMapper.ts`, `MaterieClasseProvider.ts`, `TeachingCouncilProjection.ts`