---
name: zotero-axi
description: Manage the user's local Zotero reference library from the shell — search papers, read metadata/abstracts/notes, and import new papers by URL/DOI/arXiv. Use whenever the task involves Zotero, references, citations, or the user's paper library.
---

# zotero-axi

`zotero-axi` is an AXI (Agent Experience Interface) CLI wrapping the local Zotero
desktop app. No MCP, no API key. Output is TOON (compact, low-token). If it is
not on PATH, prefix any command with `npx -y zotero-axi`.

## When to use

- The user asks about papers, references, citations, or "my Zotero / my library".
- You need to find what literature is already collected before searching the web.
- The user wants to save a paper you found.

## Commands

- **Search first**, before web searching:
  `zotero-axi search "<query>"` — add `-e` for full text/notes, `--limit <n>` for more.
  Each row has a `key`.
- **Read a paper's** metadata, abstract and notes:
  `zotero-axi view <key>` (add `--full` for the complete abstract).
- **Import a paper** you found worth keeping:
  `zotero-axi add <url|doi|arxiv|isbn>`.
- **Recently added:** `zotero-axi recent [--limit <n>]`.
- **Ambient context:** `zotero-axi setup hooks` installs a session-start hook so
  the library dashboard loads automatically (optional).

## Rules

- Prefer searching the library over re-adding duplicates — search before you add.
- zotero-axi auto-starts Zotero if it is closed; if it reports the local API is
  disabled, tell the user to enable Zotero → Settings → Advanced → "Allow other
  applications on this computer to communicate with Zotero" (one-time).
- When citing an item in notes, include the `zotero://select/...` link `view` prints.
- Exit code 2 = usage error (bad/unknown flag); 1 = runtime error. Read the
  `help:` lines in the output — they suggest the next command.
