// TOON output helpers — a small, self-contained schema→TOON layer built on
// @toon-format/toon. Modelled on the pattern used by gh-axi so output stays
// consistent across the AXI ecosystem.
import { encode } from "@toon-format/toon";

// deno-lint-ignore-file
type Item = Record<string, any>;

export interface FieldDef {
  type: "field" | "pluck" | "custom" | "year";
  key?: string;
  subkey?: string;
  as: string;
  fn?: (item: Item) => unknown;
}

/** Straight passthrough of `item[key]` (renamed to `as` when given). */
export function field(key: string, as?: string): FieldDef {
  return { type: "field", key, as: as ?? key };
}

/** Pull a nested value `item[key][subkey]`. */
export function pluck(key: string, subkey: string, as: string): FieldDef {
  return { type: "pluck", key, subkey, as };
}

/** Extract a 4-digit year from a Zotero date string (e.g. "2024-05-01" → 2024). */
export function year(key: string, as = "year"): FieldDef {
  return { type: "year", key, as };
}

/** Arbitrary extractor. */
export function custom(as: string, fn: (item: Item) => unknown): FieldDef {
  return { type: "custom", as, fn };
}

export function extract(item: Item, schema: FieldDef[]): Item {
  const out: Item = {};
  for (const def of schema) {
    switch (def.type) {
      case "field":
        out[def.as] = item[def.key!] ?? null;
        break;
      case "pluck":
        out[def.as] = item[def.key!]?.[def.subkey!] ?? null;
        break;
      case "year": {
        const raw = item[def.key!];
        const m = typeof raw === "string" ? raw.match(/\d{4}/) : null;
        out[def.as] = m ? Number(m[0]) : "n.d.";
        break;
      }
      case "custom":
        out[def.as] = def.fn!(item);
        break;
    }
  }
  return out;
}

/** Render a labeled list of items as TOON: `label[n]{fields}:`. */
export function renderList(label: string, items: Item[], schema: FieldDef[]): string {
  return encode({ [label]: items.map((it) => extract(it, schema)) });
}

/** Render a single labeled detail object as TOON. */
export function renderDetail(label: string, item: Item, schema: FieldDef[]): string {
  return encode({ [label]: extract(item, schema) });
}

/** Encode an arbitrary key/value block as TOON. */
export function block(obj: Item): string {
  return encode(obj);
}

/** Render help/next-step suggestions. encode() inlines primitive arrays, so
 * format these lines by hand to get the `help[n]:` shape AXI tools use. */
export function renderHelp(lines: string[]): string {
  if (lines.length === 0) return "";
  return `help[${lines.length}]:\n${lines.map((l) => `  ${l}`).join("\n")}`;
}

/** Combine TOON blocks into one output string, dropping empties. */
export function renderOutput(blocks: string[]): string {
  return blocks.filter(Boolean).join("\n");
}
