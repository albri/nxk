#!/usr/bin/env node
// The right answers to the cases that read a saved scan past its summary (group by group, or fact by fact). Their
// graders quote these figures; when a case's planted answers or the people files change, run this and update the
// graders. Nothing is sent: the saved scans are the cases' own synthetic answers. (The research cases about real
// products, pet-insurance-research-uk, prize-savings-research-uk and score-draw-research-uk, are keyed to published
// tables, kept in each case's graders/source/.)
//
//   node evals/truth.ts
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { SavedAnswer } from "../scripts/scan.ts";
import { linesOf } from "./lib.ts";

/** A case's folder as its seed leaves it, in a temporary directory: { at, done }. */
function seeded(name: string) {
  const at = mkdtempSync(join(tmpdir(), `nxk-truth-${name}-`));
  execFileSync("bash", [new URL(`./${name}/seed.sh`, import.meta.url).pathname], { cwd: at });
  return { at, done: () => rmSync(at, { recursive: true, force: true }) };
}

const one = (x: number) => (100 * x).toFixed(1);

// The laundry versions read for each group the question names, as options_scan reads them.
const laundry = seeded("options-groups-laundry-us");
const parents = "own_dependent_children_at_home=1|2|3|4|5|6_or_more";
const groups = [
  "home_tenure=rented_without_government_housing_assistance,age_years=18..29",
  parents,
  "age_years=65..120",
  `${parents},household_income_before_tax_per_year=under_25000_usd|25000_to_49999_usd`,
  `${parents},household_income_before_tax_per_year=150000_to_199999_usd|200000_usd_or_more`,
];
const read = execFileSync(
  "node",
  [
    new URL("../scripts/scan.ts", import.meta.url).pathname,
    ".nxk/scans/options",
    ".nxk/scans/options/laundry-versions.json",
    "--country=us",
    "--read",
    `--who=${groups.join("; ")}`,
  ],
  { cwd: laundry.at, encoding: "utf8" },
);
console.log(
  `options-groups-laundry-us (base, cheaper, weekly; simulated):\n  ${read
    .split("\n")
    .filter((l) => /^ {2}[\d.]+% base/.test(l))
    .map((l, i) => `${groups[i]}: ${l.trim()}`)
    .join("\n  ")}`,
);
laundry.done();

// What draws people to each paperwork offer: its highest and lowest answers against its own answer with nothing known.
const paperwork = seeded("ideas-drivers-paperwork-uk");
console.log("\nideas-drivers-paperwork-uk (simulated; the answer against the offer's own with nothing known):");
for (const offer of ["app", "clerk", "pack"]) {
  const scan = join(paperwork.at, ".nxk/scans/ideas-uk.spec", `scan-${offer}.jsonl`);
  const lines: SavedAnswer[] = linesOf(scan).map((l) => JSON.parse(l));
  // Every scan saves its answer with nothing known.
  const base = (lines.find((l) => l.id === "base") as SavedAnswer).p,
    rest = lines.filter((l) => l.id !== "base").sort((a, b) => b.p - a.p);
  const show = (l: SavedAnswer) => `${l.id.split(".").pop()} ${one(l.p)}`;
  console.log(
    `  ${offer} (${one(base)} with nothing known): up ${rest.slice(0, 4).map(show).join(", ")}; down ${rest.slice(-4).reverse().map(show).join(", ")}`,
  );
}
paperwork.done();
