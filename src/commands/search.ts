// `zotero-axi search "<query>"` — keyword search of the local library.
import { AxiError } from "axi-sdk-js";
import { ensureZotero, searchItems } from "../zotero.js";
import { renderList, renderHelp, renderOutput } from "../toon.js";
import { getFlag, getIntFlag, hasFlag, rejectUnknownFlags } from "../args.js";
import { ITEM_SCHEMA } from "./schema.js";

export const SEARCH_HELP = `usage: zotero-axi search "<query>" [flags]
Keyword search of your local Zotero library.

flags:
  -e, --everything   Search full text and notes, not just title/creator/year
  --limit <n>        Max results (default 15)
  --fields <a,b,c>   Override the default columns (key,title,year,authors)
  --no-launch        Do not auto-start Zotero if it is closed
  --help             Show this message

examples:
  zotero-axi search "prompt injection"
  zotero-axi search -e "contextual integrity" --limit 25
`;

const KNOWN = ["-e", "--everything", "--limit", "--fields", "--no-launch"];

export async function searchCommand(args: string[]): Promise<string> {
  rejectUnknownFlags(args, KNOWN);

  const flagTokens = new Set(["--limit", "--fields"]);
  const query = args.find((a, i) => {
    if (a.startsWith("-")) return false;
    const prev = args[i - 1];
    return !(prev && flagTokens.has(prev) && !prev.includes("="));
  });

  if (!query) {
    throw new AxiError("no search query given", "VALIDATION_ERROR", [
      'zotero-axi search "<query>"',
    ]);
  }

  const everything = hasFlag(args, "-e") || hasFlag(args, "--everything");
  const limit = getIntFlag(args, "--limit", 15);
  await ensureZotero({ launch: !hasFlag(args, "--no-launch") });

  const { items, total } = await searchItems(query, { everything, limit });

  if (items.length === 0) {
    return renderOutput([
      `count: 0 of ${total} for "${query}"`,
      renderHelp(everything ? [] : ['Try `-e` to search full text and notes']),
    ]);
  }

  const schema = buildSchema(getFlag(args, "--fields"));
  return renderOutput([
    `count: ${items.length} of ${total}`,
    renderList("items", items, schema),
    renderHelp([
      "Run `zotero-axi view <key>` for abstract + notes",
      items.length >= limit ? "Raise --limit for more results" : "",
    ].filter(Boolean)),
  ]);
}

function buildSchema(fields?: string) {
  if (!fields) return ITEM_SCHEMA;
  const wanted = new Set(fields.split(",").map((f) => f.trim()));
  return ITEM_SCHEMA.filter((f) => wanted.has(f.as));
}
