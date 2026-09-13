#!/usr/bin/env node
// Entry point. Deliberately tiny: the fast path answers `--version` without
// pulling in the heavy command graph (see AXI principle 13 / fast-path.d.ts).
import { tryFastPath } from "axi-sdk-js/fast-path";
import { VERSION } from "../src/version.js";

if (!tryFastPath(process.argv.slice(2), { version: VERSION })) {
  const { main } = await import("../src/cli.js");
  await main();
}
