#!/usr/bin/env node
// Runs every count in counts.txt on two people files, made-up and real, with nxk's own command (scripts/people.ts),
// and writes the shares side by side: each count's share on both, the gap, and whether it matches by the rule in
// counts.txt. Nothing is sent anywhere and it costs nothing.
//
//   node evals/real-us/run.ts --real=<people file>
//   node evals/real-us/run.ts --real=<people file> --made-up=<people file> --out=<results.json> --checked=2026-11-17
//
//   --real     real US adults in nxk's people-file format (packed like maps/us-people.bin.gz, or JSON as
//              scripts/pull.ts writes it), drawn so that they stand for all adults
//   --made-up  the made-up people (default: the US people shipped in maps/)
//   --out      where to write the shares (default: results-<checked>.json beside this file)
//   --checked  the date the results carry (default: today)
//
// It prints the table as Markdown. The results file holds shares only, never a person.
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { argsOf, isMain, usage } from "../../scripts/cli.ts";
import { readPeopleFile, type PeopleFile } from "../../scripts/population.ts";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "../..");
const PEOPLE = resolve(ROOT, "scripts/people.ts");

/** A count in counts.txt: its id, the command it runs, what it counts in plain words, and the block's other keys. */
export interface Count {
  id: string;
  run: string;
  what: string;
  [key: string]: string;
}

/** A reach's step: the requirement, and the share left after it. */
export interface Step {
  after: string;
  share: number;
}

/** A count's share on one people file, in every 100 (shareOf); for a reach, the share left after each step too. */
export interface Share {
  share: number;
  steps?: Step[];
}

/** Whether a made-up share matches a real one (verdict): the gap in points, the ratio, and the verdict. */
export interface Verdict {
  gap: number;
  ratio: number | null;
  verdict: "match" | "gap";
}

/** A count's row in the results file: its shares on both files and its verdict, or why it could not be run. */
interface ResultRow extends Partial<Omit<Verdict, "verdict">> {
  id: string;
  what: string;
  run: string;
  made_up?: number;
  real?: number;
  verdict?: Verdict["verdict"] | "unusable";
  why?: string;
  steps?: { after: string; made_up: number; real: number | undefined }[];
}

/** The counts in counts.txt: blocks of "key: value" lines, one block a count, separated by blank lines. */
export function readCounts(text: string): Count[] {
  return text
    .split(/\n\s*\n/)
    .map((block) =>
      Object.fromEntries(
        block
          .split("\n")
          .filter((line) => /^[a-z]+: /.test(line))
          .map((line) => [line.slice(0, line.indexOf(":")), line.slice(line.indexOf(":") + 2).trim()]),
      ),
    )
    .filter((count): count is Count => Boolean(count.id && count.run));
}

/**
 * Whether a made-up share matches a real one, both in every 100: within 2 points, or, for a real share under 10, a
 * ratio of made-up to real between 0.8 and 1.25.
 */
export function verdict(madeUp: number, real: number): Verdict {
  const gap = madeUp - real,
    ratio = real > 0 ? madeUp / real : null;
  const close = Math.abs(gap) <= 2 + 1e-9;
  const inRatio = real < 10 && ratio !== null && ratio >= 0.8 - 1e-9 && ratio <= 1.25 + 1e-9;
  return {
    gap: Math.round(100 * gap) / 100,
    ratio: ratio === null ? null : Math.round(1000 * ratio) / 1000,
    verdict: close || inRatio ? "match" : "gap",
  };
}

/** A count's share of adults (or of the audience) in every 100, from what scripts/people.ts printed. */
export function shareOf(command: string, text: string): Share {
  if (command === "count") {
    const base = /(\d+) people(?:\)|, [\d.]+% of adults\)):\s*$/m.exec(text);
    const group = /: (\d+) people, [\d.]+% of (?:adults|this audience)/.exec(text);
    if (!base || !group) throw new Error(`Could not read a count from: ${text.slice(0, 300)}`);
    return { share: Math.round((10000 * Number(group[1])) / Number(base[1])) / 100 };
  }
  if (command === "reach") {
    const steps = [...text.matchAll(/^\s+([\d.]+) remain after: (.*)$/gm)].map((m) => ({
      after: m[2],
      share: Number(m[1]),
    }));
    const left = /^So ([\d.]+) in every 100 can be reached/m.exec(text);
    if (!left) throw new Error(`Could not read a reach from: ${text.slice(0, 300)}`);
    return { share: Number(left[1]), steps };
  }
  throw new Error(`Only count and reach are compared, not ${command}`);
}

/** Runs one count on one people file with nxk's own command, as a shell would. */
function runCount(count: Count, people: string) {
  const [command, ...flags] = count.run.split(/\s+/);
  const done = spawnSync(process.execPath, [PEOPLE, command, "--country=us", ...flags, `--people=${people}`], {
    cwd: ROOT,
    env: { ...process.env, NXK_LOG: "off" },
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
  if (done.status !== 0) throw new Error((done.stderr || done.stdout || `exit ${done.status}`).trim());
  return shareOf(command, done.stdout);
}

/** A people file as the results describe it: how many people, its source's name and dates, and its hash. */
interface About {
  people: number;
  sha256: string;
  [detail: string]: unknown;
}

/** What the results say about a people file: its own description, never a person. */
function describe(path: string): { file: PeopleFile; about: About } {
  const bytes = readFileSync(path);
  const file = readPeopleFile(bytes);
  return {
    file,
    about: {
      people: file.people.length,
      ...Object.fromEntries(
        Object.entries(file.source ?? {}).filter(([key]) => ["name", "built", "drawn", "survey"].includes(key)),
      ),
      sha256: createHash("sha256").update(bytes).digest("hex"),
    },
  };
}

const one = (x: number | null | undefined) => (x === null || x === undefined ? "" : x.toFixed(1));

export function main(argv: string[]): void {
  const { flags } = argsOf(argv);
  // Every option takes a value: with no --real=<file>, or an option given without one, it says how to run it.
  if (!flags.real || Object.values(flags).includes("")) {
    console.log(usage(import.meta.url));
    process.exitCode = 1;
    return;
  }
  const checked = flags.checked || new Date().toISOString().slice(0, 10);
  const made = resolve(flags["made-up"] || resolve(ROOT, "maps/us-people.bin.gz"));
  const real = resolve(flags.real);
  const out = resolve(flags.out || resolve(HERE, `results-${checked}.json`));
  const counts = readCounts(readFileSync(resolve(HERE, "counts.txt"), "utf8"));
  const sides = { made_up: describe(made), real: describe(real) };
  for (const side of Object.values(sides)) if (side.file.country !== "us") throw new Error("Both files must be US");
  // The real file's own location is never written: it stays where the real records are.
  const madeAbout = {
    ...sides.made_up.about,
    path: relative(ROOT, made).startsWith("..") ? null : relative(ROOT, made),
  };
  const { sha256, ...realAbout } = sides.real.about;

  const results = counts.map((count) => {
    const row: ResultRow = { id: count.id, what: count.what, run: count.run };
    try {
      const m = runCount(count, made),
        r = runCount(count, real);
      Object.assign(row, { made_up: m.share, real: r.share }, verdict(m.share, r.share));
      if (m.steps) {
        // The same count ran on both files, so the real one has its steps too.
        const realSteps = r.steps as Step[];
        row.steps = m.steps.map((step, k) => ({ after: step.after, made_up: step.share, real: realSteps[k]?.share }));
      }
    } catch (error) {
      const why = error instanceof Error ? error.message : error;
      Object.assign(row, { verdict: "unusable", why: String(why).split("\n")[0] });
    }
    return row;
  });

  const matched = results.filter((row) => row.verdict === "match").length;
  const report = {
    checked,
    what: [
      "Each count run with nxk's own command (scripts/people.ts) on made-up and on real US adults.",
      "Shares are in every 100 adults, or in every 100 of the audience for a reach given one.",
      "Gap is made-up minus real, in points.",
    ].join(" "),
    tolerance:
      "A count matches if the made-up share is within 2 points of the real share, or, for real shares under 10, if made-up divided by real is between 0.8 and 1.25.",
    made_up: madeAbout,
    real: realAbout,
    matched,
    counted: results.length,
    results,
  };
  writeFileSync(out, `${JSON.stringify(report, null, 2)}\n`);

  console.log("| Count | Made-up | Real | Gap | Verdict |");
  console.log("| --- | ---: | ---: | ---: | --- |");
  for (const row of results)
    console.log(
      `| ${row.what} | ${one(row.made_up)} | ${one(row.real)} | ${row.gap === undefined ? "" : `${row.gap > 0 ? "+" : ""}${row.gap.toFixed(1)}`} | ${row.verdict} |`,
    );
  console.log(`\n${matched} of ${results.length} match. Shares written to ${relative(process.cwd(), out) || out}.`);
}

if (isMain(import.meta.url)) main(process.argv.slice(2));
