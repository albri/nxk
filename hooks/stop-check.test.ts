import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { line, logText, run } from "../scripts/testing.ts";
import { lastReply, replyFails, shallowNote, unsuggested } from "./stop-check.ts";

/** A tool call for a test transcript: its name, input and output. */
type TestCall = [name: string, input: Record<string, unknown>, text: string];

const transcript = (calls: TestCall[]) =>
  calls.flatMap(([name, input, text], i) => [
    JSON.stringify({
      type: "assistant",
      message: { content: [{ type: "tool_use", id: `t${i}`, name: `mcp__plugin_nxk_nxk__${name}`, input }] },
    }),
    JSON.stringify({
      type: "user",
      message: { content: [{ type: "tool_result", tool_use_id: `t${i}`, content: [{ type: "text", text }] }] },
    }),
  ]);

test("a session that stopped on one look is told to dig one more round, with the last move a tool named", () => {
  const thin = transcript([
    ["ideas_scan", { label: "x" }, 'Read.\n\nNext: corner_split {"segment":"s1"}. Who inside s1 is keenest.'],
    ["segment_add", {}, "Kept s1"],
  ]);
  assert.match(
    shallowNote(thin) ?? "",
    /^you read a scan and asked nothing after it, .* Dig one more round before you answer: Next: corner_split \{"segment":"s1"\}\. Who inside s1 is keenest\./,
  );
  // A scan still running is waited for; a session with no nxk call, or one that went on digging, is let be.
  assert.equal(shallowNote(thin, true), null);
  assert.equal(shallowNote([]), null);
  assert.equal(
    shallowNote(
      transcript([
        ["ideas_scan", { label: "x" }, "r"],
        ["corner_split", { segment: "s1" }, "split"],
      ]),
    ),
    null,
  );
  assert.match(
    shallowNote(transcript([["people", { action: "count" }, "A: 3"]])) ?? "",
    /^you looked at the people once, .* count the groups the answer turns on side by side/,
  );
});

test("the last message is the reply the owner reads, and it is checked against the folder's log", () => {
  const said = (text: string) => JSON.stringify({ type: "assistant", message: { content: [{ type: "text", text }] } });
  // A reply rewritten after note_check is what the owner reads: the text after the last tool call.
  const lines = [
    ...transcript([["note_check", { reply: "checked draft" }, "Ready to send."]]),
    said("Final reply, part one."),
    said("Part two."),
  ];
  assert.equal(lastReply(lines.join("\n")), "Final reply, part one.\n\nPart two.");
  assert.equal(lastReply(transcript([["people", {}, "x"]]).join("\n")), null);
  const folder = mkdtempSync(join(tmpdir(), "nxk-stop-")),
    log = join(folder, ".nxk", "log.jsonl");
  mkdirSync(join(folder, ".nxk"));
  writeFileSync(
    log,
    logText([
      run("terms", "counted", { type: "keep", text: "These counts are of adults, not of businesses." }),
      run("people", "counted", "  6.4% of adults"),
    ]),
  );
  assert.match(
    replyFails("Landlord retainers: 6.4% of adults (counted).", log).join("\n"),
    /a tool said to keep this line in the reply/,
  );
  assert.match(
    replyFails("These counts are of adults, not of businesses. Landlord retainers: 6.4% of adults.", log).join("\n"),
    /6\.4% with no source/,
  );
  assert.deepEqual(
    replyFails(
      "These counts are of adults, not of businesses. Landlord retainers: 6.4% of adults (counted).\n\ncounted: on 200,000 made-up adults that match official statistics",
      log,
    ),
    [],
  );
  // The payments the last note check was told of (in its verdict) are the ones the reply it ends on is held to.
  const pays = [{ kind: "free_trial", says: "After 14 days it is £6.99 a month" }];
  writeFileSync(log, logText([run("note", null, "Ready to send.", { type: "verdict", ready: true, pays })]));
  assert.match(
    replyFails("Start your 14-day free trial of Plus today.", log).join("\n"),
    /pays: "After 14 days it is £6\.99 a month" is not in what is delivered/,
  );
});

test("terms counted and no suggest after them is a build left unsized", () => {
  const terms = run("terms", "counted", line("1 terms in request.md")),
    suggest = run("suggest", "counted", "rules out 8.4 in every 100");
  assert.equal(unsuggested([terms]), true);
  assert.equal(unsuggested([terms, suggest]), false);
  assert.equal(unsuggested([suggest, terms]), true);
  assert.equal(unsuggested([]), false);
});

// A turn as Claude Code writes it: what the person typed, the session's tool calls (name and input), and its last words.
const turn = (prompt: string, calls: [name: string, input: Record<string, unknown>][], reply: string) => [
  JSON.stringify({ type: "user", message: { role: "user", content: prompt } }),
  ...calls.flatMap(([name, input], i) => [
    JSON.stringify({
      type: "assistant",
      message: { content: [{ type: "tool_use", id: `c${prompt.length}-${i}`, name, input }] },
    }),
    JSON.stringify({
      type: "user",
      message: {
        role: "user",
        content: [{ type: "tool_result", tool_use_id: `c${prompt.length}-${i}`, content: "ok" }],
      },
    }),
  ]),
  JSON.stringify({ type: "assistant", message: { content: [{ type: "text", text: reply }] } }),
];

test("the hook never holds the main session for nxk, holds nxk's agents on their own transcripts, and no other agent", async () => {
  const { execFileSync } = await import("node:child_process");
  const dir = mkdtempSync(join(tmpdir(), "nxk-stop-"));
  const hook = (input: Record<string, string>) =>
    execFileSync("node", [new URL("./stop-check.ts", import.meta.url).pathname], {
      input: JSON.stringify({ cwd: dir, ...input }),
      env: { ...process.env, CLAUDE_PROJECT_DIR: dir },
      encoding: "utf8",
    }).trim();
  const main = join(dir, "main.jsonl");
  writeFileSync(
    main,
    turn("write the launch email", [["Write", { file_path: join(dir, "emails/x.md") }]], "Done.").join("\n"),
  );
  // nxk runs only when the owner asks (/nxk:look, /nxk:research): work done without it is never held for it.
  assert.equal(hook({ hook_event_name: "Stop", transcript_path: main }), "");
  // The second look stopped on one look: held on its own transcript, told to end with its note.
  const own = join(dir, "advisor.jsonl");
  writeFileSync(own, transcript([["people", { action: "count" }, "Counted."]]).join("\n"));
  const advisor = { hook_event_name: "SubagentStop", transcript_path: main, agent_transcript_path: own };
  const dig = JSON.parse(hook({ ...advisor, agent_type: "nxk:second-look" }));
  assert.match(dig.reason, /Dig one more round/);
  assert.match(dig.reason, /end with the whole note or the whole findings, since your last message is what goes back/);
  // The researcher is held the same way; any other agent, the old advisor's name included, is not nxk's.
  assert.match(JSON.parse(hook({ ...advisor, agent_type: "nxk:researcher" })).reason, /Dig one more round/);
  // The panel counts its group once and draws from it: it is not told to dig.
  assert.equal(hook({ ...advisor, agent_type: "nxk:panel" }), "");
  assert.equal(hook({ ...advisor, agent_type: "Explore" }), "");
  assert.equal(hook({ ...advisor, agent_type: "nxk:advisor" }), "");
  // Suggestions an agent counted and no reply has passed note_check since: an agent whose transcript cannot be read is
  // held on the log, the main session never, transcript or not.
  mkdirSync(join(dir, ".nxk"));
  writeFileSync(join(dir, ".nxk", "log.jsonl"), logText([run("suggest", "counted", "rules out 8.4 in every 100")]));
  const unread = join(dir, "gone.jsonl");
  assert.equal(hook({ hook_event_name: "Stop", transcript_path: unread }), "");
  assert.equal(hook({ hook_event_name: "Stop", transcript_path: main }), "");
  const held = hook({ ...advisor, agent_transcript_path: unread, agent_type: "nxk:second-look" });
  assert.match(
    JSON.parse(held).reason,
    /were counted \(suggest\) but the reply to the owner has not passed note_check/,
  );
});
