#!/usr/bin/env node
// Asks Jev every benchmark question for every drawn person, following SKILL.md
// and references/persona-generation.md. Answers are cached, so a rerun only
// fills in what is missing.
//
//   node benchmarks/run.mjs                 # all studies
//   node benchmarks/run.mjs --studies=a,b   # some studies
//   node benchmarks/run.mjs --dry-run       # draw people, count calls, spend nothing
//
// Needs JEV_API_KEY (or TYPESAFE_API_KEY). PERSONAGEN_API_KEY is optional; without
// it the PersonaGen demo route is used.

import { existsSync, mkdirSync, readFileSync, writeFileSync, appendFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const cacheDir = join(here, ".cache");
const args = Object.fromEntries(process.argv.slice(2).map(a => {
  const [k, v] = a.replace(/^--/, "").split("=");
  return [k, v ?? true];
}));

for (const file of [join(here, "..", ".env.local"), join(here, "..", ".env")]) {
  if (!existsSync(file)) continue;
  for (const line of readFileSync(file, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*"?([^"#]*)"?\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
  }
}

export const PEOPLE_PER_STUDY = 1000;
const CONCURRENCY = Number(args.concurrency ?? 5);
const JEV_URL = "https://api.typesafe.ai/v1/systemone";
const JEV_MODEL = "jev-latest";

// The published instruction, from references/persona-generation.md. Variants
// append one general sentence each and are only for testing changes to it.
export const INSTRUCTION = "Based on `respondent.profile`, which answer would this person give to `survey.questions.q.text` in the situation described in `survey.context`? The available answers are in `survey.questions.q.options`. Apply the person's stated circumstances; predict their response rather than recommending the best option in general.";
const VARIANTS = {
  principles: `

Think as this person:
- Answer from inside their life, with what they would know, remember and care about. Their own habits and history are familiar to them even when the profile does not mention them; infer what is most likely for someone living this life.
- Weigh all of their circumstances together, including stage of life, money, household, work, health and where they live, not only the most obvious one.
- Hold views as firmly or as loosely as this person would. Some people feel strongly and some have no real opinion.
- Be no more informed, sensible or consistent than a real person in their situation.`,
};
export const variant = args.variant ? String(args.variant) : null;
if (variant && !VARIANTS[variant]) throw new Error(`Unknown variant ${variant}`);
export const answersDir = join(cacheDir, variant ? `answers-${variant}` : "answers");

// Every draw is a broad or lightly filtered adult sample. Batches use distinct
// seeds so the people do not repeat.
export const DRAWS = {
  "uk-adults": { country: "uk", filters: null },
  "uk-adults-ewni": { country: "uk", filters: null, from: "uk-adults", exclude: { field: "origin.region", in: ["scotland"] } },
  "uk-homeowners": { country: "uk", filters: { homeownership_status: ["own_outright", "own_with_mortgage"] } },
  "uk-internet-users": { country: "uk", filters: { digital_engagement_intensity: ["essential_light", "selective_moderate", "mobile_heavy", "high_multi_platform"] } },
  "us-adults": { country: "us", filters: null },
};

// Options kept at the end in every order: they are not part of the scale or set.
const TAIL = /don.?t know|not sure|^other|none of the above|not applicable|never heard|do not expect/i;

export function field(person, path) {
  return path.split(".").reduce((o, k) => (o == null ? undefined : o[k]), person);
}

export function matches(person, rule) {
  const v = field(person, rule.field);
  if (rule.in) return rule.in.includes(v);
  return v >= rule.min && v <= rule.max;
}

export function loadStudies() {
  return JSON.parse(readFileSync(join(here, "studies.json"), "utf8")).studies;
}

async function personagen(country, body) {
  const headers = { "Content-Type": "application/json" };
  if (process.env.PERSONAGEN_API_KEY) headers["X-API-Key"] = process.env.PERSONAGEN_API_KEY;
  else headers["X-Demo"] = "true";
  const res = await fetch(`https://api.personagen.dev/${country}/personas`, {
    method: "POST", headers, body: JSON.stringify(body), signal: AbortSignal.timeout(120000),
  });
  const json = await res.json();
  if (!res.ok || !json.success) throw new Error(`PersonaGen ${res.status}: ${JSON.stringify(json).slice(0, 300)}`);
  if (json.metadata?.filtering?.warnings?.length) console.warn("PersonaGen warnings:", json.metadata.filtering.warnings);
  return json;
}

export async function loadDraw(name) {
  const spec = DRAWS[name];
  if (spec.from) {
    const base = await loadDraw(spec.from);
    return base.filter(p => !matches(p, spec.exclude));
  }
  const file = join(cacheDir, "draws", `${name}.json`);
  const withIds = people => people.map((p, i) => ({ ...p, id: `${name}#${i}` }));
  if (existsSync(file)) return withIds(JSON.parse(readFileSync(file, "utf8")).people);
  mkdirSync(dirname(file), { recursive: true });
  const people = [];
  const batches = [];
  for (let i = 0; people.length < 1200; i++) {
    const seed = `nxk-benchmark-${name}-${i + 1}`;
    const json = await personagen(spec.country, { count: 400, seed, ...(spec.filters ? { filters: spec.filters } : {}) });
    people.push(...json.data);
    batches.push({ seed, count: json.data.length, generator: json.metadata.generator_version, api: json.metadata.api_version });
  }
  writeFileSync(file, JSON.stringify({ name, spec, batches, people }));
  console.log(`Drew ${people.length} people for ${name}`);
  return withIds(people);
}

// Unordered options rotate between people. Ordered levels keep their order but
// reverse for every other person. Tail options stay last.
export function orderFor(study, index) {
  const n = study.options.length;
  const all = [...Array(n).keys()];
  const tail = all.filter(i => i >= (study.orderedLevels || 0) && TAIL.test(study.options[i]));
  const body = all.filter(i => !tail.includes(i));
  let order;
  if (study.orderedLevels) order = index % 2 ? [...body].reverse() : body;
  else { const r = index % body.length; order = [...body.slice(r), ...body.slice(0, r)]; }
  return [...order, ...tail];
}

function situation(study) {
  return [`It is ${study.surveyed}.`, study.context].filter(Boolean).join(" ");
}

export function request(study, person, order) {
  const options = order.map(i => study.options[i]);
  const respondent = person
    ? (() => {
        const { appearance, metadata, name, id, ...profile } = person;
        return { firstName: name.first_name, profile: { country: study.country, ...profile } };
      })()
    : { profile: { country: study.country } };
  return {
    model: JEV_MODEL,
    state: {
      respondent,
      survey: { context: situation(study), questions: { q: { text: study.question, options } } },
    },
    questions: {
      q: {
        type: "choice",
        instructions: INSTRUCTION + (variant ? VARIANTS[variant] : ""),
        criteria: Object.fromEntries(options.map(text => [text, null])),
      },
    },
  };
}

class Stop extends Error {}

async function ask(body) {
  const key = process.env.JEV_API_KEY || process.env.TYPESAFE_API_KEY;
  for (let attempt = 0; ; attempt++) {
    const started = Date.now();
    let res;
    try {
      res = await fetch(JEV_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(30000),
      });
    } catch (error) {
      if (attempt >= 4) throw error;
      await new Promise(r => setTimeout(r, 1000 * 2 ** attempt));
      continue;
    }
    if ([401, 402, 403].includes(res.status)) throw new Stop(`Jev HTTP ${res.status}: ${await res.text()}`);
    if ((res.status === 429 || res.status >= 500) && attempt < 5) {
      const wait = Number(res.headers.get("retry-after")) * 1000 || 1000 * 2 ** attempt;
      await new Promise(r => setTimeout(r, wait));
      continue;
    }
    if (!res.ok) throw new Error(`Jev HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`);
    const json = await res.json();
    const options = Object.keys(body.questions.q.criteria);
    const answer = json.answers?.q;
    const p = answer?.probabilities;
    if (!answer || !options.includes(answer.choice) || options.some(o => !Number.isFinite(p?.[o]) || p[o] < 0 || p[o] > 1)) {
      throw new Error("Invalid answer");
    }
    const total = options.reduce((s, o) => s + p[o], 0);
    if (Math.abs(total - 1) > 0.03) throw new Error("Invalid probability total");
    return { answer, usage: json.usage, model: json.model, ms: Date.now() - started };
  }
}

function readCache(file) {
  if (!existsSync(file)) return new Map();
  return new Map(readFileSync(file, "utf8").trim().split("\n").filter(Boolean).map(l => {
    const row = JSON.parse(l);
    return [row.person, row];
  }));
}

async function main() {
  if (!args["dry-run"] && !process.env.JEV_API_KEY && !process.env.TYPESAFE_API_KEY) {
    throw new Error("Missing JEV_API_KEY");
  }
  const wanted = args.studies ? String(args.studies).split(",") : null;
  const studies = loadStudies().filter(s => !wanted || wanted.includes(s.id));
  const limit = Number(args.limit ?? PEOPLE_PER_STUDY);
  mkdirSync(answersDir, { recursive: true });

  const jobs = [];
  for (const study of studies) {
    const people = (await loadDraw(study.draw)).slice(0, limit);
    const file = join(answersDir, `${study.id}.jsonl`);
    const done = readCache(file);
    people.forEach((person, index) => {
      if (!done.has(person.id)) jobs.push({ study, person, index, file });
    });
    const baseline = join(answersDir, `${study.id}.no-profile.jsonl`);
    if (!readCache(baseline).has("none")) jobs.push({ study, person: null, index: 0, file: baseline });
  }
  console.log(`${jobs.length} Jev calls to make across ${studies.length} studies.`);
  if (args["dry-run"]) return;

  let next = 0, ok = 0, failed = 0, tokens = 0;
  const started = Date.now();
  async function worker() {
    while (next < jobs.length) {
      const job = jobs[next++];
      const order = orderFor(job.study, job.index);
      try {
        const { answer, usage, model, ms } = await ask(request(job.study, job.person, order));
        tokens += usage?.input_tokens ?? 0;
        appendFileSync(job.file, JSON.stringify({
          person: job.person?.id ?? "none",
          order,
          p: job.study.options.map(o => answer.probabilities[o]),
          choice: job.study.options.indexOf(answer.choice),
          confidence: answer.confidence,
          model, ms, inputTokens: usage?.input_tokens,
        }) + "\n");
        ok++;
      } catch (error) {
        if (error instanceof Stop) { next = jobs.length; console.error(error.message); return; }
        failed++;
        appendFileSync(join(cacheDir, "failures.log"), `${job.study.id} ${job.person?.id ?? "none"} ${error.message}\n`);
      }
      if ((ok + failed) % 500 === 0) {
        const mins = (Date.now() - started) / 60000;
        console.log(`${ok + failed}/${jobs.length} · ${failed} failed · ${(tokens / 1e6).toFixed(1)}M input tokens · ${mins.toFixed(1)} min`);
      }
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  console.log(`Done: ${ok} answered, ${failed} failed, ${(tokens / 1e6).toFixed(2)}M input tokens.`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch(error => { console.error(error); process.exit(1); });
}
