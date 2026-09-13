// Minimal argv helpers. Commands receive the raw args array from the SDK and
// parse their own flags. Supports both `--flag value` and `--flag=value`.
import { AxiError } from "axi-sdk-js";

/** True if `--name` is present (as a boolean flag). */
export function hasFlag(args: string[], name: string): boolean {
  return args.includes(name) || args.some((a) => a.startsWith(`${name}=`));
}

/** Value of `--name value` or `--name=value`; undefined if absent. */
export function getFlag(args: string[], name: string): string | undefined {
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === name) return args[i + 1];
    if (a.startsWith(`${name}=`)) return a.slice(name.length + 1);
  }
  return undefined;
}

/** Integer flag with a default and validation. */
export function getIntFlag(args: string[], name: string, fallback: number): number {
  const raw = getFlag(args, name);
  if (raw === undefined) return fallback;
  const n = Number(raw);
  if (!Number.isInteger(n) || n <= 0) {
    throw new AxiError(`${name} must be a positive integer`, "VALIDATION_ERROR", [
      `example: ${name} 20`,
    ]);
  }
  return n;
}

/** First non-flag positional argument (skips flags and their values). */
export function getPositional(args: string[], known: Set<string>): string | undefined {
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a.startsWith("--")) {
      // `--flag value` consumes the next token unless it's `--flag=value`
      if (!a.includes("=") && known.has(a)) i++;
      continue;
    }
    return a;
  }
  return undefined;
}

/** Reject unknown `--flags` before doing any real work (AXI principle 6:
 * usage errors exit 2). `--help` is always allowed and handled by the SDK. */
export function rejectUnknownFlags(args: string[], known: string[]): void {
  const allowed = new Set([...known, "--help"]);
  for (const a of args) {
    if (!a.startsWith("--")) continue;
    const name = a.includes("=") ? a.slice(0, a.indexOf("=")) : a;
    if (!allowed.has(name)) {
      throw new AxiError(`unknown flag ${name}`, "VALIDATION_ERROR", [
        `valid flags: ${known.join(", ")} (--help always allowed)`,
      ]);
    }
  }
}
