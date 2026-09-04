scope: src/domain/entities, src/domain/value-objects, src/domain/errors; audited lines: 2510.

delete: Remove the unconsumed DriveFileId/DriveFolderId value-object file; only its unit test imports it. Nothing replaces it. [src/domain/value-objects/DriveFileId.ts:1] (~27 lines).
shrink: Inherit DomainRepositoryLib Entity.validate and replace its stale rationale with one base-class line; no ALDO code adds validation errors or distinguishes the override. [src/domain/entities/AldoEntity.ts:2] (~15 lines).
delete: Remove test-only AnnoCorso.isSeconda/getAnnoSuccessivo/getAnnoPrecedente; use AnnoCorso.of(...) in their tests. [src/domain/value-objects/AnnoCorso.ts:14] (~9 lines).
delete: Remove test-only PeriodoSupplenza.durata/isAttiva/isTerminata; production already uses contiene/overlaps. Nothing replaces them. [src/domain/value-objects/PeriodoSupplenza.ts:42] (~9 lines).
delete: Remove test-only Docente.create; construct the existing public constructor in tests. [src/domain/entities/Docente.ts:82] (~9 lines).
delete: Remove test-only AnnoScolastico successor/predecessor helpers; use AnnoScolastico.of(...) in tests. [src/domain/value-objects/AnnoScolastico.ts:32] (~8 lines).
delete: Remove test-only Classe.create; construct the existing public constructor in tests. [src/domain/entities/Classe.ts:79] (~8 lines).
delete: Remove test-only ConfigurazioneDocumento.hasNoCondizione; callers already use getCondizione(). Nothing replaces it. [src/domain/entities/ConfigurazioneDocumento.ts:106] (~4 lines).
delete: Remove test-only ConfigurazioneDocumento.isOverwrite; no production duplicate-check path reads it. Nothing replaces it. [src/domain/entities/ConfigurazioneDocumento.ts:129] (~4 lines).
delete: Remove test-only ValoreCarenza.isVoto; production branches on isNota and constructs by factory. Nothing replaces it. [src/domain/value-objects/ValoreCarenza.ts:46] (~3 lines).

net: -96 lines, -0 deps possible.
