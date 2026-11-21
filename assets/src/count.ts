#!/usr/bin/env node
// Counts the people behind the header and the opening figure, with nxk's own people tool, and keeps every command
// with its output:
//
//   node assets/src/count.ts
//
// It runs `node scripts/people.ts count --country=uk --who=...` once for each mix of age, work and how a person goes
// online, and writes:
//   data/idea-counts.txt   each command and what it printed, so anyone can run it again and compare
//   data/idea-counts.json  the number of people in each mix, which the figures round to 100
// It reads only the people shipped in maps/, sends nothing and needs no key.

import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("../../", import.meta.url));
const COUNTRY = "uk";

// How each person goes online decides the choice: the sign-up needs a smartphone.
const ONLINE = [
  { key: "phone", who: "devices_used_to_go_online=smartphone" },
  {
    key: "other",
    who: "internet_use_frequency=daily_or_almost_daily..less_than_weekly,devices_used_to_go_online!=smartphone",
  },
  { key: "none", who: "internet_use_frequency=not_used_in_the_last_3_months..never_used_the_internet" },
];
const AGE = [
  { key: "18-34", who: "age_years=18..34" },
  { key: "35-64", who: "age_years=35..64" },
  { key: "65-74", who: "age_years=65..74" },
  { key: "75+", who: "age_years=75..120" },
];
const WORK = [
  { key: "work", who: "economic_activity_status=in_employment" },
  { key: "retired", who: "economic_activity_status=retired" },
  {
    key: "other",
    who: "economic_activity_status=unemployed_and_looking_for_work|student_not_in_employment|looking_after_home_or_family|long_term_sick_or_disabled|other_not_working",
  },
];

const map = JSON.parse(readFileSync(new URL("maps/uk.json", `file://${ROOT}`), "utf8"));
const run = (args: string[]) =>
  execFileSync("node", ["scripts/people.ts", ...args], {
    cwd: ROOT,
    encoding: "utf8",
    env: { ...process.env, NXK_LOG: "off" },
  }).trim();

const log = [
  `# The counts behind assets/src/data/idea-counts.json, made by node assets/src/count.ts on ${new Date().toISOString().slice(0, 10)}.`,
  `# People: maps/${COUNTRY}-people.bin.gz, ${map.source.people} people, engine ${map.source.engine}, built ${map.source.built}.`,
  "# Each command is run from the repository root with NXK_LOG=off. It prints how many of the people are in the group.",
  "",
];
const cells = [];
for (const online of ONLINE)
  for (const age of AGE)
    for (const work of WORK) {
      const args = ["count", `--country=${COUNTRY}`, `--who=${[online.who, age.who, work.who].join(",")}`];
      const out = run(args);
      const n = Number(/: (\d+) people,/.exec(out)?.[1]);
      if (!Number.isInteger(n)) throw new Error(`No count in the output of ${args.join(" ")}:\n${out}`);
      log.push(`$ node scripts/people.ts ${args.map((a) => (a.includes("|") ? `'${a}'` : a)).join(" ")}`, out, "");
      cells.push({ online: online.key, age: age.key, work: work.key, n });
    }

// The totals the figures print, counted directly as a check on the cells.
const checks = [];
for (const online of ONLINE) {
  const args = ["count", `--country=${COUNTRY}`, `--who=${online.who}`];
  const out = run(args);
  const n = Number(/: (\d+) people,/.exec(out)?.[1]);
  const sum = cells.filter((c) => c.online === online.key).reduce((s, c) => s + c.n, 0);
  if (n !== sum) throw new Error(`${online.key}: counted ${n} directly but the cells add up to ${sum}`);
  log.push(`$ node scripts/people.ts ${args.join(" ")}`, out, "");
  checks.push({ online: online.key, n });
}
const total = cells.reduce((s, c) => s + c.n, 0);
if (total !== map.source.people) throw new Error(`The cells add up to ${total}, not ${map.source.people}`);

writeFileSync(new URL("data/idea-counts.txt", import.meta.url), log.join("\n"));
writeFileSync(
  new URL("data/idea-counts.json", import.meta.url),
  JSON.stringify(
    {
      _about:
        "People in each mix of how they go online, age and work, counted by node assets/src/count.ts; data/idea-counts.txt has every command and its output.",
      country: COUNTRY,
      people: map.source.people,
      engine: map.source.engine,
      built: map.source.built,
      online: Object.fromEntries(ONLINE.map((o) => [o.key, o.who])),
      age: Object.fromEntries(AGE.map((o) => [o.key, o.who])),
      work: Object.fromEntries(WORK.map((o) => [o.key, o.who])),
      cells,
    },
    null,
    1,
  ) + "\n",
);
console.log(
  `${cells.length} groups, ${total} people: ` +
    checks.map((c) => `${c.online} ${((100 * c.n) / total).toFixed(1)}%`).join(", "),
);
