// `zotero-axi add <url|doi|arxiv>` — import a paper into the library.
import { AxiError } from "axi-sdk-js";
import { ensureZotero, addByIdentifier } from "../zotero.js";
import { renderList, renderHelp, renderOutput, field } from "../toon.js";
import { getPositional, hasFlag, rejectUnknownFlags } from "../args.js";

export const ADD_HELP = `usage: zotero-axi add <url|doi|arxiv|isbn> [flags]
Import a paper into your local Zotero library. arXiv URLs also attach the PDF.

flags:
  --no-launch    Do not auto-start Zotero if it is closed
  --help         Show this message

examples:
  zotero-axi add https://arxiv.org/abs/2405.05175
  zotero-axi add 10.1145/3576915.3623145
`;

const KNOWN = ["--no-launch"];

export async function addCommand(args: string[]): Promise<string> {
  rejectUnknownFlags(args, KNOWN);
  const input = getPositional(args, new Set(KNOWN));
  if (!input) {
    throw new AxiError("no URL or identifier given", "VALIDATION_ERROR", [
      "zotero-axi add <url|doi|arxiv|isbn>",
    ]);
  }

  await ensureZotero({ launch: !hasFlag(args, "--no-launch") });
  const result = await addByIdentifier(input);

  if (result.multiple !== undefined) {
    return renderOutput([
      `added: 0 (${result.multiple} candidate items found)`,
      renderHelp(["Give a more specific URL or a DOI/arXiv id that resolves to one item"]),
    ]);
  }

  if (result.saved.length === 0) {
    return renderOutput([`added: 0`, renderHelp(["No item could be extracted from that input"])]);
  }

  return renderOutput([
    `added: ${result.saved.length}`,
    renderList("saved", result.saved as any[], [field("title"), field("itemType", "type")]),
    renderHelp(["PDFs and attachments (when available) download automatically in Zotero"]),
  ]);
}
