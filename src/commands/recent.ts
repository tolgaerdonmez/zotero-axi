// `zotero-axi recent` — most recently added items.
import { ensureZotero, recentItems } from "../zotero.js";
import { renderList, renderHelp, renderOutput } from "../toon.js";
import { getIntFlag, hasFlag, rejectUnknownFlags } from "../args.js";
import { ITEM_SCHEMA } from "./schema.js";

export const RECENT_HELP = `usage: zotero-axi recent [flags]
List the most recently added items in your library.

flags:
  --limit <n>    Max results (default 10)
  --no-launch    Do not auto-start Zotero if it is closed
  --help         Show this message

examples:
  zotero-axi recent
  zotero-axi recent --limit 25
`;

const KNOWN = ["--limit", "--no-launch"];

export async function recentCommand(args: string[]): Promise<string> {
  rejectUnknownFlags(args, KNOWN);
  const limit = getIntFlag(args, "--limit", 10);
  await ensureZotero({ launch: !hasFlag(args, "--no-launch") });

  const { items, total } = await recentItems(limit);
  if (items.length === 0) {
    return renderOutput(["recent: 0 items", renderHelp(["Run `zotero-axi add <url>` to import a paper"])]);
  }

  return renderOutput([
    `count: ${items.length} of ${total}`,
    renderList("recent", items, ITEM_SCHEMA),
    renderHelp(["Run `zotero-axi view <key>` for abstract + notes"]),
  ]);
}
