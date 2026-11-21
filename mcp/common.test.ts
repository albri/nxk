import assert from "node:assert/strict";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import type { LogRecord } from "../scripts/log.ts";
import { readLog } from "../scripts/records.ts";
import { logText, run as scriptRun } from "../scripts/testing.ts";
import { background, folderOf, minutesLeft, runningScan, runScript, waitForScan } from "./common.ts";

const script = (dir: string, name: string, body: string): string => {
  const file = join(dir, name);
  writeFileSync(file, body);
  return file;
};
// What a record says, for those that print a line (any other has no text).
const textOf = (r: LogRecord): unknown => ("text" in r ? r.text : undefined);
// A script that prints its pace and records it, as scan.ts does (scripts/log.ts), then prints "done" after a wait.
const PACED = `import { openLog, scriptSinks } from ${JSON.stringify(new URL("../scripts/log.ts", import.meta.url).href)};
const log = openLog("scan", [], { label: "simulated", sinks: scriptSinks(process.env, process.cwd()), print: console.log });
log.line("Paced: about 1 minutes.");
log.record("paced", { minutes: 1 });
setTimeout(() => log.line("done"), Number(process.argv[2]));
`;

test("a scan is waited for in the call; one paced past the wait is left running, recorded, at once", async () => {
  const dir = mkdtempSync(join(tmpdir(), "nxk-bg-"));
  try {
    // Paced to a minute, against a wait of a second: left at once, not at the end of the wait.
    const paced = script(dir, "paced.mjs", PACED);
    const t0 = Date.now();
    const slow = await background(paced, [1500], dir, join(dir, "slow.run"), { most: 1000, about: { label: "slow" } });
    assert.equal(slow.running, true);
    assert.ok(Date.now() - t0 < 900, "left as soon as its pace was printed");
    assert.match(slow.text, /about 1 minutes/);
    assert.deepEqual(
      slow.records.filter((r) => r.type === "paced").map((r) => r.minutes),
      [1],
    );
    let run = runningScan(dir);
    assert.ok(run);
    assert.equal(run.label, "slow");
    assert.equal(run.alive, true);
    assert.equal(run.minutes, 1);
    assert.equal(minutesLeft(run), 1);
    await new Promise((done) => setTimeout(done, 2000));
    run = runningScan(dir);
    assert.ok(run);
    assert.equal(run.alive, false);
    assert.match(run.log, /done/);
    rmSync(run.file);
    // Done within the wait: its output, nothing left behind.
    const quick = await background(
      script(dir, "quick.mjs", 'setTimeout(() => console.log("done"), 600);\n'),
      [],
      dir,
      join(dir, "quick.run"),
      { most: 5000 },
    );
    assert.equal(quick.running, undefined);
    assert.equal(quick.error, false);
    assert.match(quick.text, /done$/);
    assert.equal(existsSync(join(dir, "quick.run.json")), false);
    assert.equal(runningScan(dir), null);
    // No pace printed and still going at the end of the wait: left running.
    const quiet = await background(
      script(dir, "quiet.mjs", "setTimeout(() => {}, 3000);\n"),
      [],
      dir,
      join(dir, "quiet.run"),
      { most: 700 },
    );
    assert.equal(quiet.running, true);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("asking about a running scan waits for it to finish, unless its pace runs well past the wait", async () => {
  const dir = mkdtempSync(join(tmpdir(), "nxk-wait-"));
  try {
    await background(script(dir, "s.mjs", "setTimeout(() => {}, 1200);\n"), [], dir, join(dir, "s.run"), {
      most: 100,
      about: { label: "s" },
    });
    assert.equal(runningScan(dir)?.alive, true);
    const run = await waitForScan(dir, { most: 5000, every: 100 });
    assert.ok(run);
    assert.equal(run.alive, false);
    rmSync(run.file);
    // Paced to 14 minutes and 5 minutes in: past a 10-minute wait, so the call returns at once and says what is left.
    writeFileSync(
      join(dir, "long.run.json"),
      JSON.stringify({ pid: process.pid, started: new Date(Date.now() - 5 * 60000).toISOString(), label: "long" }),
    );
    writeFileSync(join(dir, "long.run.log"), "Paced to 50,000 tokens a minute: about 14 minutes.\n");
    writeFileSync(
      join(dir, "long.run.jsonl"),
      logText([
        scriptRun("scan", "simulated", "Paced to 50,000 tokens a minute: about 14 minutes.", {
          type: "paced",
          minutes: 14,
        }),
      ]),
    );
    const t0 = Date.now();
    assert.equal((await waitForScan(dir, { most: 10 * 60000, every: 100 }))?.alive, true);
    assert.ok(Date.now() - t0 < 500);
    assert.equal(minutesLeft(runningScan(dir)), 9);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// A script as the engine's are (scripts/cli.ts): it prints a line, waits, and prints again, so that two runs at once
// interleave; with a second word, it ends with that exit code and message.
const STEPS = `import { Exit } from ${JSON.stringify(new URL("../scripts/cli.ts", import.meta.url).href)};
import { openLog } from ${JSON.stringify(new URL("../scripts/log.ts", import.meta.url).href)};
export async function run(argv, out) {
  const log = openLog("steps", argv, { label: "counted", ...out });
  for (let i = 0; i < 3; i++) { log.line(\`\${argv[0]} \${i}\`); await new Promise((done) => setTimeout(done, 30)); }
  if (argv[1]) throw new Exit(Number(argv[1]), "stopped");
}
`;

test("scripts run in the server at once, in different folders, each print and log only their own", async () => {
  const a = mkdtempSync(join(tmpdir(), "nxk-a-")),
    b = mkdtempSync(join(tmpdir(), "nxk-b-"));
  const env = { ...process.env, NXK_LOG: "" },
    logOf = (dir: string) => readLog(join(dir, ".nxk", "log.jsonl"));
  try {
    const steps = script(a, "steps.mjs", STEPS);
    const [x, y, sums, values] = await Promise.all([
      runScript(steps, ["x"], a, { env }),
      runScript(steps, ["y", "3"], b, { env }),
      runScript("sums.ts", ["--unit=price=10, margin=50%, target=1000"], a, { env }),
      runScript("people.ts", ["values", "--country=uk", "--field=home_tenure"], b, { env }),
    ]);
    assert.equal(x.text, "x 0\nx 1\nx 2");
    assert.equal(x.error, false);
    // What it said on ending comes after what it printed and a blank line, as stderr followed stdout from a process.
    assert.equal(y.text, "y 0\ny 1\ny 2\n\nstopped");
    assert.equal(y.error, true);
    assert.deepEqual(x.records.map(textOf), ["x 0", "x 1", "x 2"]);
    assert.equal(sums.error, false);
    assert.match(values.text, /home_tenure/);
    assert.deepEqual(
      logOf(a)
        .map((run) => run.tool)
        .sort(),
      ["steps", "sums"],
    );
    assert.deepEqual(
      logOf(b)
        .map((run) => run.tool)
        .sort(),
      ["people", "steps"],
    );
    assert.deepEqual(
      logOf(a)
        .find((run) => run.tool === "steps")
        ?.records.map(textOf),
      ["x 0", "x 1", "x 2"],
    );
    assert.deepEqual(
      logOf(b)
        .find((run) => run.tool === "steps")
        ?.records.map(textOf),
      ["y 0", "y 1", "y 2"],
    );
    assert.deepEqual(
      logOf(a)
        .find((run) => run.tool === "sums")
        ?.records.map(textOf),
      sums.text.split("\n"),
    );
    assert.deepEqual(
      logOf(b)
        .find((run) => run.tool === "people")
        ?.records.map(textOf),
      values.text.split("\n"),
    );
  } finally {
    for (const dir of [a, b]) rmSync(dir, { recursive: true, force: true });
  }
});

test("a tool's folder may be new inside the project; one outside it that does not exist is a slip, refused", () => {
  const project = mkdtempSync(join(tmpdir(), "nxk-folder-"));
  const env = { CLAUDE_PROJECT_DIR: project };
  assert.equal(folderOf({}, env), project);
  assert.equal(folderOf({ folder: "work" }, env), join(project, "work"));
  assert.ok(existsSync(join(project, "work")));
  // A path with a "/" copied as "-" is outside the project, and nothing is made there.
  const slip = `${project}-copy/uat`;
  assert.throws(() => folderOf({ folder: slip }, env), /^Error: No folder .*-copy\/uat\. Give the project folder, /);
  assert.ok(!existsSync(slip));
  // A folder outside the project that is there is used as it is.
  assert.equal(folderOf({ folder: tmpdir() }, env), tmpdir());
  rmSync(project, { recursive: true });
});
