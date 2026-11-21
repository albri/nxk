import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  canonical,
  decisionSetup,
  describeDecision,
  describeSetup,
  minutesFor,
  modelOf,
  scanBudget,
  tierOf,
} from "./decision-model.ts";

const NONE = "/nonexistent-home"; // no key files

test("a scan budget set once means no question before each scan; none set means ask", () => {
  // The plugin's empty setting falls through to the variable, then the file in the config folder.
  assert.equal(scanBudget({ NXK_SCAN_BUDGET: "${user_config.scan_budget}", NXK_SCAN_BUDGET_USD: "1" }, NONE), 1);
  assert.equal(scanBudget({ NXK_SCAN_BUDGET: "$0.25" }, NONE), 0.25);
  assert.equal(scanBudget({ CLAUDE_PLUGIN_OPTION_SCAN_BUDGET: "0.5" }, NONE), 0.5);
  assert.equal(scanBudget({ NXK_SCAN_BUDGET: "" }, NONE), null);
  assert.equal(scanBudget({ NXK_SCAN_BUDGET_USD: "nothing" }, NONE), null);
  const dir = mkdtempSync(join(tmpdir(), "nxk-budget-"));
  writeFileSync(join(dir, "scan-budget"), "0.4\n");
  assert.equal(scanBudget({ NXK_CONFIG_DIR: dir }, NONE), 0.4);
  rmSync(dir, { recursive: true });
  const key = { NXK_GEMINI_API_KEY: "k" };
  assert.match(
    describeSetup({ ...key, NXK_SCAN_BUDGET_USD: "1" }, NONE)[1],
    /^Scan budget: up to \$1 on scans for this request without asking/,
  );
  assert.match(describeSetup(key, NONE)[1], /^Scan budget: none set, so before a paid scan .* ask/);
  // With no key there is no scan to budget for.
  assert.ok(!describeSetup({}, NONE).some((line) => line.startsWith("Scan budget")));
});

test("a model has one name across routes, and moving aliases are pinned", () => {
  assert.equal(canonical("google/gemini-decision-1"), "gemini-decision-1");
  assert.equal(canonical("gemini-decision-1"), "gemini-decision-1");
  assert.equal(canonical("typesafe/jev-1.14"), "jev-1.14.0");
  assert.equal(canonical("typesafe-ai/jev-1.13.0"), "jev-1.13.0");
  assert.equal(canonical("jev-latest"), "jev-1.14.0");
  assert.equal(canonical(""), "gemini-decision-1");
  assert.equal(canonical("openai/gpt-6-luna-decisions"), "openai/gpt-6-luna-decisions");
  assert.equal(modelOf({ id: "base", p: 0.2 }), "gemini-decision-1"); // saved before the model was recorded
  assert.equal(tierOf("Tier 2"), "tier2");
  assert.equal(tierOf("paid"), "tier1");
  assert.equal(tierOf("Free Tier"), "free");
  assert.equal(tierOf("not set"), null);
});

test("the route follows the keys set, Google's tier sets the pace, and no key is said plainly", () => {
  const none = decisionSetup({}, NONE);
  assert.equal(none.route, null);
  assert.match(
    none.reason,
    /^No key for gemini-decision-1: it needs a Google AI Studio key, or a Vercel AI Gateway key, or an OpenRouter key/,
  );
  assert.match(
    describeDecision(none),
    /^Scans: new scans unavailable\..*never ask for a key in the chat\. The tools that send nothing .* and reading a scan already saved need no key\.$/,
  );

  const unset = decisionSetup({ NXK_GEMINI_API_KEY: "k", NXK_GEMINI_TIER: "${user_config.gemini_tier}" }, NONE);
  assert.equal(unset.route, "google");
  assert.equal(unset.wire, "gemini-decision-1");
  assert.equal(unset.limits?.tpm, 50000); // no tier set: the Free Tier's limits, safe on every tier
  assert.equal(unset.charged, true);
  assert.equal(unset.from, "the plugin's settings");
  assert.match(describeDecision(unset), /tier not set: kept to the Free Tier's 50,000 tokens a minute/);
  assert.doesNotMatch(JSON.stringify(describeDecision(unset)), /"k"/);
  assert.equal(unset.price, "published");
  assert.doesNotMatch(describeDecision(unset), /assumes/);
  // A model with no published price says the price it assumes, since spending limits count with it.
  const unknown = decisionSetup({ AI_GATEWAY_API_KEY: "k", NXK_DECISION_MODEL: "acme/decider-2" }, NONE);
  assert.equal(unknown.price, "assumed");
  assert.match(
    describeDecision(unknown),
    /no published price for acme\/decider-2: it assumes \$0\.1 a million input tokens.*NXK_DECISION_USD_PER_M/,
  );
  assert.equal(
    decisionSetup(
      { AI_GATEWAY_API_KEY: "k", NXK_DECISION_MODEL: "acme/decider-2", NXK_DECISION_USD_PER_M: "0.3" },
      NONE,
    ).price,
    "set",
  );

  const free = decisionSetup({ GEMINI_API_KEY: "k", NXK_GEMINI_TIER: "Free Tier" }, NONE);
  assert.equal(free.charged, false);
  const tier2 = decisionSetup(
    { CLAUDE_PLUGIN_OPTION_GEMINI_API_KEY: "k", CLAUDE_PLUGIN_OPTION_GEMINI_TIER: "Tier 2" },
    NONE,
  );
  assert.equal(tier2.limits?.tpm, 4000000);
  // The scan that took 33 minutes on the Free Tier's pace: 1,359 requests, about 1.6m tokens.
  assert.equal(minutesFor(free, 1359, 1606500), 33);
  assert.equal(minutesFor(tier2, 1359, 1606500), 1);

  const home = mkdtempSync(join(tmpdir(), "nxk-home-"));
  mkdirSync(join(home, ".config", "nxk"), { recursive: true });
  writeFileSync(join(home, ".config", "nxk", "gemini-key"), "k\n");
  writeFileSync(join(home, ".config", "nxk", "gemini-tier"), "paid\n");
  const files = decisionSetup({}, home);
  rmSync(home, { recursive: true, force: true });
  assert.deepEqual(
    [files.route, files.from, files.tier, files.limits?.tpm],
    ["google", "~/.config/nxk/gemini-key", "tier1", 1000000],
  );

  const placeholder = decisionSetup({ NXK_GEMINI_API_KEY: "${user_config.gemini_api_key}" }, NONE);
  assert.equal(placeholder.route, null);

  const jev = decisionSetup({ NXK_DECISION_MODEL: "jev-latest", TYPESAFE_API_KEY: "k", OPENROUTER_API_KEY: "k" }, NONE);
  assert.deepEqual(
    [jev.route, jev.wire, jev.model, jev.usdPerMillion, jev.limits],
    ["typesafe", "jev-1.14.0", "jev-1.14.0", 0.042, null],
  );
  const viaRouter = decisionSetup({ NXK_DECISION_MODEL: "jev-1.14.0", OPENROUTER_API_KEY: "k" }, NONE);
  assert.deepEqual([viaRouter.route, viaRouter.wire], ["openrouter", "typesafe/jev-1.14"]);
  const gemini = decisionSetup({ AI_GATEWAY_API_KEY: "k" }, NONE);
  assert.deepEqual([gemini.route, gemini.wire], ["gateway", "google/gemini-decision-1"]);
  const luna = decisionSetup({ NXK_DECISION_MODEL: "openai/gpt-6-luna-decisions", GEMINI_API_KEY: "k" }, NONE);
  assert.equal(luna.route, null);
  assert.match(luna.reason, /needs a Vercel AI Gateway key, or an OpenRouter key/);
});

/** A stand-in decision service, listening: what it has seen, where it listens, and how to stop it. */
interface Service {
  seen: { requests: number; answered: number; models: Set<string> };
  url: string;
  close: () => void;
}

// A stand-in decision service: answers every question at 0.5, busy for the first `busy` requests, and out of daily
// quota after `daily` answers.
function service({ busy = 0, daily = Infinity } = {}): Promise<Service> {
  const seen: Service["seen"] = { requests: 0, answered: 0, models: new Set() };
  const server = createServer((req, res) => {
    let raw = "";
    req.on("data", (c) => {
      raw += c;
    });
    req.on("end", () => {
      seen.requests++;
      const body: { model: string; questions: Record<string, { criteria: Record<string, string | null> }> } =
        JSON.parse(raw);
      seen.models.add(body.model);
      if (seen.requests <= busy) {
        res.writeHead(429, { "retry-after": "1", "content-type": "application/json" });
        return res.end('{"error":{"message":"Rate limit exceeded","type":"rate_limit_exceeded"}}');
      }
      if (seen.answered >= daily) {
        res.writeHead(429, { "content-type": "application/json" });
        return res.end('{"error":{"code":"quota_exceeded","message":"Daily quota used"}}');
      }
      seen.answered++;
      const answers = Object.fromEntries(
        Object.entries(body.questions).map(([key, q]) => [
          key,
          { probabilities: Object.fromEntries(Object.keys(q.criteria).map((name) => [name, 0.5])) },
        ]),
      );
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ answers, usage: { input_tokens: 1000 } }));
    });
  });
  return new Promise((ready) =>
    server.listen(0, "127.0.0.1", () =>
      ready({
        seen,
        // Listening on a TCP port, the server's address is an AddressInfo.
        url: `http://127.0.0.1:${(server.address() as AddressInfo).port}/`,
        close: () => server.close(),
      }),
    ),
  );
}

const SCAN = fileURLToPath(new URL("./scan.ts", import.meta.url));
const scan = (dir: string, spec: string, env: NodeJS.ProcessEnv) =>
  new Promise<{ code: number | string; out: string }>((done) =>
    execFile(
      process.execPath,
      [SCAN, dir, spec, "--country=uk", "--quiet", "--max-usd=1", "--fields=home_tenure"],
      { env: { PATH: process.env.PATH, HOME: dir, ...env }, timeout: 120000 },
      (error, stdout, stderr) => done({ code: error?.code ?? 0, out: `${stdout}${stderr}` }),
    ),
  );

test("a scan slows for a busy service, stops at a spent daily quota, and keeps each model's answers apart", async () => {
  const dir = mkdtempSync(join(tmpdir(), "nxk-decision-"));
  try {
    const spec = join(dir, "pricing.json");
    writeFileSync(
      spec,
      JSON.stringify({
        surveyed: "November 2026",
        versions: { a: "A budgeting app, £4.99 a month.", b: "A budgeting app, £2.99 a month." },
        questions: {
          act: { type: "choice", text: "What would you do next?", options: ["Start the free trial", "Leave"] },
        },
        watch: ["act", "Start the free trial"],
      }),
    );
    mkdirSync(join(dir, ".config", "nxk"), { recursive: true });
    const rows = () =>
      ["a", "b"].flatMap((v) =>
        readFileSync(join(dir, "pricing", `scan-${v}.jsonl`), "utf8")
          .split("\n")
          .filter(Boolean)
          .map((l) => JSON.parse(l)),
      );

    const first = await service({ busy: 3 });
    let ran = await scan(dir, spec, { NXK_DECISION_URL: first.url, NXK_DECISION_KEY: "test" });
    first.close();
    assert.match(
      ran.out,
      /requests \(\d+ questions\) across 2 versions to gemini-decision-1 through http:\/\/127\.0\.0\.1/,
    );
    assert.match(ran.out, /No published limit: up to 16 requests at a time/);
    assert.doesNotMatch(ran.out, /Stopped:/);
    assert.deepEqual([...first.seen.models], ["google/gemini-decision-1"]);
    const asked = first.seen.answered;
    assert.ok(asked > 10);
    assert.ok(rows().every((r) => r.m === "gemini-decision-1"));
    const firstRows = rows().length;

    // Another model sends every question again; its answers are tagged with it and the first model's are untouched.
    const second = await service({ daily: 2 });
    ran = await scan(dir, spec, {
      NXK_DECISION_URL: second.url,
      NXK_DECISION_KEY: "test",
      NXK_DECISION_MODEL: "jev-1.14.0",
    });
    second.close();
    assert.match(ran.out, /Stopped: The decision model's daily request quota is used up/);
    assert.deepEqual([...second.seen.models], ["jev-1.14.0"]);
    assert.equal(rows().filter((r) => r.m === "gemini-decision-1").length, firstRows);
    const byModel = Object.groupBy(rows(), (r) => r.m);
    const jev = byModel["jev-1.14.0"] ?? [],
      gemini = byModel["gemini-decision-1"] ?? [];
    assert.ok(jev.length > 0 && jev.length < gemini.length);
    assert.equal(second.seen.answered, 2);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("the plugin's default tier setting, the words not set, gives way to the tier file", () => {
  const home = mkdtempSync(join(tmpdir(), "nxk-tier-"));
  mkdirSync(join(home, ".config", "nxk"), { recursive: true });
  writeFileSync(join(home, ".config", "nxk", "gemini-tier"), "paid\n");
  const setup = decisionSetup({ NXK_GEMINI_API_KEY: "k", NXK_GEMINI_TIER: "not set" }, home);
  assert.equal(setup.tier, "tier1");
  assert.equal(decisionSetup({ NXK_GEMINI_API_KEY: "k", NXK_GEMINI_TIER: "Tier 2" }, home).tier, "tier2");
  rmSync(home, { recursive: true, force: true });
});

test("NXK_CONFIG_DIR moves the key files: an empty folder means no key", () => {
  const home = mkdtempSync(join(tmpdir(), "nxk-cfg-"));
  mkdirSync(join(home, ".config", "nxk"), { recursive: true });
  writeFileSync(join(home, ".config", "nxk", "gemini-key"), "k\n");
  assert.equal(decisionSetup({}, home).route, "google");
  const empty = mkdtempSync(join(tmpdir(), "nxk-empty-"));
  assert.equal(decisionSetup({ NXK_CONFIG_DIR: empty }, home).route, null);
  rmSync(home, { recursive: true, force: true });
  rmSync(empty, { recursive: true, force: true });
});
