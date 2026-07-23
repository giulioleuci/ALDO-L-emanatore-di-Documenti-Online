# Simple Bound-Master Provisioning Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add minimal Bash and PowerShell launchers that refresh GasLibraryFactory, build ALDO, and push it to a newly created Google Sheet-bound Apps Script project.

**Architecture:** The launchers remain thin command orchestrators. They use Git to obtain the requested public GLF branch, existing ALDO npm scripts to refresh the vendor bundle and build production output, and local clasp to create and push an isolated bound project. They deliberately do not call the Drive API or resolve `MASTER_FOLDER_PATH`.

**Tech Stack:** Bash, PowerShell 5.1+, Git, Node.js 18+, npm 9+, local `@google/clasp`, Jest.

## Global Constraints

- Support Windows through PowerShell and macOS/Linux through Bash.
- Keep `GLF_REPOSITORY_URL` and `GLF_BRANCH` as plainly editable variables in both launchers.
- Do not add direct Drive API clients, OAuth token handling, or third-party dependencies.
- Create the master Sheet in Drive root; `MASTER_FOLDER_PATH` is an informational manual-move reminder only.
- Create a container-bound project, never a standalone one, and use an isolated temporary clasp directory.
- Never overwrite an existing GasLibraryFactory checkout with a destructive Git reset; stop if a fast-forward update is impossible.
- Run `npm run refresh:vendor` before `npm run build:production`.
- Do not edit generated `dist/` files.

---

### Task 1: Add launcher contract tests and launchers

**Files:**
- Create: `test/build/provision-master-scripts.test.ts`
- Create: `scripts/provision-master.sh`
- Create: `scripts/provision-master.ps1`

**Interfaces:**
- Consumes: repository-root paths, local `npx`, `git`, `npm`, and `clasp` commands.
- Produces: two launchers exposing `GLF_REPOSITORY_URL`, `GLF_BRANCH`, `MASTER_TITLE`, and `MASTER_FOLDER_PATH`; each generates `REPO_FOR_GLF.txt` and an isolated clasp project.

- [ ] **Step 1: Write the failing test**

Create `test/build/provision-master-scripts.test.ts`:

```ts
import fs from 'node:fs';
import path from 'node:path';

const repoRoot = path.resolve(__dirname, '../..');
const read = (name: string) => fs.readFileSync(path.join(repoRoot, 'scripts', name), 'utf8');

describe('master provisioning launchers', () => {
  test.each(['provision-master.sh', 'provision-master.ps1'])('%s has the portable provisioning contract', (name) => {
    const source = read(name);
    expect(source).toContain('GLF_REPOSITORY_URL');
    expect(source).toContain('GLF_BRANCH');
    expect(source).toContain('MASTER_TITLE');
    expect(source).toContain('MASTER_FOLDER_PATH');
    expect(source).toContain('REPO_FOR_GLF.txt');
    expect(source).toContain('refresh:vendor');
    expect(source).toContain('build:production');
    expect(source).toContain('clasp create --type sheets');
    expect(source).toContain('clasp push');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx jest --config jest.build.config.cjs test/build/provision-master-scripts.test.ts`

Expected: FAIL because the launcher files do not yet exist.

- [ ] **Step 3: Implement the Bash launcher**

Create `scripts/provision-master.sh` with `set -euo pipefail`. Define the four configuration variables at its top. Derive `ALDO_ROOT` from the script directory, set `GLF_DIR="$ALDO_ROOT/GasLibraryFactory"` and `DIST_DIR="$ALDO_ROOT/dist"`, and require `git`, `npm`, and `npx` using `command -v`.

Run `npx --prefix "$ALDO_ROOT" clasp show-authorized-user`; on failure, print a message and run `npx --prefix "$ALDO_ROOT" clasp login`. If `GLF_DIR/.git` is absent, clone with `git clone --branch "$GLF_BRANCH" --single-branch "$GLF_REPOSITORY_URL" "$GLF_DIR"`; otherwise execute `git -C "$GLF_DIR" fetch origin "$GLF_BRANCH"` followed by `git -C "$GLF_DIR" pull --ff-only origin "$GLF_BRANCH"`.

Write URL, branch, and `git -C "$GLF_DIR" rev-parse HEAD` to `REPO_FOR_GLF.txt`. Then execute `npm run refresh:vendor` and `npm run build:production` from `ALDO_ROOT`.

Use `mktemp -d` and a `trap` that removes the temporary directory only after success. From that directory, run `npx --prefix "$ALDO_ROOT" clasp create --type sheets --title "$MASTER_TITLE" --rootDir "$DIST_DIR"`, then `npx --prefix "$ALDO_ROOT" clasp push`. Print that the Sheet was created in Drive root and must be moved manually to `MASTER_FOLDER_PATH`.

- [ ] **Step 4: Implement the PowerShell launcher**

Create `scripts/provision-master.ps1` with `$ErrorActionPreference = 'Stop'`. Define equivalent `$GlfRepositoryUrl`, `$GlfBranch`, `$MasterTitle`, and `$MasterFolderPath` values at the top. Derive `$AldoRoot` from `$PSScriptRoot`, and use `Get-Command` to validate `git`, `npm`, and `npx`.

Use `npx --prefix $AldoRoot clasp show-authorized-user` with `$LASTEXITCODE`; when it is non-zero, run `npx --prefix $AldoRoot clasp login`. Clone only when `$GlfDir/.git` is missing; otherwise use `git -C $GlfDir fetch origin $GlfBranch` then `git -C $GlfDir pull --ff-only origin $GlfBranch`.

Write the URL, branch, and `git -C $GlfDir rev-parse HEAD` to `REPO_FOR_GLF.txt` with `Set-Content`. Invoke `npm run refresh:vendor` and `npm run build:production` from `$AldoRoot` using `Push-Location`/ `Pop-Location`.

Create a unique temporary directory under `[System.IO.Path]::GetTempPath()`, run `npx --prefix $AldoRoot clasp create --type sheets --title $MasterTitle --rootDir $DistDir`, then `npx --prefix $AldoRoot clasp push` from that directory. Delete the temporary directory only on success and print the same root/manual-move notice.

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx jest --config jest.build.config.cjs test/build/provision-master-scripts.test.ts`

Expected: PASS with two launcher-contract tests.

- [ ] **Step 6: Run syntax checks**

Run: `bash -n scripts/provision-master.sh`

Expected: exit code 0.

On Windows, additionally run: `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/provision-master.ps1 -?`

Expected: the script parses without a PowerShell syntax error; do not run provisioning in automated verification because it creates cloud resources.

- [ ] **Step 7: Commit**

```bash
git add scripts/provision-master.sh scripts/provision-master.ps1 test/build/provision-master-scripts.test.ts
git commit -m "feat: add bound master provisioning launchers"
```

### Task 2: Document first use in the repository README

**Files:**
- Modify: `README.md`
- Test: `test/build/provision-master-scripts.test.ts`

**Interfaces:**
- Consumes: the four launcher configuration variables and generated `REPO_FOR_GLF.txt`.
- Produces: a concise Italian “Provisioning del master bound” section that lets an operator complete the first run without reading source code.

- [ ] **Step 1: Extend the failing test for README guidance**

Add this test:

```ts
test('README documents first-run provisioning and its Drive limitation', () => {
  const readme = fs.readFileSync(path.join(repoRoot, 'README.md'), 'utf8');
  expect(readme).toContain('provision-master.sh');
  expect(readme).toContain('provision-master.ps1');
  expect(readme).toContain('clasp login');
  expect(readme).toContain('Drive root');
  expect(readme).toContain('REPO_FOR_GLF.txt');
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx jest --config jest.build.config.cjs test/build/provision-master-scripts.test.ts`

Expected: FAIL because README does not yet document the launchers.

- [ ] **Step 3: Add the README section**

Append a concise Italian section after “Comandi” titled `Provisioning del master bound (primo avvio)`. State the prerequisites (Git, Node/npm matching `package.json`, `npm install`, and browser-capable `clasp login`); show both commands:

```bash
bash scripts/provision-master.sh
```

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\provision-master.ps1
```

Explain the four editable variables, interactive OAuth behavior, the contents of `REPO_FOR_GLF.txt`, that the new Sheet/project is bound, that creation occurs in Drive root, and that the operator must manually move the Sheet to `MASTER_FOLDER_PATH`.

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx jest --config jest.build.config.cjs test/build/provision-master-scripts.test.ts`

Expected: PASS.

- [ ] **Step 5: Run repository verification**

Run: `npm run lint && npm run test:build && npm run build:production`

Expected: all commands exit with code 0. The production build validates the actual bundle but does not create any Google resources.

- [ ] **Step 6: Commit**

```bash
git add README.md test/build/provision-master-scripts.test.ts docs/superpowers/specs/2026-07-24-simple-bound-master-provisioning-design.md docs/superpowers/plans/2026-07-24-simple-bound-master-provisioning.md
git commit -m "docs: explain bound master first run"
```

### Task 3: Integrate only after verification

**Files:**
- No source changes.

**Interfaces:**
- Consumes: the verified commits from Tasks 1–2 and the current branch state.
- Produces: a merged commit only when an explicit, non-ambiguous target branch is identified.

- [ ] **Step 1: Inspect branch and working tree**

Run: `git status --short && git branch --show-current && git log --oneline -5`

Expected: the implementation commits are visible and all changes intended for integration are identified.

- [ ] **Step 2: Confirm target branch before merging**

Do not infer a merge target. If changes are already committed on the target branch, no merge is necessary. Otherwise request the exact target branch from the operator before running `git merge`.

- [ ] **Step 3: Perform the requested merge only after target confirmation**

Run the branch-specific merge command only after the operator supplies its destination branch and any merge conflict is resolved without overwriting user changes.

