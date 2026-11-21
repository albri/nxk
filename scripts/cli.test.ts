import assert from "node:assert/strict";
import { test } from "node:test";
import { argsOf } from "./cli.ts";

test("a command line: positionals in order, and each flag's text after the first =", () => {
  const { positionals, flags, lists } = argsOf([
    "dir",
    "--who=a=b,c=d",
    "--read",
    "--out=",
    "spec.json",
    "--d=a",
    "--d=b",
  ]);
  assert.deepEqual(positionals, ["dir", "spec.json"]);
  assert.deepEqual({ ...flags }, { who: "a=b,c=d", read: "", out: "", d: "b" });
  assert.deepEqual(lists.d, ["a", "b"]);
  assert.ok("read" in flags && !("plan" in flags));
});

test("text that starts with a dash is a positional, and everything after a bare -- is", () => {
  const { positionals, flags } = argsOf(["--country=uk", "-20% off", "--", "https://example.com", "--50% today"]);
  assert.deepEqual(positionals, ["-20% off", "https://example.com", "--50% today"]);
  assert.deepEqual({ ...flags }, { country: "uk" });
});
