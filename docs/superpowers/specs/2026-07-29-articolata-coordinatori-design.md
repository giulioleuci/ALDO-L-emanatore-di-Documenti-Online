# Coordinatori per articolazione — Design

## Obiettivo

Rappresentare l'articolata E2E `3C` con le due articolazioni `3C-S` (Scientifico) e `3C-C` (Classico), ciascuna con il proprio coordinatore, senza un coordinatore artificiale sulla classe padre.

## Dati seed

- `3C` è la classe padre, attiva, con `ARTICOLAZIONE.partners = "3C-S,3C-C"` e `COORD` vuoto.
- `3C-S` è partner del padre, usa l'indirizzo Scientifico e ha il coordinatore docente 3.
- `3C-C` è partner del padre, usa l'indirizzo Classico e ha il coordinatore docente 4.
- Gli alunni e i piani già presenti nella precedente `3C` passano a `3C-S`; la seconda articolazione mantiene i propri alunni.

## Destinatari email

`EmailNotificationService` continua a usare solo classi padre come entry point. Per `PER_COORDINATORE`, se il padre non ha coordinatori propri, ricava i coordinatori dai partner. Ogni coordinatore ricostruito riceve un target con `classiCompetenza` limitata al partner che coordina; non riceve i documenti dell'altra articolazione.

Per classi non articolate e per padri con un coordinatore configurato, il comportamento rimane invariato. I processi `PER_DOCENTE` e `PER_CDC` mantengono la loro aggregazione dell'intero gruppo articolato.

## Verifica

- Test unitario: due coordinatori ricostruiti per un padre senza `COORD`, ognuno competente per la sola articolazione.
- Scenario E2E 3: il piano PDP_BES dell'alunno 42 è nel testo dell'email del coordinatore di `3C-S`; l'email del coordinatore di `3C-C` non lo include.
- Suite, typecheck, lint e build online verdi.
