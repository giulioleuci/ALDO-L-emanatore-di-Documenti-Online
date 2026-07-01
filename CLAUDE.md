# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this workspace is

This is an **implementation workspace**, not a single codebase. The task is to build **SGSA (Sistema di Gestione Scolastica Automatizzata)** — a modular school-management ERP for Google Workspace, internal codename **ALDO** — by following the specifications in `SPECS_ALDO/` and building on the reusable libraries in `GasLibraryFactory/`.

Two top-level directories:

- **`SPECS_ALDO/`** — The authoritative design spec for SGSA (17 Markdown files, **written in Italian**). This describes the domain, database, and services to be *implemented*. As of now the application itself is largely unimplemented; these documents are the blueprint.
- **`GasLibraryFactory/`** — A mature, self-contained monorepo of 16 Google Apps Script libraries (its own git repo, build, and tests). SGSA *references and extends* these libraries; it must not reimplement functionality they already provide. This directory has **its own `CLAUDE.md`** with deep detail on the build pipeline, GAS V8 compatibility patches, source maps, and library-debugging workflow — read it before touching library source. You MUST **ONLY** use the docs in `GasLibraryFactory//DOCS_LIBS` and not read the code if not extremally necessary.

## Sources of truth (precedence)

When any SGSA spec document conflicts with another, these two win, in order:

1. **`SPECS_ALDO/01_SCHEMA_DATABASE.md`** — physical DB schema. All table and column names are UPPERCASE.
2. **`SPECS_ALDO/02_CDU_STRUTTURA.md`** — canonical structure of the *Contesto Dati Unificato* (CDU). Every context access path (e.g. `focus.classe.anagrafica.nome`) derives from this.

`SPECS_ALDO/00_PANORAMICA.md` is the index/overview; start there to navigate the other spec files.

## Core domain concepts (from the specs)

- **Google Sheets as a relational DB** — each sheet is a table, columns are typed fields, emails are primary/foreign keys. `SheetDBLib` (L2) abstracts persistence into domain objects.
- **CDU (Contesto Dati Unificato)** — before any operation (document generation, email), the system assembles one aggregated context object; templates and email boxes operate only on this serialized context. Built via `ContextEngine`.
- **Role resolution hierarchy** — the active teacher for a class/subject/date is resolved by querying three sources in descending priority: `SUPPLENZE` (1) → `VARIAZIONI_CATTEDRA` (2) → `CLASSI` (3, nominal fallback). See `RoleResolutionLib`.
- **Data-driven, not hard-coded** — document types, Drive templates, destination folders, ACLs, and email patterns live in DB tables (`CONF_DOC`, `CONF_MAIL`). Adding a document type or email pattern means inserting a DB record, not editing code.
- **Long jobs via `JobRunnerLib`** — GAS caps execution at 6/30 min. Batch work is written as generator functions whose state is serialized to `ScriptProperties` at each checkpoint and resumed by a timed trigger.

The domain is Clean Architecture: Presentation → Application Services → Domain (entities, value objects, aggregates, repositories, specifications) → Infrastructure. The Domain layer is agnostic of Google Sheets/Drive/Gmail.


## Critical constraints when writing code

- **Target is GAS V8**, not Node. ONLY synchronous code; avoid Node-specific and unsupported browser APIs. Source uses modern TS but is transpiled (Babel → Chrome 80) and patched for GAS by a script similar to `scripts/build-and-prepare.cjs`.
- **Native GAS service globals** (`DriveApp`, `SpreadsheetApp`, `DocumentApp`, `PropertiesService`, `CacheService`, `UrlFetchApp`, `Utilities`, `Session`, `ScriptApp`, `LockService`, `MailApp`) may only be touched inside **`GoogleApiWrapper` (L2)**. Everything else routes through a wrapper service. This is enforced by ESLint (`no-restricted-globals`); leaks fail `npm run lint`. (Narrow sanctioned exceptions exist — documented in `GasLibraryFactory/CLAUDE.md`.)
- **Never edit `dist/*`** — it is generated. Fix source modules only.
- The library dependency graph is strictly layered (L0→L4) with **no circular dependencies**; keep new code within its layer's allowed dependencies.
