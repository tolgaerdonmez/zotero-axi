// Command graph. Loaded lazily by bin/zotero-axi.ts after the fast-path check.
import { encode } from "@toon-format/toon";
import { runAxiCli, AxiError, exitCodeForError } from "axi-sdk-js";
import { VERSION } from "./version.js";
import { homeCommand } from "./commands/home.js";
import { searchCommand, SEARCH_HELP } from "./commands/search.js";
import { viewCommand, VIEW_HELP } from "./commands/view.js";
import { addCommand, ADD_HELP } from "./commands/add.js";
import { recentCommand, RECENT_HELP } from "./commands/recent.js";
import { setupCommand, SETUP_HELP } from "./commands/setup.js";

export const DESCRIPTION =
  "Agent-ergonomic wrapper around your local Zotero library. Prefer this over raw Zotero API calls or MCP.";

export const TOP_HELP = `usage: zotero-axi [command] [args] [flags]
commands[6]:
  (none)=dashboard, search "<query>", view <key>, add <url|doi|arxiv>, recent, setup hooks
flags:
  --no-launch (skip auto-starting Zotero), --help, -v/-V/--version
examples:
  zotero-axi
  zotero-axi search "prompt injection"
  zotero-axi search -e "contextual integrity" --limit 25
  zotero-axi view K4WARNBQ
  zotero-axi add https://arxiv.org/abs/2405.05175
  zotero-axi recent --limit 20
  zotero-axi setup hooks
`;

const COMMAND_HELP: Record<string, string> = {
  search: SEARCH_HELP,
  view: VIEW_HELP,
  add: ADD_HELP,
  recent: RECENT_HELP,
  setup: SETUP_HELP,
};

const COMMANDS = {
  search: (args: string[]) => searchCommand(args),
  view: (args: string[]) => viewCommand(args),
  add: (args: string[]) => addCommand(args),
  recent: (args: string[]) => recentCommand(args),
  setup: (args: string[]) => setupCommand(args),
};

export async function main(options: { argv?: string[] } = {}): Promise<void> {
  await runAxiCli({
    ...(options.argv ? { argv: options.argv } : {}),
    description: DESCRIPTION,
    version: VERSION,
    topLevelHelp: TOP_HELP,
    home: () => homeCommand(),
    commands: COMMANDS,
    getCommandHelp: (command) => COMMAND_HELP[command],
    formatError: (error) => {
      const axiError =
        error instanceof AxiError
          ? error
          : new AxiError(error instanceof Error ? error.message : String(error), "UNKNOWN");
      return {
        output: `${encode({
          error: axiError.message,
          code: axiError.code,
          ...(axiError.suggestions.length > 0 ? { help: axiError.suggestions } : {}),
        })}\n`,
        exitCode: exitCodeForError(axiError),
      };
    },
  });
}
