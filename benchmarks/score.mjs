#!/usr/bin/env node
// Scores the cached answers against the published studies, writes
// benchmarks/results.json and refreshes the generated blocks in methodology.md.
//
//   node benchmarks/score.mjs

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { loadStudies, loadDraw, matches, PEOPLE_PER_STUDY, answersDir, variant } from "./run.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const EXAMPLE_STUDY = "fsa-food-price-concern";
const CLEAR_GAP = 10; // percentage points between two published groups
const MIN_GROUP = 30; // simulated people needed in each group
const FAINT_GAP = 5; // an nxk gap smaller than this points the right way only faintly

const mean = xs => xs.reduce((a, b) => a + b, 0) / xs.length;
const argmax = xs => xs.indexOf(Math.max(...xs));
const pct = x => Math.round(x * 100);

function readRows(file) {
  if (!existsSync(file)) return [];
  return readFileSync(file, "utf8").trim().split("\n").filter(Boolean).map(l => JSON.parse(l));
}

function average(rows, k) {
  return Array.from({ length: k }, (_, i) => 100 * mean(rows.map(r => r.p[i])));
}

function ranks(xs) {
  const sorted = xs.map((v, i) => [v, i]).sort((a, b) => a[0] - b[0]);
  const r = Array(xs.length);
  for (let i = 0; i < sorted.length;) {
    let j = i;
    while (j + 1 < sorted.length && sorted[j + 1][0] === sorted[i][0]) j++;
    for (let t = i; t <= j; t++) r[sorted[t][1]] = (i + j) / 2;
    i = j + 1;
  }
  return r;
}

function spearman(a, b) {
  const ra = ranks(a), rb = ranks(b);
  const ma = mean(ra), mb = mean(rb);
  const cov = mean(ra.map((x, i) => (x - ma) * (rb[i] - mb)));
  const sa = Math.sqrt(mean(ra.map(x => (x - ma) ** 2)));
  const sb = Math.sqrt(mean(rb.map(x => (x - mb) ** 2)));
  return cov / (sa * sb);
}

// Exact: same leading answer. Close: one step away on the same side of a
// scale, or, with four or more unordered answers, the published leader is the
// crowd's second choice.
function leader(study, crowd, real) {
  const c = argmax(crowd), r = argmax(real);
  if (c === r) return "exact";
  const levels = study.orderedLevels || 0;
  if (c < levels && r < levels) {
    const side = i => (levels % 2 ? Math.sign(i - (levels - 1) / 2) : i < levels / 2 ? -1 : 1);
    return Math.abs(c - r) === 1 && (levels % 2 || side(c) === side(r)) ? "close" : "miss";
  }
  const second = crowd.map((v, i) => [v, i]).sort((a, b) => b[0] - a[0])[1][1];
  if (!levels && crowd.length >= 4 && second === r) return "close";
  return "miss";
}

async function scoreStudy(study, limit = Infinity) {
  const people = new Map((await loadDraw(study.draw)).slice(0, Math.min(limit, PEOPLE_PER_STUDY)).map(p => [p.id, p]));
  const rows = readRows(join(answersDir, `${study.id}.jsonl`)).filter(r => people.has(r.person));
  const base = readRows(join(answersDir, `${study.id}.no-profile.jsonl`))[0];
  if (!rows.length) return null;
  const k = study.options.length;
  const crowd = average(rows, k);
  const real = study.observed;
  const mae = mean(crowd.map((v, i) => Math.abs(v - real[i])));
  const noProfile = base ? base.p.map(x => 100 * x) : null;

  const crowdTop = argmax(crowd);
  const distance = rows.map(r => 50 * r.p.reduce((s, x, i) => s + Math.abs(100 * x - crowd[i]) / 100, 0));
  const topDiffers = rows.filter(r => argmax(r.p) !== crowdTop).length / rows.length;
  const tops = new Set(rows.map(r => argmax(r.p)));
  const realTop = argmax(real);
  const spreadBins = Array(10).fill(0);
  for (const r of rows) spreadBins[Math.min(9, Math.floor(r.p[realTop] * 10))]++;

  const groups = study.groups.map(g => {
    const buckets = g.buckets.map(b => {
      const inBucket = rows.filter(r => matches(people.get(r.person), b.match));
      return { label: b.label, n: inBucket.length, real: b.observed, nxk: inBucket.length ? average(inBucket, k) : null };
    });
    const gaps = [];
    for (let i = 0; i < buckets.length; i++) {
      for (let j = i + 1; j < buckets.length; j++) {
        const a = buckets[i], b = buckets[j];
        if (!a.real || !b.real || a.n < MIN_GROUP || b.n < MIN_GROUP) continue;
        for (let o = 0; o < k; o++) {
          const realGap = a.real[o] - b.real[o];
          if (Math.abs(realGap) < CLEAR_GAP) continue;
          const nxkGap = a.nxk[o] - b.nxk[o];
          gaps.push({ a: a.label, b: b.label, option: study.options[o], realGap, nxkGap, agrees: Math.sign(realGap) === Math.sign(nxkGap) });
        }
      }
    }
    const headline = [...gaps].sort((x, y) => Math.abs(y.realGap) - Math.abs(x.realGap))[0] ?? null;
    return { dimension: g.dimension, buckets, gaps, headline };
  });

  const byLeader = [...rows].sort((a, b) => a.p[realTop] - b.p[realTop]);
  const examples = [byLeader[0], byLeader[Math.floor(byLeader.length / 2)], byLeader.at(-1)].map(r => ({
    who: describe(people.get(r.person), study.country), p: r.p,
  }));

  return {
    id: study.id, title: study.title, question: study.question, examples, country: study.country, population: study.population,
    source: study.source, surveyed: study.surveyed, options: study.options, orderedLevels: study.orderedLevels,
    people: rows.length,
    real, crowd, noProfile,
    leader: leader(study, crowd, real),
    noProfileLeader: noProfile ? leader(study, noProfile, real) : null,
    mae, noProfileMae: noProfile ? mean(noProfile.map((v, i) => Math.abs(v - real[i]))) : null,
    rankAgreement: k >= 4 ? spearman(crowd, real) : null,
    noProfileRankAgreement: noProfile && k >= 4 ? spearman(noProfile, real) : null,
    spread: { distance: mean(distance), topDiffers, distinctTops: tops.size, bins: spreadBins, binsFor: study.options[realTop] },
    groups,
    inputTokens: rows.reduce((s, r) => s + (r.inputTokens ?? 0), 0),
  };
}

const words = s => String(s ?? "").replace(/_/g, " ");
function describe(p, country) {
  const income = words(p.economic.household_income_band_estimate).replace(/(\d+)k to (\d+)k (gbp|usd)/, (_, a, b, c) => `${c === "gbp" ? "£" : "$"}${a}–${b}k`).replace(/under (\d+)k (gbp|usd)/, (_, a, c) => `under ${c === "gbp" ? "£" : "$"}${a}k`).replace(/over (\d+)k (gbp|usd)/, (_, a, c) => `over ${c === "gbp" ? "£" : "$"}${a}k`);
  return `${p.name.first_name}, ${p.identity.age}, ${words(p.work.occupation_title || p.work.employment_status).toLowerCase()}, ${words(p.origin.region)} · household ${income} · ${words(p.economic.financial_pressure_context)} · ${words(p.household.housing_tenure)}`;
}

// ---------- charts ----------

const BLOCKS = " ▏▎▍▌▋▊▉█";
function bar(value, width = 20, max = 100) {
  const units = Math.max(0, Math.min(1, value / max)) * width * 8;
  const full = Math.floor(units / 8);
  const part = Math.round(units % 8);
  return ("█".repeat(full) + (part ? BLOCKS[part] : "")).padEnd(width, " ");
}
const SPARK = " ▁▂▃▄▅▆▇█";
function spark(bins) {
  const max = Math.max(...bins);
  return bins.map(b => (b === 0 ? "·" : SPARK[Math.max(1, Math.round((b / max) * 8))])).join("");
}
const clip = (s, n) => (s.length > n ? s.slice(0, n - 1) + "…" : s).padEnd(n, " ");
const signed = x => `${x > 0 ? "+" : x < 0 ? "−" : "±"}${Math.abs(Math.round(x))}`;
const mark = { exact: "Exact", close: "One step off", miss: "Missed" };
const flag = c => (c.country === "uk" ? "UK" : "US");
const plain = s => String(s).replace(/[‘’]/g, "'").replace(/[“”]/g, '"');

function studyChart(s) {
  const width = Math.min(34, Math.max(...s.options.map(o => o.length)));
  const lines = [`${s.title} · ${s.source.organisation.split(" / ")[0]}, ${s.surveyed}`, `${"".padEnd(width)}  Real survey              nxk crowd`];
  s.options.forEach((o, i) => {
    lines.push(`${clip(plain(o), width)}  ${bar(s.real[i], 18)} ${String(Math.round(s.real[i])).padStart(3)}   ${bar(s.crowd[i], 18)} ${String(Math.round(s.crowd[i])).padStart(3)}`);
  });
  return lines.join("\n");
}

function render(results) {
  const all = results;
  const exact = all.filter(s => s.leader === "exact").length;
  const close = all.filter(s => s.leader === "close").length;
  const npExact = all.filter(s => s.noProfileLeader === "exact").length;
  const npClose = all.filter(s => s.noProfileLeader === "close").length;
  const gaps = all.flatMap(s => s.groups.flatMap(g => g.gaps));
  const agreed = gaps.filter(g => g.agrees).length;
  const headlines = all.flatMap(s => s.groups.filter(g => g.headline).map(g => ({ s, g })));
  const headAgreed = headlines.filter(h => h.g.headline.agrees).length;
  const headClear = headlines.filter(h => h.g.headline.agrees && Math.abs(h.g.headline.nxkGap) >= FAINT_GAP).length;
  const distance = mean(all.map(s => s.spread.distance));
  const differs = mean(all.map(s => s.spread.topDiffers));
  const mae = mean(all.map(s => s.mae));
  const npMae = mean(all.filter(s => s.noProfileMae != null).map(s => s.noProfileMae));
  const rank = mean(all.filter(s => s.rankAgreement != null).map(s => s.rankAgreement));
  const npRank = mean(all.filter(s => s.noProfileRankAgreement != null && !Number.isNaN(s.noProfileRankAgreement)).map(s => s.noProfileRankAgreement));
  const people = all.reduce((t, s) => t + s.people, 0);
  const tokens = all.reduce((t, s) => t + s.inputTokens, 0);

  const blocks = {};

  blocks.headline = [
    "```text",
    `${"Answers vary between people".padEnd(32)}${bar(differs * 100, 24)} ${pct(differs)}% of people's top answer differs from the crowd's`,
    `${"Group gaps point the same way".padEnd(32)}${bar(100 * headAgreed / headlines.length, 24)} ${headAgreed} of ${headlines.length} biggest published gaps (${headClear} clearly)`,
    `${"Leading answer exact or close".padEnd(32)}${bar(100 * (exact + close) / all.length, 24)} ${exact + close} of ${all.length} questions (${exact} exact)`,
    "```",
  ].join("\n");

  blocks.setup = [
    "| | |",
    "| --- | --- |",
    `| Studies | ${all.length} questions from ${new Set(all.map(s => s.source.name)).size} published surveys, UK and US |`,
    `| People | ${PEOPLE_PER_STUDY.toLocaleString("en-GB")} PersonaGen profiles per question, ${people.toLocaleString("en-GB")} answers in total |`,
    `| Model | Jev (\`jev-latest\`), one Choice question per request, as in [SKILL.md](SKILL.md) |`,
    `| Cost | ${(tokens / 1e6).toFixed(1)}M input tokens, about $${((tokens / 1e6) * 0.042).toFixed(2)} for the whole run |`,
  ].join("\n");

  blocks.spread = [
    "| Question | Probability each person gives the real leading answer, 0 → 100% | Top answer differs from crowd |",
    "| --- | --- | ---: |",
    ...all.map(s => `| ${s.title} (${flag(s)}) | \`${spark(s.spread.bins)}\` ${plain(clip(s.spread.binsFor, 22).trim())} | ${pct(s.spread.topDiffers)}% |`),
  ].join("\n");

  blocks.gaps = [
    "| Question | Groups compared | Answer | Real gap | nxk gap | Same way? |",
    "| --- | --- | --- | ---: | ---: | :---: |",
    ...headlines.map(({ s, g }) => {
      const h = g.headline;
      return `| ${s.title} (${flag(s)}) | ${plain(h.a)} vs ${plain(h.b)} | ${plain(h.option)} | ${signed(h.realGap)} | ${signed(h.nxkGap)} | ${!h.agrees ? "No" : Math.abs(h.nxkGap) >= FAINT_GAP ? "Yes" : "Faintly"} |`;
    }),
  ].join("\n");

  blocks.gapsAll = `"Faintly" means the right way, but by less than ${FAINT_GAP} points. Across every pair of published groups that differ by ${CLEAR_GAP} points or more on an answer, nxk's gap points the same way in ${agreed} of ${gaps.length} (${pct(agreed / gaps.length)}%).`;

  blocks.leaders = [
    "| Question | Leading answer | Options in the right order | Average gap per answer |",
    "| --- | --- | ---: | ---: |",
    ...all.map(s => `| ${s.title} (${flag(s)}) | ${mark[s.leader]} | ${s.rankAgreement == null ? "–" : s.rankAgreement.toFixed(2)} | ${s.mae.toFixed(1)} pts |`),
  ].join("\n");

  blocks.baseline = [
    "| | Model alone, no person | nxk crowd |",
    "| --- | ---: | ---: |",
    `| Leading answer exact or one step off | ${npExact + npClose} of ${all.length} (${npExact} exact) | ${exact + close} of ${all.length} (${exact} exact) |`,
    `| Options in the right order (1 = perfect, questions with 4+ answers) | ${npRank.toFixed(2)} | ${rank.toFixed(2)} |`,
    `| Average gap per answer | ${npMae.toFixed(1)} pts | ${mae.toFixed(1)} pts |`,
    `| Group gaps pointing the same way | None, everyone gets one answer | ${headAgreed} of ${headlines.length} (${headClear} clearly) |`,
  ].join("\n");

  const ex = all.find(s => s.id === EXAMPLE_STUDY) ?? all[0];
  blocks.example = "```text\n" + [
    `${ex.title}: "${plain(ex.question)}"`,
    "",
    ...ex.examples.flatMap(e => [
      e.who,
      ...ex.options.map((o, i) => `  ${clip(plain(o), 22)} ${bar(e.p[i] * 100, 20)} ${String(pct(e.p[i])).padStart(3)}%`),
      "",
    ]),
  ].join("\n").trimEnd() + "\n```";

  blocks.charts = all.map(s => "```text\n" + studyChart(s) + "\n```").join("\n\n");

  blocks.sources = [
    "| Question | Source | Surveyed | Population |",
    "| --- | --- | --- | --- |",
    ...all.map(s => `| ${s.title} | [${s.source.name}](${s.source.url}) | ${s.surveyed} | ${s.population} |`),
  ].join("\n");

  const ratios = headlines.map(h => Math.abs(h.g.headline.nxkGap) / Math.abs(h.g.headline.realGap)).sort((a, b) => a - b);
  const scaled = all.filter(s => s.orderedLevels >= 4);
  const endShare = key => mean(scaled.map(s => s[key][0] + s[key][s.orderedLevels - 1]));
  const midShare = key => mean(scaled.filter(s => s.orderedLevels % 2).map(s => s[key][(s.orderedLevels - 1) / 2]));
  const diagnostics = {
    gapSizeRatio: ratios[Math.floor(ratios.length / 2)],
    scaleEnds: { real: endShare("real"), nxk: endShare("crowd") },
    scaleMiddle: { real: midShare("real"), nxk: midShare("crowd") },
  };
  return { blocks, totals: { diagnostics, headClear, exact, close, npExact, npClose, agreed, gaps: gaps.length, headAgreed, headlines: headlines.length, distance, differs, mae, npMae, rank, npRank, people, tokens } };
}

async function main() {
  const only = process.argv.find(a => a.startsWith("--studies="))?.split("=")[1].split(",");
  const limit = Number(process.argv.find(a => a.startsWith("--limit="))?.split("=")[1] ?? Infinity);
  const results = (await Promise.all(loadStudies().filter(s => !only || only.includes(s.id)).map(s => scoreStudy(s, limit)))).filter(Boolean);
  const { blocks, totals } = render(results);
  const publish = !variant && !only && limit === Infinity;
  if (publish) writeFileSync(join(here, "results.json"), JSON.stringify({ totals, studies: results.map(({ groups, ...s }) => ({
    ...s,
    groups: groups.map(g => ({ dimension: g.dimension, headline: g.headline, clearGaps: g.gaps.length, agreeing: g.gaps.filter(x => x.agrees).length, buckets: g.buckets })),
  })) }, null, 1));

  const file = join(here, "..", "methodology.md");
  if (publish && existsSync(file)) {
    let md = readFileSync(file, "utf8");
    for (const [name, body] of Object.entries(blocks)) {
      const re = new RegExp(`(<!-- generated:${name} -->)[\\s\\S]*?(<!-- /generated:${name} -->)`);
      md = md.replace(re, (_, open, close) => `${open}\n${body}\n${close}`);
    }
    writeFileSync(file, md);
  }
  console.log(JSON.stringify(totals, null, 1));
  if (process.argv.includes("--print")) for (const [k, v] of Object.entries(blocks)) console.log(`\n## ${k}\n${v}`);
}

main().catch(error => { console.error(error); process.exit(1); });
