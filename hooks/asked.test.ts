import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import type { TranscriptEntry } from "../scripts/depth.ts";
import { ownerFigures } from "../scripts/note.ts";
import { promptsIn } from "./asked.ts";

const line = (e: TranscriptEntry) => JSON.stringify(e);
const TRANSCRIPT = [
  line({
    type: "user",
    message: { role: "user", content: "Who is it for? A driving theory app in Leicester, £1.50 a week." },
  }),
  line({
    type: "assistant",
    message: {
      role: "assistant",
      content: [{ type: "tool_use", id: "t1", name: "mcp__plugin_nxk_nxk__product", input: {} }],
    },
  }),
  line({
    type: "user",
    message: {
      role: "user",
      content: [{ type: "tool_result", tool_use_id: "t1", content: "£9.99 a month (from a tool)" }],
    },
  }),
  line({ type: "user", isMeta: true, message: { role: "user", content: "<command-name>/clear</command-name> £5" } }),
  line({
    type: "user",
    message: {
      role: "user",
      content: [
        { type: "text", text: "<system-reminder>£7 note</system-reminder>\nAnd the family plan is £4 a week." },
      ],
    },
  }),
].join("\n");

test("the person's own prompts are read from the transcript, without tool results or notes Claude Code adds", () => {
  assert.deepEqual(promptsIn(TRANSCRIPT), [
    "Who is it for? A driving theory app in Leicester, £1.50 a week.",
    "And the family plan is £4 a week.",
  ]);
});

test("before an nxk tool runs, the session's prompts are kept once, so the owner's own figures in them are given", () => {
  const dir = mkdtempSync(join(tmpdir(), "nxk-asked-"));
  mkdirSync(join(dir, ".git"));
  const transcript = join(dir, "t.jsonl");
  writeFileSync(transcript, TRANSCRIPT);
  const hook = () =>
    spawnSync(process.execPath, [new URL("./asked.ts", import.meta.url).pathname], {
      input: JSON.stringify({ cwd: dir, transcript_path: transcript, tool_name: "mcp__plugin_nxk_nxk__product" }),
      encoding: "utf8",
    });
  assert.equal(hook().stdout, "");
  hook();
  const kept = readFileSync(join(dir, ".nxk", "asked.md"), "utf8");
  assert.equal(kept.match(/£1\.50/g)?.length, 1, kept);
  assert.ok(ownerFigures(dir).some((f) => f.value === 1.5 && f.kind === "money"));
  assert.ok(!ownerFigures(dir).some((f) => f.value === 9.99), "a tool's figure is not the owner's");
  // No transcript, nothing kept and nothing printed.
  const empty = mkdtempSync(join(tmpdir(), "nxk-asked-none-"));
  spawnSync(process.execPath, [new URL("./asked.ts", import.meta.url).pathname], {
    input: JSON.stringify({ cwd: empty }),
    encoding: "utf8",
  });
  assert.equal(existsSync(join(empty, ".nxk", "asked.md")), false);
});
