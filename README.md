# zotero-axi

**Agent-ergonomic CLI for your local Zotero library.** No MCP, no API key.

`zotero-axi` is an [AXI](https://axi.md) (Agent Experience Interface) tool: a
token-efficient CLI, like `gh-axi` and `lavish-axi`, that any coding agent
(Claude Code, opencode, Gemini CLI, Cursor…) can drive from the shell. It talks
to the Zotero desktop app's built-in local HTTP API and emits compact
[TOON](https://toonformat.dev) output.

```
$ zotero-axi search "prompt injection"
count: 3 of 244
items[3]{key,title,year,authors}:
  K4WARNBQ,"Air Gap: Protecting Privacy-Conscious Agents",2024,"Bagdasaryan et al."
  9FQ2XKUP,"Defeating Prompt Injections by Design",2025,"Debenedetti et al."
  ...
help[1]:
  Run `zotero-axi view <key>` for abstract + notes
```

## Install

Pick one:

```bash
# run directly, no install
npx -y zotero-axi

# install as an Agent Skill for every agent (recommended for collaborators)
npx skills add tolgaerdonmez/zotero-axi

# or globally on PATH
npm i -g zotero-axi
```

Optional ambient context (a library dashboard at every session start):

```bash
zotero-axi setup hooks
```

## Prerequisites (one-time)

1. **Zotero desktop** installed. `zotero-axi` auto-starts it if it's closed
   (macOS `open -a Zotero`; Linux `zotero` on PATH or the `org.zotero.Zotero`
   flatpak). Pass `--no-launch` to disable.
2. **Enable the local API:** Zotero → *Settings* → *Advanced* →
   **"Allow other applications on this computer to communicate with Zotero"**.
3. **Node ≥ 18.**
4. **For `add`:** nothing extra by default — metadata is extracted by
   Wikimedia's hosted Zotero translation service (Citoid). The paper's
   identifier is sent to Wikimedia's public API. Prefer a fully local
   extractor? Run a Zotero `translation-server` (Docker/Podman) and pass
   `zotero-axi add <input> --via server`.

## Commands

| Command | Description |
|---|---|
| `zotero-axi` | Home view: library state + recent items + hints |
| `zotero-axi search "<q>"` | Keyword search. `-e`/`--everything`, `--limit <n>`, `--fields <a,b,c>` |
| `zotero-axi view <key>` | Metadata + abstract (truncated) + notes. `--full` |
| `zotero-axi add <url\|doi\|arxiv\|isbn\|pmid>` | Import a paper (Citoid by default; `--via server` for local translation-server; arXiv PDF attached automatically) |
| `zotero-axi recent [--limit <n>]` | Most recently added items |
| `zotero-axi setup hooks` | Install/repair agent SessionStart hooks |
| `zotero-axi --version` / `--help` | Version / help |

Exit codes: `0` success, `1` runtime error, `2` usage error (bad/unknown flag).

## Ports

- `23119` — Zotero desktop (connector + local read API)
- `1969` — translation-server (only when `add --via server` is used)

## Development

```bash
npm ci
npm run build      # tsc → dist/
npm test           # build + node --test
node dist/bin/zotero-axi.js --help
```

Project layout follows the AXI reference pattern: `bin/` (fast-path entry),
`src/version.ts` (leaf), `src/cli.ts` (command graph), `src/zotero.ts` (local
API client), `src/toon.ts` (output), `src/commands/*`.

## Releasing / npm publish

Publishing is automated via GitHub Actions (`.github/workflows/release.yml`):
it publishes to npm whenever you **publish a GitHub Release**. One-time setup:

1. **npm account + package name.** Log in at npmjs.com. `zotero-axi` must be
   free (or use a scope like `@tolgaerdonmez/zotero-axi` — then set that as
   `name` in `package.json` and keep `publishConfig.access: public`).
2. **Create an npm access token.** npm → *Access Tokens* → *Generate* →
   **Automation** (or a Granular token with publish rights to this package).
3. **Add it as a repo secret.** GitHub repo → *Settings* → *Secrets and
   variables* → *Actions* → *New repository secret* → name it **`NPM_TOKEN`**,
   paste the token.
4. **Release.** Bump `version` in `package.json`, commit, then create a GitHub
   Release with a tag matching the version prefixed by `v` (e.g. `v0.1.0`).
   The workflow verifies the tag matches `package.json`, builds, tests, and runs
   `npm publish --provenance --access public`.

That's it — every new Release publishes automatically. CI
(`.github/workflows/ci.yml`) builds and tests on Linux and macOS across Node
18/20/22 on every push and PR.

## License

MIT © Ahmet Tolga Erdönmez
