// Shared list schema for library items. AXI principle 2: keep default rows to
// 3–4 fields; richer detail is a `view <key>` away.
import { field, year, custom, type FieldDef } from "../toon.js";
import type { ZoteroItem } from "../zotero.js";

export function authorsOf(item: ZoteroItem): string {
  const creators = item.creators ?? [];
  if (creators.length === 0) return "n.a.";
  const names = creators.map((c) => c.lastName || c.name || "").filter(Boolean);
  if (names.length === 0) return "n.a.";
  if (names.length <= 2) return names.join(", ");
  return `${names[0]} et al.`;
}

export const ITEM_SCHEMA: FieldDef[] = [
  field("key"),
  field("title"),
  year("date"),
  custom("authors", (i) => authorsOf(i as ZoteroItem)),
];
