// Zotero access layer. Talks to the running Zotero desktop app over its
// built-in local HTTP API — no API key, no account, no MCP. `add` additionally
// uses the Zotero translation-server to extract metadata from a URL/DOI/arXiv.
import { spawn, execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { AxiError } from "axi-sdk-js";
import { VERSION } from "./version.js";

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
// Add — metadata extraction + save to the library
//
// Two interchangeable backends, both saving through the Zotero connector:
//   - "citoid" (default): Wikimedia's hosted Zotero translation-server. No
//     Docker, no local service. Resolves URL / DOI / ISBN / PMID; arXiv is
//     routed via its registered DOI (10.48550/arXiv.<id>) for clean `preprint`
//     metadata. The identifier is sent to Wikimedia's public API.
//   - "server": a local Zotero translation-server on :1969 (Docker/Podman), for
//     fully offline/self-hosted extraction.
// ---------------------------------------------------------------------------

export type AddVia = "citoid" | "server";

export interface AddResult {
  saved: Array<{ title: string; itemType: string }>;
  via: AddVia;
  multiple?: number;
}

const CITOID = "https://en.wikipedia.org/api/rest_v1/data/citation/zotero";
const USER_AGENT = `zotero-axi/${VERSION} (https://github.com/tolgaerdonmez/zotero-axi)`;

/** Extract an arXiv id from a URL or bare id, else null. Exported for tests. */
export function arxivId(input: string): string | null {
  if (/arxiv\.org/i.test(input)) {
    const m = input.match(/(\d{4}\.\d{4,5})(v\d+)?/);
    return m ? m[1] : null;
  }
  if (/^\d{4}\.\d{4,5}(v\d+)?$/.test(input)) return input.replace(/v\d+$/, "");
  return null;
}

/** Drop Zotero-library-specific fields Citoid adds so the connector treats the
 * item like fresh translator output. */
function sanitizeItems(items: any[]): any[] {
  return items.map((it) => {
    const { key, version, relations, dateAdded, dateModified, ...rest } = it;
    return rest;
  });
}

function attachArxivPdf(items: any[], id: string | null): void {
  if (!id) return;
  const first = items[0];
  if (!first) return;
  if (!first.attachments || first.attachments.length === 0) {
    first.attachments = [
      { title: "arXiv.org PDF", url: `https://arxiv.org/pdf/${id}.pdf`, mimeType: "application/pdf" },
    ];
  }
}

function summarize(items: any[]): Array<{ title: string; itemType: string }> {
  return items
    .filter((i) => i.itemType !== "attachment" && i.itemType !== "note")
    .map((i) => ({ title: String(i.title ?? "(untitled)"), itemType: String(i.itemType ?? "unknown") }));
}

async function saveToZotero(items: any[], uri: string): Promise<void> {
  const sessionID = randomUUID().replace(/-/g, "").slice(0, 16);
  let res: Response;
  try {
    res = await fetch(`${ZOTERO}/connector/saveItems`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ items, uri, sessionID }),
      signal: AbortSignal.timeout(30000),
    });
  } catch (err) {
    throw new AxiError(`Failed to save to Zotero: ${(err as Error).message}`, "ZOTERO_ERROR");
  }
  if (res.status !== 201 && !res.ok) {
    throw new AxiError(`Zotero refused the save (HTTP ${res.status})`, "ZOTERO_ERROR");
  }
}

// --- Citoid backend (default) ---------------------------------------------

async function addViaCitoid(input: string): Promise<AddResult> {
  const id = arxivId(input);
  const query = id ? `10.48550/arXiv.${id}` : input;
  let res: Response;
  try {
    res = await fetch(`${CITOID}/${encodeURIComponent(query)}`, {
      headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
      signal: AbortSignal.timeout(30000),
    });
  } catch (err) {
    throw new AxiError(`Citoid request failed: ${(err as Error).message}`, "TRANSLATE_FAILED", [
      "Check your connection, or use --via server for a local translator",
    ]);
  }
  if (res.status === 404) {
    throw new AxiError("Citoid could not resolve that URL/identifier", "TRANSLATE_FAILED", [
      "Try a DOI or arXiv id, or --via server for a local translator",
    ]);
  }
  if (!res.ok) {
    throw new AxiError(`Citoid returned HTTP ${res.status}`, "TRANSLATE_FAILED");
  }
  const raw = (await res.json().catch(() => [])) as any[];
  if (!Array.isArray(raw) || raw.length === 0) {
    throw new AxiError("Citoid returned no metadata for that input", "TRANSLATE_FAILED");
  }
  const items = sanitizeItems(raw);
  attachArxivPdf(items, id);
  await saveToZotero(items, input);
  return { via: "citoid", saved: summarize(items) };
}

// --- translation-server backend (Docker/Podman) ---------------------------

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
      execFileSync(cmd, ["run", "-d", "-p", "1969:1969", "--rm", "--name", "translation-server", image], {
        stdio: "ignore",
      });
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
    throw new AxiError("translation-server is not running and Docker/Podman was not found", "NO_TRANSLATOR", [
      "Use the default Citoid backend (drop --via server), or install Docker/Podman",
    ]);
  }
  const start = Date.now();
  while (Date.now() - start < 15000) {
    await sleep(750);
    if (await isTranslationUp()) return;
  }
  throw new AxiError("translation-server did not become ready in time", "NO_TRANSLATOR");
}

async function addViaServer(input: string): Promise<AddResult> {
  await ensureTranslationServer();
  const isUrl = /^https?:\/\//i.test(input);
  let res: Response;
  try {
    res = await fetch(`${TRANSLATION}${isUrl ? "/web" : "/search"}`, {
      method: "POST",
      headers: { "Content-Type": "text/plain" },
      body: input,
      signal: AbortSignal.timeout(30000),
    });
  } catch (err) {
    throw new AxiError(`translation-server request failed: ${(err as Error).message}`, "NO_TRANSLATOR");
  }
  if (res.status === 300) {
    const choices = await res.json().catch(() => ({}));
    const n = choices && typeof choices === "object" ? Object.keys(choices).length : 0;
    return { via: "server", saved: [], multiple: n };
  }
  if (!res.ok) {
    throw new AxiError(`Could not extract metadata (HTTP ${res.status})`, "TRANSLATE_FAILED", [
      "The URL/identifier may not be supported by any translator",
    ]);
  }
  const raw = (await res.json()) as any[];
  if (!Array.isArray(raw) || raw.length === 0) {
    throw new AxiError("Could not extract metadata for that input", "TRANSLATE_FAILED");
  }
  attachArxivPdf(raw, arxivId(input));
  await saveToZotero(raw, input);
  return { via: "server", saved: summarize(raw) };
}

/** Add a paper by URL, DOI, ISBN, PMID or arXiv id. Defaults to the Citoid
 * backend; pass via:"server" for a local translation-server. */
export async function addPaper(input: string, opts: { via?: AddVia } = {}): Promise<AddResult> {
  return opts.via === "server" ? addViaServer(input) : addViaCitoid(input);
}
