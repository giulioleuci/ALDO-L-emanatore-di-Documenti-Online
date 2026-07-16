# 07 — Specifications

Le **Specification** implementano il Specification Pattern: ogni classe incapsula un predicato di business riusabile e componibile per filtrare entità. Sono il meccanismo standard di SGSA per esprimere criteri di ricerca in modo dichiarativo e indipendente dalla persistenza.

---

## Pattern base

### Interfaccia `Specification<T>`

```
isSatisfiedBy(entity: T): boolean
  — Valuta se l'entità soddisfa il criterio. Chiamato in memoria dopo il caricamento.

toQueryObject(): Object | null
  — Converte la spec in un oggetto query per SheetDBLib.
    DEVE restituire null se il criterio non è esprimibile come query semplice
    (es. range di date, regex, parsing JSON): in tal caso il Repository
    DEVE caricare tutti i record e filtrare in memoria.
```

### Composite Specifications

```
AndSpecification<T>(spec1, spec2) → spec1.isSatisfiedBy(e) && spec2.isSatisfiedBy(e)
OrSpecification<T>(spec1, spec2)  → spec1.isSatisfiedBy(e) || spec2.isSatisfiedBy(e)
NotSpecification<T>(spec)         → !spec.isSatisfiedBy(e)
```

Ogni Specification espone i metodi fluent `.and()`, `.or()`, `.not()` per composizione a catena:

```
const spec = new AlunniAttiviSpec()
  .and(new AlunniInClasseSpec("5A"))
  .and(new AlunniBESSpec());
```

### Regola di performance

Quando si compongono più specifications, quelle con `toQueryObject()` non null DEVONO essere eseguite per prime a livello DB. Le rimanenti DEVONO filtrare in memoria SOLO sul sottoinsieme risultante.

---

## 1. Specifications per Alunno

| Specification                            | Criterio                                                    | `toQueryObject()`                                                        |
| ---------------------------------------- | ----------------------------------------------------------- | ------------------------------------------------------------------------ |
| `AlunniAttiviSpec`                       | `ATTIVO = true`                                             | `{ ATTIVO: true }`                                                       |
| `AlunniInClasseSpec(classeId)`           | `CLASSE = classeId`                                         | `{ CLASSE: classeId.value }`                                             |
| `AlunniRipetentiSpec`                    | `RIPETENTE = true`                                          | `{ RIPETENTE: true }`                                                    |
| `AlunniRappresentantiSpec`               | `RAPPR_STUD = true`                                         | `{ RAPPR_STUD: true }`                                                   |
| `AlunniBESSpec`                          | alunni con almeno un Piano con `isBES() = true`             | `null` (filtra in memoria: carica PIANI per ogni alunno)                 |
| `AlunniPerReligioneSpec(religione)`      | `RELIGIONE = religione`                                     | `{ RELIGIONE: religione.value }`                                         |
| `AlunniPerCognomeSpec(cognome, partial)` | Match esatto o parziale su `COGNOMENOME` (case-insensitive) | `{ COGNOMENOME: cognome }` solo se `partial = false`; `null` se parziale |

---

## 2. Specifications per Docente

| Specification                         | Criterio            | `toQueryObject()`            |
| ------------------------------------- | ------------------- | ---------------------------- |
| `DocentiInDipartimentoSpec(dipartId)` | `DIPART = dipartId` | `{ DIPART: dipartId.value }` |
| `DocentiITPSpec`                      | `ITP = true`        | `{ ITP: true }`              |
| `DocentiPerGenereSpec(genere)`        | `GENERE = genere`   | `{ GENERE: genere.value }`   |

---

## 3. Specifications per Classe

| Specification                         | Criterio                             | `toQueryObject()`                  |
| ------------------------------------- | ------------------------------------ | ---------------------------------- |
| `ClassiPerAnnoSpec(anno)`             | `ANNO = anno`                        | `{ ANNO: anno }`                   |
| `ClassiAttiveSpec`                    | `ATTIVA = true`                      | `{ ATTIVA: true }`                 |
| `ClassiPerIndirizzoSpec(indirizzoId)` | `INDIRIZZO = indirizzoId`            | `{ INDIRIZZO: indirizzoId.value }` |
| `ClassiArticolateSpec`                | `ARTICOLAZIONE` non null e non vuoto | `null` (filtra in memoria)         |
| `ClassiTerminaliSpec`                 | `TERMINALE = true`                   | `{ TERMINALE: true }`              |
| `ClassiPrimoBiennioSpec`              | `ANNO >= 1 && ANNO <= 2`             | `null`                             |
| `ClassiSecondoBiennioSpec`            | `ANNO >= 3 && ANNO <= 4`             | `null`                             |

---

## 4. Specifications per Materia

| Specification                                | Criterio                                        | `toQueryObject()` |
| -------------------------------------------- | ----------------------------------------------- | ----------------- |
| `MateriePerDipartimentoSpec(dipartId, repo)` | La materia è nel CSV `MATERIE` del dipartimento | `null`            |
| `MaterieEsamePrimaSpec(indirizzoId)`         | `ESAME_CFG.prima_prova` include `indirizzoId`   | `null`            |
| `MaterieEsameSecondaSpec(indirizzoId)`       | `ESAME_CFG.seconda_prova` include `indirizzoId` | `null`            |

---

## 5. Specifications per Indirizzo

| Specification                | Criterio      | `toQueryObject()`      |
| ---------------------------- | ------------- | ---------------------- |
| `IndirizziPerTipoSpec(tipo)` | `TIPO = tipo` | `{ TIPO: tipo.value }` |

---

## 6. Specifications per Configurazioni

| Specification                            | `toQueryObject()`              |
| ---------------------------------------- | ------------------------------ |
| `ConfigDocPerTipoSpec(tipo)`             | `{ TIPO: tipo.value }`         |
| `ConfigDocPerGeneratoreSpec(generatore)` | `{ GENERATORE: generatore }`   |
| `ConfigMailPerProcessoSpec(processo)`    | `{ PROCESSO: processo.value }` |
| `ConfigImpAttiviSpec`                    | `{ ATTIVO: true }`             |
| `ConfigImpPerTargetSpec(target)`         | `{ TARGET: target }`           |

---

## 7. Specifications per Carenza

| Specification                        | Criterio                                        | `toQueryObject()`            |
| ------------------------------------ | ----------------------------------------------- | ---------------------------- |
| `CarenzePerAlunnoSpec(alunno)`       | `STUDENTE = alunno.EMAIL`                       | `{ STUDENTE: alunno.email }` |
| `CarenzePerClasseSpec(classe)`       | `CLASSE = classe.ID`                            | `{ CLASSE: classe.id }`      |
| `CarenzePerDataSpec(data)`           | `DATA` corrisponde alla data (confronto giorno) | `{ DATA: data }`             |
| `CarenzeNonNotificateSpec`           | `NOTIFICATO` è null o vuoto                     | `null`                       |
| `CarenzePerAnnoScolasticoSpec(anno)` | `DATA` tra `[1-set-anno, 31-ago-anno+1]`        | `null`                       |
| `CarenzeConAssenzeSpec`              | `ASSENZE = true`                                | `{ ASSENZE: true }`          |

**Nota classi articolate:** `CarenzePerClasseSpec` filtra per `CLASSE = classeId` esatto; poiché per le classi articolate `CARENZE.CLASSE` riporta l'ID della classe **partner** (vedi `01_SCHEMA_DATABASE.md`), interrogarla con l'ID della classe parent non restituisce risultati. Per ottenere le carenze dell'intera classe articolata tramite la classe parent, usare la spec composita `CarenzePerClasseArticolataSpec` (sezione 16), che unisce i risultati dei due partner.

---

## 8. Specifications per Piano

| Specification                | `toQueryObject()`            |
| ---------------------------- | ---------------------------- |
| `PianiPerAlunnoSpec(alunno)` | `{ STUDENTE: alunno.email }` |
| `PianiPerTipoSpec(tipo)`     | `{ TIPO: tipo.value }`       |

---

## 9. Specifications per Progetto

| Specification                   | `toQueryObject()`       |
| ------------------------------- | ----------------------- |
| `ProgettiPerClasseSpec(classe)` | `{ CLASSE: classe.id }` |
| `ProgettiPerTipoSpec(tipo)`     | `{ TIPO: tipo.value }`  |

---

## 10. Specifications per Supplenza

| Specification                        | Criterio                    | `toQueryObject()`              |
| ------------------------------------ | --------------------------- | ------------------------------ |
| `SupplenzaPerTitolareSpec(docente)`  | `TITOLARE = docente.EMAIL`  | `{ TITOLARE: docente.email }`  |
| `SupplenzaPerSupplenteSpec(docente)` | `SUPPLENTE = docente.EMAIL` | `{ SUPPLENTE: docente.email }` |
| `SupplenzaAttiveSpec(data)`          | `DAL ≤ data ≤ AL`           | `null`                         |

---

## 11. Specifications per VariazioneCattedra

| Specification                           | Criterio                                | `toQueryObject()`                           |
| --------------------------------------- | --------------------------------------- | ------------------------------------------- |
| `VariazioniPerClasseSpec(classeId)`     | `CLASSE_ID` contiene `classeId` (CSV)   | `null` — filtraggio in memoria con CONTAINS |
| `VariazioniPerMateriaSpec(materiaId)`   | `MATERIA_ID` contiene `materiaId` (CSV) | `null` — filtraggio in memoria con CONTAINS |
| `VariazioniPerNuovoTitolareSpec(email)` | `NUOVO_TITOLARE = email`                | `{ NUOVO_TITOLARE: email.value }`           |

---

## 12. Specifications per MovimentoAlunno

| Specification                    | Criterio                     | `toQueryObject()`            |
| -------------------------------- | ---------------------------- | ---------------------------- |
| `MovimentiPerAlunnoSpec(alunno)` | `STUDENTE = alunno.EMAIL`    | `{ STUDENTE: alunno.email }` |
| `MovimentiPerTipoSpec(tipo)`     | `TIPO = tipo`                | `{ TIPO: tipo.value }`       |
| `MovimentiPerDataSpec(data)`     | `DATA` corrisponde alla data | `{ DATA: data }`             |

---

## 13. Specifications per OreASL

| Specification                 | `toQueryObject()`            |
| ----------------------------- | ---------------------------- |
| `OreASLPerAlunnoSpec(alunno)` | `{ STUDENTE: alunno.email }` |
| `OreASLPerAnnoSpec(anno)`     | `{ ANNO: anno.value }`       |

---

## 14. Specifications per RuoloSpeciale

| Specification                  | `toQueryObject()`            |
| ------------------------------ | ---------------------------- |
| `RuoliPerDocenteSpec(docente)` | `{ DOCENTE: docente.email }` |

---

## 15. Specifications per Log

| Specification                      | Criterio                                                 | `toQueryObject()`                                    |
| ---------------------------------- | -------------------------------------------------------- | ---------------------------------------------------- |
| `LogDocsPerConfigIdSpec(configId)` | —                                                        | `{ ID_GEN: configId }`                               |
| `LogDocsPerClasseSpec(classe)`     | `CLASSI` contiene `classe.id` (CSV)                      | `{ CLASSI: classe.id }` — ricerca per contenimento   |
| `LogDocsPerUtenteSpec(email)`      | `UTENTI` contiene `email.value` (CSV)                    | `{ UTENTI: email.value }` — ricerca per contenimento |
| `LogDocsPerStatoSpec(stato)`       | —                                                        | `{ STATO: stato.value }`                             |
| `LogDocsNonNotificatiSpec`         | `NOTIFICATO` è null o vuoto                              | `null`                                               |
| `LogFoldPerTipoSpec(tipo)`         | —                                                        | `{ TIPO: tipo }`                                     |
| `LogFoldPerClasseSpec(classe)`     | `CLASSI` contiene `classe.id` (CSV)                      | `{ CLASSI: classe.id }` — ricerca per contenimento   |
| `LogFoldPerPathSpec(path, exact?)` | `PATH = path` (exact) o `PATH.startsWith(path)` (prefix) | `{ PATH: path }` solo se `exact = true`              |
| `LogMailPerPatternSpec(patternId)` | —                                                        | `{ PATTERN: patternId }`                             |
| `LogMailPerStatoSpec(stato)`       | —                                                        | `{ STATO: stato.value }`                             |

**Nota colonne CSV:** Le query `LogDocsPerClasseSpec`, `LogDocsPerUtenteSpec` e `LogFoldPerClasseSpec` operano su colonne CSV (`CLASSI`, `UTENTI`). Il `toQueryObject()` fornisce un hint per SheetDBLib; il filtro definitivo avviene in memoria tramite ricerca per contenimento (CONTAINS).

---

## 16. Composite Specifications predefinite

Le seguenti combinazioni sono fornite pre-costruite, poiché ricorrono frequentemente nel sistema.

### `AlunniAttiviConBESInClasseSpec(classeId: ClasseId)`

```
new AlunniAttiviSpec()
  .and(new AlunniInClasseSpec(classeId))
  .and(new AlunniBESSpec())
```

**Uso tipico:** generazione documenti personalizzati (PDP/PEI) per una classe.

---

### `ClassiTerminaliAttiveSpec`

```
new ClassiTerminaliSpec()
  .and(new ClassiAttiveSpec())
```

**Uso tipico:** operazioni riservate alle classi terminali attive (es. documenti d'esame). Usa `TERMINALE = true` (non `ANNO = 5`) per includere i corsi quadriennali.

---

### `AlunniNonIRCSpec`

```
new AlunniPerReligioneSpec(ReligioneScelta.NO)
  .or(new AlunniPerReligioneSpec(ReligioneScelta.ALT))
```

**Uso tipico:** filtro del CDC per studenti che non seguono IRC (usato in `CDCFilterAlunnoStrategy`). Copre sia chi non si avvale (NO) sia chi segue un'attività alternativa (ALT).

---

### `CarenzeAttivaPerPeriodoSpec(alunno: Alunno, anno: AnnoScolastico)`

```
new CarenzePerAlunnoSpec(alunno)
  .and(new CarenzePerAnnoScolasticoSpec(anno))
```

**Uso tipico:** recupero carenze di uno studente nell'anno scolastico corrente o precedente.

---

### `SupplenzaAttivaPerContestoSpec(titolare, data, classe?, materia?)`

```javascript
new SupplenzaPerTitolareSpec(titolare).and(new SupplenzaAttiveSpec(data));
// se classe specificata: filtro in memoria con applicaAClasse()
// se materia specificata: filtro in memoria con applicaAMateria()
```

`toQueryObject() = null` (logica complessa non traducibile in query semplice — include range di date e CSV scope).
**Uso tipico:** verifica se un docente è in supplenza per un contesto specifico (classe + materia) a una data.

---

### `CarenzePerClasseArticolataSpec(parentId: ClasseId)`

```javascript
// OrSpecification dinamico sui partner della classe parent:
ClasseRepository.getClassiPartner(parent).forEach(
  (partner) => (orSpec = orSpec.or(new CarenzePerClasseSpec(partner.id)))
);
```

`toQueryObject() = null` (composizione dinamica non traducibile direttamente).
**Uso tipico:** ottenere tutte le carenze dell'intera classe articolata tramite la classe parent, unendo i risultati dei due partner.

---

## 17. Riepilogo

| Entità                | Specs totali | Con `toQueryObject()` non null |
| --------------------- | ------------ | ------------------------------ |
| Alunno                | 7            | 5                              |
| Docente               | 3            | 3                              |
| Classe                | 7            | 4                              |
| Materia               | 3            | 0                              |
| Indirizzo             | 1            | 1                              |
| Configurazioni        | 5            | 5                              |
| Carenza               | 6            | 4                              |
| Piano                 | 2            | 2                              |
| Progetto              | 2            | 2                              |
| Supplenza             | 3            | 2                              |
| VariazioneCattedra    | 3            | 1                              |
| MovimentoAlunno       | 3            | 3                              |
| OreASL                | 2            | 2                              |
| RuoloSpeciale         | 1            | 1                              |
| Log (4 tabelle)       | 10           | 8                              |
| Composite predefinite | 6            | —                              |
| **Totale**            | **64+**      |                                |

**Note:**

- `AlunniNonIRCSpec` è contata nelle "Composite predefinite" (non nelle specs Alunno).
- `SupplenzaAttivaPerContestoSpec` è contata nelle "Composite predefinite" (non nelle specs Supplenza), in quanto composizione di `SupplenzaPerTitolareSpec` e `SupplenzaAttiveSpec`; analogamente ad `AlunniNonIRCSpec`.
- `VariazioneCattedra`: `VariazioniPerClasseSpec` e `VariazioniPerMateriaSpec` usano `toQueryObject() = null` (filtraggio in memoria su CSV); solo `VariazioniPerNuovoTitolareSpec` produce query diretta.
