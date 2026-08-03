# Colonne foglio per materie con specifica

## Obiettivo

`SHEET_CON_MATERIE_PERMESSI` deve trattare ogni coppia `MATERIA.SPECIFICA` come
una colonna operativa separata. Le colonne devono mostrare `MATERIE.SINTESI` e
proteggere ciascuna colonna con i docenti del relativo slot.

## Progetto

- La chiave colonna diventa `sigla + specificita`, mantenendo anche `classeId`
  e `kind` quando disponibili.
- Il testo colonna viene da `MATERIE.SINTESI` dell'identificativo effettivo,
  inclusi cataloghi puntati come `MAT.A`; fallback all'identificativo.
- `elencoMaterieConPermessi` deduplica con la stessa chiave composta.
- Risoluzione `DOCENTE_MATERIA` riceve l'identita' completa dello slot, cosi'
  supplenze e variazioni restano circoscritte alla specifica.
- Colonna speciale `REL`/`REL/ALT` e relativa regola permessi non cambiano.

## Verifica

Test unitario con due specifiche della stessa materia: due colonne, entrambe
intestate con `MATERIE.SINTESI`, ciascuna con editor del solo slot associato.
