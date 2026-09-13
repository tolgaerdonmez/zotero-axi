// `zotero-axi setup hooks` — AXI principle 7: install SessionStart hooks so the
// home view loads as ambient context in Claude Code, Codex and OpenCode.
import { AxiError, installSessionStartHooks } from "axi-sdk-js";
import { renderHelp, renderOutput, block } from "../toon.js";

export const SETUP_HELP = `usage: zotero-axi setup hooks
Install or repair agent SessionStart hooks for zotero-axi ambient context.

examples:
  zotero-axi setup hooks
`;

export async function setupCommand(args: string[]): Promise<string> {
  if (args.length !== 1 || args[0] !== "hooks") {
    throw new AxiError("Unknown setup action", "VALIDATION_ERROR", ["Run `zotero-axi setup hooks`"]);
  }
  installSessionStartHooks();
  return renderOutput([
    block({ hooks: { status: "installed", integrations: "Claude Code, Codex, OpenCode" } }),
    renderHelp(["Restart your agent session to receive zotero-axi ambient context"]),
  ]);
}
