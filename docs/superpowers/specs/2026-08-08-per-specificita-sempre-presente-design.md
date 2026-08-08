# Design: `studenti.perSpecificita` sempre presente nel CDU classe

Data: 2026-08-08  
Stato: approvato

## Decisione

`focus.classe.studenti.perSpecificita` diventa un ramo standard del CDU di
classe: `StudentiProvider` lo costruisce sempre, senza dipendere dal template
che verrà renderizzato.

Il flag `RecipeOptions.includiSpecificita` viene eliminato. Tenerlo ignorato
produrrebbe una configurazione falsa e manterrebbe complessità senza valore.

## Motivazione

I documenti possono usare il loop Mustache:

```mustache
{{#focus.classe.studenti.perSpecificita}}{{materiaNome}}: {{#specifiche}}{{nome}} ({{#alunni}}{{nomeCompleto}};{{/alunni}}){{/specifiche}}{{/focus.classe.studenti.perSpecificita}}
```

La generazione documenti usa la recipe `CLASSE_COMPLETA` con opzioni standard.
Con il precedente default `includiSpecificita: false`, il ramo era assente e la
sezione Mustache veniva resa vuota, pur essendo dati validi per la classe.

La semplificazione evita rilevamento dei placeholder e non richiede una nuova
capacità di `GasLibraryFactory`: forma e costo del CDU SGSA restano una scelta
applicativa di dominio.

## Modifiche

- `StudentiProvider` assegna sempre `perSpecificita: buildPerSpecificita(listaCompleta)`.
- Rimuovere `includiSpecificita` da `RecipeOptions`, dalle viste CDU e dalle
  opzioni predefinite.
- Aggiornare i call site, fixture e test che lo impostano esplicitamente.
- Aggiornare `SPECS_ALDO/02_CDU_STRUTTURA.md`: `perSpecificita` non è più
  condizionale e l'opzione non compare più nella recipe.
- Aggiornare test del provider e test E2E template: il placeholder del
  documento complesso deve produrre contenuto per `1A` con opzioni standard.

## Contratto

- Ogni CDU con `focus.classe.studenti` contiene `perSpecificita`.
- Se nessun alunno possiede specificità, il valore è `[]`, mai `undefined`.
- Forma invariata: array `materiaId`, `materiaSigla`, `materiaNome`,
  `specifiche[]`, `alunni[]`.
- Nessuna modifica a rendering Mustache, catalogo `MATERIE`, o risoluzione ruoli.

## Verifica

- Test RED: recipe standard produce ramo assente nel comportamento attuale.
- Test GREEN: recipe standard produce struttura attesa e template complesso
  della `1A` contiene materia, specificità e alunno.
- `npm run typecheck`, `npm run lint`, `npm test`, integrazione e build.

## Fuori scope

- Analisi dinamica dei placeholder nei template.
- Nuove API in `GasLibraryFactory`.
- Altri rami CDU condizionali.
