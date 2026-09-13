// `zotero-axi view <key>` — full metadata + abstract (truncated) + notes.
import { AxiError } from "axi-sdk-js";
import { ensureZotero, getItem, getNotes } from "../zotero.js";
import { renderHelp, renderOutput, block } from "../toon.js";
import { getPositional, hasFlag, rejectUnknownFlags } from "../args.js";
import { authorsOf } from "./schema.js";

export const VIEW_HELP = `usage: zotero-axi view <key> [flags]
Show full details for one library item.

flags:
  --full         Do not truncate the abstract
  --no-launch    Do not auto-start Zotero if it is closed
  --help         Show this message

examples:
  zotero-axi view K4WARNBQ
  zotero-axi view K4WARNBQ --full
`;

const KNOWN = ["--full", "--no-launch"];
const ABSTRACT_LIMIT = 1200;

export async function viewCommand(args: string[]): Promise<string> {
  rejectUnknownFlags(args, KNOWN);
  const key = getPositional(args, new Set(KNOWN));
  if (!key) {
    throw new AxiError("no item key given", "VALIDATION_ERROR", ["zotero-axi view <key>"]);
  }

  await ensureZotero({ launch: !hasFlag(args, "--no-launch") });
  const item = await getItem(key);
  const notes = await getNotes(key);

  const full = hasFlag(args, "--full");
  let abstract = item.abstractNote ?? "";
  let truncated = false;
  if (abstract.length > ABSTRACT_LIMIT && !full) {
    abstract = `${abstract.slice(0, ABSTRACT_LIMIT)} … (truncated, ${item.abstractNote!.length} chars total)`;
    truncated = true;
  }

  const detail: Record<string, unknown> = {
    key: item.key,
    title: item.title ?? "(untitled)",
    type: item.itemType ?? "unknown",
    authors: authorsOf(item),
    date: item.date ?? "n.d.",
  };
  if (item.DOI) detail.doi = item.DOI;
  if (item.url) detail.url = item.url;
  detail.zotero = `zotero://select/library/items/${item.key}`;
  if (abstract) detail.abstract = abstract;
  if (notes.length) detail.notes = notes.length;

  const blocks = [block({ item: detail })];
  if (notes.length) {
    blocks.push(`notes[${notes.length}]:\n${notes.map((n) => `  ${n.replace(/\n+/g, " ")}`).join("\n")}`);
  }
  const hints: string[] = [];
  if (truncated) hints.push(`Run \`zotero-axi view ${key} --full\` for the complete abstract`);
  blocks.push(renderHelp(hints));

  return renderOutput(blocks);
}
