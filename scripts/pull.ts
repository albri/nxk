#!/usr/bin/env node
// More people for a narrow audience, drawn from PersonaGen itself. The 200,000 people shipped with nxk are
// enough for most questions; an audience of under a few hundred of them (nurses who rent, parents of under-fives in
// Wales) is too few to count on. This asks PersonaGen to draw people who all match, and saves them as JSON, which every
// other tool reads beside the packed shipped file, with --people=<file>.
//
//   node scripts/pull.ts --country=uk --among=home_tenure=rented_from_a_private_landlord_or_letting_agency,age_years=25..34 --count=2000
//   node scripts/pull.ts --country=uk --among=... --check        size the audience only; nobody is drawn
//
//   --among   the audience, in the same form as the other tools: field=code|code, or field=low..high for a number
//   --count   how many people to draw (default 2000; a free PersonaGen key allows 100,000 a month)
//   --seed    the draw's name, so the same command draws the same people (default from the audience)
//   --out     where to save them (default .nxk/people-<country>-<seed>.json.gz)
//
// It needs a PersonaGen key (https://personagen.dev/signup): the plugin's personagen_api_key setting, PERSONAGEN_API_KEY
// or the file ~/.config/nxk/personagen-key (decision-model.ts reads them all), never printed. PERSONAGEN_URL names another PersonaGen, such as a local one.
// Figures from these people are of the audience, not of adults: say so in the reply.
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { gzipSync } from "node:zlib";
import { argsOf, cli, usageExit, type Out, type RunContext } from "./cli.ts";
import { PERSONAGEN_KEY_HOW, personagenKey } from "./decision-model.ts";
import { openLog } from "./log.ts";
import { loadMap, type CodedAs, type Field, type InterestAs, type JsonRow, type PeopleSource } from "./population.ts";

/**
 * One person as PersonaGen returns them: by section (identity, work, ...), each field's value: a code, a number, a
 * coded value as { code, title } (a place, an occupation), a list of those, or null for none. The interests section
 * lists the person's specific interests, and the families and the rest as codes.
 */
export interface Persona {
  interests?: { interests?: InterestAs[]; [name: string]: unknown };
  [section: string]: Record<string, unknown> | undefined;
}

/** How PersonaGen sizes an audience (validate): its share of adults, a range, and the filter that narrows it most. */
export interface Sizing {
  estimated_share?: string | number;
  range?: unknown;
  narrowest_filter?: { field?: string; [detail: string]: unknown };
}

/** PersonaGen's filters: the codes a field may take, or the range of a number. */
export type Filters = Record<string, string[] | { min: number; max: number }>;

// A coded value is an object, { code, title }; any other value is its own code.
const codeOf = (v: unknown) =>
  v !== null && typeof v === "object" && !Array.isArray(v) ? String((v as CodedAs).code) : String(v);

/** Conditions in the tools' form ("a=x|y", "age_years=25..34") as PersonaGen's filters. */
export function filtersOf(among: string): Filters {
  const filters: Filters = {};
  for (const text of among.split(",").filter(Boolean)) {
    const [name, want = ""] = text.split("=");
    if (!name || !want) throw new Error(`"${text}" should be field=value`);
    if (/^-?\d+(\.\d+)?\.\.-?\d+(\.\d+)?$/.test(want)) {
      const [min, max] = want.split("..").map(Number);
      filters[name] = { min, max };
    } else filters[name] = want.split("|");
  }
  return filters;
}

/**
 * One persona from PersonaGen as a row of the map: a value as its position in the field's list, a list of positions for
 * a list, a number for a number, -1 for a value the map does not list and null for none. The same form as the people
 * shipped with the map (scripts/build-maps.ts).
 */
export function rowOf(fields: Field[], person: Persona): JsonRow {
  return fields.map((field) => {
    const [group, name] = field.path.split(".");
    const interests = person.interests ?? {};
    const raw =
      group !== "interests"
        ? person[group]?.[name]
        : name === "interests"
          ? (interests.interests ?? []).map((i) => i.specific)
          : (interests[name] ?? []);
    if (field.quantiles)
      return raw !== null && raw !== undefined && raw !== "" && Number.isFinite(Number(raw)) ? Number(raw) : null;
    const index = (code: string) => (field.values ?? []).findIndex((v) => v.code === code);
    if (Array.isArray(raw)) return raw.map((v) => index(codeOf(v))).filter((i) => i >= 0);
    return raw === null || raw === undefined ? null : index(codeOf(raw));
  });
}

/**
 * PersonaGen's refusal, said plainly. A filter it cannot pull by ("interests is not a filter field for UK") is named,
 * with the way round it, rather than passed on as the API's JSON.
 */
export function refusal(status: number, text: string): string {
  let issues: { field?: string; message?: string }[] = [];
  try {
    issues = JSON.parse(text)?.error?.issues ?? [];
  } catch {
    // Not JSON: the text is passed on as it came.
  }
  const said = issues.map((i) => [i.field, i.message].filter(Boolean).join(" ")).filter(Boolean);
  return said.length
    ? `PersonaGen cannot pull by this: ${said.join("; ")}. Pull by the other facts, and count this one among them with the people tool.`
    : `PersonaGen ${status}: ${text.slice(0, 300)}`;
}

/** Ask PersonaGen, waiting when it says to. `send` is fetch, or a stand-in for testing. Its answer is read as T. */
async function ask<T>(send: Send, url: string, body: object, key: string | undefined): Promise<T> {
  for (let attempt = 0; attempt < 30; attempt++) {
    const response = await send(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Accept-Encoding": "gzip", ...(key ? { "X-API-Key": key } : {}) },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(120000),
    });
    if (response.status === 429) {
      const text = await response.text();
      const seconds = Math.min(70, Number(/Retry in (\d+) seconds/.exec(text)?.[1]) || 15);
      await new Promise((done) => setTimeout(done, (seconds + 1) * 1000));
      continue;
    }
    if (!response.ok) throw new Error(refusal(response.status, await response.text()));
    return response.json() as Promise<T>;
  }
  throw new Error("PersonaGen kept asking to wait");
}

/** How a request is sent: fetch, or a stand-in for testing that answers with what ask reads of a response. */
export type Send = (
  url: string,
  init: { method: string; headers: Record<string, string>; body: string; signal: AbortSignal },
) => Promise<{ ok: boolean; status: number; json: () => Promise<unknown>; text: () => Promise<string> }>;

/** A draw from PersonaGen: whom, how many, under what name, and the key, the server and how to send. */
export interface PullRequest {
  country: string;
  filters: Filters;
  count: number;
  seed: string;
  key?: string;
  base?: string;
  send?: Send;
  /** Size the audience only. */
  checkOnly?: boolean;
}

/** Size the audience, then draw it: the sizing, and the raw personas ([] with `checkOnly`). */
export async function pull({
  country,
  filters,
  count,
  seed,
  key,
  base = "https://api.personagen.dev",
  send = fetch,
  checkOnly = false,
}: PullRequest): Promise<{ check: Sizing; people: Persona[] }> {
  const check = await ask<Sizing>(
    send,
    `${base}/${country}/personas/validate`,
    { count: Math.min(count, 1000), seed, filters },
    key,
  );
  if (checkOnly) return { check, people: [] };
  const people: Persona[] = [];
  for (let page = 1; people.length < count; page++) {
    const answer = await ask<{ data?: Persona[] }>(
      send,
      `${base}/${country}/personas`,
      {
        count: Math.min(1000, count - people.length),
        seed: `${seed}-${page}`,
        filters,
        exclude_sections: ["body_and_appearance"],
      },
      key,
    );
    if (!answer.data?.length) break;
    people.push(...answer.data);
  }
  return { check, people };
}

export async function run(argv: string[], out: Out, { folder, env = process.env }: RunContext): Promise<void> {
  const { flags } = argsOf(argv);
  if (!["uk", "us"].includes(flags.country) || !flags.among) throw usageExit(import.meta.url, out, argv);
  const key = personagenKey(env)?.key;
  if (!key)
    throw new Error(
      `No PersonaGen key: ${PERSONAGEN_KEY_HOW}. Without one, the 200,000 people shipped with nxk are used.`,
    );
  const log = openLog("pull", argv, out);
  const filters = filtersOf(flags.among);
  const count = Math.min(20000, Number(flags.count ?? 2000));
  const seed = flags.seed || `nxk-${flags.among.replace(/[^a-z0-9]+/gi, "-").slice(0, 40)}`;
  const { check, people } = await pull({
    country: flags.country,
    filters,
    count,
    seed,
    key,
    base: env.PERSONAGEN_URL || undefined,
    checkOnly: "check" in flags,
  });
  const narrow = check.narrowest_filter
    ? ` The filter that narrows it most is ${check.narrowest_filter.field ?? JSON.stringify(check.narrowest_filter)}.`
    : "";
  const share = check.estimated_share ?? "an unknown share";
  const range = check.range ? ` (range ${JSON.stringify(check.range)})` : "";
  log.line(`PersonaGen sizes this audience at ${share} of ${flags.country.toUpperCase()} adults${range}.${narrow}`);
  if ("check" in flags) return;
  const map = loadMap(flags.country);
  const rows = people.map((person) => rowOf(map.fields, person));
  const saved = resolve(folder, flags.out || `.nxk/people-${flags.country}-${seed}.json.gz`);
  mkdirSync(dirname(saved), { recursive: true });
  const source: PeopleSource = {
    name: "PersonaGen, drawn for an audience",
    audience: flags.among,
    filters,
    estimated_share: check.estimated_share ?? null,
    people: rows.length,
    seed,
    drawn: new Date().toISOString().slice(0, 10),
  };
  writeFileSync(
    saved,
    gzipSync(
      JSON.stringify({ country: flags.country, source, fields: map.fields.map((field) => field.path), people: rows }),
    ),
  );
  log.line(`Saved ${rows.length} people, all in this audience, to ${saved}.`);
  log.line(
    `Use them as people_file ${saved} (people, sweep, terms, probe) or "people" in suggest's suggestions. Every figure is then of this audience, not of adults.`,
  );
}

cli(import.meta.url, run);
