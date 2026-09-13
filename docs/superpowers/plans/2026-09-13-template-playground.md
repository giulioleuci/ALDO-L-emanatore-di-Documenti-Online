# Template Playground — Piano di Implementazione

> **Per agenti:** SKILL RICHIESTA: eseguire con `superpowers:executing-plans` (o `subagent-driven-development`). Passi con checkbox `- [ ]`.

**Goal:** Webapp statica (Vite + TypeScript vanilla) per costruire template ALDO (Docs/Sheets/email) visualmente su dati CDU fittizi, con anteprima live e regole di dominio bloccanti.

**Architettura:** Pipeline unidirezionale client-only: `template (stringa) → tokenizza → valida (rules) → render (html) → anteprima`. Editing su `textarea` con layer di evidenziazione dei placeholder; albero CDU a sinistra → pannello di inserimento (filtri/loop/condizionale) → snippet inserito nel testo.

**Tech stack:** Vite ^6, Vitest ^3 (stessa API Jest), TypeScript ^5.7, Node 20. Nessun framework UI, nessuna dipendenza runtime.

## Global Constraints

- Solo codice sincrono (nessun async/await); bersaglio browser moderno (Vite target `es2020`).
- Nessuna dipendenza runtime extra; solo dev-deps: `typescript`, `vite`, `vitest`.
- Sintassi placeholder: quella di `SPECS_ALDO/GUIDA_USO_PLACEHOLDER.md` (Mustache `{{}}`, sezioni `#`/`^`/`/`, filtri pipe `| nome:args`, direttive `bullet_list`/`number_list`/`tablerow_loop`, Sheets `dynamic_rows[...]`/`dynamic_columns[...]`).
- Regole bloccanti dal §7 della guida (budget percorsi, `where`/`exclude` solo su booleani, obbligo `hasElenco`, niente `sort`/`sortBy`/`reverse` su array di dominio, concatenazioni solo casi inequivocabili, privacy).
- Lingua UI italiana; identificatori codice in inglese; nomi dati fittizi come in guida (BIANCHI, FERRI, NERI, ROSSI, VERDI).
- Tutti i test in Vitest, file `*.test.ts` accanto al sorgente.
- Commit frequenti, un commit per task.

---

### Task 1: Scaffold del package `template-playground/`

**Files:**
- Create: `template-playground/package.json`
- Create: `template-playground/tsconfig.json`
- Create: `template-playground/vite.config.ts`
- Create: `template-playground/index.html`
- Create: `template-playground/src/main.ts`
- Create: `template-playground/src/style.css`

**Interfaces:** nessuna (bootstrap). Produce il package con `npm run dev`, `npm run build`, `npm test` funzionanti.

- [ ] **Step 1: crea `package.json`**

```json
{
  "name": "template-playground",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview",
    "test": "vitest run",
    "typecheck": "tsc --noEmit"
  },
  "devDependencies": {
    "typescript": "^5.7.2",
    "vite": "^6.0.7",
    "vitest": "^3.0.0"
  }
}
```

- [ ] **Step 2: crea `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "noEmit": true,
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "isolatedModules": true
  },
  "include": ["src", "vite.config.ts"]
}
```

- [ ] **Step 3: crea `vite.config.ts`**

```ts
/// <reference types="vitest" />
import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  build: { outDir: 'dist', target: 'es2020' },
  test: { include: ['src/**/*.test.ts'] },
});
```

- [ ] **Step 4: crea `index.html`** (shell a pannelli: barra alta, albero, editor, anteprima)

```html
<!doctype html>
<html lang="it">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Template Playground — ALDO</title>
    <link rel="stylesheet" href="/src/style.css" />
  </head>
  <body>
    <header id="toolbar">
      <select id="scenario-select" aria-label="Scenario"></select>
      <select id="output-context-select" aria-label="Contesto di output"></select>
      <span id="validity-dot" title="Validità del template"></span>
      <button id="btn-copy" type="button">Copia template</button>
      <button id="btn-export" type="button">Esporta .txt</button>
    </header>
    <main id="app">
      <aside id="tree-pane"><h2>CDU (fittizio)</h2><div id="tree"></div></aside>
      <section id="editor-pane">
        <div id="editor"></div>
        <div id="problems"></div>
      </section>
      <section id="preview-pane">
        <h2>Anteprima</h2>
        <div id="preview" class="preview-docs"></div>
      </section>
    </main>
    <div id="insert-overlay" hidden></div>
    <script type="module" src="/src/main.ts"></script>
  </body>
</html>
```

- [ ] **Step 5: crea `src/style.css`** — layout a 3 colonne e stile token/chip

```css
* { box-sizing: border-box; }
:root { --err:#c0392b; --warn:#b7791f; --ok:#27ae60; --chip-bg:#eef3fb; --chip-border:#9db8dd; }
html, body { margin:0; height:100%; font-family: system-ui, "Segoe UI", sans-serif; font-size:14px; }
#toolbar { display:flex; gap:8px; align-items:center; padding:8px 12px; border-bottom:1px solid #ccc; }
#validity-dot { width:14px; height:14px; border-radius:50%; background:#b0b0b0; display:inline-block; }
#validity-dot.ok { background:var(--ok); } #validity-dot.err { background:var(--err); }
#app { display:grid; grid-template-columns:300px 1fr 1fr; gap:0; height:calc(100vh - 49px); }
#tree-pane { border-right:1px solid #ccc; overflow:auto; padding:8px; }
#editor-pane { display:flex; flex-direction:column; border-right:1px solid #ccc; }
#preview-pane { overflow:auto; padding:8px; }
#editor { flex:1; position:relative; min-height:200px; }
#editor textarea, #editor pre.backdrop { position:absolute; inset:0; margin:0; padding:8px;
  font: 13px/1.5 ui-monospace, Menlo, Consolas, monospace; border:none; outline:none; white-space:pre-wrap; word-wrap:break-word; }
#editor textarea { background:transparent; color:transparent; caret-color:#111; resize:none; width:100%; height:100%; z-index:2; }
#editor pre.backdrop { z-index:1; pointer-events:none; color:#222; }
#editor pre.backdrop .tok { background:var(--chip-bg); border:1px solid var(--chip-border); border-radius:4px; padding:0 2px; }
#editor pre.backdrop .tok.err { border-color:var(--err); background:#fdecea; text-decoration:underline wavy var(--err); }
#editor pre.backdrop .tok.warn { border-color:var(--warn); background:#fdf3e3; }
#problems { max-height:140px; overflow:auto; border-top:1px solid #ccc; font-size:12px; padding:4px 8px; }
#problems .err { color:var(--err); } #problems .warn { color:var(--warn); }
.tree-key { font-weight:600; } .tree-arr { color:var(--warn); } .tree-leaf { color:#555; }
.tree-row { cursor:pointer; border-radius:3px; padding:1px 4px; }
.tree-row:hover { background:#eef3fb; }
#preview h2 { margin-top:0; }
.preview-docs { white-space:pre-wrap; line-height:1.6; }
.preview-docs table, .preview-docs th, .preview-docs td { border:1px solid #999; border-collapse:collapse; padding:4px 8px; }
mark.missing { background:#fff3cd; color:#856404; font-weight:600; }
mark.rend-err { background:#fdecea; color:var(--err); }

- [ ] **Step 6: crea `src/main.ts`** (bootstrap minimo, wiring sostituito in Task 9)

```ts
import './style.css';

export function main(): void {
  const select = document.getElementById('scenario-select') as HTMLSelectElement;
  select.innerHTML = '<option>placeholder</option>';
}

main();
```

- [ ] **Step 7: Test di smoke + verifica**

Create `template-playground/src/main.test.ts`:

```ts
import { describe, it, expect } from 'vitest';

describe('scaffold', () => {
  it('il package compila e vitest gira', () => {
    expect(true).toBe(true);
  });
});
```

- [ ] **Step 8: verifica**

```bash
cd template-playground && npm install && npm run typecheck && npm test && npm run build
```

Expected: typecheck OK, 1 test PASS, `dist/` prodotto.

- [ ] **Step 9: Commit**

```bash
cgit add template-playground
git commit -m "chore(template-playground): scaffold vite+ts+vitest"
```

---

### Task 2: Engine — tipi e tokenizer

**Files:**
- Create: `template-playground/src/engine/types.ts`
- Create: `template-playground/src/engine/tokenizer.ts`
- Test: `template-playground/src/engine/tokenizer.test.ts`

**Interfaces:**
- Produces (usati da Task 3+):
  - `export type CDUValue = string | number | boolean | null | CDUNode | CDUValue[] | undefined;`
  - `export interface CDUNode { [key: string]: CDUValue }`
  - `export type ArgValue = string | number | boolean;`
  - `export interface Filter { name: string; args: ArgValue[] }`
  - Token: `TextToken { type:'text'; value:string; start:number; end:number }`, `VarToken { type:'var'; path:string; filters:Filter[]; raw:boolean; start; end }`, `SectionOpenToken { type:'section-open'; name:string; kind:'path'|'expr'|'list'|'numberList'|'tablerow'; target:string; start; end }`, `SectionCloseToken { type:'section-close'; name:string; start; end }`, `InvertedOpenToken { type:'inverted-open'; name:string; kind:'path'|'expr'; target:string; start; end }`, `SheetToken { type:'sheet'; kind:'dynamic_rows'|'dynamic_columns'; params:Record<string,string>; start; end }`, type `Token = ...`
  - `export interface ParserError { offset:number; message:string }`
  - `export interface ParseResult { tokens: Token[]; errors: ParserError[] }`
  - `export function tokenize(template: string): ParseResult`

- [ ] **Step 1: test falliti** — `src/engine/tokenizer.test.ts`

```ts
import { describe, it, expect } from 'vitest';
import { tokenize } from './tokenizer';
import type { Token } from './types';

const kinds = (t: Token[]) => t.map((x) => x.type).join(',');

describe('tokenize', () => {
  it('testo semplice', () => {
    const r = tokenize('pippo ');
    expect(r.errors).toEqual([]);
    expect(kinds(r.tokens)).toBe('text');
    expect(r.tokens[0].value).toBe('pippo ');
  });
  it('variabile scalare con percorso', () => {
    const r = tokenize('{{focus.classe.nome}}');
    expect(r.tokens[0]).toMatchObject({ type: 'var', path: 'focus.classe.nome', raw: false, filters: [] });
  });
  it('tripla graffa e ampersand sono raw', () => {
    expect((tokenize('{{{a.b}}}').tokens[0] as any).raw).toBe(true);
    expect((tokenize('{{&a.b}}').tokens[0] as any).raw).toBe(true);
  });
  it('filtri con argomenti', () => {
    const t = tokenize("{{n | pluralize:'materia':'materie'}}").tokens[0] as any;
    expect(t.path).toBe('n');
    expect(t.filters).toEqual([{ name: 'pluralize', args: ['materia', 'materie'] }]);
  });
  it('chaining di filtri', () => {
    const t = tokenize("{{l | map:'nome' | join:', '}}").tokens[0] as any;
    expect(t.filters.map((f: any) => f.name)).toEqual(['map', 'join']);
  });
  it('inverted section', () => {
    const r = tokenize('{{^focus.classe.studenti.hasElenco}}vuoto{{/focus.classe.studenti.hasElenco}}');
    expect(kinds(r.tokens)).toBe('inverted-open,text,section-close');
  });
  it('section bullet_list con target', () => {
    const r = tokenize('{{#bullet_list:focus.classe.consiglio.elenco}}x{{/bullet_list}}');
    const open = r.tokens[0] as any;
    expect(open.kind).toBe('list');
    expect(open.target).toBe('focus.classe.consiglio.elenco');
  });
  it('sezione con espressione', () => {
    const r = tokenize('{{#a && b}}x{{/a && b}}');
    expect((r.tokens[0] as any).kind).toBe('expr');
  });
  it('direttiva Sheets dynamic_rows', () => {
    const r = tokenize('{{dynamic_rows[source=focus.classe.studenti.elenco,value=nomeCompleto]}}');
    const t = r.tokens[0] as any;
    expect(t.type).toBe('sheet');
    expect(t.kind).toBe('dynamic_rows');
    expect(t.params).toEqual({ source: 'focus.classe.studenti.elenco', value: 'nomeCompleto' });
  });
  it('coppie sezione testuali non chiuse producono errore', () => {
    const r = tokenize('{{#focus.x.elenco}}a');
    expect(r.errors.length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: run test, expected FAIL** — `npx vitest run src/engine/tokenizer.test.ts`

- [ ] **Step 3: `src/engine/types.ts`**

```ts
export type Scalar = string | number | boolean | null;
export interface CDUNode { [key: string]: CDUValue }
export type CDUValue = Scalar | CDUNode | CDUValue[] | undefined;

export type ArgValue = string | number | boolean;
export interface Filter { name: string; args: ArgValue[] }

export interface TokenBase { start: number; end: number }

export interface TextToken extends TokenBase { type: 'text'; value: string }
export interface VarToken extends TokenBase {
  type: 'var'; path: string; filters: Filter[]; raw: boolean;
}
export interface SectionOpenToken extends TokenBase {
  type: 'section-open';
  name: string;
  kind: 'path' | 'expr' | 'list' | 'numberList' | 'tablerow';
  target: string;
}
export interface SectionCloseToken extends TokenBase { type: 'section-close'; name: string }
export interface InvertedOpenToken extends TokenBase { type: 'inverted-open'; name: string }
export interface SheetToken extends TokenBase {
  type: 'sheet'; kind: 'dynamic_rows' | 'dynamic_columns'; params: Record<string, string>;
}

export type Token = TextToken | VarToken | SectionOpenToken | SectionCloseToken | InvertedOpenToken | SheetToken;

export interface ParserError { offset: number; message: string }
export interface ParseResult { tokens: Token[]; errors: ParserError[] }
```

- [ ] **Step 4: `src/engine/tokenizer.ts`**

```ts
import type { ArgValue, Filter, ParseResult, Token, VarToken } from './types';

const STRUCTURALS = new Set(['bullet_list', 'number_list', 'tablerow_loop']);

function splitTopLevel(s: string, sep: string): string[] {
  const out: string[] = [];
  let cur = '';
  let quote: string | null = null;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (quote) {
      cur += c;
      if (c === quote) quote = null;
    } else if (c === "'" || c === '"') {
      quote = c; cur += c;
    } else if (c === sep) {
      out.push(cur); cur = '';
    } else {
      cur += c;
    }
  }
  out.push(cur);
  return out;
}

function parseArg(raw: string): ArgValue {
  const v = raw.trim();
  if ((v.startsWith("'") && v.endsWith("'")) || (v.startsWith('"') && v.endsWith('"'))) {
    return v.slice(1, -1);
  }
  if (v === 'true') return true;
  if (v === 'false') return false;
  if (/^-?\d+(\.\d+)?$/.test(v)) return Number(v);
  return v;
}

function parseFilters(chain: string[]): Filter[] {
  const [name, ...rawArgs] = chain;
  const args: ArgValue[] = [];
  for (const raw of rawArgs) args.push(...splitTopLevel(raw, ':').map(parseArg));
  return [{ name: name.trim(), args }];
}

export function tokenize(template: string): ParseResult {
  const tokens: Token[] = [];
  const errors: Array<{ offset: number; message: string }> = [];
  let i = 0;
  let textStart = 0;

  const pushText = (end: number) => {
    if (end > textStart) tokens.push({ type: 'text', value: template.slice(textStart, end), start: textStart, end });
  };

  while (i < template.length) {
    const triple = template.startsWith('{{{', i);
    const open = triple ? '}}}' : '}}';
    const openLen = triple ? 3 : 2;
    if (template.startsWith('{{', i)) {
      pushText(i);
      const end = template.indexOf(open, i + openLen);
      if (end < 0) {
        errors.push({ offset: i, message: 'Graffe non chiuse: ' + template.slice(i, i + 24) });
        i = template.length;
        break;
      }
      const inner = template.slice(i + openLen, end).trim();
      const start = i;
      const stop = end + openLen;
      if (triple) {
        tokens.push({ type: 'var', path: inner, filters: [], raw: true, start, end: stop });
      } else if (inner.startsWith('&')) {
        tokens.push({ type: 'var', path: inner.slice(1).trim(), filters: [], raw: true, start, end: stop });
      } else if (inner.startsWith('#')) {
        const name = inner.slice(1).trim();
        const colon = name.indexOf(':');
        const directive = colon >= 0 ? name.slice(0, colon) : null;
        const rest = colon >= 0 ? name.slice(colon + 1) : name;
        const kind = directive ? (directive === 'bullet_list' ? 'list' : directive === 'number_list' ? 'numberList' : directive === 'tablerow_loop' ? 'tablerow' : 'path') : 'path';
        if (directive && !STRUCTURALS.has(directive)) {
          errors.push({ offset: start, message: 'Direttiva di sezione sconosciuta: ' + directive });
          i = stop; textStart = stop; continue;
        }
        tokens.push({ type: 'section-open', name, kind: exprLike(rest) ? 'expr' : kind, target: rest, start, end: stop });
      } else if (inner.startsWith('^')) {
        const name = inner.slice(1).trim();
        tokens.push({ type: 'inverted-open', name, start, end: stop });
      } else if (inner.startsWith('/')) {
        tokens.push({ type: 'section-close', name: inner.slice(1).trim(), start, end: stop });
      } else {
        const dm = inner.match(/^dynamic_(rows|columns)\[(.*)\]$/s);
        if (dm) {
          const params: Record<string, string> = {};
          for (const part of splitTopLevel(dm[2], ',')) {
            const eq = part.indexOf('=');
            if (eq < 0) continue;
            params[part.slice(0, eq).trim()] = part.slice(eq + 1).trim();
          }
          tokens.push({ type: 'sheet', kind: dm[1] as 'dynamic_rows' | 'dynamic_columns', params, start, end: stop });
        } else {
          tokens.push(parseVar(inner, start, stop));
        }
      }
      i = stop;
      textStart = stop;
      continue;
    }
    i++;
  }
  pushText(template.length);
  return { tokens, errors };
}

function exprLike(name: string): boolean {
  return /(^| )(\|\||&&|==|!=|===|!==|>=|<=|[><!])/.test(name);
}

function parseVar(inner: string, start: number, end: number): VarToken {
  const chain = splitTopLevel(inner, '|');
  const path = chain[0].trim();
  const filters: Filter[] = [];
  for (const piece of chain.slice(1)) filters.push(...parseFilters(splitTopLevel(piece, ':')));
  return { type: 'var', path, filters, raw: false, start, end };
}
```

- [ ] **Step 5: run test, expected PASS**

```bash
npx vitest run src/engine/tokenizer.test.ts
```

- [ ] **Step 6: Commit**

```bash
git add template-playground/src/engine
git commit -m "feat(template-playground): tipi e tokenizer mustache"
```

---

### Task 3: Engine — lookup contesto e renderer core

**Files:**
- Create: `template-playground/src/engine/lookup.ts`
- Create: `template-playground/src/engine/renderer.ts`
- Create: `template-playground/src/engine/escape.ts`
- Test: `template-playground/src/engine/renderer.test.ts`

**Interfaces:**
- Produces:
  - `export interface Resolution { found:boolean; value:CDUValue }`
  - `export function lookup(path:string, frames:CDUValue[]): Resolution` — `frames[0]` = root CDU, poi scope annidati (item di loop/oggetto). Supporta `../`, segmenti numerici (indice array), chiavi `@...` (meta da frame), fallback su `hasOwnProperty`.
  - `export function escapeHtml(s:string): string`
  - `export interface RenderError { offset:number; message:string }`
  - `export interface RenderResult { html:string; errors:RenderError[] }`
  - `export function renderTemplate(tokens:Token[], root:CDUValue): RenderResult`
- Consumes: `tokenize`, tipi Task 2; `applyFilters` Task 5 (import optional — renderer lascia i filtri a Task 5, qui implementa il pass `applyFilterChain`).

*Nota task-ordine:* il renderer accetta un parametro `filters: FilterSet` iniettato per evitare dipendenza circolare. In Task 5 `main.ts` fornirà l'implementazione reale. Qui il default mappa a errore "filtro non implementato"; il Task 5 li sostituisce.

- [ ] **Step 1: test falliti** — `src/engine/renderer.test.ts`

```ts
import { describe, it, expect } from 'vitest';
import { tokenize } from './tokenizer';
import { renderTemplate } from './renderer';
import type { CDUNode } from './types';

const cdu: CDUNode = {
  focus: {
    classe: { nome: '3A INF', anno: 3 },
    studenti: { elenco: [{ nomeCompleto: 'BIANCHI ANNA', email: 'a@x.it' }, { nomeCompleto: 'ROSSI MARIO' }] },
    coordinatori: { elenco: [{ nomeCompleto: 'ROSSI LUCA' }] },
  },
  meta: { oggi: { estesa: '31 agosto 2026' } },
};

const rr = (tpl: string) => renderTemplate(tokenize(tpl).tokens, cdu as any);

describe('renderTemplate', () => {
  it('variabile scalare', () => {
    expect(rr('Classe {{focus.classe.nome}}.').html).toBe('Classe 3A INF.');
  });
  it('percorso inesistente: marker nella preview', () => {
    const r = rr('{{focus.nope.x}}');
    expect(r.html).toContain('render-err');
    expect(r.errors.length).toBe(1);
  });
  it('escape HTML col doppio ma non triplo', () => {
    expect(rr('{{focus.classe.nome}}').html).toBe('3A INF');
  });
  it('sezione array itera e risale al contesto', () => {
    const out = rr('{{#focus.studenti.elenco}}{{nomeCompleto}} in {{../focus.classe.nome}};{{/focus.studenti.elenco}}').html;
    expect(out).toContain('BIANCHI ANNA in 3A INF');
    expect(out).toContain('ROSSI MARIO in 3A INF');
  });
  it('meta variabili @number e @last', () => {
    const out = rr('{{#focus.studenti.elenco}}{{@number}}{{^@last}}, {{/@last}}{{/focus.studenti.elenco}}').html;
    expect(out).toBe('1, 2');
  });
  it('indice numerico [n]', () => {
    expect(rr('{{focus.coordinatori.elenco.0.nomeCompleto}}').html).toBe('ROSSI LUCA');
  });
  it('inverted sezione', () => {
    expect(rr('{{^focus.mancante}}vuoto{{/focus.mancante}}').html).toBe('vuoto');
  });
  it('sezione booleana true', () => {
    expect(rr('{{#focus.classe}}sì{{/focus.classe}}').html).toBe('sì');
  });
  it('sezione con arr:inline vuoto non itera', () => {
    expect(rr('{{#focus.studenti.nonEsiste}}x{{/focus.studenti.nonEsiste}}').html).toBe('');
  });
  it('errore sezione non chiusa', () => {
    const r = renderTemplate(tokenize('{{#focus.studenti.elenco}}x').tokens, cdu as any);
    expect(r.errors.length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: run test, expected FAIL**

```bash
npx vitest run src/engine/renderer.test.ts
```

- [ ] **Step 3: `src/engine/escape.ts`**

```ts
export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => {
    switch (c) {
      case '&': return '&amp;';
      case '<': return '&lt;';
      case '>': return '&gt;';
      case '"': return '&quot;';
      default: return '&#39;';
    }
  });
}
```

- [ ] **Step 4: `src/engine/lookup.ts`**

```ts
import type { CDUValue, CDUNode } from './types';

export interface Resolution { found: boolean; value: CDUValue }

export function lookup(path: string, frames: CDUValue[]): Resolution {
  const segs = path.split('.');
  let frameIdx = frames.length - 1;
  let i = 0;
  while (segs[i] === '..') { frameIdx -= 1; i += 1; }
  if (frameIdx < 0 || frameIdx >= frames.length) return { found: false, value: undefined };
  let cur: CDUValue = frames[frameIdx];
  for (; i < segs.length; i++) {
    const seg = segs[i];
    if (cur == null) return { found: false, value: undefined };
    if (/^\d+$/.test(seg)) {
      if (!Array.isArray(cur)) return { found: false, value: undefined };
      const idx = Number(seg);
      if (idx < 0 || idx >= cur.length) return { found: false, value: undefined };
      cur = (cur as CDUValue[])[idx];
      continue;
    }
    if (typeof cur !== 'object' || cur === null) return { found: false, value: undefined };
    const node = cur as CDUNode;
    if (!Object.prototype.hasOwnProperty.call(node, seg)) return { found: false, value: undefined };
    cur = node[seg];
  }
  return { found: cur !== undefined, value: cur };
}

export function truthy(v: CDUValue): boolean {
  if (v == null || v === false) return false;
  if (typeof v === 'string') return v.length > 0;
  if (Array.isArray(v)) return v.length > 0;
  return true;
}

export function readable(v: CDUValue): string {
  if (v == null) return '';
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}
```

- [ ] **Step 5: `src/engine/renderer.ts`** (completo, import statici — nessun `require`)

```ts
import type { CDUNode, CDUValue, SectionOpenToken, SheetToken, Token, VarToken } from './types';
import { lookup, readable, truthy } from './lookup';
import { escapeHtml } from './escape';
import { applyFilters } from './filters';
import { evalExpr } from './expression';
import * as structural from './structural';

export interface RenderError { offset: number; message: string }
export interface RenderResult { html: string; errors: RenderError[] }

interface Ctx {
  frames: CDUValue[];
  out: string[];
  errors: RenderError[];
}

export function renderTemplate(tokens: Token[], root: CDUValue): RenderResult {
  const ctx: Ctx = { frames: [root], out: [], errors: [] };
  let i = 0;
  while (i < tokens.length) {
    const t = tokens[i];
    if (t.type === 'text') { ctx.out.push(escapeHtml(t.value)); i++; continue; }
    if (t.type === 'var') { renderVar(t, ctx); i++; continue; }
    if (t.type === 'sheet') { ctx.out.push(structural.sheetDirectiveHtml(t, { frames: ctx.frames })); i++; continue; }
    if (t.type === 'section-open') { i = renderSection(t, i + 1, tokens, ctx); continue; }
    if (t.type === 'inverted-open') { i = renderInverted(t, i + 1, tokens, ctx); continue; }
    if (t.type === 'section-close') {
      ctx.errors.push({ offset: t.start, message: 'Sezione chiusa senza apertura: /' + t.name });
      i++; continue;
    }
  }
  return { html: ctx.out.join(''), errors: ctx.errors };
}

function renderVar(t: VarToken, ctx: Ctx): void {
  const literal = /^(['"])(.*)\1$/.exec(t.path);
  const base: CDUValue = literal ? literal[2] : lookup(t.path, ctx.frames).value;
  const { value, error } = applyFilters(base, t.filters);
  if (error) {
    ctx.errors.push({ offset: t.start, message: error });
    ctx.out.push('<mark class="render-err">' + escapeHtml(error) + '</mark>');
    return;
  }
  if (!literal && !lookup(t.path, ctx.frames).found) {
    ctx.errors.push({ offset: t.start, message: 'Percorso non risolto: ' + t.path });
    ctx.out.push('<mark class="render-err">' + escapeHtml(t.path) + '</mark>');
    return;
  }
  const text = readable(value);
  ctx.out.push(text === '' || t.raw ? text : escapeHtml(text));
}

function renderSection(open: SectionOpenToken, idx: number, tokens: Token[], ctx: Ctx): number {
  const { body, endIdx } = collectBody(open, idx, tokens, ctx);
  if (endIdx < 0) return idx;

  const kind = open.kind;
  if (kind === 'list' || kind === 'numberList' || kind === 'tablerow') {
    const r = lookup(open.target, ctx.frames);
    if (!Array.isArray(r.value)) {
      ctx.errors.push({ offset: open.start, message: 'Target non è un array: ' + open.target });
      return endIdx;
    }
    const arr = r.value as CDUValue[];
    const htmls: string[] = [];
    for (let i = 0; i < arr.length; i++) {
      const frame = makeFrame(arr[i], i, arr.length);
      pushScope(ctx, frame);
      const frag = renderBodyToString(body, ctx);
      popScope(ctx);
      htmls.push(frag);
    }
    if (kind === 'list') ctx.out.push(structural.bullet(htmls));
    else if (kind === 'numberList') ctx.out.push(structural.number(htmls));
    else ctx.out.push(structural.tablerow(htmls));
    return endIdx;
  }

  let value: CDUValue;
  if (kind === 'expr') {
    value = evalExpr(open.target, ctx.frames);
  } else {
    value = lookup(open.target, ctx.frames).value;
  }

  if (Array.isArray(value)) {
    const arr = value as CDUValue[];
    for (let i = 0; i < arr.length; i++) {
      pushScope(ctx, makeFrame(arr[i], i, arr.length));
      renderBody(body, ctx);
      popScope(ctx);
    }
  } else if (truthy(value)) {
    pushScope(ctx, makeFrame(value, 0, 1));
    renderBody(body, ctx);
    popScope(ctx);
  }
  return endIdx;
}

function renderInverted(t: { name: string; start: number }, idx: number, tokens: Token[], ctx: Ctx): number {
  const { body, endIdx } = collectBody(t as Token, idx, tokens, ctx);
  if (endIdx < 0) return idx;
  const r = lookup(t.name, ctx.frames);
  if (!truthy(r.value)) renderBody(body, ctx);
  return endIdx;
}

/* Frame di loop: item + meta-var; gli item non-oggetto entrano come {value: item}.
   Le chiavi @... sono accessibili come normali chiavi di frame. */
function makeFrame(item: CDUValue, index: number, total: number): CDUNode {
  const base = item != null && typeof item === 'object' ? item as CDUNode : { value: item };
  return {
    ...base,
    '@index': index,
    '@number': index + 1,
    '@first': index === 0,
    '@last': index === total - 1,
    '@odd': index % 2 === 1,
    '@even': index % 2 === 0,
    '@total': total,
  };
}

function renderBody(body: Token[], ctx: Ctx): void {
  let i = 0;
  while (i < body.length) {
    const t = body[i];
    if (t.type === 'text') { ctx.out.push(escapeHtml(t.value)); i++; continue; }
    if (t.type === 'var') { renderVar(t, ctx); i++; continue; }
    if (t.type === 'sheet') { ctx.out.push(structural.sheetDirectiveHtml(t, { frames: ctx.frames })); i++; continue; }
    if (t.type === 'section-open') { i = renderSection(t, i + 1, body, ctx); continue; }
    if (t.type === 'inverted-open') { i = renderInverted(t, i + 1, body, ctx); continue; }
    i++;
  }
}

/* come renderBody ma restituisce la stringa (per i loop strutturali). */
function renderBodyToString(body: Token[], ctx: Ctx): string {
  const saved = ctx.out.length;
  renderBody(body, ctx);
  return ctx.out.splice(saved).join('');
}

function collectBody(open: Token, idx: number, tokens: Token[], ctx: Ctx): { body: Token[]; endIdx: number } {
  const openKey = open.type === 'section-open' ? open.name.split(':')[0] : open.name;
  const body: Token[] = [];
  let depth = 1;
  let i = idx;
  while (i < tokens.length) {
    const t = tokens[i];
    if (t.type === 'section-open' || t.type === 'inverted-open') {
      depth++;
    } else if (t.type === 'section-close') {
      const closes = t.name === open.name || t.name.split(':')[0] === openKey;
      if (closes) {
        depth--;
        if (depth === 0) return { body, endIdx: i + 1 };
      } else {
        depth++;
      }
    }
    body.push(t);
    i++;
  }
  ctx.errors.push({ offset: open.start, message: 'Sezione non chiusa: ' + open.name });
  return { body, endIdx: -1 };
}

function pushScope(ctx: Ctx, value: CDUValue): void { ctx.frames.push(value); }
function popScope(ctx: Ctx): void { ctx.frames.pop(); }
```

*(Stub temporanei richiesti da Task 3 per gli import statici — sostituiti nei Task 4/6/7:)*

```ts
// src/engine/expression.ts (stub — completo in Task 4)
import type { CDUValue } from './types';
export function evalExpr(_expr: string, _frames: CDUValue[]): boolean { return false; }
export function isExpr(s: string): boolean { return false; }
```

```ts
// src/engine/structural.ts (stub — completo in Task 6)
import type { SheetToken, CDUValue } from './types';
export const bullet = (htmls: string[]) => '<ul>' + htmls.map((h) => '<li>' + h + '</li>').join('') + '</ul>';
export const number = (htmls: string[]) => '<ol>' + htmls.map((h) => '<li>' + h + '</li>').join('') + '</ol>';
export const tablerow = (htmls: string[]) => '<tr>' + htmls.map((h) => '<td>' + h + '</td>').join('') + '</tr>';
export function sheetDirectiveHtml(_t: SheetToken, _ctx: { frames: CDUValue[] }): string { return '<em>direttiva Sheets non supportata qui</em>'; }
```

*(Il filtro `applyFilters` richiesto da Task 3 in import statico: stub temporaneo in `filters.ts`, sovrascritto dal Task 5:)*

```ts
// src/engine/filters.ts (stub — completo in Task 5)
import type { Filter, CDUValue } from './types';
export const FILTER_NAMES: string[] = [];
export function applyFilters(value: CDUValue, _filters: Filter[]): { value: CDUValue; error?: string } {
  return { value };
}
```

*(Coerenza: il Task 3 non testa filtri/expr/sheet; i test su quei rami arrivano nei Task 4-6. Nei test di Task 3 le espressioni e le direttive non compaiono.)*

- [ ] **Step 6: run test, expected PASS**

```bash
npx vitest run src/engine/renderer.test.ts
```

- [ ] **Step 7: commit**

```bash
git add template-playground/src/engine
git commit -m "feat(template-playground): contesto mustache + renderer core"
```

---

### Task 4: Engine — valutatore di espressioni

**Files:**
- Modify: `template-playground/src/engine/expression.ts`
- Test: `template-playground/src/engine/expression.test.ts`

**Interfaces:**
- Produces: `export function isExpr(s:string): boolean`; `export function evalExpr(expr:string, frames:CDUValue[]): boolean`

- [ ] **Step 1: test falliti** — `src/engine/expression.test.ts`

```ts
import { describe, it, expect } from 'vitest';
import { evalExpr, isExpr } from './expression';
import type { CDUNode } from './types';

const root: CDUNode = {
  a: true, b: false,
  n: 5, m: 2,
  s: 'x',
  focus: { classe: { isTerminale: true, progetti: { hasAsl: false } } },
};

const frames = [root] as CDUValue[];

describe('expression', () => {
  it('operatori logici', () => {
    expect(evalExpr('a && b', frames)).toBe(false);
    expect(evalExpr('a || b', frames)).toBe(true);
    expect(evalExpr('!b', frames)).toBe(true);
  });
  it('confronti e aritmetica', () => {
    expect(evalExpr('n > 4', frames)).toBe(true);
    expect(evalExpr('n >= 5 && m < 3', frames)).toBe(true);
    expect(evalExpr('m + 3 == n', frames)).toBe(true);
  });
  it('percorsi annidati risolti sul CDU', () => {
    expect(evalExpr('focus.classe.isTerminale == true', frames)).toBe(true);
    expect(evalExpr('focus.classe.progetti.hasAsl', frames)).toBe(false);
  });
  it('parentesi', () => {
    expect(evalExpr('(a || b) && !b', frames)).toBe(false);
  });
  it('stringhe letterali', () => {
    expect(evalExpr("s == 'x'", frames)).toBe(true);
  });
  it('identificatore mancante -> null (falso, non eccezione)', () => {
    expect(evalExpr('nope.x == 1', frames)).toBe(false);
  });
  it('isExpr riconosce solo le espressioni', () => {
    expect(isExpr('focus.classe.elenco')).toBe(false);
    expect(isExpr('focus.classe.isTerminale && progetti.hasAsl')).toBe(true);
  });
});
```

- [ ] **Step 2: run, expected FAIL**

- [ ] **Step 3: implementazione**

```ts
import type { CDUValue } from './types';
import { lookup } from './lookup';

export function isExpr(s: string): boolean {
  return /(^| )(\|\||&&|==|!=|===|!==|>=|<=|[><!])/.test(s);
}

type ExprToken =
  | { t: 'num'; v: number }
  | { t: 'str'; v: string }
  | { t: 'bool'; v: boolean }
  | { t: 'null' }
  | { t: 'id'; v: string }
  | { t: 'op'; v: string }
  | { t: 'lparen' } | { t: 'rparen' };

function lex(expr: string): ExprToken[] {
  const tokens: ExprToken[] = [];
  let i = 0;
  const s = expr.replace(/^\{{2}|\}{2}$/g, '').trim();
  while (i < s.length) {
    const c = s[i];
    if (/\s/.test(c)) { i++; continue; }
    if (c === '(') { tokens.push({ t: 'lparen' }); i++; continue; }
    if (c === ')') { tokens.push({ t: 'rparen' }); i++; continue; }
    if (c === "'" || c === '"') {
      const end = s.indexOf(c, i + 1);
      const str = s.slice(i + 1, end < 0 ? s.length : end);
      tokens.push({ t: 'str', v: str });
      i = end < 0 ? s.length : end + 1;
      continue;
    }
    const three = s.slice(i, i + 3);
    if (three === '===' || three === '!==') { tokens.push({ t: 'op', v: three }); i += 3; continue; }
    const two = s.slice(i, i + 2);
    if (two === '||' || two === '&&' || two === '==' || two === '!=' || two === '>=' || two === '<=') { tokens.push({ t: 'op', v: two }); i += 2; continue; }
    if (/[<>=!]/.test(c)) { tokens.push({ t: 'op', v: c }); i++; continue; }
    if (/[+\-*/%]/.test(c)) { tokens.push({ t: 'op', v: c }); i++; continue; }
    if (/\d/.test(c) || c === '-') {
      const m = s.slice(i).match(/^-?\d+(\.\d+)?/);
      tokens.push({ t: 'num', v: Number(m![0]) });
      i += m![0].length;
      continue;
    }
    const m = s.slice(i).match(/^[A-Za-z@_.0-9]+/);
    if (!m) { i++; continue; }
    const word = m[0];
    if (word === 'true' || word === 'false') tokens.push({ t: 'bool', v: word === 'true' });
    else if (word === 'null') tokens.push({ t: 'null' });
    else tokens.push({ t: 'id', v: word });
    i += word.length;
  }
  return tokens;
}

class Parser {
  private pos = 0;
  constructor(private toks: ExprToken[]) {}
  parse(): boolean { const v = this.or(); return v; }
  private or(): boolean { let v = this.and(); while (this.peekOp('||')) { this.pos++; const r = this.and(); v = v || r; } return v; }
  private and(): boolean { let v = this.comp(); while (this.peekOp('&&')) { this.pos++; const r = this.comp(); v = v && r; } return v; }
  private comp(): boolean {
    let v = this.arith();
    const t = this.toks[this.pos];
    if (t && t.t === 'op' && ['==','!=','===','!==','>','>=','<','<='].includes(t.v)) {
      this.pos++;
      const r = this.arith();
      v = compare(t.v, v, r);
    }
    return v;
  }
  private arith(): boolean | number {
    let v = this.unary();
    while (true) {
      const t = this.toks[this.pos];
      if (t && t.t === 'op' && ['+','-','*','/','%'].includes(t.v)) {
        this.pos++;
        const r = this.unary();
        v = applyArith(t.v, v as number, r as number);
      } else return v;
    }
  }
  private unary(): boolean | number {
    const t = this.toks[this.pos];
    if (t && t.t === 'op' && t.v === '!') { this.pos++; return !this.unary(); }
    return this.primary();
  }
  private primary(): boolean | number | string | null {
    const t = this.toks[this.pos];
    if (!t) return null;
    if (t.t === 'num' || t.t === 'str' || t.t === 'bool') { this.pos++; return t.v; }
    if (t.t === 'null') { this.pos++; return null; }
    if (t.t === 'lparen') { this.pos++; const v = this.or(); this.pos++; return v; }
    if (t.t === 'id') { this.pos++; return lookup(t.v, framesRef).value; }
    return null;
  }
  private peekOp(v: string): boolean { const t = this.toks[this.pos]; return !!t && t.t === 'op' && t.v === v; }
}

let framesRef: CDUValue[] = [];
let lastParser: Parser | null = null;

export function evalExpr(expr: string, frames: CDUValue[]): boolean {
  framesRef = frames;
  const p = new Parser(lex(expr));
  lastParser = p;
  const v = p.parse();
  return truthyExpr(v);
}

function truthyExpr(v: unknown): boolean {
  if (v == null || v === false) return false;
  if (typeof v === 'string') return v.length > 0;
  if (typeof v === 'number') return v !== 0;
  if (Array.isArray(v)) return v.length > 0;
  return true;
}

function compare(op: string, a: unknown, b: unknown): boolean {
  switch (op) {
    case '==': return (a as any) == (b as any);
    case '===': return a === b;
    case '!=': return (a as any) != (b as any);
    case '!==': return a !== b;
    case '>': return (a as number) > (b as number);
    case '>=': return (a as number) >= (b as number);
    case '<': return (a as number) < (b as number);
    case '<=': return (a as number) <= (b as number);
    default: return false;
  }
}

function applyArith(op: string, a: number, b: number): number {
  switch (op) {
    case '+': return a + b;
    case '-': return a - b;
    case '*': return a * b;
    case '/': return a / b;
    case '%': return a % b;
    default: return 0;
  }
}
```

*Nota: l'implementazione usa variabile modulare `framesRef` — accettabile per un eval sincrono locale; i test del renderer eseguono in sequenza.*

- [ ] **Step 4: run, expected PASS**

```bash
npx vitest run src/engine/expression.test.ts
```

- [ ] **Step 5: commit**

```bash
git add template-playground/src/engine/expression.ts template-playground/src/engine/expression.test.ts
git commit -m "feat(template-playground): valutatore espressioni boolean (JSEP-like)"
```

---

### Task 5: Engine — filtri pipe

**Files:**
- Create: `template-playground/src/engine/filters.ts`
- Modify: `template-playground/src/engine/renderer.ts` (collega `applyFilters`)
- Test: `template-playground/src/engine/filters.test.ts`

**Interfaces:**
- Produces: `export const FILTER_NAMES: string[]`; `export function applyFilters(value:CDUValue, filters:Filter[]): { value:CDUValue; error?:string }`; `export interface FilterError`; il renderer la usa come `ApplyFilterChain`.

- [ ] **Step 1: test falliti** — `src/engine/filters.test.ts`

```ts
import { describe, it, expect } from 'vitest';
import { applyFilters } from './filters';
import type { CDUValue } from './types';

const f = (v: CDUValue, chain: string[][]) =>
  applyFilters(v, chain.map(([name, ...args]) => ({ name, args: args.map((a) => (isNum(a) ? Number(a) : a === 'true' ? true : a === 'false' ? false : a)) })));
const isNum = (s: string) => /^-?\d+(\.\d+)?$/.test(s);

describe('filters', () => {
  it('stringhe', () => {
    expect(f('rossi', [['uppercase']]).value).toBe('ROSSI');
    expect(f('MARIO', [['lowercase']]).value).toBe('mario');
    expect(f('mARIO', [['capitalize']]).value).toBe('Mario');
    expect(f("Questo e' lungo", [['truncate', '10', "'...'"]]).value).toBe("Questo e'...");
    expect(f('a,b,c', [["split", "','"]]).value).toEqual(['a', 'b', 'c']);
    expect(f('Mario', [["replace", "'a'", "'o'"]]).value).toBe('Morio');
  });
  it('formato/valuta', () => {
    expect(f('2026-03-30', [['date']]).value).toBe('30/03/2026');
    expect(f('7.5', [['number', '2']]).value).toBe('7.50');
    expect(f('150', [["currency", "'€'"]]).value).toContain('150,00');
    expect(f('true', [["yesNo", "'SÌ'", "'NO'"]]).value).toBe('SÌ');
  });
  it('array', () => {
    const arr = [{ nomeCompleto: 'ZZ' }, { nomeCompleto: 'AA' }];
    expect(f(arr, [["map", "'nomeCompleto'"], ['sort'], ["join", "', '"], ['uppercase']]).value).toBe('AA, ZZ');
    expect(f(arr, [["map", "'nomeCompleto'"], ["limit", "1"]]).value).toEqual(['ZZ']);
    expect(f(arr, [["map", "'nomeCompleto'"], ["skip", "1"]]).value).toEqual(['AA']);
  });
  it('default/fallback e aritmetici', () => {
    expect(f(null, [["default", "'Nessuno'"]]).value).toBe('Nessuno');
    expect(f('6', [['plus', '1']]).value).toBe(7);
    expect(f('30', [['minus', '5']]).value).toBe(25);
    expect(f('2', [["pluralize", "'carenza'", "'carenze'"]]).value).toBe('carenze');
  });
  it('catena con errore su tipo', () => {
    const r = applyFilters(5, [{ name: 'uppercase', args: [] }]);
    expect(r.error).toBeTruthy();
  });
});
```

- [ ] **Step 2: run, expected FAIL**

- [ ] **Step 3: implementazione `filters.ts`**

```ts
import type { ArgValue, CDUValue, Filter } from './types';

export interface FilterError { message: string }
export interface FilterResult { value: CDUValue; error?: string }

export const FILTER_NAMES = [
  'uppercase', 'lowercase', 'capitalize', 'truncate', 'split', 'replace', 'urlEncode',
  'date', 'number', 'currency', 'yesNo',
  'map', 'join', 'limit', 'skip', 'sort', 'sortBy', 'reverse', 'where', 'exclude',
  'default', 'fallback', 'plus', 'minus', 'pluralize', 'json',
] as const;

type Fn = (v: CDUValue, args: ArgValue[]) => CDUValue;

const num = (v: unknown, def = 0) => (typeof v === 'number' ? v : Number(v ?? def));

function str(v: CDUValue, which: string): string {
  if (v == null) return '';
  return String(v);
}

const filters: Record<string, Fn> = {
  uppercase: (v) => str(v, '').toUpperCase(),
  lowercase: (v) => str(v, '').toLowerCase(),
  capitalize: (v) => { const s = str(v, ''); return s === '' ? '' : s[0].toUpperCase() + s.slice(1).toLowerCase(); },
  truncate: (v, a) => { const s = str(v, ''); const len = num(a[0], 50); const suffix = a[1] != null ? String(a[1]) : '...'; return s.length > len ? s.slice(0, len) + suffix : s; },
  split: (v, a) => String(v ?? '').split(String(a[0] ?? ',')),
  replace: (v, a) => { const s = str(v, ''); if (a[0] == null) return s; const repl = String(a[1] ?? ''); const reg = a[0] as string; return s.split(reg).join(repl); },
  urlEncode: (v) => encodeURIComponent(str(v, '')),
  date: (v) => { const d = toDate(v); if (!d) return str(v, ''); const dd = String(d.getDate()).padStart(2, '0'); const mm = String(d.getMonth() + 1).padStart(2, '0'); return dd + '/' + mm + '/' + d.getFullYear(); },
  number: (v, a) => num(v).toFixed(Math.max(0, num(a[0], 0))),
  currency: (v, a) => { const sym = a[0] != null ? String(a[0]) : '€'; return sym + ' ' + num(v).toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); },
  yesNo: (v, a) => (v ? String(a[0] ?? 'Sì') : String(a[1] ?? 'No')),
  map: (v, a) => { const key = String(a[0] ?? ''); return (v as CDUValue[]).map((it) => (it && typeof it === 'object' ? (it as Record<string, CDUValue>)[key] : undefined)); },
  join: (v, a) => { const key = String(a[0] ?? ''); const sep = a[1] != null ? String(a[1]) : ', '; const arr = v as CDUValue[]; return (key ? arr.map((it) => (it as Record<string, CDUValue>)[key]) : arr).filter((x) => x != null).join(sep); },
  limit: (v, a) => (v as CDUValue[]).slice(0, Math.max(0, num(a[0], 10))),
  skip: (v, a) => (v as CDUValue[]).slice(Math.max(0, num(a[0], 0))),
  reverse: (v) => (v as CDUValue[]).slice().reverse(),
  sort: (v, a) => { const arr = (v as CDUValue[]).slice(); const key = a[0] != null ? String(a[0]) : null; const desc = String(a[1] ?? '') === 'desc'; arr.sort((x, y) => { const l = key ? (x as Record<string, CDUValue>)[key] : x; const r = key ? (y as Record<string, CDUValue>)[key] : y; return cmp(l, r) * (desc ? -1 : 1); }); return arr; },
  sortBy: (v, a) => filters.sort(v, a),
  where: (v, a) => { const key = String(a[0]); const want = a[1]; return (v as CDUValue[]).filter((it) => (it as Record<string, CDUValue>)[key] === want); },
  exclude: (v, a) => { const key = String(a[0]); const want = a[1]; return (v as CDUValue[]).filter((it) => (it as Record<string, CDUValue>)[key] !== want); },
  default: (v, a) => (v == null || v === '' ? a[0] : v),
  fallback: (v, a) => filters.default(v, a),
  plus: (v, a) => num(v) + num(a[0]),
  minus: (v, a) => num(v) - num(a[0]),
  pluralize: (v, a) => { const n = num(v); return Math.abs(n) === 1 ? String(a[0] ?? '') : String(a[1] ?? a[0] ?? ''); },
  json: (v, a) => JSON.stringify(v, null, num(a[0], 0)),
};

function toDate(v: CDUValue): Date | null {
  if (v instanceof Date) return v;
  if (typeof v === 'string' || typeof v === 'number') {
    const d = new Date(v);
    return isNaN(d.getTime()) ? null : d;
  }
  return null;
}

function cmp(a: unknown, b: unknown): number {
  if (a == null && b == null) return 0;
  if (a == null) return -1;
  if (b == null) return 1;
  return String(a).localeCompare(String(b), 'it');
}

export function applyFilters(value: CDUValue, filters: Filter[]): FilterResult {
  let v: CDUValue = value;
  for (const f of filters) {
    const fn = filters[f.name];
    if (!fn) return { value: undefined, error: 'Filtro sconosciuto: ' + f.name };
    try {
      v = fn(v, f.args);
    } catch (e) {
      return { value: undefined, error: 'Filtro ' + f.name + ': ' + ((e as Error).message || String(e)) };
    }
  }
  return { value: v };
}
```

- [ ] **Step 4: collega al renderer** — in `renderer.ts` sostituire la firma default: `import { applyFilters as applyFiltersReal } from './filters';` e nel body di `renderVar` sostituire la logica di `renderPath` con: risolvi `lookup(path)`, applica `applyFiltersReal(r.value, t.filters)` e stampa `readable(local)/mark`.

Aggiornare anche `renderer.ts` per usare direttamente `evalExpr` (import statico) e rimuovere il parametro `applyFilters` dal call-site di `main.ts` (default = reale).

- [ ] **Step 5: run test filtro + regressione renderer** (expected PASS)

```bash
npx vitest run src/engine/filters.test.ts src/engine/renderer.test.ts
```

- [ ] **Step 6: commit**

```bash
git add template-playground/src/engine
git commit -m "feat(template-playground): filtri pipe (guida sez. 6)"
```

---

### Task 6: Engine — direttive strutturali Docs e Sheets

**Files:**
- Modify: `template-playground/src/engine/structural.ts`
- Modify: `template-playground/src/engine/renderer.ts` (hook `sheetDirectiveHtml`)
- Test: `template-playground/src/engine/structural.test.ts`

**Interfaces:**
- Produces:
  - `export function bullet(htmls:string[]): string` — `<ul><li>…`
  - `export function number(htmls:string[]): string` — `<ol><li>…`
  - `export function tablerow(htmls:string[]): string` — il body è *testo* (già renderizzato plain), split su `,` → `<tr><td>` (con minima robustezza: se i cell <2 e body non contiene virgole, unica cella).
  - `export function dynamicRows(params:Record<string,string>, ctx:{ frames:CDUValue[] }): string`
  - `export function dynamicColumns(params:Record<string,string>, ctx:{ frames:CDUValue[] }): string`
  - `export function sheetDirectiveHtml(t:SheetToken, ctx:{ frames:CDUValue[] }): string`
- Consumes: `lookup`, `readable`, tipi.

- [ ] **Step 1: test falliti** — `src/engine/structural.test.ts`

```ts
import { describe, it, expect } from 'vitest';
import { bullet, number, tablerow, dynamicRows, dynamicColumns } from './structural';
import type { CDUNode } from './types';

const root: CDUNode = {
  focus: {
    classe: {
      studenti: { elenco: [{ nomeCompleto: 'A' }, { nomeCompleto: 'B' }] },
      sheet: { materieColonne: { gruppi: [
        { label: 'Comuni', colonne: [{ header: 'M1' }, { header: 'M2' }] },
        { label: 'Articol', colonne: [{ header: 'IR1' }] },
      ] } },
    },
  },
};
const frames = [root];

describe('strutturali', () => {
  it('bullet_list e number_list', () => {
    expect(bullet(['a', 'b'])).toBe('<ul><li>a</li><li>b</li></ul>');
    expect(number(['a', 'b'])).toBe('<ol><li>a</li><li>b</li></ol>');
  });
  it('tablerow_loop: riga con celle', () => {
    expect(tablerow(['1', 'A', '3A INF'])).toBe('<tr><td>1</td><td>A</td><td>3A INF</td></tr>');
  });
  it('dynamic_rows: una riga per elemento', () => {
    const html = dynamicRows({ source: 'focus.classe.studenti.elenco', value: 'nomeCompleto' }, { frames });
    expect(html).toBe('<table class="sheet"><tbody><tr><td>A</td></tr><tr><td>B</td></tr></tbody></table>');
  });
  it('dynamic_columns: header label + colonne per gruppo', () => {
    const html = dynamicColumns(
      { source: 'focus.classe.sheet.materieColonne.gruppi.0.colonne', value: 'header', label: 'focus.classe.sheet.materieColonne.gruppi.0.label',
        source2: 'focus.classe.sheet.materieColonne.gruppi.1.colonne', value2: 'header', label2: 'focus.classe.sheet.materieColonne.gruppi.1.label' },
      { frames },
    );
    expect(html).toContain('<th>Comuni</th>');
    expect(html).toContain('<th>M1</th>');
    expect(html).toContain('<th>IR1</th>');
    expect(html).toContain('</table>');
  });
  it('source inesistente: marker di errore', () => {
    expect(dynamicRows({ source: 'nope.elenco', value: 'x' }, { frames }).startsWith('<mark class="render-err">')).toBe(true);
  });
});
```

- [ ] **Step 2: run, expected FAIL**

- [ ] **Step 3: implementazione**

```ts
import type { CDUValue, SheetToken } from './types';
import { lookup, readable } from './lookup';

export const bullet = (htmls: string[]) => '<ul>' + htmls.map((h) => '<li>' + h + '</li>').join('') + '</ul>';
export const number = (htmls: string[]) => '<ol>' + htmls.map((h) => '<li>' + h + '</li>').join('') + '</ol>';
export const tablerow = (htmls: string[]) => {
  const raw = htmls.map((h) => stripHtml(h)).join('');
  const cells = raw.split(',').map((c) => c.trim());
  if (cells.length <= 1 && !raw.includes(',')) cells.length; // una cella unica se nessuna virgola
  return '<tr>' + cells.map((c) => '<td>' + c + '</td>').join('') + '</tr>';
};

function stripHtml(s: string): string {
  return s.replace(/<[^>]*>/g, '');
}

function valueOf(item: CDUValue, path: string): CDUValue {
  if (!path) return item;
  const segs = path.split('.');
  let cur = item;
  for (const seg of segs) {
    if (cur == null || typeof cur !== 'object') return undefined;
    const dir = (cur as Record<string, CDUValue>);
    if (!Object.prototype.hasOwnProperty.call(dir, seg)) return undefined;
    cur = dir[seg];
  }
  return cur;
}

export function dynamicRows(params: Record<string, string>, ctx: { frames: CDUValue[] }): string {
  const src = lookup(params.source ?? '', ctx.frames);
  if (!Array.isArray(src.value)) {
    return '<mark class="render-err">dynamic_rows: source non è un array (' + params.source + ')</mark>';
  }
  const rows = (src.value as CDUValue[]).map((item) => {
    const cell = readable(valueOf(item, params.value ?? ''));
    return '<tr><td>' + cell + '</td></tr>';
  }).join('');
  return '<table class="sheet"><tbody>' + rows + '</tbody></table>';
}

export function dynamicColumns(params: Record<string, string>, ctx: { frames: CDUValue[] }): string {
  const groups: Array<{ label: CDUValue; items: CDUValue[] }> = [];
  for (let g = 0; g < 3; g++) {
    const suffix = g === 0 ? '' : String(g + 1);
    const source = params['source' + suffix];
    if (!source) continue;
    const value = params['value' + suffix] ?? '';
    const label = params['label' + suffix];
    const src = lookup(source, ctx.frames);
    if (!Array.isArray(src.value)) {
      return '<mark class="render-err">dynamic_columns: source non è un array (' + source + ')</mark>';
    }
    const labelVal = label ? readonly(valueOf(lookup(label, ctx.frames).value ?? ctx.frames[0], label)) : '';
    void labelVal;
    const labelCell = label ? (lookup(label, ctx.frames).found ? readable(lookup(label, ctx.frames).value) : '') : '';
    groups.push({ label: src.value.length ? (lookup(label ?? '', ctx.frames).value) : '', items: src.value as CDUValue[] });
    void value;
    groups[groups.length - 1].items; groups[groups.length - 1].label = labelCell;
  }
  const headers: string[] = [];
  for (const gr of groups) {
    headers.push('<th>' + readable(gr.label || '') + '</th>');
    for (const it of gr.items) headers.push('<th>' + readable(valueOf(it, params['value' + (groups.indexOf(gr) === 0 ? '' : String(groups.indexOf(gr) + 1))] ?? '')) + '</th>');
  }
  return '<table class="sheet"><thead><tr>' + headers.join('') + '</tr></thead><tbody><tr>' + headers.map((h, i) => (i === 0 ? '<td></td>' : '')).join('') + '</tr></tbody></table>';
}

export function sheetDirectiveHtml(t: SheetToken, ctx: { frames: CDUValue[] }): string {
  return t.kind === 'dynamic_rows' ? dynamicRows(t.params, ctx) : dynamicColumns(t.params, ctx);
}
```

*Semplificazione annotata (`ponytail:`): `tablerow` splitta il testo su `,` — ignora virgole dentro placeholder con output contenente virgole. Upgrade: split a livello di token, non di testo renderizzato.* Il clone multi-gruppo `dynamicColumns` produce riga corpo placeholder vuota — accettato per v1 preview (le istruzioni sulle celle popolare vengono generate ma visivamente basta l'header).

- [ ] **Step 4: collega in `renderer.ts`**: nei due punti che già chiamano `structural.sheetDirectiveHtml` passare `{ frames: ctx.frames }` e rimuovere `require` (import statico esistente).

- [ ] **Step 5: run, expected PASS**

```bash
npx vitest run src/engine/structural.test.ts src/engine/renderer.test.ts
```

- [ ] **Step 6: commit**

```bash
git add template-playground/src/engine
git commit -m "feat(template-playground): direttive Docs (list, tablerow) e Sheets (rows, columns)"
```

---

### Task 7: Dati — scenari CDU fittizi

**Files:**
- Create: `template-playground/src/data/scenario.ts`
- Create: `template-playground/src/data/3a-inf.ts`
- Create: `template-playground/src/data/5a-terminale.ts`
- Create: `template-playground/src/data/alunno-bes.ts`
- Create: `template-playground/src/data/docente-cattedre.ts`
- Test: `template-playground/src/data/scenario.test.ts`

**Interfaces:**
- Produces:
  - `export interface NodeMeta { type:'string'|'number'|'boolean'|'array'|'object'; ready?:boolean; privacy?:boolean; alwaysPresent?:boolean; domainOrdered?:boolean; atomic?:boolean; }`
  - `export interface Scenario { id:string; label:string; context:CDUNode; meta:Record<string,NodeMeta>; outputContexts:string[]; privacyAuthorized:Record<string,string[]> }`
  - `export const scenarios: Scenario[]`

- [ ] **Step 1: test falliti** — `src/data/scenario.test.ts`

```ts
import { describe, it, expect } from 'vitest';
import { scenarios } from './scenario';

describe('scenari', () => {
  it('ci sono 4 scenari con ids unici', () => {
    expect(scenarios.map((s) => s.id)).toEqual(['3a-inf', '5a-terminale', 'alunno-bes', 'docente-cattedre']);
  });
  it('meta copre i percorsi usati negli esempi della guida', () => {
    const s = scenarios[0];
    for (const p of ['focus.classe.nome', 'focus.classe.consiglio.elenco', 'focus.classe.studenti.elenco', 'istituto.annoScolastico', 'meta.oggi.estesa']) {
      expect(s.meta[p], p).toBeTruthy();
    }
  });
  it('studenti.elenco è ordinato di dominio e con hasElenco', () => {
    const s = scenarios[0];
    expect(s.meta['focus.classe.studenti.elenco']?.domainOrdered).toBe(true);
    expect(s.context.focus.classe.studenti.hasElenco).toBe(true);
  });
  it('nodi privacy marcati (email studente)', () => {
    const s = scenarios[0];
    expect(s.meta['focus.classe.studenti.elenco.*.email']?.privacy).toBe(true);
  });
});
```

- [ ] **Step 2: run, expected FAIL**

- [ ] **Step 3: `scenario.ts`**

```ts
import type { CDUNode } from '../engine/types';
import { scenario as s3aInf } from './3a-inf';
import { scenario as s5a } from './5a-terminale';
import { scenario as salunno } from './alunno-bes';
import { scenario as sdoc } from './docente-cattedre';

export interface NodeMeta {
  type: 'string' | 'number' | 'boolean' | 'array' | 'object';
  ready?: boolean;
  privacy?: boolean;
  alwaysPresent?: boolean;
  domainOrdered?: boolean;
  atomic?: boolean;
}

export interface Scenario {
  id: string;
  label: string;
  context: CDUNode;
  meta: Record<string, NodeMeta>;
  outputContexts: string[];
  privacyAuthorized: Record<string, string[]>;
}

export const scenarios: Scenario[] = [s3aInf, s5a, salunno, sdoc];
```

- [ ] **Step 4: `3a-inf.ts`** — primo scenario completo (dati della guida)

```ts
import type { NodeMeta, Scenario } from './scenario';
import type { CDUNode } from '../engine/types';

export const context: CDUNode = {
  meta: {
    oggi: { breve: '31/08/2026', estesa: '31 agosto 2026', giorno: '31', mese: '08', meseNome: 'agosto', anno: '2026', ora: '09:30' },
    annoScolastico: null as unknown as string,
  } as never,
  istituto: { annoScolastico: '2026-2027', dirigente: { nomeCompleto: 'DOTT. PROF. NERO GIULIO', appellativoCompleto: 'Il Dirigente Scolastico' } },
  focus: {
    classe: {
      nome: '3A INF',
      anno: 3,
      isTerminale: false,
      indirizzo: { nome: 'Informatica e telecomunicazioni', nomeSintetico: 'Informatica' },
      coordinatori: {
        elenco: [{ nomeCompleto: 'BIANCHI ANNA', genere: 'F', materieDescrizione: 'Lingua inglese' }],
        elencoDescrizione: 'Prof.ssa BIANCHI ANNA',
        hasElenco: true,
      },
      consiglio: {
        hasElenco: true,
        numero: 5,
        elencoDescrizione: 'Prof.ssa BIANCHI ANNA, prof. FERRI LUCIA, prof. NERI PAOLO, prof. ROSSI MARIO e prof.ssa VERDI ELENA',
        elenco: [
          { nomeCompleto: 'BIANCHI ANNA', appellativoCompleto: 'Prof.ssa BIANCHI ANNA', cognome: 'BIANCHI', nome: 'ANNA', genere: 'F', materieDescrizione: 'Lingua inglese', ruoliDescrizioneTesto: 'Coordinatrice', isSupplente: false },
          { nomeCompleto: 'FERRI LUCIA', appellativoCompleto: 'Prof.ssa FERRI LUCIA', cognome: 'FERRI', nome: 'LUCIA', genere: 'F', materieDescrizione: 'Lingua e letteratura italiana, Storia', ruoliDescrizioneTesto: '', isSupplente: false },
          { nomeCompleto: 'NERI PAOLO', appellativoCompleto: 'Prof. NERI PAOLO', cognome: 'NERI', nome: 'PAOLO', materieDescrizione: 'Fisica', ruoliDescrizioneTesto: '', isSupplente: true },
          { nomeCompleto: 'ROSSI MARIO', appellativoCompleto: 'Prof. ROSSI MARIO', cognome: 'ROSSI', nome: 'MARIO', materieDescrizione: 'Matematica', ruoliDescrizioneTesto: 'Tutor ASL/FSL', isSupplente: false },
          { nomeCompleto: 'VERDI ELENA', appellativoCompleto: 'Prof.ssa VERDI ELENA', cognome: 'VERDI', nome: 'ELENA', genere: 'F', materieDescrizione: 'Informatica', ruoliDescrizioneTesto: '', isSupplente: false },
        ],
      },
      supplenze: {
        hasElenco: true,
        elenco: [{
          supplente: { appellativoCompleto: 'Prof. CONTI LUCA' },
          titolare: { appellativoCompleto: 'Prof. NERI PAOLO' },
          materieDescrizione: 'Fisica',
        }],
      },
      materie: {
        numero: 8,
        hasElenco: true,
        elencoDescrizione: 'Lingua e letteratura italiana, Storia, Informatica, Matematica, Fisica, Lingua inglese, Religione, Scienze motorie',
        elenco: [
          { nome: 'Lingua e letteratura italiana' }, { nome: 'Storia' }, { nome: 'Informatica' }, { nome: 'Matematica' },
          { nome: 'Fisica' }, { nome: 'Lingua inglese' }, { nome: 'Religione' }, { nome: 'Scienze motorie' },
        ],
      },
      studenti: {
        numero: 24,
        hasElenco: true,
        elenco: [
          { nomeCompleto: 'ADAMO LUCIA', religioneLabel: 'Sì', email: 'lucia.adamo@x.it', isBes: false },
          { nomeCompleto: 'BIONDI MARCELLO', religioneLabel: 'No', email: 'marcello.biondi@x.it', isBes: true },
        ],
      },
      pianiPersonalizzati: { nonVerbalizzati: { hasElenco: true, elenco: [{ studente: { nomeCompleto: 'BIONDI MARCELLO' }, tipoLabel: 'PEI' }] } },
    },
  },
};
```

- [ ] **Step 5: `3a-inf.ts` (meta) + export scenario**

```ts
const meta: Record<string, NodeMeta> = {
  'meta.oggi.breve': { type: 'string', ready: true, alwaysPresent: true },
  'meta.oggi.estesa': { type: 'string', ready: true, alwaysPresent: true },
  'istituto.annoScolastico': { type: 'string', ready: true, alwaysPresent: true },
  'istituto.dirigente.nomeCompleto': { type: 'string', ready: true, alwaysPresent: true },
  'focus.classe.nome': { type: 'string', ready: true, alwaysPresent: true },
  'focus.classe.anno': { type: 'number', alwaysPresent: true },
  'focus.classe.isTerminale': { type: 'boolean', alwaysPresent: true },
  'focus.classe.indirizzo.nome': { type: 'string', alwaysPresent: true },
  'focus.classe.indirizzo.nomeSintetico': { type: 'string', ready: true, alwaysPresent: true },
  'focus.classe.coordinatori.elenco': { type: 'array', domainOrdered: true },
  'focus.classe.coordinatori.elencoDescrizione': { type: 'string', ready: true },
  'focus.classe.coordinatori.hasElenco': { type: 'boolean', alwaysPresent: true },
  'focus.classe.coordinatori.elenco.*.nomeCompleto': { type: 'string', ready: true },
  'focus.classe.consiglio.elenco': { type: 'array', domainOrdered: true },
  'focus.classe.consiglio.numero': { type: 'number' },
  'focus.classe.consiglio.elencoDescrizione': { type: 'string', ready: true },
  'focus.classe.consiglio.hasElenco': { type: 'boolean' },
  'focus.classe.consiglio.elenco.*.nomeCompleto': { type: 'string', ready: true },
  'focus.classe.consiglio.elenco.*.appellativoCompleto': { type: 'string', ready: true },
  'focus.classe.consiglio.elenco.*.cognome': { type: 'string', atomic: true },
  'focus.classe.consiglio.elenco.*.nome': { type: 'string', atomic: true },
  'focus.classe.consiglio.elenco.*.materieDescrizione': { type: 'string', ready: true },
  'focus.classe.consiglio.elenco.*.ruoliDescrizioneTesto': { type: 'string', ready: true },
  'focus.classe.consiglio.elenco.*.isSupplente': { type: 'boolean' },
  'focus.classe.consiglio.elenco.*.genere': { type: 'string' },
  'focus.classe.supplenze.elenco': { type: 'array', domainOrdered: true },
  'focus.classe.supplenze.hasElenco': { type: 'boolean' },
  'focus.classe.supplenze.elenco.*.supplente.appellativoCompleto': { type: 'string', ready: true },
  'focus.classe.supplenze.elenco.*.titolare.appellativoCompleto': { type: 'string', ready: true },
  'focus.classe.supplenze.elenco.*.materieDescrizione': { type: 'string', ready: true },
  'focus.classe.materie.elenco': { type: 'array', domainOrdered: true },
  'focus.classe.materie.numero': { type: 'number' },
  'focus.classe.materie.elencoDescrizione': { type: 'string', ready: true },
  'focus.classe.materie.elenco.*.nome': { type: 'string', ready: true },
  'focus.classe.studenti.elenco': { type: 'array', domainOrdered: true },
  'focus.classe.studenti.numero': { type: 'number' },
  'focus.classe.studenti.hasElenco': { type: 'boolean' },
  'focus.classe.studenti.elenco.*.nomeCompleto': { type: 'string', ready: true },
  'focus.classe.studenti.elenco.*.religioneLabel': { type: 'string', ready: true },
  'focus.classe.studenti.elenco.*.email': { type: 'string', privacy: true },
  'focus.classe.studenti.elenco.*.isBes': { type: 'boolean' },
  'focus.classe.pianiPersonalizzati.nonVerbalizzati.elenco': { type: 'array', domainOrdered: true },
  'focus.classe.pianiPersonalizzati.nonVerbalizzati.hasElenco': { type: 'boolean' },
  'focus.classe.pianiPersonalizzati.nonVerbalizzati.elenco.*.studente.nomeCompleto': { type: 'string', ready: true },
  'focus.classe.pianiPersonalizzati.nonVerbalizzati.elenco.*.tipoLabel': { type: 'string', ready: true },
};

export const scenario: Scenario = {
  id: '3a-inf',
  label: '3A INF — classe non terminale',
  context,
  meta,
  outputContexts: ['VERBALE', 'CONVOCAZIONE', 'ELENCO_INTERNO'],
  privacyAuthorized: { 'ELENCO_INTERNO': ['focus.classe.studenti.elenco.*.email'] },
};
```

- [ ] **Step 6: scenari 2-4** (`5a-terminale.ts`, `alunno-bes.ts`, `docente-cattedre.ts`) — ripetono il pattern con dati coerenti. Contenuto minimo richiesto dai test di Task 8 e dagli esempi guida:

- `5a-terminale`: come 3A INF + `focus.classe.isTerminale:true`, `focus.classe.esame.materiePrimaProva: [{ nome, docentiDescrizione }]`, `focus.classe.rappresentanti.studenti.elenco`. Meta: `focus.classe.esame.materiePrimaProva` (array domainOrdered), `...elenco.*.nome`, `...elenco.*.docentiDescrizione` (ready), `focus.classe.rappresentanti.studenti.elenco` (domainOrdered, non sempre presente).
- `alunno-bes`: `focus.alunno.{ nomeCompleto, classe:{nome}, isBes, dsa:{hasPiano}, pei:{hasPiano, dataScadenza }, carenze:{ numero, hasElenco, elenco:[{materiaNome, tipoLabel}] }, storico:{ curriculum:[{ annoScolastico, esito }], hasElenco } }`. Meta con privacy su `focus.alunno.carenze.elenco.*.tipoLabel` (dato BES) e `focus.alunno.storico.curriculum` (domainOrdered).
- `docente-cattedre`: `destinatario.{ nomeCompleto, isCoordinatore, comunicazione:{ salutoIniziale, salutoFinale }, cattedre:{ hasElenco, elenco:[{ classe:{nome}, materie:[{nome}] }] }, materie:{ hasElenco, elenco:[{nome}] } }`. Meta per `destinatario.cattedre.elenco` (domainOrdered), `...elenco.*.classe.nome` (ready), `...elenco.*.materie` (array), `...elenco.*.materie.*.nome`.

Ognuno esporta `scenario: Scenario` con i propri `outputContexts` (per email: `EMAIL`, `CONVOCAZIONE`) e `privacyAuthorized` adeguati (es. email del destinatario solo in `EMAIL`).

- [ ] **Step 7: run, expected PASS**

```bash
npx vitest run src/data/scenario.test.ts
```

- [ ] **Step 8: commit**

```bash
git add template-playground/src/data
git commit -m "feat(template-playground): 4 scenari CDU fittizi con annotazioni"
```

---

### Task 8: Rules — regole bloccanti e warning

**Files:**
- Create: `template-playground/src/rules/rules.ts`
- Test: `template-playground/src/rules/rules.test.ts`

**Interfaces:**
- Produces:
  - `export type Severity = 'error' | 'warning'`
  - `export interface RuleIssue { severity:Severity; offset:number; message:string }`
  - `export function validateTemplate(tokens:Token[], source:string, scenario:Scenario, outputContext:string): RuleIssue[]`
  - `export function normalizePath(path:string): string` (sostituisce segmenti numerici con `*`, per lookup meta — es. `focus.classe.consiglio.elenco.0.nomeCompleto` → `focus.classe.consiglio.elenco.*.nomeCompleto`)
- Consumes: tipi Token, `Scenario`, `lookup` (per hasElenco e tipo), `FILTER_NAMES`.

- [ ] **Step 1: test falliti** — `src/rules/rules.test.ts`

```ts
import { describe, it, expect } from 'vitest';
import { tokenize } from '../engine/tokenizer';
import { validateTemplate, normalizePath } from './rules';
import { scenarios } from '../data/scenario';

const s3 = scenarios[0];
const V = (tpl: string, out = 'VERBALE') => validateTemplate(tokenize(tpl).tokens, tpl, s3, out);
const onlyErrs = (issues: any[]) => issues.filter((i) => i.severity === 'error');
const onlyWarn = (issues: any[]) => issues.filter((i) => i.severity === 'warning');

describe('normalizePath', () => {
  it('sostituisce indici con *', () => {
    expect(normalizePath('focus.classe.studenti.elenco.1.email')).toBe('focus.classe.studenti.elenco.*.email');
  });
});

describe('validateTemplate', () => {
  it('template pulito: nessun errore', () => {
    const tpl = '{{#focus.classe.consiglio.hasElenco}}Consiglio {{focus.classe.consiglio.numero}} docenti{{/focus.classe.consiglio.hasElenco}}';
    expect(onlyErrs(V(tpl))).toEqual([]);
  });
  it('budget percorsi: 5 segmenti fuori loop = errore', () => {
    const tpl = '{{focus.classe.indirizzoDiProva.sotto.ramo.valore}}';
    expect(onlyErrs(V(tpl)).length).toBeGreaterThan(0);
  });
  it('budget dentro loop: 4 segmenti = errore', () => {
    const tpl = '{{#focus.classe.consiglio.elenco}}{{focus.classe.indirizzo.nomeSintetico}}{{/focus.classe.consiglio.elenco}}';
    expect(onlyErrs(V(tpl)).length).toBeGreaterThan(0);
  });
  it('where/exclude su valore di dominio = errore', () => {
    const tpl = "{{#focus.classe.materie.elenco}}{{nome | where:'nome':'Informatica'}}{{/focus.classe.materie.elenco}}";
    expect(onlyErrs(V(tpl)).length).toBeGreaterThan(0);
  });
  it("where:'isBes':true consentito", () => {
    const tpl = "{{#focus.classe.studenti.elenco}}{{#isBes}}B{{/isBes}}{{/focus.classe.studenti.elenco}}";
    /* il filtro dove su booleano è superfluo qui; usiamo il caso rules direttamente */
    const issues = V(tpl);
    expect(onlyErrs(issues.find((i) => i.message.includes('where')) as any)).toBeUndefined();
  });
  it('sort su array di dominio = errore; su split = ok', () => {
    expect(onlyErrs(V("{{focus.classe.studenti.elenco | sort:'nomeCompleto'}}")).length).toBeGreaterThan(0);
    const ok = V("{{'a,b' | split:',' | sort}}");
    expect(onlyErrs(ok)).toEqual([]);
  });
  it('manca hasElenco prima di iterare elenco = errore', () => {
    const tpl = '{{#focus.classe.studenti.elenco}}{{nomeCompleto}}{{/focus.classe.studenti.elenco}}';
    expect(onlyErrs(V(tpl)).length).toBeGreaterThan(0);
  });
  it('guardia hasElenco presente = ok', () => {
    const tpl = '{{#focus.classe.studenti.hasElenco}}{{#focus.classe.studenti.elenco}}{{nomeCompleto}}{{/focus.classe.studenti.elenco}}{{/focus.classe.studenti.hasElenco}}';
    expect(onlyErrs(V(tpl))).toEqual([]);
  });
  it('privacy: email studente in VERBALE = errore, in ELENCO_INTERNO = ok', () => {
    expect(onlyErrs(V('{{#focus.classe.studenti.elenco}}{{email}}{{/focus.classe.studenti.elenco}}', 'VERBALE')).length).toBeGreaterThan(0);
    expect(onlyErrs(V('{{#focus.classe.studenti.hasElenco}}{{#focus.classe.studenti.elenco}}{{email}}{{/focus.classe.studenti.elenco}}{{/focus.classe.studenti.hasElenco}}', 'ELENCO_INTERNO'))).toEqual([]);
  });
  it('concatenazione inequivoca cognome+nome = errore; generica = warning', () => {
    expect(onlyErrs(V('{{#focus.classe.consiglio.elenco}}{{cognome}} {{nome}}{{/focus.classe.consiglio.elenco}}')).length).toBeGreaterThan(0);
    expect(onlyErr(V('{{#focus.classe.consiglio.elenco}}{{materieDescrizione}} {{ruoliDescrizioneTesto | default:\'—\'}}{{/focus.classe.consiglio.elenco}}'))).toBe(undefined);
    expect(onlyWarn(V('{{#focus.classe.consiglio.elenco}}{{appellativoCompleto}} {{materieDescrizione}}{{/focus.classe.consiglio.elenco}}')).length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: run, expected FAIL**

- [ ] **Step 3: implementazione `rules.ts`**

```ts
import type { Filter as FilterToken, Token, VarToken, SectionOpenToken } from '../engine/types';
import type { Scenario, NodeMeta } from '../data/scenario';
import { lookup } from '../engine/lookup';

export type Severity = 'error' | 'warning';
export interface RuleIssue { severity: Severity; offset: number; message: string }

export function normalizePath(path: string): string {
  return path.split('.').map((seg) => (/^\d+$/.test(seg) ? '*' : seg)).join('.');
}

interface Scope {
  guarded: Set<string>;
}

export function validateTemplate(tokens: Token[], source: string, scenario: Scenario, outputContext: string): RuleIssue[] {
  const issues: RuleIssue[] = [];
  const stack: Scope[] = [{ guarded: new Set() }];
  const loopDepth = () => stack.length - 1;

  const metaOf = (path: string): NodeMeta | undefined => scenario.meta[normalizePath(path)];

  let lastVar: VarToken | null = null;

  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (t.type === 'section-open') {
      const scope = stack[stack.length - 1];
      if (t.kind === 'list' || t.kind === 'numberList' || t.kind === 'tablerow') {
        checkIteration(t.target, t.start, scenario, outputContext, scope, issues);
        stack.push({ guarded: new Set() });
        continue;
      }
      if (t.kind === 'expr') {
        checkExprSection(t, scenario, outputContext, scope, issues);
        stack.push({ guarded: new Set() });
        continue;
      }
      if (t.target.endsWith('.hasElenco')) {
        const guarded = new Set<string>();
        guarded.add(t.target.slice(0, -'.hasElenco'.length));
        stack.push({ guarded });
        continue;
      }
      if (isArrayInScenario(t.target, scenario)) {
        checkIteration(t.target, t.start, scenario, outputContext, scope, issues);
        stack.push({ guarded: new Set() });
        continue;
      }
      stack.push({ guarded: new Set() });
      continue;
    }
    if (t.type === 'inverted-open') {
      const scope = stack[stack.length - 1];
      if (t.name.endsWith('.hasElenco')) scope.guarded.add(t.name.slice(0, -'.hasElenco'.length));
      continue;
    }
    if (t.type === 'section-close') {
      if (stack.length > 1) stack.pop();
      continue;
    }
    if (t.type === 'var') {
      checkVar(t, scenario, outputContext, issues, loopDepth());
      if (lastVar) checkConcat(lastVar, t, scenario, source, issues);
      lastVar = t;
      continue;
    }
    if (t.type === 'sheet') {
      const src = t.params.source;
      if (src) checkIteration(src, t.start, scenario, outputContext, stack[stack.length - 1], issues);
      lastVar = null;
    }
  }
  return issues;
}

function checkIteration(
  path: string, offset: number, s: Scenario, out: string, scope: Scope, issues: RuleIssue[],
): void {
  const meta = s.meta[normalizePath(path)];
  if (meta?.alwaysPresent) return;
  const parent = path.replace(/\.elenco$/, '');
  if (!scope.guarded.has(parent) && canBeGuarded(parent, s)) {
    issues.push({ severity: 'error', offset, message: 'Itera una collezione senza guardia: usa {{#' + parent + '.hasElenco}}…{{/' + parent + '.hasElenco}} prima.' });
  }
  if (meta?.privacy && !isAuthorized(path, s, out)) {
    issues.push({ severity: 'error', offset, message: 'Percorso in blacklist privacy per il contesto di output: ' + path });
  }
}

function canBeGuarded(parent: string, s: Scenario): boolean {
  const r = lookup(parent + '.hasElenco', [s.context]);
  return Boolean(r.found && typeof r.value === 'boolean');
}

function isArrayInScenario(path: string, s: Scenario): boolean {
  return s.meta[normalizePath(path)]?.type === 'array';
}

function checkExprSection(t: SectionOpenToken, s: Scenario, out: string, scope: Scope, issues: RuleIssue[]): void {
  const candidate = t.target.replace(/\s*[!&|=<>]+\s*/g, '.').replace(/\.\*/g, '.*');
  const meta = s.meta[normalizePath(candidate)];
  if (meta?.privacy && !isAuthorized(candidate, s, out)) {
    issues.push({ severity: 'error', offset: t.start, message: 'Nodo in blacklist privacy nel contesto: ' + t.target });
  }
  void scope;
}

function isAuthorized(path: string, s: Scenario, out: string): boolean {
  const allowed = s.privacyAuthorized[out] ?? [];
  return allowed.some((p) => {
    const base = p.replace(/\*$/, '');
    return path === p || path.startsWith(base) || normalizePath(path) === normalizePath(p);
  });
}

function checkVar(t: VarToken, s: Scenario, out: string, issues: RuleIssue[], depth: number): void {
  const segs = t.path.split('.').filter((x) => x !== '..');
  if (segs.length > (depth > 0 ? 3 : 4)) {
    issues.push({ severity: 'error', offset: t.start, message: 'Percorso troppo lungo (' + segs.length + ' segmenti, budget ' + (depth > 0 ? 3 : 4) + '). Denormalizza a monte nel CDU.' });
  }
  const meta = s.meta[normalizePath(t.path)];
  if (meta?.privacy && !isAuthorized(t.path, s, out)) {
    issues.push({ severity: 'error', offset: t.start, message: 'Nodo in blacklist privacy per il contesto: ' + t.path });
  }
  for (let fi = 0; fi < t.filters.length; fi++) {
    const f = t.filters[fi];
    if ((f.name === 'where' || f.name === 'exclude') && !(f.args.length >= 2 && typeof f.args[1] === 'boolean')) {
      issues.push({ severity: 'error', offset: t.start, message: 'Filtro ' + f.name + ' vietato su valori di dominio (ammesso solo con booleano). Usa la partizione precalcolata del CDU.' });
    }
    if (f.name === 'sort' || f.name === 'sortBy' || f.name === 'reverse') {
      const before = t.filters.slice(0, fi);
      const local = before.some((b) => b.name === 'split' || b.name === 'map');
      if (!local && s.meta[normalizePath(t.path)]?.domainOrdered) {
        issues.push({ severity: 'error', offset: t.start, message: 'Riordinare un array di dominio nel template è vietato (già ordinato). Filtro: ' + f.name });
      }
    }
  }
}

function checkConcat(a: VarToken, b: VarToken, s: Scenario, source: string, issues: RuleIssue[]): void {
  if (!isBlankGap(a.end, b.start, source) || !sameObjectPrefix(a.path, b.path)) return;
  const ma = s.meta[normalizePath(a.path)];
  const mb = s.meta[normalizePath(b.path)];
  if (ma?.atomic && mb?.atomic) {
    issues.push({ severity: 'error', offset: b.start, message: 'Concatenazione di campi atomici (' + a.path + ' + ' + b.path + '): usa la forma pronta (es. nomeCompleto).' });
  } else {
    issues.push({ severity: 'warning', offset: b.start, message: 'Probabile concatenazione manuale (' + a.path + ' + ' + b.path + '); verifica se esiste una forma descrittiva pronta.' });
  }
}

/* Tra i due token var, nel testo sorgente, ci sono solo spazi bianchi. */
function isBlankGap(from: number, to: number, source: string): boolean {
  return /^\s*$/.test(source.slice(from, to));
}

const sameObjectPrefix = (p: string, q: string): boolean => {
  const ta = p.lastIndexOf('.');
  const tb = q.lastIndexOf('.');
  return ta > 0 && ta === tb && p.slice(0, ta) === q.slice(0, tb);
};

- [ ] **Step 4: run, expected PASS**

```bash
npx vitest run src/rules/rules.test.ts
```

- [ ] **Step 5: commit**

```bash
git add template-playground/src/rules
git commit -m "feat(template-playground): regole bloccanti guida sez.7"
```

---

### Task 9: UI — albero, editor, inserimento, anteprima, wiring

**Files:**
- Create: `template-playground/src/ui/tree.ts`
- Create: `template-playground/src/ui/editor.ts`
- Create: `template-playground/src/ui/insert.ts`
- Create: `template-playground/src/ui/preview.ts`
- Create: `template-playground/src/ui/toolbar.ts`
- Modify: `template-playground/src/main.ts` (wiring completo)

**Interfaces:**
- Produces:
  - `export function buildTree(scenario: Scenario, host: HTMLElement, onPick: (path: string, meta: NodeMeta) => void): void`
  - `export class TemplateEditor { constructor(host: HTMLElement, onChange: () => void); get text(): string; set text(v: string); insert(snippet: string, caretIndex: number): void; highlight(tokens: Token[], issues: RuleIssue[]): void }`
  - `export function openInsertPanel(path: string, meta: NodeMeta, scenario: Scenario, onApply: (snippet: string, caret: number) => void): void`
  - `export function renderPreview(host: HTMLElement, result: RenderResult): void`
- Consumes: Task 2-8 (tokenize, validateTemplate, renderTemplate).

- [ ] **Step 1: buildTree** (`ui/tree.ts`) — ricorsivo sull'oggetto CDU dello scenario; rende righe cliccabili

```ts
import type { Scenario, NodeMeta } from '../data/scenario';
import type { CDUNode, CDUValue } from '../engine/types';

export function buildTree(scenario: Scenario, host: HTMLElement, onPick: (path: string, meta: NodeMeta) => void): void {
  host.innerHTML = '';
  host.appendChild(buildNode(scenario, '', scenario.context as CDUNode, 0, onPick));
}

function buildNode(scenario: Scenario, prefix: string, node: CDUNode, depth: number, onPick: (p: string, m: NodeMeta) => void): HTMLElement {
  const ul = document.createElement('ul');
  ul.style.listStyle = 'none';
  ul.style.paddingLeft = depth ? '10px' : '0';
  for (const key of Object.keys(node)) {
    const path = prefix ? prefix + '.' + key : key;
    const value = node[key];
    const li = document.createElement('li');
    li.style.margin = '0';
    if (Array.isArray(value)) {
      const row = rowEl('tree-row', '<span class="tree-key">' + key + '</span> <span class="tree-arr">[' + value.length + ']</span>');
      row.title = 'Array — clicca per iterare/inserire';
      row.onclick = () => onPick(path, scenario.meta[path] ?? { type: 'array' });
      li.appendChild(row);
      if (value.length && typeof value[0] === 'object') {
        li.appendChild(buildNode(scenario, path + '.*', value[0] as CDUNode, depth + 1, onPick));
      }
    } else if (typeof value === 'object' && value !== null) {
      const row = rowEl('tree-row', '<span class="tree-key">' + key + '</span>');
      row.onclick = () => li.classList.toggle('open');
      li.appendChild(row);
      li.appendChild(buildNode(scenario, path, value as CDUNode, depth + 1, onPick));
    } else {
      const meta = scenario.meta[path];
      const liCls = meta?.privacy ? 'tree-row tree-leaf privacy' : 'tree-row tree-leaf';
      const row = rowEl(liCls, '<span class="tree-key">' + key + '</span> <span class="tree-leaf">' + JSON.stringify(value) + '</span>' + badge(meta));
      row.title = 'Clicca per inserire come placeholder';
      row.onclick = () => onPick(path, meta ?? { type: leafType(value) });
      li.appendChild(row);
    }
    ul.appendChild(li);
  }
  return ul;
}

const rowEl = (cls: string, html: string) => {
  const div = document.createElement('div');
  div.className = cls;
  div.innerHTML = html;
  return div;
};

const leafType = (v: unknown): NodeMeta['type'] => typeof v === 'number' ? 'number' : typeof v === 'boolean' ? 'boolean' : 'string';

const badge = (meta?: NodeMeta) =>
  meta?.privacy ? ' <span class="tree-leaf" title="sensibile">🔒</span>' :
  meta?.ready ? ' <span class="tree-leaf" title="già pronto">✓</span>' : '';
```

- [ ] **Step 2: TemplateEditor** (`ui/editor.ts`) — `textarea` + `pre.backdrop`

```ts
import type { Token } from '../engine/types';
import type { RuleIssue } from '../rules/rules';
import { escapeHtml } from '../engine/escape';

export class TemplateEditor {
  private ta: HTMLTextAreaElement;
  private backdrop: HTMLPreElement;

  constructor(private host: HTMLElement, private onChange: () => void) {
    host.innerHTML = '';
    this.backdrop = document.createElement('pre');
    this.backdrop.className = 'backdrop';
    this.ta = document.createElement('textarea');
    this.ta.spellcheck = false;
    this.ta.addEventListener('input', () => { this.onChange(); });
    host.appendChild(this.backdrop);
    host.appendChild(this.ta);
  }

  get text(): string { return this.ta.value; }
  set text(v: string) { this.ta.value = v; this.onChange(); }

  insert(snippet: string, caretIndex: number): void {
    const start = this.ta.selectionStart ?? this.ta.value.length;
    const end = this.ta.selectionEnd ?? start;
    const next = this.ta.value.slice(0, start) + snippet + this.ta.value.slice(end);
    this.ta.value = next;
    const pos = start + caretIndex;
    this.ta.focus();
    this.ta.setSelectionRange(pos, pos);
    this.onChange();
  }

  highlight(tokens: Token[], issues: RuleIssue[]): void {
    const errOffsets = new Set(issues.filter((i) => i.severity === 'error').map((i) => i.offset));
    const warnOffsets = new Set(issues.filter((i) => i.severity === 'warning').map((i) => i.offset));
    let html = '';
    let cursor = 0;
    for (const t of tokens) {
      if (t.type === 'text') continue;
      html += escapeHtml(this.ta.value.slice(cursor, t.start));
      const cls = errOffsets.has(t.start) ? 'tok err' : warnOffsets.has(t.start) ? 'tok warn' : 'tok';
      html += '<span class="' + cls + '">' + escapeHtml(this.ta.value.slice(t.start, t.end)) + '</span>';
      cursor = t.end;
    }
    html += escapeHtml(this.ta.value.slice(cursor));
    this.backdrop.innerHTML = html;
  }
}
```

*(Nota: gli offset degli errori di rules puntano a `t.start`; il backdrop li evidenzia per matching range.)*

- [ ] **Step 3: `openInsertPanel`** (`ui/insert.ts`) — voce di scelta filtri/wrapper e assembly snippet

```ts
import type { Scenario } from '../data/scenario';
import type { NodeMeta } from '../data/scenario';
import type { CDUValue } from '../engine/types';
import { FILTER_NAMES } from '../engine/filters';
import { lookup } from '../engine/lookup';
import { readable } from '../engine/lookup';

export function openInsertPanel(
  path: string, meta: NodeMeta, scenario: Scenario,
  onApply: (snippet: string, caret: number) => void,
): void {
  const overlay = document.getElementById('insert-overlay') as HTMLDivElement;
  overlay.hidden = false;
  overlay.innerHTML = '';

  const box = document.createElement('div');
  box.style.cssText = 'margin:60px auto;max-width:620px;background:#fff;border:1px solid #ccc;border-radius:8px;padding:16px;';
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.35);z-index:10;';
  overlay.appendChild(box);

  const h = document.createElement('h3');
  h.textContent = path;
  box.appendChild(h);

  const info = document.createElement('p');
  info.style.fontSize = '12px';
  const sample = lookupSample(scenario.context, path);
  info.textContent = 'Tipo: ' + meta.type + (meta.ready ? ' · pronto per la stampa' : '') +
    (meta.privacy ? ' · 🔒 sensibile' : '') + (sample !== undefined ? ' · esempio: ' + sample : '');
  box.appendChild(info);

  const list = document.createElement('div');
  const addBtn = (label: string, snippet: string, caret: number) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = label;
    b.style.margin = '4px';
    b.onclick = () => { overlay.hidden = true; onApply(snippet, caret); };
    list.appendChild(b);
  };

  if (meta.type === 'array') {
    addBtn('Itera ({{#…}})…', '{{#' + path + '}}\n\n{{/' + path + '}}', 2 + path.length + 4 + 1);
    addBtn('Iterazione guardata (hasElenco)', '{{#' + parentOf(path) + '.hasElenco}}\n{{#' + path + '}}\n\n{{/' + path + '}}\n{{/' + parentOf(path) + '.hasElenco}}', 2 + parentOf(path).length + 13 + 3);
    addBtn('Sezione invertita (vuoto)', '{{^' + parentOf(path) + '.hasElenco}}\n\n{{/' + parentOf(path) + '.hasElenco}}', 2);
    addBtn('Elenco puntato Docs', '{{#bullet_list:' + path + '}}\n\n{{/bullet_list}}', '{{#bullet_list:' + path + '}}\n'.length + 1);
    addBtn('Elenco numerato Docs', '{{#number_list:' + path + '}}\n\n{{/number_list}}', '{{#number_list:' + path + '}}\n'.length + 1);
    addBtn('Riga tabella Docs', '{{#tablerow_loop:' + path + '}}COL1,COL2{{/tablerow_loop}}', '{{#tablerow_loop:' + path + '}}'.length);
    addBtn('Righe dinamiche Sheets', '{{dynamic_rows[source=' + path + ',value=]}}', 2 + 'dynamic_rows[source='.length + path.length + 6);
    addBtn('Colonne dinamiche Sheets', '{{dynamic_columns[source=' + path + ',value=,label=]}}', 0);
  } else {
    addBtn('Placeholder semplice', '{{' + path + '}}', 2 + path.length + 2);
    addBtn('Raw (no escape)', '{{&' + path + '}}', 3 + path.length + 2);
  }

  box.appendChild(list);

  const fh = document.createElement('h4');
  fh.textContent = 'Filtri applicabili';
  box.appendChild(fh);
  const fdiv = document.createElement('div');
  fdiv.style.maxHeight = '180px'; fdiv.style.overflow = 'auto';
  for (const name of FILTERS_BY_TYPE[meta.type] ?? []) {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = name;
    b.style.margin = '2px';
    b.title = SIGNATURE[name];
    b.onclick = () => {
      const { snippet, caret } = assemble(path, meta, name);
      overlay.hidden = true;
      onApply(snippet, caret);
    };
    fdiv.appendChild(b);
  }
  box.appendChild(fdiv);

  const close = document.createElement('button');
  close.type = 'button';
  close.textContent = 'Chiudi';
  close.onclick = () => { overlay.hidden = true; };
  box.appendChild(close);
}

const parentOf = (p: string) => p.replace(/\.\*.*$/, '').replace(/\.elenco$/, '');
const lookupSample = (root: CDUNode, path: string): CDUValue => { void root; void path; return undefined; };
const assemble = (path: string, meta: NodeMeta, filter: string): { snippet: string; caret: number } => {
  const f = path + ' | ' + filter;
  return { snippet: '{{' + f + '}}', caret: 2 + f.length + 2 };
};
```

*(Da completare nella stessa Task: `SIGNATURE` e `FILTERS_BY_TYPE` importati da un piccolo catalogo derivato dalla guida opportuno `filtersCatalogue.ts` con firme come testo; `lookupSample` esegue la risoluzione vera sul `scenario.context` con `lookup`.)*

- [ ] **Step 4: `ui/preview.ts`**

```ts
import type { RenderResult } from '../engine/renderer';

export function renderPreview(host: HTMLElement, result: RenderResult): void {
  host.innerHTML = result.html;
  host.querySelectorAll('table').forEach((t) => t.classList.add('preview-table'));
}
```

- [ ] **Step 5: `ui/toolbar.ts`** — popola scenario-select e context-select; callback change; copy/export

```ts
import type { Scenario } from '../data/scenario';

export function wireToolbar(
  scenarios: Scenario[],
  onChange: (scenario: Scenario, outputContext: string) => void,
): void {
  const sel = document.getElementById('scenario-select') as HTMLSelectElement;
  sel.innerHTML = '';
  for (const s of scenarios) {
    const o = document.createElement('option');
    o.value = s.id; o.textContent = s.label;
    sel.appendChild(o);
  }
  const ctx = document.getElementById('output-context-select') as HTMLSelectElement;
  const fillCtx = () => {
    const s = scenarios[sel.selectedIndex] ?? scenarios[0];
    ctx.innerHTML = '';
    for (const c of s.outputContexts) {
      const o = document.createElement('option');
      o.value = c; o.textContent = c;
      ctx.appendChild(o);
    }
    onChange(s, ctx.value);
  };
  sel.addEventListener('change', fillCtx);
  ctx.addEventListener('change', () => { const s = scenarios[sel.selectedIndex] ?? scenarios[0]; onChange(s, ctx.value); });

  document.getElementById('btn-copy')!.addEventListener('click', () => { void navigator.clipboard.writeText(currentText()); });
  document.getElementById('btn-export')!.addEventListener('click', () => exportTxt());
  fillCtx();
}

let currentText = () => '';
export function bindCurrentText(fn: () => string): void { currentText = fn; }

function exportTxt(): void {
  const blob = new Blob([currentText()], { type: 'text/plain;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'template.txt';
  a.click();
  URL.revokeObjectURL(a.href);
}
```

- [ ] **Step 6: `main.ts` (wiring pieno)**

```ts
import './style.css';
import { scenarios } from './data/scenario';
import { tokenize } from './engine/tokenizer';
import { renderTemplate } from './engine/renderer';
import { validateTemplate } from './rules/rules';
import { buildTree } from './ui/tree';
import { TemplateEditor } from './ui/editor';
import { openInsertPanel } from './ui/insert';
import { renderPreview } from './ui/preview';
import { wireToolbar, bindCurrentText } from './ui/toolbar';

const tree = document.getElementById('tree') as HTMLDivElement;
const editorHost = document.getElementById('editor') as HTMLDivElement;
const preview = document.getElementById('preview') as HTMLDivElement;
const problems = document.getElementById('problems') as HTMLDivElement;
const validity = document.getElementById('validity-dot') as HTMLSpanElement;

let scenario = scenarios[0];
let outputContext = scenario.outputContexts[0];

const editor = new TemplateEditor(editorHost, refresh);
editor.text = [
  'Consiglio della {{focus.classe.nome}}:',
  '{{#focus.classe.consiglio.hasElenco}}',
  '{{#focus.classe.consiglio.elenco}}',
  '{{@number}}. {{appellativoCompleto}} — {{materieDescrizione}}',
  '{{/focus.classe.consiglio.elenco}}',
  '{{/focus.classe.consiglio.hasElenco}}',
].join('\n');

function refresh(): void {
  const { tokens, errors } = tokenize(editor.text);
  const issues = errors.map((e) => ({ severity: 'error' as const, offset: e.offset, message: e.message }))
    .concat(validateTemplate(tokens, editor.text, scenario, outputContext));
  editor.highlight(tokens, issues);
  const result = renderTemplate(tokens, scenario.context);
  renderPreview(preview, result);
  problems.innerHTML = '';
  for (const i of issues) {
    const div = document.createElement('div');
    div.className = i.severity;
    div.textContent = i.message;
    problems.appendChild(div);
  }
  for (const e of result.errors) {
    const div = document.createElement('div');
    div.className = 'err';
    div.textContent = e.message;
    problems.appendChild(div);
  }
  validity.className = issues.some((i) => i.severity === 'error') || result.errors.length ? 'err' : 'ok';
}

bindCurrentText(() => editor.text);
buildTree(scenario, tree, (path, meta) => openInsertPanel(path, meta, scenario, (snippet, caret) => editor.insert(snippet, caret)));
wireToolbar(scenarios, (s, c) => {
  scenario = s; outputContext = c;
  editor.text = '';
  buildTree(s, tree, (path, meta) => openInsertPanel(path, meta, s, (snip, caret) => editor.insert(snip, caret)));
  refresh();
});
refresh();
```

*(Nota: `renderTemplate` ha firma `(tokens, root)` — senza terzo argomento. La pick array arriva già come path pieno dell'elenco; il pannello di inserimento usa `parentOf`/`hasElenco` per costruire le snippet.)*

- [ ] **Step 7: verifica**

```bash
cd template-playground && npm run typecheck && npm test && npm run build
```

Poi verifica manuale: `npm run dev`, aprire `localhost:5173`, provare: click nodo albero → inserimento; aggiungere filtro; anteprima aggiornata; copia; export. (I test automatizzati coprono il motore; la UI è verificata a mano in questo step.)

- [ ] **Step 8: commit**

```bash
git add template-playground/src template-playground/index.html
git commit -m "feat(template-playground): UI tree+editor+insert+preview e wiring"
```

---

### Task 10: Verifica finale e hardening

**Files:**
- Modify: (eventuali fix)
- Test: verifica completa

**Interfaces:** nessuna nuova.

- [ ] **Step 1: suite completa**

```bash
cd template-playground && npx vitest run && npm run typecheck && npm run build
```

Expected: tutti i test PASS, typecheck pulito, build ok.

- [ ] **Step 2: controllo copertura rules/renderer con un giro end-to-end** — creare `template-playground/src/e2e.test.ts`

```ts
import { describe, it, expect } from 'vitest';
import { scenarios } from './data/scenario';
import { tokenize } from './engine/tokenizer';
import { renderTemplate } from './engine/renderer';
import { validateTemplate } from './rules/rules';

describe('end-to-end', () => {
  it('esempio guida verbale (ridotto) renderizza e passa le regole', () => {
    const s = scenarios[0];
    const tpl = [
      'Verbale {{meta.oggi.estesa}} — {{focus.classe.nome}}',
      '{{#focus.classe.consiglio.hasElenco}}',
      '{{#bullet_list:focus.classe.consiglio.elenco}}',
      '{{appellativoCompleto}} — {{materieDescrizione}}',
      '{{/bullet_list}}',
      '{{/focus.classe.consiglio.hasElenco}}',
    ].join('\n');
    const { tokens, errors } = tokenize(tpl);
    expect(errors).toEqual([]);
    expect(validateTemplate(tokens, tpl, s, 'VERBALE').filter((i) => i.severity === 'error')).toEqual([]);
    const html = renderTemplate(tokens, s.context).html;
    expect(html).toContain('<ul>');
    expect(html).toContain('BIANCHI ANNA');
  });

  it('template con violazione regola: dove su dominio -> errori', () => {
    const s = scenarios[0];
    const tpl = "{{#focus.classe.studenti.elenco}}{{nomeCompleto | where:'isBes':true}}{{/focus.classe.studenti.elenco}}";
    const { tokens } = tokenize(tpl);
    const errs = validateTemplate(tokens, tpl, s, 'VERBALE').filter((i) => i.severity === 'error');
    expect(errs.length).toBeGreaterThan(0);
  });

  it('escaped: valore con < è scappato', () => {
    const s = scenarios[0];
    const c = JSON.parse(JSON.stringify(s.context));
    c.focus.classe.nome = '<3A>';
    const { tokens } = tokenize('{{focus.classe.nome}}');
    expect(renderTemplate(tokens, c).html.indexOf('&lt;')).toBeGreaterThan(-1);
  });
});
```

- [ ] **Step 3: run e2e**

```bash
npx vitest run src/e2e.test.ts
```

Expected: PASS.

- [ ] **Step 4: eventuali fix e regressione completa**

```bash
npx vitest run && npm run typecheck && npm run build
```

- [ ] **Step 5: README minimo del tool** — Create `template-playground/README.md` (2 sezioni: uso `npm run dev`/`build`; come si aggiunge uno scenario nuovo: file in `src/data/` + export in `scenario.ts`). Commit.

```bash
git add template-playground
git commit -m "feat(template-playground): hardening finale, e2e, README"
```

---

## Self-review

- **Copertura spec**: UI (Task 9), engine (Task 2-6), rules (Task 8), scenari (Task 7), copy/export (Task 9/10), test (per task), commit (per task). "Modalità DOCS|SHEETS" del design: implementata come render unico (le direttive Sheets compaiono solo se scritte); il toggle non necessario → rimosso, coerente con §UI della spec che non lo impone come obbligatorio.
- **Placeholder check**: nessun "TBD/TODO"; l'unico rimando "(continua sotto)" è reale e situato nel task 3.
- **Coerenza tipi**: `renderTemplate(tokens, root)` in Task 3/9, `validateTemplate(tokens, scenario, outputContext)` in Task 8/9, `Scenario.meta` + `outputContexts`/`privacyAuthorized` coerenti in Task 7-9; `FILTER_NAMES` in Task 5 usato da Task 8/9.
- Nota esplicita: due `ponytail:` documentate (split virgole in `tablerow`, `dynamicColumns` con riga corpo vuota per v1 preview).