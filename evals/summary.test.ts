import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import type { NxkSplit } from "./depth.ts";
import { deliveredFiles, judged, keepFiles, keptFiles, snapshot, type GraderResult } from "./grade.ts";
import type { OwnerRound, OwnerTally } from "./owner.ts";
import type { RunRecord, ScanSpend, ScoredRun } from "./run.ts";
import {
  agreementLines,
  byKind,
  caseLines,
  expectedCost,
  failureLines,
  JUDGE_PER_GRADER,
  kindFigures,
  ownerLines,
  processLines,
  repliesOf,
  seriousMiss,
  SESSION_PER_RUN,
  toolErrors,
  words,
} from "./summary.ts";

const scratch = () => mkdtempSync(join(tmpdir(), "nxk-summary-test-"));
const run = (c: string, score: number, rep?: number, reply = "one two three"): ScoredRun => ({
  case: c,
  score,
  rep,
  reply,
  graders: [],
});

test("a kind's figures: each case weighed once, the range across repeats, and words per reply", () => {
  const runs = [
    run("a", 1, 1),
    run("a", 0.5, 2),
    run("b", 1, 1, "one two three four five"),
    run("b", 1, 2, "one two three four five"),
    run("c", 0, 1),
  ];
  const k = kindFigures(runs);
  assert.equal(k.cases, 3);
  assert.equal(k.mean?.toFixed(3), ((0.75 + 1 + 0) / 3).toFixed(3));
  // Repeat 1: a 1, b 1, c 0; repeat 2: a 0.5, b 1.
  assert.deepEqual([k.low?.toFixed(3), k.high?.toFixed(3)], [(2 / 3).toFixed(3), "0.750"]);
  assert.equal(k.words, 3, "the median of 3, 3, 5, 5 and 3 words");
  assert.equal(words("  a b\nc "), 3);
});

test("the summary prints each kind in order, then every case together; graders shown apart are counted by kind", () => {
  const outputOf = (c: string) => ({ a: "look", b: "research", m: "meet" } as Record<string, string>)[c];
  const lines = byKind(
    [run("a", 1), run("a", 0.5, 2), run("b", 0), run("m", 1), { case: "x", failure: "error" }],
    outputOf,
  );
  assert.match(lines[0], /^KIND\s+CASES\s+SCORE \(range\)\s+SERIOUS \(range\)\s+WORDS$/);
  assert.match(lines[1], /^research\s+1\s+0\.00 \(0\.00-0\.00\)\s+0% \(0-0\)\s+3$/);
  assert.match(lines[2], /^look\s+1\s+0\.75 \(0\.50-1\.00\)\s+0% \(0-0\)/);
  assert.match(lines[3], /^meet\s+1\s+1\.00/);
  assert.match(lines[4], /^all\s+3\s+0\.58 /);
  assert.deepEqual(byKind([], outputOf), [lines[0]]);
  const proc = processLines(
    [
      {
        case: "a",
        graders: [
          { process: true, scored: false, passed: true },
          { process: false, scored: false, passed: false },
          { process: false, scored: true, passed: false },
        ] as GraderResult[],
      },
    ],
    outputOf,
  );
  assert.deepEqual(proc, ["look         1 of 2 passed"]);
});

test("a serious miss: a run that fails a serious grader that is scored, as a share of runs and across repeats", () => {
  const g = (name: string, passed: boolean, extra: Partial<GraderResult> = {}) =>
    ({ name, passed, scored: true, process: false, ...extra }) as GraderResult;
  const runs = [
    { ...run("a", 0.5, 1), graders: [g("trap", false), g("other", true)] },
    { ...run("a", 1, 2), graders: [g("trap", true), g("other", true)] },
    { ...run("b", 0.5, 1), graders: [g("trap", true), g("other", false)] },
    { ...run("b", 1, 2), graders: [g("trap", true), g("unscored", false, { scored: false })] },
  ];
  // "trap" is serious in both cases, "unscored" too, but it is not scored; "other" is not serious.
  const seriousOf = (c: string, name: string) => name === "trap" || name === "unscored";
  assert.equal(seriousMiss(runs[0], seriousOf), true);
  assert.equal(seriousMiss(runs[2], seriousOf), false, "a failed grader that is not serious");
  assert.equal(seriousMiss(runs[3], seriousOf), false, "a serious grader that is not scored");
  assert.deepEqual(kindFigures(runs, seriousOf).serious, { share: 0.25, low: 0, high: 0.5 });
  assert.match(byKind(runs, () => "look", seriousOf)[1], /^look\s+2\s+0\.75 \(0\.50-1\.00\)\s+25% \(0-50\)/);
});

test("the expected cost: each case at its latest paid run, its judging at today's cost unless the run was on the model", () => {
  const dir = scratch();
  mkdirSync(join(dir, "1"));
  mkdirSync(join(dir, "2"));
  writeFileSync(
    join(dir, "1", "results.json"),
    JSON.stringify({ runs: [{ case: "a", score: 1, cost: 1, judgeCost: 0.5 }] }),
  );
  // A later run of a (on the pinned model, so its judging counts as it cost), and a reused run, which is no price.
  writeFileSync(
    join(dir, "2", "results.json"),
    JSON.stringify({
      setup: { sessionModel: "m-1" },
      runs: [
        { case: "a", score: 1, cost: 0.2, judgeCost: 0.9, scans: { usd: 0.1 }, tools: { model: "m-1" } },
        { case: "x", score: 1, cost: 9, reusedFrom: "1" },
      ],
    }),
  );
  const jobs = [
    { case: "a", llm: 3 },
    { case: "b", llm: 3 },
  ];
  const judging = 3 * JUDGE_PER_GRADER;
  // a: session 0.2 + its scans 0.1 + its judging 0.9; b: the median of the sessions (1 and 0.2) + judging, no scans.
  const pinned = expectedCost(jobs, dir, { model: "m-1" });
  assert.equal(pinned.usd.toFixed(3), (0.2 + 0.1 + 0.9 + 0.6 + judging).toFixed(3));
  assert.equal(pinned.scans.toFixed(3), "0.100");
  assert.equal(pinned.guessed, 1);
  assert.deepEqual(
    pinned.byCase.map((x) => x.toFixed(3)),
    [(0.2 + 0.1 + 0.9).toFixed(3), (0.6 + judging).toFixed(3)],
  );
  // On another model, the runs' judging is priced at today's cost.
  const other = expectedCost(jobs, dir, { model: "m-2" });
  assert.equal(other.usd.toFixed(3), (0.2 + 0.1 + 0.6 + 2 * judging).toFixed(3));
  // With no results at all, every case is priced at the measured session.
  assert.equal(
    expectedCost([{ case: "a", llm: 0 }], join(dir, "none"), { model: "m-1" }).usd.toFixed(3),
    SESSION_PER_RUN.toFixed(3),
  );
});

test("the expected cost: a run whose scans the account stopped is no price, and its scans are priced a call", () => {
  const dir = scratch();
  const stopTrace = [
    {
      type: "assistant",
      message: { content: [{ type: "tool_use", id: "t1", name: "mcp__plugin_nxk_nxk__options_scan" }] },
    },
    {
      type: "user",
      message: {
        content: [
          {
            type: "tool_result",
            tool_use_id: "t1",
            is_error: true,
            content: "Spent $0.000 on this spec. Stopped: The decision-model account has no credit left.",
          },
        ],
      },
    },
  ].map((e) => JSON.stringify(e));
  mkdirSync(join(dir, "1", "traces"), { recursive: true });
  writeFileSync(join(dir, "1", "traces", "stopped.jsonl"), stopTrace.join("\n"));
  writeFileSync(
    join(dir, "1", "results.json"),
    JSON.stringify({
      setup: { sessionModel: "claude-opus-5-5" },
      runs: [
        // Two scan calls answered for $0.20; one stopped run that called three; one that scanned nothing.
        { case: "paid", score: 1, cost: 1, scans: { usd: 0.2, answers: 900 }, depth: { scans: 2 } },
        { case: "stopped", score: 1, cost: 0.05, scans: { usd: 0, answers: 0 }, depth: { scans: 3 } },
        { case: "plain", score: 1, cost: 3, scans: { usd: 0, answers: 0 }, depth: { scans: 0 } },
      ],
    }),
  );
  const got = expectedCost(
    [
      { case: "paid", llm: 0 },
      { case: "stopped", llm: 0 },
    ],
    dir,
    { model: "claude-opus-5-5" },
  );
  // paid: 1 + 0.2; stopped: the median session (1 and 3) + 3 calls at 0.1.
  assert.equal(got.scans.toFixed(3), (0.2 + 0.3).toFixed(3));
  assert.equal(got.usd.toFixed(3), (1.2 + 2 + 0.3).toFixed(3));
  assert.equal(got.guessed, 1, "the stopped run is not a price for its session");
});

test("the case table, the run's failures, the replies and the judge agreement", () => {
  const cases = [
    { name: "a", output: "look", prompt: "/nxk:look site/join.html" },
    { name: "b", output: "research", prompt: "/nxk:research Who?" },
    { name: "c", output: "meet", prompt: "/nxk:meet renters" },
  ];
  const nxk = (over: Partial<NxkSplit>): NxkSplit => ({
    main: 0,
    agents: 3,
    secondLook: false,
    research: false,
    panel: false,
    ...over,
  });
  const runs: RunRecord[] = [
    { ...run("a", 1, 1), cost: 0.5, judgeCost: 0.1, nxk: nxk({ secondLook: true }), toolErrors: 2 },
    { ...run("a", 0.5, 2, "one two"), cost: 0.5, nxk: nxk({ main: 1 }) },
    { ...run("b", 1), cost: 1, scans: { usd: 0.25 } as ScanSpend, nxk: nxk({ research: true }) },
    { case: "c", failure: "contamination", error: "the session could not see nxk's nxk:panel" },
    { case: "a", rep: 3, skipped: "spend limit $1.00 reached" },
  ];
  const lines = caseLines(cases, runs);
  assert.match(lines[0], /^CASE\s+KIND\s+SCORE\s+SERIOUS\s+WORDS\s+RAN\s+IN WORK\s+COST$/);
  assert.match(lines[1], /^a\s+look\s+0\.75\s+0 of 2\s+3\s+1 of 2\s+1\s+\$1\.10$/);
  assert.match(lines[2], /^b\s+research\s+1\.00\s+0 of 1\s+3\s+1 of 1\s+0\s+\$1\.25$/);
  assert.match(lines[3], /^c\s+meet\s+-$/);
  const fails = failureLines(runs);
  assert.match(fails[0], /^c contamination: the session could not see nxk's nxk:panel/);
  assert.match(fails[1], /^a \[3\] skipped/);
  assert.match(fails[2], /^3 runs scored · 2 tool errors \(1 runs\) · words per reply: median 3/);
  assert.match(fails.at(-1) ?? "", /^2 to fill in: 0 errors, 0 time-outs, 1 contaminated, 1 skipped, of 5 runs/);
  assert.match(failureLines([run("a", 1)]).at(-1) ?? "", /^0 to fill in/);
  const replies = repliesOf(cases.slice(0, 2), runs);
  assert.match(replies, /^## a\n\n> \/nxk:look site\/join\.html\n\n### Repeat 1 \(1\.00\)\n\none two three/);
  assert.match(replies, /### Repeat 3\n\nspend limit \$1\.00 reached/);
  assert.match(replies, /## b\n\n> \/nxk:research Who\?\n\n### Reply \(1\.00\)/);
  const g = (name: string, passed: boolean, rubricHash = name) =>
    ({
      name,
      type: "llm",
      passed,
      scored: true,
      process: false,
      weight: 1,
      rubricHash,
    }) as GraderResult;
  const agree = agreementLines([
    {
      run: "a",
      saved: [g("x", true), g("y", true)],
      first: [g("x", true), g("y", false)],
      second: [g("x", true), g("y", true)],
    },
  ]);
  assert.match(
    agree[0],
    /^AGREEMENT: 1 of 2 llm verdicts the same both times \(50%\); 3 of 4 the same as the saved verdict \(75%\); 0 of 1 runs/,
  );
  assert.match(agree[1], /a y/);
  const older = agreementLines([
    { run: "b", saved: [g("x", false, "old")], first: [g("x", true)], second: [g("x", true)] },
  ]);
  assert.match(older[0], /0 of 0 the same as the saved verdict/, "a verdict under another rubric is not compared");
  const tr = (id: string, is_error: boolean) =>
    JSON.stringify({ type: "user", message: { content: [{ type: "tool_result", tool_use_id: id, is_error }] } });
  assert.equal(toolErrors([tr("1", true), tr("1", true), tr("2", false), tr("3", true), "not json"]), 2);
});

test("what the simulated owner did, over the scored runs", () => {
  const tally = (over: Partial<OwnerTally>): OwnerTally => ({
    exchanges: 0,
    yes: 0,
    no: 0,
    known: 0,
    unknown: 0,
    fill: 0,
    ungrounded: 0,
    ...over,
  });
  const lines = ownerLines([
    {
      ...run("a", 1),
      owner: [{ asked: true }] as OwnerRound[],
      ownerTally: tally({ exchanges: 1, no: 2, unknown: 1 }),
    },
    { ...run("b", 1), owner: [], ownerTally: tally({}) },
    { case: "c", failure: "error", owner: [{ asked: true }] as OwnerRound[], ownerTally: tally({ yes: 5 }) },
  ]);
  assert.deepEqual(lines, [
    "2 runs  1 put to the owner  1 exchanges  offers 0 yes / 2 no  answers 0 known / 0 theirs to fill in / 1 left to judgement",
  ]);
  assert.deepEqual(ownerLines([run("a", 1)]), []);
});

test("what the session delivered: the files it wrote, by path, without nxk's own records", () => {
  const work = scratch();
  mkdirSync(join(work, "site"));
  writeFileSync(join(work, "site", "join.html"), "<p>Join</p>");
  writeFileSync(join(work, "nxk.json"), "{}");
  writeFileSync(join(work, "reply.md"), "draft");
  const tool = (file_path: string) =>
    JSON.stringify({ message: { content: [{ type: "tool_use", name: "Write", input: { file_path } }] } });
  const lines = [tool(join(work, "site", "join.html")), tool("nxk.json"), tool("reply.md"), tool("/etc/hosts")];
  const files = deliveredFiles(lines, work);
  assert.deepEqual(files, [{ path: "site/join.html", text: "<p>Join</p>" }]);
  assert.equal(
    judged("Built it.", files),
    '<reply>\nBuilt it.\n</reply>\n\n<file path="site/join.html">\n<p>Join</p>\n</file>',
  );
  assert.equal(judged("Built it.", []), "<reply>\nBuilt it.\n</reply>");
  assert.equal(deliveredFiles(lines, join(work, "gone")), null);
  // Given what the seed left, a file written with a shell command is delivered too; nxk's own files never are.
  const before = snapshot(work);
  writeFileSync(join(work, "site", "join.html"), "<p>Join us</p>");
  writeFileSync(join(work, "notes.txt"), "written with cat");
  mkdirSync(join(work, ".nxk"));
  writeFileSync(join(work, ".nxk", "log.jsonl"), "{}");
  writeFileSync(join(work, "terms.json"), "{}");
  assert.deepEqual(
    deliveredFiles([], work, before)?.map((f) => f.path),
    ["notes.txt", "site/join.html"],
  );
  const kept = join(scratch(), "files", "a");
  keepFiles(kept, deliveredFiles([], work, before));
  assert.deepEqual(keptFiles(kept), [
    { path: "notes.txt", text: "written with cat" },
    { path: "site/join.html", text: "<p>Join us</p>" },
  ]);
  assert.equal(keptFiles(join(scratch(), "none")), null);
  // Nothing changed after the seed: nothing delivered.
  assert.deepEqual(deliveredFiles([], work, snapshot(work)), []);
});
