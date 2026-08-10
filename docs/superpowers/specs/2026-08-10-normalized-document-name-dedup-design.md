# Normalized Document-Name Deduplication Design

## Goal

Keep document deduplication stable when `FILE_NAME` contains `{{progressivo}}`, while allowing distinct logical documents in a shared output folder to be identified by their rendered filename.

## Contract

For `CONF_DOC.DUPLICAZIONE=NEGATA`, document identity becomes:

`TIPO + SOTTOTIPO + ID_GEN + PATH + normalized(FILE_NAME)`, plus `UTENTI` for `PIANO_PERS`.

`normalized(FILE_NAME)` is rendered from the same CDU as the real filename, except every `{{progressivo}}` placeholder is temporarily replaced with literal `_PROGRESSIVO_PH_`. Only this deduplication branch uses the normalized rendering. The real filename still resolves `{{progressivo}}` to the next folder file count.

## Data flow

`CheckDuplicatesStep` derives the stable name, then matches it against `LOG_DOCS.NOME`. `GenerateNameStep` remains responsible for deriving the real name after infrastructure preparation. No pipeline-step state is retained between targets.

## Email log correction

Every `LOG_MAIL.ALLEGATI` record contains `logicalTargetId`, including test-mode deliveries. Test-mode records also carry a boolean marker. The duplicate-history preload ignores successful records with this marker, so preview delivery never blocks real delivery.

## Tests

Unit coverage proves that two class documents sharing `PATH` but having different names both generate, rerunning one class skips it, and `{{progressivo}}` does not defeat deduplication. Email coverage proves test-mode log records preserve `logicalTargetId` but do not block a later real send. Existing E2E fixtures retain shared class folders and exercise this contract.

## Documentation

Update the authoritative schema and CDU note to describe normalized `FILE_NAME` in the duplicate identity. Align the older enum reference so no contradictory definition remains.
