# Guida Tecnica: Estensione del CDU per i Rappresentanti Genitori con Riferimento allo Studente

Questo documento descrive la procedura dettagliata per estendere la struttura del **CDU (Contesto Dati Unificato)** in **SGSA / ALDO**, permettendo di arricchire l'array `focus.classe.rappresentanti.genitori` con i dati anagrafici del rispettivo studente/figlio (`studente.nomeCompleto`).

---

## 1. Obiettivo dell'Estensione

Abilitare nei template di Google Docs e nelle email HTML l'utilizzo dei placeholder annidati dentro il loop dei genitori rappresentanti:

```mustache
{{#tablerow_loop:focus.classe.rappresentanti.genitori}}{{nomeCompleto}},Genitore di {{studente.nomeCompleto}},—
```

Questo consente di costruire tabelle unificate a due righe `tablerow_loop` (una per gli studenti rappresentanti e una per i genitori rappresentanti) distinguendo chiaramente i ruoli senza dover modificare la logica di presentazione a valle.

---

## 2. Componenti Interessati nel Codebase

La modifica riguarda esclusivamente lo strato **Application Services / Context Engine** di ALDO:

1. **[`src/application/context-engine/Cdu.ts`](file:///home/giulio/Desktop/ALDO%20implementing/src/application/context-engine/Cdu.ts#L185-L188)**: Contratto di interfaccia TypeScript del Contesto Dati Unificato.
2. **[`src/application/context-engine/providers/RappresentantiProvider.ts`](file:///home/giulio/Desktop/ALDO%20implementing/src/application/context-engine/providers/RappresentantiProvider.ts)**: Componente del Context Engine che estrae i dati dalle entità di dominio (`Classe`, `Alunno`) e popola il CDU.
3. **[`SPECS_ALDO/02_CDU_STRUTTURA.md`](file:///home/giulio/Desktop/ALDO%20implementing/SPECS_ALDO/02_CDU_STRUTTURA.md#L198-L208)**: Specifica ufficiale del CDU.
4. **`test/unit/application/context-engine/providers/RappresentantiProvider.test.ts`**: Test di unità per la verifica delle regressioni.

---

## 3. Guida alla Modifica del Codice (Step-by-Step)

### Step 1: Aggiornamento dell'Interfaccia TypeScript (`Cdu.ts`)

Modificare la definizione del tipo per `rappresentanti` in [`src/application/context-engine/Cdu.ts`](file:///home/giulio/Desktop/ALDO%20implementing/src/application/context-engine/Cdu.ts):

```typescript
// src/application/context-engine/Cdu.ts

export interface Cdu {
  // ...
  focus?: {
    classe?: {
      // ...
      rappresentanti?: {
        studenti: Array<{
          nomeCompleto: string;
          email: string;
          indirizzo?: { nome: string };
        }>;
        genitori: Array<{
          nomeCompleto: string;
          studente?: {
            nomeCompleto: string;
          };
          indirizzo?: { nome: string };
        }>;
      };
      // ...
    };
  };
}
```

---

### Step 2: Aggiornamento del Provider (`RappresentantiProvider.ts`)

Aggiornare il provider in [`src/application/context-engine/providers/RappresentantiProvider.ts`](file:///home/giulio/Desktop/ALDO%20implementing/src/application/context-engine/providers/RappresentantiProvider.ts) per associare `studente.nomeCompleto` durante l'iterazione degli alunni, sia per le classi ordinarie che per le classi articolate parent:

```typescript
// src/application/context-engine/providers/RappresentantiProvider.ts

import type { ContextProvider } from '../ContextProvider';
import type { Cdu } from '../Cdu';
import type { IClasseRepository } from '../../../domain/repositories/IClasseRepository';
import { getClasseEntity } from '../techEntities';

export class RappresentantiProvider implements ContextProvider {
  constructor(private readonly classi: IClasseRepository) {}

  provide(cdu: Cdu): void {
    const classe = getClasseEntity(cdu);
    const focusClasse = cdu.focus.classe;
    if (focusClasse === undefined) return;

    const config = this.classi.getArticolazione(classe);

    // Gestione per Classi Articolate (Parent)
    if (config?.isParent() === true) {
      const studenti: Array<{ nomeCompleto: string; email: string; indirizzo: { nome: string } }> =
        [];
      const genitori: Array<{
        nomeCompleto: string;
        studente: { nomeCompleto: string };
        indirizzo: { nome: string };
      }> = [];

      for (const partner of this.classi.getClassiPartner(classe)) {
        const indirizzo = { nome: this.classi.getIndirizzo(partner).nome };
        for (const alunno of this.classi.getStudenti(partner)) {
          if (alunno.isRappresentante()) {
            studenti.push({
              nomeCompleto: alunno.cognomeNome,
              email: alunno.email.value,
              indirizzo
            });
          }
          const nomeGenitore = alunno.getRappresentanteGenitore().trim();
          if (nomeGenitore.length > 0) {
            genitori.push({
              nomeCompleto: nomeGenitore,
              studente: { nomeCompleto: alunno.cognomeNome },
              indirizzo
            });
          }
        }
      }
      focusClasse.rappresentanti = { studenti, genitori };
      return;
    }

    // Gestione per Classi Ordinarie o Partner
    const studenti = this.classi.getStudenti(classe);
    focusClasse.rappresentanti = {
      studenti: studenti
        .filter((a) => a.isRappresentante())
        .map((a) => ({ nomeCompleto: a.cognomeNome, email: a.email.value })),
      genitori: studenti
        .filter((a) => a.getRappresentanteGenitore().trim().length > 0)
        .map((a) => ({
          nomeCompleto: a.getRappresentanteGenitore().trim(),
          studente: { nomeCompleto: a.cognomeNome }
        }))
    };
  }
}
```

---

## 4. Struttura del CDU Risultante (JSON Example)

Dopo la modifica, la sezione `focus.classe.rappresentanti` assemblata nel CDU apparirà come segue:

```json
{
  "focus": {
    "classe": {
      "anagrafica": {
        "nome": "5AB-LC-LS"
      },
      "rappresentanti": {
        "studenti": [
          {
            "nomeCompleto": "Marco Neri",
            "email": "marco.neri@alunni.edu.it",
            "indirizzo": { "nome": "Liceo Classico" }
          }
        ],
        "genitori": [
          {
            "nomeCompleto": "Giuseppe Neri",
            "studente": {
              "nomeCompleto": "Marco Neri"
            },
            "indirizzo": { "nome": "Liceo Classico" }
          }
        ]
      }
    }
  }
}
```

---

## 5. Esempio Pratico nei Template Google Docs (Approccio 1)

All'interno del documento di modello per il Verbale del Consiglio di Classe o l'elenco dei rappresentanti, è possibile configurare un'unica tabella contenente **due righe con direttive `tablerow_loop` distinte**:

### Struttura nel Template Google Docs:

| Nome e Cognome                                                            | Ruolo                                   | Email       |
| :------------------------------------------------------------------------ | :-------------------------------------- | :---------- |
| `{{#tablerow_loop:focus.classe.rappresentanti.studenti}}{{nomeCompleto}}` | `Rappresentante Studenti`               | `{{email}}` |
| `{{#tablerow_loop:focus.classe.rappresentanti.genitori}}{{nomeCompleto}}` | `Genitore di {{studente.nomeCompleto}}` | `—`         |

### Risultato Renderizzato nel Documento Finale:

| Nome e Cognome | Ruolo                   | Email                    |
| :------------- | :---------------------- | :----------------------- |
| Marco Neri     | Rappresentante Studenti | marco.neri@alunni.edu.it |
| Giuseppe Neri  | Genitore di Marco Neri  | —                        |

---

## 6. Procedura di Validazione e Test

Dopo aver applicato le modifiche al codice:

1. **Typecheck**:
   ```bash
   npm run typecheck
   ```
2. **Esecuzione Unit Test**:
   ```bash
   npm test
   ```
3. **Verifica Lint**:
   ```bash
   npm run lint
   ```
