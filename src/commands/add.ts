// `zotero-axi add <url|doi|arxiv>` — import a paper into the library.
import { AxiError } from "axi-sdk-js";
import { ensureZotero, addPaper, type AddVia } from "../zotero.js";
import { renderList, renderHelp, renderOutput, field } from "../toon.js";
import { getFlag, getPositional, hasFlag, rejectUnknownFlags } from "../args.js";

export const ADD_HELP = `usage: zotero-axi add <url|doi|arxiv|isbn|pmid> [flags]
Import a paper into your local Zotero library. arXiv also attaches the PDF.

Metadata is extracted by Wikimedia's hosted Zotero translation service (Citoid)
by default — no Docker required. Use --via server for a local translation-server.

flags:
  --via <citoid|server>   Extraction backend (default: citoid)
  --no-launch             Do not auto-start Zotero if it is closed
  --help                  Show this message

examples:
  zotero-axi add https://arxiv.org/abs/2405.05175
  zotero-axi add 10.1145/3576915.3623145
  zotero-axi add https://example.com/paper --via server
`;

const KNOWN = ["--via", "--no-launch"];

export async function addCommand(args: string[]): Promise<string> {
  rejectUnknownFlags(args, KNOWN);
  const input = getPositional(args, new Set(KNOWN));
  if (!input) {
    throw new AxiError("no URL or identifier given", "VALIDATION_ERROR", [
      "zotero-axi add <url|doi|arxiv|isbn|pmid>",
    ]);
  }

  const via = (getFlag(args, "--via") ?? "citoid") as string;
  if (via !== "citoid" && via !== "server") {
    throw new AxiError(`invalid --via value: ${via}`, "VALIDATION_ERROR", ["--via citoid | --via server"]);
  }

  await ensureZotero({ launch: !hasFlag(args, "--no-launch") });
  const result = await addPaper(input, { via: via as AddVia });

  if (result.multiple !== undefined) {
    return renderOutput([
      `added: 0 (${result.multiple} candidate items found, via ${result.via})`,
      renderHelp(["Give a more specific URL or a DOI/arXiv id that resolves to one item"]),
    ]);
  }

  if (result.saved.length === 0) {
    return renderOutput([`added: 0 (via ${result.via})`, renderHelp(["No item could be extracted from that input"])]);
  }

  return renderOutput([
    `added: ${result.saved.length} (via ${result.via})`,
    renderList("saved", result.saved as any[], [field("title"), field("itemType", "type")]),
    renderHelp(["PDFs and attachments (when available) download automatically in Zotero"]),
  ]);
}
