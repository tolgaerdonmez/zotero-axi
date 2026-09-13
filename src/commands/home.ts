// Home view (no-arg): AXI principle 8 — show live content, not help text. The
// SDK prepends the `bin:` / `description:` header; we add library state below.
// Runs at session start via the installed hook, so it must never throw.
import { recentItems, isZoteroUp } from "../zotero.js";
import { renderList, renderHelp, renderOutput, block } from "../toon.js";
import { ITEM_SCHEMA } from "./schema.js";

export const HOME_HELP = "";

export async function homeCommand(): Promise<string> {
  if (!(await isZoteroUp())) {
    return renderOutput([
      block({ library: "offline — Zotero desktop is not running" }),
      renderHelp([
        "Start Zotero (zotero-axi will auto-launch it on the next command)",
        'Run `zotero-axi search "<query>"` once Zotero is running',
      ]),
    ]);
  }

  try {
    const { items, total } = await recentItems(3);
    return renderOutput([
      block({ library: "local (:23119)" }),
      `items: ${total} total`,
      items.length ? renderList("recent", items, ITEM_SCHEMA) : "recent: 0 items",
      renderHelp([
        'Run `zotero-axi search "<query>"` to find papers',
        "Run `zotero-axi add <url|doi|arxiv>` to import a paper",
        "Run `zotero-axi recent` for more recently added items",
      ]),
    ]);
  } catch {
    return renderOutput([
      block({ library: "local (:23119)" }),
      renderHelp([
        'Enable Zotero → Settings → Advanced → "Allow other applications…to communicate with Zotero"',
        'Then run `zotero-axi search "<query>"`',
      ]),
    ]);
  }
}
