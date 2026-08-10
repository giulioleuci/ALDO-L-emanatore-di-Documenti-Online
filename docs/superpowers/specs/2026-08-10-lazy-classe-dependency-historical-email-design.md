# Ripristino dello storico nelle email dei piani personalizzati

## Problema

L'arricchimento storico delle email usa `StoricoDocumentiService`, che legge
soltanto `LOG_DOCS` tramite `LogDocumentoRepository.findByUtente()`. Una recente
modifica ha però fatto costruire al provider storico un `ClasseRepository`
completo per soddisfare la dipendenza di `LogDocumentoRepository`.

`ClasseRepository` apre anticipatamente anche `DOCENTI`, `INDIRIZZI`, `MATERIE`
e altre tabelle. I database storici minimali, per contratto, contengono invece
solo `CLASSI`, `ALUNNI` e `LOG_DOCS`. Il primo accesso a una tabella assente
raggiunge `SheetDbAdapter` con un `SheetTableService` non definito e fallisce su
`setPrimaryKey`, impedendo l'arricchimento.

## Soluzione

`LogDocumentoRepository` continuerà a richiedere esplicitamente la dipendenza
da `IClasseRepository`, ma la riceverà tramite `CoreUtilsLib.LazyRef`. Soltanto
`findByClasse()`, l'unico metodo che usa la gerarchia delle classi, risolverà la
dipendenza con `get()`.

Il composition root e gli altri punti di costruzione avvolgeranno il rispettivo
`ClasseRepository` in `LazyRef`. Il provider storico potrà così costruire
`LogDocumentoRepository` sul database minimale senza aprire tabelle estranee al
percorso `findByUtente()`.

Questa soluzione riusa direttamente `LazyRef` di GasLibraryFactory; non richiede
estensioni della libreria né nuovi meccanismi locali di lazy loading.

## Compatibilità ed errori

La semantica di `findByClasse()` non cambia: al primo utilizzo viene creato lo
stesso `IClasseRepository` oggi costruito anticipatamente. Gli altri metodi di
`LogDocumentoRepository` non dipendono dalla gerarchia delle classi e non
caricheranno tale repository.

La gestione best-effort del renderer resta invariata: un database storico
realmente indisponibile continua a produrre il warning esistente e non elimina
i piani correnti. Il caso di database valido ma minimale, invece, deve tornare a
produrre l'arricchimento storico.

## Verifica

Un test di regressione costruirà un anno storico con sole `CLASSI`, `ALUNNI` e
`LOG_DOCS`, quindi verificherà che `StoricoDocumentiService.perAlunnoConTipo()`
restituisca il documento storico senza richiedere `DOCENTI`, `INDIRIZZI` o
`MATERIE`. Il test dovrà fallire prima della modifica su `setPrimaryKey` e
passare dopo.

Saranno inoltre eseguiti i test mirati dei servizi storici e delle email,
typecheck, lint, suite completa e build online/offline pertinente. Il controllo
tramite knowledge graph verificherà linkage, assenza di bypass GAS e impatto sui
call site del repository.
