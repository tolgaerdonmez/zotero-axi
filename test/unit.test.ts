// Pure unit tests — no Zotero, no network. Runs in CI on Linux and macOS.
import { test } from "node:test";
import assert from "node:assert/strict";
import { getFlag, getIntFlag, hasFlag, rejectUnknownFlags, getPositional } from "../src/args.js";
import { renderList, renderHelp, field, year } from "../src/toon.js";
import { authorsOf } from "../src/commands/schema.js";

test("getFlag handles space and equals forms", () => {
  assert.equal(getFlag(["--limit", "20"], "--limit"), "20");
  assert.equal(getFlag(["--limit=30"], "--limit"), "30");
  assert.equal(getFlag(["--other"], "--limit"), undefined);
});

test("hasFlag detects boolean flags", () => {
  assert.equal(hasFlag(["-e", "x"], "-e"), true);
  assert.equal(hasFlag(["--everything"], "--everything"), true);
  assert.equal(hasFlag(["x"], "-e"), false);
});

test("getIntFlag validates positives", () => {
  assert.equal(getIntFlag([], "--limit", 15), 15);
  assert.equal(getIntFlag(["--limit", "5"], "--limit", 15), 5);
  assert.throws(() => getIntFlag(["--limit", "-1"], "--limit", 15), /positive integer/);
});

test("getPositional skips flags and their values", () => {
  const known = new Set(["--limit"]);
  assert.equal(getPositional(["--limit", "5", "K123"], known), "K123");
  assert.equal(getPositional(["K123", "--limit", "5"], known), "K123");
});

test("rejectUnknownFlags throws exit-2 AxiError for unknown flags", () => {
  assert.doesNotThrow(() => rejectUnknownFlags(["--limit", "5"], ["--limit"]));
  assert.throws(
    () => rejectUnknownFlags(["--bogus"], ["--limit"]),
    (err: any) => err.code === "VALIDATION_ERROR",
  );
});

test("renderList produces TOON with a sized header", () => {
  const out = renderList("items", [{ key: "K1", date: "2024-05-01" }], [field("key"), year("date")]);
  assert.match(out, /^items\[1\]\{key,year\}:/);
  assert.match(out, /K1,2024/);
});

test("renderHelp formats a numbered block", () => {
  assert.equal(renderHelp(["a", "b"]), "help[2]:\n  a\n  b");
  assert.equal(renderHelp([]), "");
});

test("authorsOf collapses long creator lists", () => {
  assert.equal(authorsOf({ key: "x", creators: [{ lastName: "Doe" }] }), "Doe");
  assert.equal(
    authorsOf({ key: "x", creators: [{ lastName: "A" }, { lastName: "B" }, { lastName: "C" }] }),
    "A et al.",
  );
  assert.equal(authorsOf({ key: "x", creators: [] }), "n.a.");
});
