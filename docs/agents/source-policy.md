# Source policy

`pnpm lint` and the Linux CI job reject every non-exempt code comment and React `useEffect()` call in first-party source. This is a project rule; React still supports effects for synchronization with external systems. Use the existing lifecycle contracts and run the relevant interaction regressions when replacing one.

The checker parses first-party JS, JSX, TS, TSX, Astro, and CSS source in `packages/`, `scripts/`, `apps/docs/`, `design/`, and root source/config files. It reads tracked and non-ignored new files. Strings, regexes, template text, and JSX text are not comments. Standalone Markdown and MDX remain documentation and are outside this rule. Generated bundles under `packages/computer/lib/`, source maps, and minified files are excluded. Locked third-party skills under `.agents/` and their mirrors under `agent/` are outside first-party source.

The necessary exceptions are deliberately narrow:

- Node shebangs at line 1 of `scripts/` files.
- `// @vitest-environment jsdom` at line 1 of a test file.
- The exact `/* @vite-ignore */` in the Pagefind dynamic import. Removing it would change Vite's handling of that runtime URL.
- The exact ISC notices at the start of `packages/client/src/client/hash-icon.tsx` and `packages/client/src/client/inbox-icon.tsx`, each restricted by path, position and content hash; the license requires the notice to accompany the vendored glyph.

In `packages/client/src`, the same checker also rejects whole subscriptions to the desktop Client store (kind `store-subscription`); see [UI state subscriptions](ui-state.md).

Run `node scripts/check-source-policy.mjs` for a focused check. A violation fails with its path, line, column, kind, and token. The checker parses syntax rather than matching text, so a URL, regex, template text, or JSX text containing comment-like characters remains valid. Review the exception list before proposing a new exception.

Docs-site contracts formerly held in code comments are in [Docs site maintenance contracts](docs-site-maintenance.md).

Computer runtime and interaction contracts formerly held in code comments are in [Computer runtime contracts](../architecture/computer-runtime-contracts.md).

In-harness Client lifecycle and interaction contracts formerly held in code comments are in [Client interaction contracts](../architecture/client-interaction-contracts.md).
