# Ponytail audit — ALDO config, entrypoints, presentation

Scope: complexity only; no fixes. Audited 12 assigned files / 2,113 LOC: `src/config/{ApplicationComposition,Bootstrap,ServiceContainer,schema,syntheticPrincipals,validationRules}.ts`, `src/entrypoints/{EntryPoints,EntryPoints_Base,EntryPoints_Menu,EntryPoints_User}.ts`, `src/presentation/Menu.ts`, and `src/index.ts`.

Evidence: graph-first review (`aldo-full-coverage` plus GLF graph), scoped call/dead-code traces, test/build references, and relevant `CoreUtilsLib`, `GoogleApiWrapper`, and `JobRunnerLib` contracts. GAS ambient entrypoint split, composition-root wiring, and the typed GLF container wrapper are retained.

1. `yagni:` Delete the 35 baked-in, zero in-repo-caller shortcut globals and their exports; the existing generic menu already launches arbitrary `CONF_DOC`, `CONF_MAIL`, and `CONF_IMP` IDs. Keep the file and declarations for genuine school-specific triggers. [src/entrypoints/EntryPoints_User.ts:22] (~372 LOC)

net: -372 lines, -0 deps possible.
