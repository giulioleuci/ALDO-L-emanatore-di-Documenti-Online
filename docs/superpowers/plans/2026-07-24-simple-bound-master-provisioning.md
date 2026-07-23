# Simple Bound-Master Provisioning Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add minimal Bash and PowerShell launchers that refresh GasLibraryFactory, build ALDO, and push it to a newly created Google Sheet-bound Apps Script project.

**Architecture:** The launchers remain thin command orchestrators. They use Git to obtain the requested public GLF branch, existing ALDO npm scripts to refresh the vendor bundle and build production output, and local clasp to create and push an isolated bound project. They deliberately do not call the Drive API or resolve `MASTER_FOLDER_PATH`.

**Tech Stack:** Bash, PowerShell 5.1+, Git, Node.js 18+, npm 9+, local `@google/clasp`.

## Global Constraints

- Support Windows through PowerShell and macOS/Linux through Bash.
- Keep `GLF_REPOSITORY_URL` and `GLF_BRANCH` as plainly editable variables in both launchers.
- Do not add direct Drive API clients, OAuth token handling, third-party dependencies, or automated tests for this provisioning utility.
- Create the master Sheet in Drive root; `MASTER_FOLDER_PATH` is an informational manual-move reminder only.
- Create a container-bound project, never a standalone one, and use an isolated temporary clasp directory.
- Never overwrite an existing GasLibraryFactory checkout with a destructive Git reset; stop if a fast-forward update is impossible.
- Run `npm run refresh:vendor` before `npm run build:production`.
- Do not edit generated `dist/` files.

---

### Task 1: Add portable provisioning launchers

**Files:**
- Create: `scripts/provision-master.sh`
- Create: `scripts/provision-master.ps1`

- [ ] Define the editable GLF repository/branch, master title, and informational Drive-path variables in both scripts.
- [ ] Validate `git`, `npm`, and `npx`, then invoke interactive `clasp login` only when `show-authorized-user` fails.
- [ ] Clone the configured GLF branch when absent; otherwise fetch and fast-forward only a clean checkout.
- [ ] Write the resolved repository URL, branch, and commit SHA to `REPO_FOR_GLF.txt`.
- [ ] Run `npm run refresh:vendor`, then `npm run build:production`.
- [ ] Create and push a new Sheet-bound clasp project from an isolated temporary directory.
- [ ] Print the required manual move from Drive root to `MASTER_FOLDER_PATH`.
- [ ] Verify Bash syntax with `bash -n scripts/provision-master.sh`. Verify PowerShell syntax on a Windows host; do not create cloud resources during verification.

### Task 2: Document the first run in README

**Files:**
- Modify: `README.md`

- [ ] Add an Italian section naming both launchers and explaining their result: a Google Sheet with a bound Apps Script project.
- [ ] Document prerequisites, editable variables, both operating-system commands, interactive `clasp login`, and the contents of `REPO_FOR_GLF.txt`.
- [ ] State unambiguously that the Sheet is created in Drive root and must be moved manually to `MASTER_FOLDER_PATH`.
- [ ] Verify README links/commands by reviewing the final diff; no automated README test is added.

### Task 3: Integrate after verification

**Files:**
- No source changes.

- [ ] Inspect branch and working tree before commit.
- [ ] Commit scripts, README, specification, and plan.
- [ ] Merge `feat/simple-bound-master-provisioning` into `master` only after the implementation is verified and the worktree is clean.

