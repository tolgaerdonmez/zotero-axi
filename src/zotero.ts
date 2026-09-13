// Zotero access layer. Talks to the running Zotero desktop app over its
// built-in local HTTP API — no API key, no account, no MCP. `add` additionally
// uses the Zotero translation-server to extract metadata from a URL/DOI/arXiv.
import { spawn, execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { AxiError } from "axi-sdk-js";

export const ZOTERO = "http://127.0.0.1:23119";
export const TRANSLATION = "http://127.0.0.1:1969";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export interface ZoteroItem {
  key: string;
  itemType?: string;
  title?: string;
  date?: string;
  creators?: Array<{ lastName?: string; name?: string; firstName?: string }>;
  abstractNote?: string;
  DOI?: string;
  url?: string;
  [k: string]: unknown;
}

// ---------------------------------------------------------------------------
// Availability + auto-launch
// ---------------------------------------------------------------------------

/** True when the Zotero desktop connector answers (app is running). */
export async function isZoteroUp(): Promise<boolean> {
  try {
    const res = await fetch(`${ZOTERO}/connector/ping`, {
      signal: AbortSignal.timeout(1500),
    });
    return res.ok;
  } catch {
    return false;
  }
}

function commandExists(cmd: string): boolean {
  try {
    execFileSync(process.platform === "win32" ? "where" : "which", [cmd], {
      stdio: "ignore",
    });
    return true;
  } catch {
    return false;
  }
}

/** Best-effort launch of the Zotero desktop app, detached. Returns whether a
 * launch was attempted. */
function launchZotero(): boolean {
  try {
    if (process.platform === "darwin") {
      // -g: don't steal focus, -a: by app name.
      spawn("open", ["-ga", "Zotero"], { detached: true, stdio: "ignore" }).unref();
      return true;
    }
    if (process.platform === "linux") {
      const candidates: Array<[string, string[]]> = [
        ["zotero", []],
        ["flatpak", ["run", "org.zotero.Zotero"]],
      ];
      for (const [cmd, extra] of candidates) {
        if (commandExists(cmd)) {
          spawn(cmd, extra, { detached: true, stdio: "ignore" }).unref();
          return true;
        }
      }
    }
  } catch {
    /* fall through to "not launched" */
  }
  return false;
}

/** Ensure Zotero is running: if it's down and `launch` is set, try to start it
 * and wait until the connector responds. */
export async function ensureZotero(opts: { launch?: boolean; timeoutMs?: number } = {}): Promise<void> {
  const { launch = true, timeoutMs = 20000 } = opts;
  if (await isZoteroUp()) return;

  if (!launch) {
    throw new AxiError("Zotero desktop is not running", "ZOTERO_DOWN", [
      "Start Zotero, or drop --no-launch to let zotero-axi open it",
    ]);
  }

  const attempted = launchZotero();
  if (!attempted) {
    throw new AxiError(
      "Zotero desktop is not running and could not be launched automatically",
      "ZOTERO_DOWN",
      [
        process.platform === "linux"
          ? "Install Zotero on PATH or via flatpak (org.zotero.Zotero), then start it"
          : "Start Zotero manually and retry",
      ],
    );
  }

  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    await sleep(750);
    if (await isZoteroUp()) return;
  }
  throw new AxiError("Launched Zotero but it did not become ready in time", "ZOTERO_TIMEOUT", [
    "Give Zotero a few seconds to finish starting, then retry",
  ]);
}

// ---------------------------------------------------------------------------
// Read API (users/0 = the local library)
// ---------------------------------------------------------------------------

async function apiGet(path: string): Promise<{ items: any; total: number }> {
  let res: Response;
  try {
    res = await fetch(`${ZOTERO}/api/users/0/${path}`, {
      signal: AbortSignal.timeout(15000),
    });
  } catch (err) {
    throw new AxiError(`Could not reach the Zotero local API: ${(err as Error).message}`, "ZOTERO_DOWN", [
      "Is Zotero running?",
    ]);
  }
  if (res.status === 403 || res.status === 404) {
    throw new AxiError("Zotero local API is not enabled", "ZOTERO_API_DISABLED", [
      'Enable Zotero → Settings → Advanced → "Allow other applications on this computer to communicate with Zotero"',
    ]);
  }
  if (!res.ok) {
    throw new AxiError(`Zotero local API returned HTTP ${res.status}`, "ZOTERO_ERROR");
  }
  const total = Number(res.headers.get("Total-Results") ?? "0");
  const items = await res.json();
  return { items, total };
}

export interface SearchResult {
  items: ZoteroItem[];
  total: number;
}

// The local API only honours a single `itemType` negation reliably (multi-term
// `-a -b` / `-a || -b` forms are ignored or tautological), so we strip
// attachments server-side and drop any stray notes/attachments client-side.
const NON_REFERENCE = new Set(["attachment", "note", "annotation"]);
function referencesOnly(rows: any[]): ZoteroItem[] {
  return rows
    .map((i) => i.data as ZoteroItem)
    .filter((d) => !NON_REFERENCE.has(String(d.itemType)));
}

/** Keyword search of the library. `everything` searches full text/notes too. */
export async function searchItems(
  query: string,
  opts: { everything?: boolean; limit?: number } = {},
): Promise<SearchResult> {
  const { everything = false, limit = 15 } = opts;
  // Over-fetch a little so client-side filtering still fills the page.
  const params = new URLSearchParams({
    q: query,
    qmode: everything ? "everything" : "titleCreatorYear",
    itemType: "-attachment",
    limit: String(Math.min(limit * 2, 100)),
    format: "json",
  });
  const { items, total } = await apiGet(`items?${params.toString()}`);
  return { items: referencesOnly(items as any[]).slice(0, limit), total };
}

/** Most recently added top-level items. */
export async function recentItems(limit = 10): Promise<SearchResult> {
  const params = new URLSearchParams({
    sort: "dateAdded",
    direction: "desc",
    itemType: "-attachment",
    limit: String(Math.min(limit * 2, 100)),
    format: "json",
  });
  const { items, total } = await apiGet(`items/top?${params.toString()}`);
  return { items: referencesOnly(items as any[]).slice(0, limit), total };
}

/** Full data for one item by key. */
export async function getItem(key: string): Promise<ZoteroItem> {
  const { items } = await apiGet(`items/${encodeURIComponent(key)}?format=json`);
  if (!items || !(items as any).data) {
    throw new AxiError(`No item with key ${key}`, "NOT_FOUND", [
      'Run `zotero-axi search "<query>"` to find item keys',
    ]);
  }
  return (items as any).data as ZoteroItem;
}

/** Child notes of an item, HTML stripped to plain text. */
export async function getNotes(key: string): Promise<string[]> {
  try {
    const { items } = await apiGet(`items/${encodeURIComponent(key)}/children?format=json`);
    return (items as any[])
      .filter((c) => c.data?.itemType === "note")
      .map((c) => stripHtml(String(c.data.note ?? "")))
      .filter(Boolean);
  } catch {
    return [];
  }
}

function stripHtml(html: string): string {
  return html
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .trim();
}

// ---------------------------------------------------------------------------
// Add (translation-server → connector)
// ---------------------------------------------------------------------------

async function isTranslationUp(): Promise<boolean> {
  try {
    const res = await fetch(TRANSLATION, { signal: AbortSignal.timeout(1500) });
    return res.status < 500;
  } catch {
    return false;
  }
}

function startTranslationServer(): boolean {
  const runtimes: Array<[string, string]> = [
    ["podman", "docker.io/zotero/translation-server"],
    ["docker", "zotero/translation-server"],
  ];
  for (const [cmd, image] of runtimes) {
    if (!commandExists(cmd)) continue;
    try {
      execFileSync(
        cmd,
        ["run", "-d", "-p", "1969:1969", "--rm", "--name", "translation-server", image],
        { stdio: "ignore" },
      );
      return true;
    } catch {
      /* try next runtime */
    }
  }
  return false;
}

async function ensureTranslationServer(): Promise<void> {
  if (await isTranslationUp()) return;
  if (!startTranslationServer()) {
    throw new AxiError("Zotero translation-server is not running and Docker/Podman was not found", "NO_TRANSLATOR", [
      "Install Docker or Podman, or run: docker run -d -p 1969:1969 --rm zotero/translation-server",
    ]);
  }
  const start = Date.now();
  while (Date.now() - start < 15000) {
    await sleep(750);
    if (await isTranslationUp()) return;
  }
  throw new AxiError("translation-server did not become ready in time", "NO_TRANSLATOR");
}

export interface AddResult {
  saved: Array<{ title: string; itemType: string }>;
  multiple?: number;
}

/** Add a paper by URL, DOI, ISBN or arXiv id. Idempotency is left to Zotero's
 * own duplicate handling; this returns what was sent to the library. */
export async function addByIdentifier(input: string): Promise<AddResult> {
  await ensureTranslationServer();

  const isUrl = /^https?:\/\//i.test(input);
  const endpoint = isUrl ? "/web" : "/search";
  let res: Response;
  try {
    res = await fetch(`${TRANSLATION}${endpoint}`, {
      method: "POST",
      headers: { "Content-Type": "text/plain" },
      body: input,
      signal: AbortSignal.timeout(30000),
    });
  } catch (err) {
    throw new AxiError(`translation-server request failed: ${(err as Error).message}`, "NO_TRANSLATOR");
  }

  if (res.status === 300) {
    // Multiple candidate items; we don't auto-pick.
    const choices = await res.json().catch(() => ({}));
    const n = choices && typeof choices === "object" ? Object.keys(choices).length : 0;
    return { saved: [], multiple: n };
  }
  if (!res.ok) {
    throw new AxiError(`Could not extract metadata (HTTP ${res.status})`, "TRANSLATE_FAILED", [
      "The URL/identifier may not be supported by any translator",
    ]);
  }

  let items = (await res.json()) as any[];
  if (!Array.isArray(items) || items.length === 0) {
    throw new AxiError("Could not extract metadata for that input", "TRANSLATE_FAILED");
  }

  // Attach the arXiv PDF when the source is arXiv and none is present.
  const arxiv = input.match(/(\d{4}\.\d{4,5})(v\d+)?/);
  if (/arxiv\.org/i.test(input) && arxiv) {
    const first = items[0];
    if (!first.attachments || first.attachments.length === 0) {
      first.attachments = [
        {
          title: "arXiv.org PDF",
          url: `https://arxiv.org/pdf/${arxiv[1]}.pdf`,
          mimeType: "application/pdf",
        },
      ];
    }
  }

  const sessionID = randomUUID().replace(/-/g, "").slice(0, 16);
  let saveRes: Response;
  try {
    saveRes = await fetch(`${ZOTERO}/connector/saveItems`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ items, uri: input, sessionID }),
      signal: AbortSignal.timeout(30000),
    });
  } catch (err) {
    throw new AxiError(`Failed to save to Zotero: ${(err as Error).message}`, "ZOTERO_ERROR");
  }

  if (saveRes.status !== 201 && !saveRes.ok) {
    throw new AxiError(`Zotero refused the save (HTTP ${saveRes.status})`, "ZOTERO_ERROR");
  }

  return {
    saved: items.map((i) => ({
      title: String(i.title ?? "(untitled)"),
      itemType: String(i.itemType ?? "unknown"),
    })),
  };
}
