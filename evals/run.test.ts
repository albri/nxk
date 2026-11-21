import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { commandOf, NXK_AGENTS, readCase, scoreOf, selectCases, SESSION, WAYS_IN, type Kind } from "./cases.ts";
import { handedOf, nxkLine, nxkSplit, repeats, runName, table, traceFile, type Depth } from "./depth.ts";
import { blind, grade, judge, JUDGE_ASK, JUDGE_INTRO, judged, type Delivered, type Graded } from "./grade.ts";
import { headOf, jobsOf, keptOf, messagesOf, scanSpend, turnText, type RunRecord } from "./run.ts";
import {
  contamination,
  envFor,
  eventsOf,
  keyFolder,
  plainOf,
  QUIET,
  setupOf,
  unlike,
  type Compared,
  type InitEvent,
  type SetupDecision,
} from "./setup.ts";
import { KINDS } from "./summary.ts";

const HERE = dirname(fileURLToPath(import.meta.url));

const scratch = () => mkdtempSync(join(tmpdir(), "nxk-run-test-"));
// Transcript lines as Claude Code keeps them: a message, a text block, a hand-off to a subagent, a tool's result.
const say = (type: string, content: string | object[], more: Record<string, unknown> = {}) =>
  JSON.stringify({ type, message: { role: type, content }, ...more });
const said = (text: string, more?: Record<string, unknown>) => say("assistant", [{ type: "text", text }], more);
const handOff = (agent: string) =>
  say("assistant", [{ type: "tool_use", id: `t-${agent}`, name: "Agent", input: { subagent_type: agent } }]);
const result = (id: string, text: string) => say("user", [{ type: "tool_result", tool_use_id: id, content: text }]);
const call = (name: string, input: Record<string, unknown> = {}, more: Record<string, unknown> = {}) =>
  say(
    "assistant",
    [{ type: "tool_use", id: `${name}-${JSON.stringify(input)}-${JSON.stringify(more)}`, name, input }],
    more,
  );
// A slash command as Claude Code keeps it: its name and arguments apart.
const command = (name: string, args: string) =>
  say(
    "user",
    `<command-message>${name.slice(1)}</command-message>\n<command-name>${name}</command-name>\n<command-args>${args}</command-args>`,
  );

test("a case's hash moves with what the session or the judge sees; the ask hash ignores the graders", () => {
  const dir = scratch();
  mkdirSync(join(dir, "graders"));
  writeFileSync(join(dir, "prompt.md"), "---\nname: x\ntags: [look]\n---\n/nxk:look site/join.html\n");
  writeFileSync(join(dir, "graders", "a.md"), "---\ntype: llm\n---\nAt most three points.\n");
  const first = readCase(dir);
  writeFileSync(join(dir, "graders", "a.md"), "---\ntype: llm\n---\nAt most three points, each labelled.\n");
  const regraded = readCase(dir);
  assert.notEqual(regraded.hash, first.hash);
  assert.equal(regraded.askHash, first.askHash);
  // A new tag or description reaches no session; no-key does (it hides the keys).
  writeFileSync(
    join(dir, "prompt.md"),
    '---\nname: x\ndescription: "A gym."\ntags: [look, uk]\n---\n/nxk:look site/join.html\n',
  );
  assert.equal(readCase(dir).askHash, first.askHash);
  assert.equal(readCase(dir).hash, regraded.hash);
  writeFileSync(join(dir, "prompt.md"), "---\nname: x\ntags: [look, no-key]\n---\n/nxk:look site/join.html\n");
  assert.notEqual(readCase(dir).askHash, first.askHash);
  writeFileSync(join(dir, "prompt.md"), "---\nname: x\n---\n/nxk:look site/pool.html\n");
  assert.notEqual(readCase(dir).askHash, first.askHash);
  assert.notEqual(readCase(dir).hash, regraded.hash);
  const before = readCase(dir).askHash;
  writeFileSync(join(dir, "notes.txt"), "a file the session can read");
  assert.notEqual(readCase(dir).askHash, before);
});

test("graders of the result count in the score; process graders and calibration examples do not", () => {
  const dir = scratch();
  mkdirSync(join(dir, "graders", "process"), { recursive: true });
  writeFileSync(join(dir, "prompt.md"), "---\ntags: [uk, output-look]\n---\n/nxk:look terms.md\n");
  writeFileSync(join(dir, "graders", "fair.md"), "---\ntype: llm\nweight: 2\n---\nThe points are fair.\n");
  writeFileSync(join(dir, "graders", "process", "tool.md"), "---\ntype: tool_used\ntool: x\n---\n");
  const c = readCase(dir);
  assert.equal(c.output, "look");
  assert.deepEqual(
    c.graders.map((g) => [g.name, g.process]),
    [
      ["fair", false],
      ["tool", true],
    ],
  );
  const before = c.hash;
  mkdirSync(join(dir, "graders", "calibration"));
  writeFileSync(join(dir, "graders", "calibration", "fair.pass.md"), "Fair points.");
  assert.equal(readCase(dir).hash, before, "a calibration example is not part of the case");
  assert.equal(
    scoreOf([
      { scored: true, process: false, weight: 2, passed: true },
      { scored: true, process: true, weight: 1, passed: false },
    ]),
    1,
  );
});

test("a process grader runs and is shown apart, unscored; regex and tool graders read the trace and the files", async () => {
  const dir = scratch();
  mkdirSync(join(dir, "graders", "process"), { recursive: true });
  writeFileSync(join(dir, "prompt.md"), "---\ntags: [output-meet]\n---\n/nxk:meet renters\n");
  // The new cases' own regexes, as their graders give them.
  const unchanged = readCase(join(HERE, "look-gym-signup-uk")).graders.find((g) => g.name === "page-unchanged");
  const read = readCase(join(HERE, "meet-cardiff-walkthrough-uk")).graders.find((g) => g.name === "page-read");
  assert.ok(unchanged && read);
  writeFileSync(
    join(dir, "graders", "page-unchanged.md"),
    `---\ntype: regex\ntarget: files\npattern: '${unchanged.pattern}'\nflags: i\n---\n`,
  );
  writeFileSync(
    join(dir, "graders", "process", "page-read.md"),
    `---\ntype: regex\ntarget: trace\npattern: '${read.pattern}'\n---\n`,
  );
  writeFileSync(join(dir, "graders", "no-scan.md"), "---\ntype: tool_used\ntool: scan\nmin: 0\nmax: 0\n---\n");
  writeFileSync(
    join(dir, "graders", "process", "panel-ran.md"),
    `---\ntype: regex\ntarget: trace\npattern: '"subagent_type":\\s*"nxk:panel"'\n---\n`,
  );
  const c = readCase(dir);
  const trace = [
    call("Agent", { subagent_type: "nxk:panel", prompt: "Walk them through site/join.html" }),
    call("Read", { file_path: "/tmp/w/site/join.html" }, { isSidechain: true }),
  ];
  const opts = { model: "m", votes: 1 };
  const page = [{ path: "site/join.html", text: "<!DOCTYPE html>\n<p>Join</p>" }];
  const run = async (s: Graded, files: Delivered[]) =>
    Object.fromEntries((await grade(c, "", s, opts, [], files)).map((g) => [g.name, g]));
  const good = await run({ reply: "Five people, walked through the page.", trace }, []);
  assert.deepEqual(
    Object.values(good).map((g) => [g.name, g.passed, g.scored]),
    [
      ["no-scan", true, true],
      ["page-unchanged", true, true],
      ["page-read", true, false],
      ["panel-ran", true, false],
    ],
  );
  // A page the session changed or wrote again is among its files; a brief that only names the page is not a read.
  const bad = await run({ reply: "Done.", trace: [trace[0], call("scan")] }, page);
  assert.deepEqual(
    Object.values(bad).map((g) => [g.name, g.passed]),
    [
      ["no-scan", false],
      ["page-unchanged", false],
      ["page-read", false],
      ["panel-ran", true],
    ],
  );
  assert.equal(scoreOf(Object.values(bad)), 0, "only graders of the result are scored");
  // A shell command that reads the page counts too.
  const shell = await run({ reply: "", trace: [call("Bash", { command: "cat site/join.html" })] }, []);
  assert.equal(shell["page-read"].passed, true);
});

test("a serious miss is marked by a serious-<grader> tag, on a grader of the result, without moving the case's hashes", () => {
  const dir = scratch();
  mkdirSync(join(dir, "graders", "process"), { recursive: true });
  writeFileSync(join(dir, "prompt.md"), "---\ntags: [output-look]\n---\n/nxk:look site/checkout.html\n");
  writeFileSync(join(dir, "graders", "figures-labelled.md"), "---\ntype: llm\n---\nEvery figure is labelled.\n");
  writeFileSync(join(dir, "graders", "page-exists.md"), "---\ntype: file_exists\npath: a.html\n---\n");
  writeFileSync(join(dir, "graders", "process", "tool.md"), "---\ntype: tool_used\ntool: x\n---\n");
  const before = readCase(dir);
  writeFileSync(
    join(dir, "prompt.md"),
    "---\ntags: [output-look, serious-figures-labelled]\n---\n/nxk:look site/checkout.html\n",
  );
  const c = readCase(dir);
  assert.deepEqual(
    c.graders.map((g) => [g.name, g.serious]),
    [
      ["figures-labelled", true],
      ["page-exists", false],
      ["tool", false],
    ],
  );
  assert.deepEqual([c.askHash, c.hash], [before.askHash, before.hash]);
  for (const tag of ["serious-tool", "serious-not-there"]) {
    writeFileSync(join(dir, "prompt.md"), `---\ntags: [output-look, ${tag}]\n---\n/nxk:look site/checkout.html\n`);
    assert.throws(() => readCase(dir), new RegExp(`${tag} names no grader of the result`));
  }
  // The suite's own tags load, and mark graders in most cases.
  const marked = selectCases().filter((x) => x.graders.some((g) => g.serious));
  assert.ok(marked.length >= 9, `${marked.length} cases with a serious grader`);
});

test("every case sends the command of its kind, has a grader of the result, and an llm grader has its pass and fail examples", () => {
  assert.deepEqual(KINDS, ["research", "look", "meet"]);
  const cases = selectCases();
  assert.equal(cases.length, readdirSync(HERE).filter((d) => existsSync(join(HERE, d, "prompt.md"))).length);
  for (const c of cases) {
    assert.equal((c.meta.tags ?? []).filter((t) => String(t).startsWith("output-")).length, 1, c.name);
    assert.ok((KINDS as (string | null)[]).includes(c.output), `${c.name}: ${c.output}`);
    assert.equal(commandOf(c.prompt), WAYS_IN[c.output as Kind].command, c.name);
    assert.ok(
      c.graders.some((g) => !g.process),
      `${c.name} has no grader of the result`,
    );
    const at = join(c.dir, "graders", "calibration");
    for (const g of c.graders.filter((x) => x.type === "llm"))
      for (const want of ["pass", "fail"])
        assert.ok(existsSync(join(at, `${g.name}.${want}.md`)), `${c.name}/${g.name} has no ${want} example`);
  }
  for (const kind of KINDS)
    assert.ok(
      cases.some((c) => c.output === kind),
      kind,
    );
  assert.equal(commandOf("/nxk:meet renters in Leeds"), "/nxk:meet");
  assert.equal(commandOf("Build the page."), null);
});

test("the gym's page is the same in the look and the panel, and the seeds build each case's work", () => {
  const built: Record<string, string> = {};
  for (const [name, file] of [
    ["look-gym-signup-uk", "site/join.html"],
    ["meet-cardiff-walkthrough-uk", "site/join.html"],
    ["look-refund-policy-uk", "site/refunds.html"],
  ]) {
    const at = scratch(),
      seed = readCase(join(HERE, name)).seed;
    assert.ok(seed, name);
    assert.equal(spawnSync("bash", [seed], { cwd: at }).status, 0, name);
    built[name] = readFileSync(join(at, file), "utf8");
    assert.match(built[name], /^<!doctype html>/i, name);
    assert.ok(existsSync(join(at, ".git")), `${name} is a git project`);
  }
  assert.equal(built["look-gym-signup-uk"], built["meet-cardiff-walkthrough-uk"]);
  assert.match(built["look-gym-signup-uk"], /£29[\s\S]*£20[\s\S]*12 months[\s\S]*Direct Debit/);
});

test("every case runs on the one setup: a case that sets its own tools, turns, time or model is refused", () => {
  const dir = scratch();
  writeFileSync(
    join(dir, "prompt.md"),
    "---\ntags: [output-look]\nallowed_tools: [Read, Grep]\nmax_turns: 20\n---\n/nxk:look site/join.html\n",
  );
  assert.throws(
    () => readCase(dir),
    /max_turns, allowed_tools are the same for every case \(SESSION in evals\/cases\.ts\)/,
  );
  assert.deepEqual(SESSION, { model: null, permissionMode: "auto", maxTurns: 80, timeoutSeconds: 2400, scanBudget: 1 });
});

test("scan spend adds each row's cost under every .nxk/scans folder and counts unreadable lines", () => {
  const dir = scratch(),
    spec = join(dir, "app", ".nxk", "scans", "ideas-us.spec");
  mkdirSync(spec, { recursive: true });
  writeFileSync(join(spec, "scan-a.jsonl"), '{"id":"base","p":0.2,"usd":0.004}\n{"id":"x","p":0.3,"usd":0}\n');
  writeFileSync(join(spec, "scan-b.jsonl"), '{"id":"base","p":0.1,"usd":0.006}\n{"id":"y","p":0.2\n');
  writeFileSync(join(spec, "notes.txt"), "not a scan");
  const spend = scanSpend(dir);
  assert.equal(spend.answers, 3);
  assert.equal(spend.unreadable, 1);
  assert.ok(Math.abs(spend.usd - 0.01) < 1e-9);
  assert.deepEqual(scanSpend(scratch()), { usd: 0, answers: 0, unreadable: 0 });
});

test("an earlier run stands in only when nothing it depends on changed", () => {
  const setup: Compared = {
    claude: "2.1.0",
    session: "s",
    judge: { model: "sonnet", votes: 3, code: "j" },
    plugin: "p",
    people: { "uk.json": "h" },
    decision: { route: "google" } as SetupDecision,
    personagenKey: false,
  };
  const c = { hash: "case" },
    old = { caseHash: "case" };
  assert.deepEqual(unlike(old, setup, c, setup), []);
  assert.deepEqual(unlike(old, setup, c, { ...setup, plugin: "p2" }), ["nxk changed"]);
  assert.deepEqual(unlike(old, setup, c, { ...setup, judge: { ...setup.judge, votes: 5 } }), ["the judge changed"]);
  assert.deepEqual(unlike(old, setup, { hash: "other" }, setup), ["the case changed"]);
  assert.match(
    unlike(old, setup, c, { ...setup, claude: "2.2.0", people: {} }).join("; "),
    /Claude Code was 2.1.0, now 2.2.0; the people files changed/,
  );
  assert.deepEqual(unlike(old, setup, c, { ...setup, decision: { route: "gateway" } as SetupDecision }), [
    "the decision model or keys changed",
  ]);
  assert.deepEqual(unlike(old, undefined, c, setup), ["the earlier results have no setup record"]);
  // Sessions on another model are another setup, for --reuse and --fill alike.
  const pinned = { ...setup, sessionModel: "claude-opus-5-5" };
  assert.deepEqual(unlike(old, setup, c, pinned), ["the session model was not pinned, now claude-opus-5-5"]);
  assert.deepEqual(unlike(old, { ...pinned, sessionModel: "claude-sonnet-5-5" }, c, pinned), [
    "the session model was claude-sonnet-5-5, now claude-opus-5-5",
  ]);
});

test("sessions get every key but PersonaGen's; a no-key case gets none", () => {
  const mine = scratch(),
    links = join(scratch(), "keys");
  for (const f of ["gemini-key", "gemini-tier", "personagen-key"]) writeFileSync(join(mine, f), "x\n");
  const base = {
    PATH: "/bin",
    GEMINI_API_KEY: "g",
    NXK_GEMINI_TIER: "Tier 1",
    CLAUDE_PLUGIN_OPTION_GEMINI_API_KEY: "o",
    PERSONAGEN_API_KEY: "p",
    NXK_PERSONAGEN_API_KEY: "q",
    NXK_CONFIG_DIR: mine,
  };
  const keyed = envFor({ tags: ["research"] }, base, keyFolder(base, "/nowhere", links));
  assert.equal(keyed.GEMINI_API_KEY, "g");
  assert.equal(keyed.NXK_GEMINI_TIER, "Tier 1");
  assert.equal(keyed.PERSONAGEN_API_KEY, undefined);
  assert.equal(keyed.NXK_PERSONAGEN_API_KEY, undefined);
  assert.equal(keyed.NXK_CONFIG_DIR, links);
  assert.equal(keyed.NXK_SCAN_BUDGET_USD, "1"); // the plugin's scan budget, set once as an owner would
  assert.deepEqual(readdirSync(links).sort(), ["gemini-key", "gemini-tier"]);
  assert.ok(lstatSync(join(links, "gemini-key")).isSymbolicLink());
  unlinkSync(join(mine, "gemini-tier"));
  keyFolder(base, "/nowhere", links);
  assert.deepEqual(readdirSync(links), ["gemini-key"]);
  const env = envFor({ tags: ["no-key"] }, base, links);
  assert.equal(env.GEMINI_API_KEY, undefined);
  assert.equal(env.CLAUDE_PLUGIN_OPTION_GEMINI_API_KEY, undefined);
  assert.equal(env.NXK_GEMINI_TIER, undefined);
  assert.equal(env.PERSONAGEN_API_KEY, undefined);
  assert.equal(env.PATH, "/bin");
  assert.equal(env.NXK_SCAN_BUDGET_USD, undefined);
  assert.match(env.NXK_CONFIG_DIR ?? "", /nxk-evals-no-keys$/);
});

test("the setup names the decision model and tier, never a key", () => {
  const config = scratch(),
    fake = "AIzaFAKE-not-a-real-key-0123456789";
  writeFileSync(join(config, "gemini-key"), `${fake}\n`);
  writeFileSync(join(config, "gemini-tier"), "paid\n");
  // A stand-in for Claude Code, so the test runs where it is not installed (CI).
  const bin = scratch();
  writeFileSync(join(bin, "claude"), "#!/bin/sh\necho '9.9.9 (Claude Code)'\n", { mode: 0o755 });
  const env = { PATH: `${bin}${delimiter}${process.env.PATH}`, NXK_CONFIG_DIR: config };
  const setup = setupOf({ model: "sonnet", votes: 3 }, env, scratch());
  assert.equal(setup.decision.route, "google");
  assert.ok(setup.decision.tier);
  assert.ok(!JSON.stringify(setup).includes(fake), "the setup record holds the key");
  assert.match(setup.nxk.commit, /^[0-9a-f]{40}$/);
  assert.ok(Object.keys(setup.people).some((f) => f.endsWith("-people.bin.gz")));
  assert.equal(setup.claude, "9.9.9 (Claude Code)");
});

test("repeated runs keep their own names and traces, and print each one's score and depth with the mean and range", () => {
  assert.equal(runName({ case: "a", rep: 2 }), "a [2]");
  assert.equal(runName({ case: "a" }), "a");
  assert.equal(traceFile({ case: "a", rep: 2 }), "a.2.jsonl");
  assert.equal(traceFile({ case: "a" }), "a.jsonl");
  const depth = (nxk: number, looks: number) =>
    ({ nxk, looks, after: 0, raw: 0, nudges: 4, followed: 2, scans: 0 }) as Depth;
  const lines = repeats([
    { case: "a", rep: 1, score: 1, depth: depth(9, 5) },
    { case: "a", rep: 2, score: 0.5, depth: depth(3, 1) },
    { case: "b", score: 1, depth: depth(1, 1) },
  ]);
  assert.equal(lines.length, 2, "a case run once has no line");
  assert.match(lines[1], /^a\s+1\.00 0\.50\s+0\.75 {2}0\.50 {3}9\/3\s+5\/1/);
  assert.deepEqual(repeats([{ case: "b", score: 1, depth: depth(1, 1) }]), []);
});

test("the judge is told what it reads, never who wrote it, and the work folder's path is taken out", () => {
  for (const words of [JUDGE_INTRO, JUDGE_ASK]) assert.doesNotMatch(words, /nxk|plugin/i);
  const work = join(scratch(), "case", "run-2");
  mkdirSync(work, { recursive: true });
  const text = judged(`Read ${work}/site/join.html.`, [{ path: "README.md", text: `Run from ${work}.` }], work);
  assert.ok(!text.includes(work), text);
  assert.match(text, /Read \.\/site\/join\.html\./);
  assert.equal(blind("nothing to hide", null), "nothing to hide");
});

test("a session's run counts only if it could see nxk's tools and subagents, and nothing else, on the pinned model", () => {
  const nxkTools = ["Read", "mcp__plugin_nxk_nxk__people"];
  const init = (over: Partial<InitEvent> = {}) =>
    ({
      model: "m-1",
      tools: nxkTools,
      skills: ["debug"],
      plugins: [],
      mcp_servers: [{ name: "plugin:nxk:nxk" }],
      ...over,
    }) as InitEvent;
  assert.deepEqual(contamination(init(), "m-1"), []);
  assert.match(contamination(init({ tools: ["Read", "Write"] }))[0], /could not see nxk's tools/);
  assert.deepEqual(contamination(init({ mcp_servers: [{ name: "plugin:nxk:nxk" }, { name: "claude.ai Docs" }] })), [
    "it could use MCP servers outside the setup: claude.ai Docs",
  ]);
  assert.match(contamination(init(), "m-2")[0], /ran on m-1, not the pinned m-2/);
  assert.deepEqual(contamination(null), ["the session never said what it could use"]);
  // Held to what a plain session here loads (the run's probe): built-in plugins and skills pass, and nxk's own.
  const builtin = { name: "cc-plugin-privacy", path: "builtin" };
  const plain = plainOf(init({ plugins: [builtin], agents: ["Explore"] }));
  assert.deepEqual(plain.plugins, ["cc-plugin-privacy"]);
  const all = ["Explore", ...Object.values(NXK_AGENTS)];
  const withNxkPlugin = { plugins: [builtin, { name: "nxk", path: "/repo" }], skills: ["debug", "nxk:look"] };
  assert.deepEqual(contamination(init({ ...withNxkPlugin, agents: all }), "m-1", plain), []);
  assert.match(
    contamination(
      init({ skills: ["debug", "use-railway"], plugins: [builtin, { name: "stripe", path: "/x" }], agents: all }),
      "m-1",
      plain,
    )[0],
    /loaded what a plain session here does not: skill use-railway, plugin stripe \(\/x\)/,
  );
  // Every one of nxk's subagents must be there: the second look, the researcher and the panel.
  assert.match(
    contamination(
      init({ ...withNxkPlugin, agents: ["Explore", "nxk:second-look", "nxk:researcher"] }),
      "m-1",
      plain,
    )[0],
    /could not see nxk's nxk:panel$/,
  );
  assert.match(
    contamination(init({ ...withNxkPlugin, agents: ["Explore", "nxk:advisor"] }), "m-1", plain)[0],
    /could not see nxk's nxk:second-look or nxk:researcher or nxk:panel/,
  );
  const out = [
    JSON.stringify({ type: "system", subtype: "init", model: "m-1" }),
    JSON.stringify({ type: "assistant", message: {} }),
    JSON.stringify({ type: "result", result: "Done.", total_cost_usd: 0.1 }),
  ].join("\n");
  assert.deepEqual(eventsOf(out), {
    init: { type: "system", subtype: "init", model: "m-1" },
    result: { type: "result", result: "Done.", total_cost_usd: 0.1 },
  });
  // Sessions see no claude.ai connectors and do not update Claude Code mid-run.
  assert.deepEqual(QUIET, {
    ENABLE_CLAUDEAI_MCP_SERVERS: "false",
    DISABLE_AUTOUPDATER: "1",
    CLAUDE_CODE_DISABLE_AUTO_MEMORY: "1",
  });
  assert.equal(envFor({}, { PATH: "/bin" }, "/keys").ENABLE_CLAUDEAI_MCP_SERVERS, "false");
});

test("jobs go case by case, repeats together; a fill keeps scored runs and reruns the rest", () => {
  const cases = [{ name: "a" }, { name: "b" }];
  assert.deepEqual(
    jobsOf(cases, 2).map((x) => `${x.c.name}.${x.rep}`),
    ["a.1", "a.2", "b.1", "b.2"],
  );
  assert.deepEqual(
    jobsOf(cases, 1).map((x) => [x.c.name, x.rep]),
    [
      ["a", undefined],
      ["b", undefined],
    ],
  );
  const runs: RunRecord[] = [
    { case: "a", rep: 1, score: 1 },
    { case: "a", rep: 2, failure: "timeout", error: "timed out" },
    { case: "b", rep: 1, score: 0, failure: "contamination" },
    { case: "b", rep: 2, skipped: "spend limit $1.00 reached" },
  ];
  const { kept, failures } = keptOf(runs);
  assert.equal(kept.length, 1);
  assert.equal(failures.length, 3);
  assert.deepEqual(
    jobsOf(cases, 2, new Set(kept.map(runName))).map((x) => `${x.c.name}.${x.rep}`),
    ["a.2", "b.1", "b.2"],
  );
});

test("where nxk ran: calls in its subagents and in the work's context, and which subagent each run handed work to", () => {
  const lines = [
    call("Agent", { subagent_type: "nxk:second-look" }),
    call("mcp__plugin_nxk_nxk__people", {}, { isSidechain: true }),
    call("mcp__plugin_nxk_nxk__people", { a: 1 }, { isSidechain: true }),
    call("Read"),
  ];
  assert.deepEqual(nxkSplit(lines), { main: 0, agents: 2, secondLook: true, research: false, panel: false });
  assert.deepEqual(nxkSplit([call("Task", { subagent_type: "nxk:researcher" })]), {
    main: 0,
    agents: 0,
    secondLook: false,
    research: true,
    panel: false,
  });
  assert.equal(nxkSplit([call("Agent", { subagent_type: "nxk:panel" })]).panel, true);
  const runs = [
    { nxk: { main: 0, agents: 2, secondLook: true, research: false, panel: false } },
    { nxk: { main: 1, agents: 5, secondLook: false, research: true, panel: false } },
    { nxk: { main: 0, agents: 3, secondLook: false, research: false, panel: true } },
    { nxk: { main: 0, agents: 0, secondLook: false, research: false, panel: false } },
    { case: "failed before it ran" },
  ];
  assert.equal(
    nxkLine(runs),
    "nxk's calls: 10 in its subagents, 1 in the work's own context; of 4 runs, the second look ran in 1, research in 1, the panel in 1",
  );
  assert.equal(nxkLine([{ case: "a" }]), null);
  assert.deepEqual(
    runs.slice(0, 4).map((r) => handedOf(r.nxk)),
    ["look", "research", "panel", "none"],
  );
  // The depth table says which subagent each run handed work to, and how many in all.
  const depth = { nxk: 0, looks: 0 } as Depth;
  const rows = table([
    { case: "a", depth, nxk: runs[0].nxk },
    { case: "b", depth, nxk: runs[1].nxk },
    { case: "c", depth, nxk: runs[2].nxk },
  ]);
  assert.match(rows[0], /handed to\s+shallow$/);
  assert.match(rows[1], /\s+look\s+/);
  assert.match(rows[3], /\s+panel\s+/);
  assert.match(rows[4], /^median, 3 sessions.*1 look, 1 research, 1 panel/);
});

test("a judge that does not answer at all throws, never a fail vote; an answer without a verdict still fails", async () => {
  const limit = async () => ({
    out: JSON.stringify({ is_error: true, result: "You've hit your usage limit" }),
    err: "",
  });
  await assert.rejects(
    judge("rubric", "text", { model: "m", votes: 3 }, limit),
    /the judge did not answer: You've hit/,
  );
  const silent = async () => ({ out: "", err: "", timedOut: true });
  await assert.rejects(judge("rubric", "text", { model: "m", votes: 1 }, silent), /timed out/);
  const noVerdict = async () => ({
    out: JSON.stringify({ result: "It meets the first condition.", total_cost_usd: 0.01 }),
  });
  const v = await judge("rubric", "text", { model: "m", votes: 1 }, noVerdict);
  assert.equal(v.passed, false);
  assert.match(v.explanation, /NONE/);
  const pass = async () => ({ out: JSON.stringify({ result: "Fine.\nVERDICT: PASS", total_cost_usd: 0.01 }) });
  assert.equal((await judge("rubric", "text", { model: "m", votes: 3 }, pass)).passed, true);
});

test("a turn's reply is all the session wrote in its own context that turn, in order, after a Stop hook too", () => {
  const lines = [
    say("user", "Help me find a business"),
    said("Here are three ideas, with who each is for."),
    handOff("nxk:second-look"),
    said("Nothing worth raising.", { isSidechain: true }),
    result("t-nxk:second-look", "Nothing worth raising."),
    said("nxk had a look: nothing worth raising."),
    say("user", "Stop hook feedback:\nnxk: the reply has not passed note_check.", { isMeta: true }),
    said("Checked: the figures stand."),
    say("user", "Yes, please: run the scan.\nMake those changes and nothing else, then tell me where it stands."),
    said("The researcher is running the scan; I'll pass on the results when it reports back."),
    said("Scanning 9 offers.", { isSidechain: true }),
    say("user", "<task-notification>the researcher finished</task-notification>"),
    said("The scan is back: three groups lean in."),
  ];
  // The answer before the hand-off, what came after it, and what the session wrote once a Stop hook sent it back:
  // what Claude Code's result alone (the last block) would miss. Never a subagent's words.
  assert.equal(
    turnText(lines, "Help me find a business"),
    "Here are three ideas, with who each is for.\n\nnxk had a look: nothing worth raising.\n\nChecked: the figures stand.",
  );
  // A turn that ended on a holding line and answered once a background agent reported: both, in order.
  assert.equal(
    turnText(lines, "Yes, please: run the scan.\nMake those changes"),
    "The researcher is running the scan; I'll pass on the results when it reports back.\n\nThe scan is back: three groups lean in.",
  );
  // An earlier turn's words are never taken for this one's.
  assert.equal(turnText(lines.slice(0, 8), "Yes, please: run the scan."), "");
  assert.equal(turnText(lines, "a message never sent"), "");
  assert.equal(turnText([], "Help me find a business"), "");
  assert.deepEqual(
    messagesOf(lines).map((m) => [m.text.slice(0, 12), m.texts.length]),
    [
      ["Help me find", 3],
      ["Yes, please:", 2],
    ],
  );
});

test("a command's turn is found by its arguments, and only ever the turn that sent the command", () => {
  const lines = [
    command("/nxk:research", "Who would want a weekly score-draw game?"),
    handOff("nxk:researcher"),
    said("Findings: under-35s lean in most."),
  ];
  assert.equal(
    headOf("/nxk:research Who would want a weekly score-draw game?"),
    "Who would want a weekly score-draw game?",
  );
  assert.equal(
    turnText(lines, "/nxk:research Who would want a weekly score-draw game?"),
    "Findings: under-35s lean in most.",
  );
  // Arguments kept escaped are found by the command's name; another command's turn never is.
  const escaped = [command("/nxk:research", "Who&#39;d want a weekly score-draw game?"), ...lines.slice(1)];
  assert.equal(
    turnText(escaped, "/nxk:research Who'd want a weekly score-draw game?"),
    "Findings: under-35s lean in most.",
  );
  assert.equal(turnText(escaped, "/other:command Who'd want it?"), "");
  // A short argument (a file) that the owner's answer repeats: the command's turn is still the look's, not the answer's.
  const look = [
    command("/nxk:look", "site/join.html"),
    handOff("nxk:second-look"),
    said("Worth considering: one point. Say yes and I'll add a monthly option to site/join.html."),
    say(
      "user",
      "No to this, leave it as it is: add a monthly option to site/join.html.\nI don't know; use your judgement.",
    ),
    said("Understood: the page stays as it is."),
  ];
  assert.match(turnText(look, "/nxk:look site/join.html"), /^Worth considering/);
  assert.equal(
    turnText(look, "No to this, leave it as it is: add a monthly option"),
    "Understood: the page stays as it is.",
  );
});

test("an unknown option stops the run before anything is paid for", () => {
  for (const flag of ["--help", "--cases=look-*"]) {
    const r = spawnSync(process.execPath, [join(HERE, "run.ts"), flag], { encoding: "utf8" });
    assert.equal(r.status, 1, flag);
    assert.match(r.stderr, /^No such option: --(help|cases)\. The options are at the top of evals\/run\.ts\.$/m, flag);
  }
});
