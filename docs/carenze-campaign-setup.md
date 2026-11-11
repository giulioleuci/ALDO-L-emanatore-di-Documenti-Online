# Notifiche carenze per campagna

Eseguire un solo import o invio alla volta. Prima della migrazione salvare una copia della tabella CARENZE.

Aggiungere in fondo la colonna testuale `ID_RILEVAZIONE`; assegnare alle righe storiche la campagna effettiva senza dedurla automaticamente dal mese. Ad esempio `2026_27_NOVEMBRE` comprende consigli del 16 e 19 novembre. Non cambiare DATA, PROGRESSIVO o NOTIFICATO. Verificare l'unicità di STUDENTE e ID_RILEVAZIONE. Le righe senza campagna restano leggibili ma non vengono inviate.

Nella sorgente importare esplicitamente ID_RILEVAZIONE e PROGRESSIVO valido (massimo precedente per studente + 1). Configurare `key: ["STUDENTE", "ID_RILEVAZIONE"]` e `conflictResolution: "IGNORE"`. Il reimport salta le righe esistenti, anche se non notificate; correggere i voti modificando deliberatamente la riga esistente.

In CONF_MAIL, per ciascuno dei tre processi PER_CARENZA_GENITORI, combinare la condizione esistente con:

```
{{focus.carenza.idRilevazione}} == "2026_27_NOVEMBRE"
```

Per febbraio usare `2026_27_FEBBRAIO`. BOX_CFG non richiede filtri aggiuntivi. Impostare POST_PROCESSO esattamente sulla riga selezionata:

```json
[{"tipo":"INSERISCI_TIMESTAMP","tab":"CARENZE","col":"NOTIFICATO","criteri":{"STUDENTE":"{{focus.carenza.studente.email}}","PROGRESSIVO":"{{focus.carenza.progressivo}}"}}]
```

Qualsiasi valore non vuoto di NOTIFICATO impedisce nuovi invii, anche con un altro pattern e DUPLICAZIONE=PERMESSA. Per le righe pendenti usare celle davvero vuote, senza checkbox, FALSE o zero. Il test mode non marca le righe di produzione.

Prima dell'uso in produzione verificare su un database GAS eliminabile due import di campagne, HTML con soli voti/note/assenze della rilevazione selezionata, timestamp sulle sole righe inviate e zero invii ripetendo con un servizio nuovo.

Gmail e Sheets non sono una transazione atomica: un arresto dopo la consegna ma prima del salvataggio del log e del timestamp può provocare un duplicato. Non è garantita una consegna exactly-once; non eseguire job concorrenti né import durante gli invii.
