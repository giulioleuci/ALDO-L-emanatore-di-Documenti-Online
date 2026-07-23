# Simple bound-master provisioning — Design

## Goal

Provide an intentionally small, cross-platform local workflow that refreshes
GasLibraryFactory from a public GitHub repository, builds ALDO for production,
creates a new Google Sheet with a container-bound Apps Script project, and
pushes the generated bundle into that project.

The resulting Apps Script project is bound to the master Sheet. It therefore
uses the Sheet as its container and never needs its ID stored in
`PropertiesService`.

## Scope and constraints

- The workflow is implemented exclusively as a Bash launcher for macOS/Linux
  and a PowerShell launcher for Windows.
- It relies only on installed `git`, Node.js/npm, and `clasp`; no direct Drive
  API client or custom OAuth-token management is added.
- GasLibraryFactory is public. The scripts expose editable repository URL and
  branch variables.
- Each run writes `REPO_FOR_GLF.txt`, recording the resolved repository URL,
  requested branch, and checked-out commit SHA.
- `clasp login` remains interactive when credentials are absent or expired.

## Drive path behavior

`clasp` can create a Sheet-bound project, but it has no portable CLI operation
for resolving, creating, or moving files through a Google Drive folder path.
The scripts therefore create the Sheet in Drive root. They accept and print a
`MASTER_FOLDER_PATH` value only as an operator reminder; moving the Sheet to
that path is a manual post-step. Moving the container does not detach its bound
Apps Script project.

If direct placement by path becomes a requirement, this workflow must be
replaced by the Node.js plus Drive API design previously considered.

## Components

- `scripts/provision-master.sh`: Bash entry point for macOS and Linux.
- `scripts/provision-master.ps1`: PowerShell entry point for Windows.
- `README.md`: documents prerequisites, configuration variables, first-run
  authorization, execution, output, and the manual Drive move.

The two launchers have the same configuration names and operational sequence.
They use a temporary clasp project directory so the repository's existing
`.clasp.json` is never replaced.

## Operational sequence

1. Check the required commands and request an interactive `clasp login` if
   needed.
2. Clone or update GasLibraryFactory at the configured branch.
3. Resolve the checked-out revision and write `REPO_FOR_GLF.txt`.
4. Run `npm run refresh:vendor` so the checked-out library bundle is copied
   into ALDO's vendor directory with its checksum and version metadata.
5. Run `npm run build:production` from the ALDO root.
6. In the temporary clasp directory, create a new Sheet-bound Apps Script
   project with the configured master title and `dist/` as its source root.
7. Push the generated production files to that new project.

`clasp push` replaces the complete remote project content. The isolated
temporary clasp configuration is therefore mandatory.

## Error handling and safety

- Fail immediately for missing commands, failed Git operations, build failures,
  or failed clasp operations.
- Preserve the repository's `GasLibraryFactory` checkout and its existing
  `.clasp.json`; do not delete or overwrite either.
- Retain the temporary clasp directory on failure and print its location for
  diagnosis; clean it after a successful push.
- Do not attempt to bypass Google OAuth approval.

## Verification

Automated tests will verify that both launchers expose the agreed configuration
variables, guard required commands, create an isolated clasp configuration, and
do not attempt Drive-path automation. A build verification will continue to use
the existing `npm run build:production` command.
