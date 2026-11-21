// What every run is measured on, and what each session could use: the keys it gets, the setup record, the exact model
// IDs a run pins at its start, and the check that a session loaded nxk and nothing else beyond a plain session's.
import { execFileSync, spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, symlinkSync, unlinkSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { decisionSetup, personagenKey, type RoutedSetup } from "../scripts/decision-model.ts";
import { filesIn, HERE, hash, NXK_AGENTS, SESSION, type Case, type CaseMeta, type Session } from "./cases.ts";
import { entriesOf, type Entry } from "./lib.ts";

export const ROOT = resolve(HERE, "..");
// Sessions draw only from the people shipped in maps/: a PersonaGen key would let people_pull draw from the hosted
// API, which is paid for and differs from run to run. So their key folder (NXK_CONFIG_DIR) holds links to your key
// files, all but personagen-key, and no PersonaGen key variable reaches them. A case tagged no-key checks what nxk
// does with no decision-model key either: its key folder is empty and no key variable reaches it. (`claude plugin
// eval` gives no key at all.)
export const KEY_VARS =
  /^(NXK_|CLAUDE_PLUGIN_OPTION_|GEMINI_API_KEY$|AI_GATEWAY_API_KEY$|OPENROUTER_API_KEY$|TYPESAFE_API_KEY$|PERSONAGEN_API_KEY$)/;
const PERSONAGEN_VARS = /^(NXK_PERSONAGEN_API_KEY|CLAUDE_PLUGIN_OPTION_PERSONAGEN_API_KEY|PERSONAGEN_API_KEY)$/;
// Every session and judge: no claude.ai connectors (they can act on your accounts and are not part of what is
// measured), no auto memory (a session would write notes under ~/.claude that nothing measured asked for), and Claude
// Code does not update itself while a run is going.
export const QUIET = {
  ENABLE_CLAUDEAI_MCP_SERVERS: "false",
  DISABLE_AUTOUPDATER: "1",
  CLAUDE_CODE_DISABLE_AUTO_MEMORY: "1",
};

/** A folder of links to the key files in yours (NXK_CONFIG_DIR or ~/.config/nxk), all but the PersonaGen key. */
export function keyFolder(base = process.env, home = homedir(), at = join(tmpdir(), "nxk-evals-keys")): string {
  const from = String(base.NXK_CONFIG_DIR ?? "").trim() || join(home, ".config", "nxk");
  mkdirSync(at, { recursive: true });
  for (const f of readdirSync(at)) if (!existsSync(join(from, f)) || f === "personagen-key") unlinkSync(join(at, f));
  for (const f of existsSync(from) ? readdirSync(from) : [])
    if (f !== "personagen-key" && !existsSync(join(at, f))) symlinkSync(join(from, f), join(at, f));
  return at;
}
/**
 * A session's environment: yours without the PersonaGen key (without any key, for a case tagged no-key), with its own
 * key folder and scan budget.
 */
export function envFor(meta: Pick<CaseMeta, "tags">, base = process.env, keys = keyFolder(base)): NodeJS.ProcessEnv {
  const noKey = (meta.tags ?? []).includes("no-key");
  const kept = Object.entries(base).filter(([k]) => !(noKey ? KEY_VARS : PERSONAGEN_VARS).test(k));
  return {
    ...Object.fromEntries(kept),
    ...QUIET,
    NXK_CONFIG_DIR: noKey ? join(tmpdir(), "nxk-evals-no-keys") : keys,
    // The plugin's own setting reaches the server as NXK_SCAN_BUDGET (empty here); this is the variable it falls back to.
    ...(noKey ? {} : { NXK_SCAN_BUDGET_USD: String(SESSION.scanBudget) }),
  };
}

const fileHash = (file: string) => createHash("sha256").update(readFileSync(file)).digest("hex").slice(0, 16);
// What the plugin loads: its manifest, hooks, MCP server and scripts (not the tests, the README or the evals).
export const PLUGIN_PATHS = [".claude-plugin", "agents", "hooks", "mcp", "scripts"];

/** The Claude Code version on `env`'s PATH. */
export const claudeVersion = (env = process.env): string =>
  execFileSync("claude", ["--version"], { encoding: "utf8", env }).trim();

/** How `run` runs a command: where, what it reads on stdin, its time limit (0 for none) and its environment. */
export interface RunOptions {
  cwd?: string;
  input?: string;
  timeoutMs?: number;
  env?: NodeJS.ProcessEnv;
}

/** What a command came to: its exit code, its output, and whether it was stopped at its time limit. */
export interface Ran {
  code: number | null;
  out: string;
  err: string;
  timedOut: boolean;
}

/**
 * What runs a command for the judge and the simulated owner: `run`, or a test's stand-in, which gives back only the
 * output it is checked on.
 */
export type Runner = (
  cmd: string,
  args: string[],
  options: RunOptions,
) => Promise<{ out: string; err?: string; timedOut?: boolean }>;

/** The judge every llm grader is put to: its model, and how many votes each verdict takes. */
export interface Judge {
  model: string;
  votes: number;
}

/**
 * The first event of a stream-json session: what it could use. Its plugins are { name, path } (path "builtin" for one
 * built into Claude Code), its MCP servers { name, status }.
 */
export interface InitEvent extends Entry {
  type: "system";
  subtype: "init";
  model: string;
  claude_code_version: string;
  tools?: string[];
  skills?: string[];
  plugins?: { name: string; path: string }[];
  agents?: string[];
  mcp_servers?: { name: string; status?: string }[];
}

/**
 * The last event of a stream-json session, which is also all that `--output-format json` prints: the result's text
 * (the last block of the turn), whether it is an error and of what kind, what it cost and what it ran on.
 */
export interface ResultEvent extends Entry {
  type?: "result";
  subtype?: string;
  is_error?: boolean;
  result?: string;
  api_error?: string;
  session_id?: string;
  total_cost_usd?: number;
  num_turns?: number;
  permission_denials?: { tool_name: string }[];
  /** Usage by the model IDs it ran on. */
  modelUsage?: Record<string, unknown>;
}

/** What a session with no plugin of ours loads (plainOf): every session of a run may load no more, besides nxk. */
export interface Plain {
  skills: string[];
  plugins: string[];
  agents: string[];
  mcp: string[];
}

/** What a session could use, kept with its run (toolsOf). */
export interface Tools {
  model: string;
  claude: string;
  tools: string[];
  skills: string[];
  plugins: string[];
  mcp: string[];
}

/** The decision model a run's scans use: its route, model and tier, never a key; or why there is none. */
export type SetupDecision =
  | Pick<RoutedSetup, "route" | "model" | "wire" | "tier" | "charged" | "usdPerMillion">
  | { route: null; reason: string; model?: undefined; tier?: undefined };

/**
 * What every run of one invocation is measured on (setupOf), and what run.ts adds once it knows: what a plain session
 * loads, and the simulated owner.
 */
export interface Setup {
  /** When it was taken, as an ISO date and time. */
  date: string;
  /** This repository's commit, and the plugin's files (and the people files) not committed. */
  nxk: { commit: string; uncommitted: string[] };
  /** A hash of the plugin's files. */
  plugin: string;
  /** A hash of each people file, by name. */
  people: Record<string, string>;
  /** Claude Code's version. */
  claude: string;
  node: string;
  decision: SetupDecision;
  /** Whether a PersonaGen key is set (sessions never get it). */
  personagenKey: boolean;
  sessions: Session;
  /** The model ID the sessions are pinned to. */
  sessionModel: string;
  /** A hash of how a session runs. */
  session: string;
  judge: Judge & { code: string };
  /** A hash of the runner's own code. */
  runner: string;
  plain?: Plain;
  owner?: { model: string; turns: number } | null;
}

/** A command's output, code and whether it was stopped at its time limit. */
export function run(
  cmd: string,
  args: string[],
  { cwd, input = "", timeoutMs = 0, env = process.env }: RunOptions = {},
): Promise<Ran> {
  return new Promise((done) => {
    const child = spawn(cmd, args, { cwd, env, stdio: ["pipe", "pipe", "pipe"] });
    let out = "",
      err = "",
      timedOut = false;
    const timer = timeoutMs
      ? setTimeout(() => {
          timedOut = true;
          child.kill("SIGTERM");
        }, timeoutMs)
      : null;
    child.stdout.on("data", (d) => (out += d));
    child.stderr.on("data", (d) => (err += d));
    child.on("close", (code) => {
      if (timer) clearTimeout(timer);
      done({ code, out, err, timedOut });
    });
    child.stdin.end(input);
  });
}

/**
 * What every run of one invocation is measured on. Of the decision model, only its route, model and tier: never a key.
 * `code` holds hashes of the code that runs a session and grades it; `sessionModel` the model ID the sessions are
 * pinned to.
 */
export function setupOf(
  { model, votes }: Judge,
  env = process.env,
  home = homedir(),
  {
    code = {},
    sessionModel,
  }: { code?: { session?: string; judge?: string; runner?: string }; sessionModel?: string } = {},
): Setup {
  const git = (...args: string[]) => execFileSync("git", args, { cwd: ROOT, encoding: "utf8" });
  const pluginFiles = PLUGIN_PATHS.flatMap((p) => filesIn(join(ROOT, p)).map((f) => join(p, f))).filter(
    (f) => !f.endsWith(".test.ts"),
  );
  const d = decisionSetup(env, home);
  return {
    date: new Date().toISOString(),
    // Uncommitted files where the plugin loads from (the people files too), not drafts elsewhere in the repository.
    nxk: {
      commit: git("rev-parse", "HEAD").trim(),
      uncommitted: git("status", "--porcelain", "--", ...PLUGIN_PATHS, "maps")
        .split("\n")
        .filter(Boolean)
        .map((line) => line.slice(3)),
    },
    plugin: hash(...pluginFiles.flatMap((f) => [f, readFileSync(join(ROOT, f), "latin1")])),
    people: Object.fromEntries(
      readdirSync(join(ROOT, "maps"))
        .sort()
        .map((f) => [f, fileHash(join(ROOT, "maps", f))]),
    ),
    claude: claudeVersion(env),
    node: process.version,
    decision: d.route
      ? {
          route: d.route,
          model: d.model,
          wire: d.wire,
          tier: d.tier,
          charged: d.charged,
          usdPerMillion: d.usdPerMillion,
        }
      : { route: null, reason: d.reason },
    personagenKey: Boolean(personagenKey(env, home)),
    sessions: SESSION,
    sessionModel: sessionModel ?? SESSION.model ?? "Claude Code's default",
    session: hash(JSON.stringify(SESSION), KEY_VARS.source, JSON.stringify(QUIET), code.session ?? ""),
    judge: { model, votes, code: code.judge ?? "" },
    runner: code.runner ?? "",
  };
}

/**
 * What unlike compares of two setups. An earlier one is read from its results, which may be older than the pinned
 * session model.
 */
export type Compared = Pick<
  Setup,
  "claude" | "session" | "judge" | "owner" | "plugin" | "people" | "decision" | "personagenKey"
> & { sessionModel?: string };

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
/** Why an earlier run cannot stand for this one: nothing when it can. */
export function unlike(
  old: { caseHash?: string },
  then: Compared | undefined,
  c: Pick<Case, "hash">,
  now: Compared,
): string[] {
  if (!then) return ["the earlier results have no setup record"];
  const why: string[] = [];
  if (old.caseHash !== c.hash) why.push("the case changed");
  if (then.claude !== now.claude) why.push(`Claude Code was ${then.claude}, now ${now.claude}`);
  if ((then.sessionModel ?? null) !== (now.sessionModel ?? null))
    why.push(`the session model was ${then.sessionModel ?? "not pinned"}, now ${now.sessionModel}`);
  if (then.session !== now.session) why.push("the session code changed");
  if (!same(then.judge, now.judge)) why.push("the judge changed");
  if (!same(then.owner ?? null, now.owner ?? null)) why.push("the simulated owner changed");
  if (then.plugin !== now.plugin) why.push("nxk changed");
  if (!same(then.people, now.people)) why.push("the people files changed");
  if (!same(then.decision, now.decision) || then.personagenKey !== now.personagenKey)
    why.push("the decision model or keys changed");
  return why;
}

/** The first event of a stream-json session (what it could use) and its last (the result), from its output. */
export function eventsOf(out: string): { init: InitEvent | null; result: ResultEvent | null } {
  const entries = entriesOf(String(out ?? "").split("\n"));
  const init = entries.find((e): e is InitEvent => e.type === "system" && e.subtype === "init") ?? null;
  const result = entries.findLast((e): e is ResultEvent => e.type === "result") ?? null;
  return { init, result };
}

/** What a session could use, from its first event: kept with the run. */
export const toolsOf = (init: InitEvent | null): Tools | null =>
  init
    ? {
        model: init.model,
        claude: init.claude_code_version,
        tools: init.tools ?? [],
        skills: init.skills ?? [],
        plugins: (init.plugins ?? []).map((p) => p.name),
        mcp: (init.mcp_servers ?? []).map((m) => `${m.name} (${m.status})`),
      }
    : null;

const NXK_SERVER = "plugin:nxk:nxk";
/**
 * Why a session's run cannot count, from what it could use (its first event): it could not see nxk's tools or any of
 * its subagents (NXK_AGENTS: the second look, the researcher and the panel); it loaded a skill, plugin or agent a plain
 * session here does not, besides nxk's own; it could use any MCP server but nxk's; or it ran on a model other than the
 * one the run pinned. Nothing when the run can count.
 */
export function contamination(
  init: InitEvent | null,
  model: string | null = null,
  plain: Plain | null = null,
): string[] {
  if (!init) return ["the session never said what it could use"];
  const extra: string[] = [];
  if (plain) {
    // nxk's own parts are judged below; anything else a plain session here does not load is outside the setup.
    const ours = (x: string) => /^nxk\b|^nxk:/.test(x);
    const now = plainOf(init);
    for (const [what, label] of [
      ["skills", "skill"],
      ["plugins", "plugin"],
      ["agents", "agent"],
    ] as const)
      for (const x of now[what]) if (!plain[what].includes(x) && !ours(x)) extra.push(`${label} ${x}`);
  }
  const problems = extra.length ? [`it loaded what a plain session here does not: ${extra.join(", ")}`] : [];
  const others = (init.mcp_servers ?? []).map((m) => m.name).filter((n) => n !== NXK_SERVER);
  if (others.length) problems.push(`it could use MCP servers outside the setup: ${others.join(", ")}`);
  if (model && init.model !== model) problems.push(`it ran on ${init.model}, not the pinned ${model}`);
  if (!(init.tools ?? []).some((t) => t.startsWith("mcp__plugin_nxk_nxk__")))
    problems.push("the session could not see nxk's tools");
  else if (init.agents) {
    const agents = init.agents;
    const missing = Object.values(NXK_AGENTS).filter((a) => !agents.includes(a));
    if (missing.length) problems.push(`the session could not see nxk's ${missing.join(" or ")}`);
  }
  return problems;
}

/**
 * What a session with no plugin of ours loads, as the run's probe found it: the skills, the plugins (only those built
 * into Claude Code: path "builtin"), the agents and the MCP servers. Every session of a run must load no more than
 * this, besides nxk (contamination).
 */
export const plainOf = (init: InitEvent): Plain => ({
  skills: [...(init.skills ?? [])].map(String).sort(),
  plugins: (init.plugins ?? []).map((p) => `${p.name}${p.path === "builtin" ? "" : ` (${p.path})`}`).sort(),
  agents: [...(init.agents ?? [])].map(String).sort(),
  mcp: (init.mcp_servers ?? []).map((m) => m.name).sort(),
});

/**
 * The exact model ID and Claude Code version behind a model alias (null: Claude Code's default), from the first event of
 * a session that is stopped there, before it asks the model anything.
 */
export function resolveModel(
  alias: string | null,
  env: NodeJS.ProcessEnv = { ...process.env, ...QUIET },
): Promise<{ model: string; claude: string; plain: Plain }> {
  const cwd = join(tmpdir(), "nxk-evals-resolve");
  mkdirSync(cwd, { recursive: true });
  return new Promise((done, fail) => {
    const child = spawn(
      "claude",
      [
        "-p",
        "--setting-sources",
        "project",
        ...(alias ? ["--model", alias] : []),
        "--output-format",
        "stream-json",
        "--verbose",
      ],
      { cwd, env, stdio: ["pipe", "pipe", "ignore"] },
    );
    let out = "";
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      fail(new Error(`Claude Code said nothing in 60 s when asked which model ${alias ?? "is its default"}`));
    }, 60000);
    child.stdout.on("data", (d) => {
      out += d;
      const { init } = eventsOf(out.slice(0, out.lastIndexOf("\n") + 1));
      if (!init) return;
      clearTimeout(timer);
      child.kill("SIGKILL");
      done({ model: init.model, claude: init.claude_code_version, plain: plainOf(init) });
    });
    child.on("error", fail);
    child.stdin.end("Reply OK.");
  });
}
