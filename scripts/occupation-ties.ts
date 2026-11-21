// Which facts PersonaGen ties to a person's occupation only by broad group of jobs, read from the engine's evidence for
// build-maps.ts, and the line a figure prints when it reads one of them for a narrower occupation.
//
// PersonaGen links a fact to occupation through tables in its evidence: the fact by occupation, or occupation by the
// fact. Several facts about work are linked only through broad groups, by tables the engine modelled: in the UK, shift
// work, job level, organisation size, contract type, years with the employer and personal income go by the nine major
// groups. A nurse then has the shift work of professionals as a whole (lawyers, programmers, teachers), set apart only
// through other facts such as age, sex and hours: in the 4.0 people 5 in 100 nurses work shifts most of the time,
// against 25 in 100 care workers. Counted exactly, "nurses who work shifts" is the professionals' rate, so a figure that
// reads such a fact for one occupation says so beside it.
//
// The map keeps the ties as `occupation_ties`: { meaning, facts: { <fact>: { by, groups?, except? } } }. `by` is the
// occupation field the groups are made of; without `groups`, each of its values is a group of its own; `except` lists,
// by field, the occupations a finer table does tie the fact to. Left out: a fact a finer table ties to most
// occupations, and a fact with no table at all, which may still follow occupation by derivation (social grade does).
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describeConditions, matches, type Condition } from "./groups.ts";
import {
  valuesAt,
  type Field,
  type OccupationTie,
  type OccupationTies,
  type PeopleMap,
  type Row,
} from "./population.ts";

export const OCCUPATION: string[] = [
  "current_occupation_major_group",
  "current_occupation_group",
  "current_occupation",
];
const BROAD = "current_occupation_major_group";
// Occupations that make up this share of their broad groups or more are read as the groups themselves.
const WHOLE = 0.95;
const MEANING = [
  "Facts PersonaGen ties to a person's occupation only by broad groups of jobs.",
  "Within a group every occupation has the group's share of the fact, set apart only through other facts such as age, sex and hours.",
  "by: the occupation field the groups are made of; groups: its values that go together (each value alone when left out);",
  "except: occupations a finer table does tie the fact to.",
].join(" ");

/**
 * A table in the engine's evidence, as tiesFrom reads it: a conditional table gives the fact (`child`) by the values of
 * its `parents`, each value standing for the codes in `members` when it groups several.
 */
export interface EvidenceTable {
  kind: string;
  /** "validation_only" for a table kept only to check a build. */
  status?: string;
  child: { node: string };
  parents: { node: string; values: (string | number)[]; members?: Record<string, (string | number)[]> }[];
}

/** Every conditional table in a country's evidence (`folder`/<country>/<fact>/*.json), but those kept only to check. */
export function readEvidence(folder: string, country: string): EvidenceTable[] {
  const root = join(folder, country);
  return readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .flatMap((entry) =>
      readdirSync(join(root, entry.name))
        .filter((file) => file.endsWith(".json"))
        // Read as conditional tables: any other kind is left out below, before anything else is read of it.
        .map((file): EvidenceTable => JSON.parse(readFileSync(join(root, entry.name, file), "utf8"))),
    )
    .filter((table) => table.kind === "conditional" && table.status !== "validation_only");
}

/**
 * How the evidence ties one fact to occupation: the broad groupings it is tied by (each a list of groups of major-group
 * codes), the codes of finer occupation fields a table ties it to, and whether occupation is given by the fact, which
 * ties every occupation to it.
 */
interface FoundTie {
  broad: string[][][];
  fine: Map<string, Set<string>>;
  every: boolean;
}

/** The map's `occupation_ties` from the evidence's tables (readEvidence) and the map's fields. */
export function tiesFrom(tables: EvidenceTable[], fields: Field[]): OccupationTies {
  const codesOf = (name: string) =>
    new Set((fields.find((field) => field.name === name)?.values ?? []).map((v) => String(v.code)));
  const broad = codesOf(BROAD);
  const found = new Map<string, FoundTie>();
  const tieOf = (fact: string) => {
    if (!found.has(fact)) found.set(fact, { broad: [], fine: new Map(), every: false });
    return found.get(fact)!;
  };
  for (const table of tables) {
    if (table.kind !== "conditional" || table.status === "validation_only") continue;
    const child = table.child.node;
    for (const parent of table.parents) {
      const job = OCCUPATION.includes(parent.node);
      // Occupation by the fact: every occupation has its own share of it.
      if (OCCUPATION.includes(child) && !job) tieOf(parent.node).every = true;
      if (OCCUPATION.includes(child) || !job) continue;
      const values = parent.values.map(String);
      const groups = values.map((v) => (parent.members?.[v] ?? [v]).map(String));
      if (values.every((v) => broad.has(v))) tieOf(child).broad.push(values.map((v) => [v]));
      else if (groups.every((group) => group.every((code) => broad.has(code)))) tieOf(child).broad.push(groups);
      else {
        const codes = tieOf(child).fine.get(parent.node) ?? new Set();
        for (const code of groups.flat()) codes.add(code);
        tieOf(child).fine.set(parent.node, codes);
      }
    }
  }
  const facts: Record<string, OccupationTie> = {};
  for (const [fact, tie] of [...found].sort(([a], [b]) => a.localeCompare(b))) {
    if (!fields.some((field) => field.name === fact) || tie.every || !tie.broad.length) continue;
    const except: Record<string, string[]> = {};
    let fine = false;
    for (const [field, codes] of tie.fine) {
      const all = codesOf(field);
      const held = [...codes].filter((code) => all.has(code)).sort();
      if (held.length >= all.size / 2) fine = true;
      else if (held.length) except[field] = held;
    }
    if (fine) continue;
    const groups = tie.broad.reduce((finest, next) => (next.length > finest.length ? next : finest));
    facts[fact] = {
      by: BROAD,
      ...(groups.every((group) => group.length === 1) ? {} : { groups }),
      ...(Object.keys(except).length ? { except } : {}),
    };
  }
  return { meaning: MEANING, facts };
}

const words = (name: string) => name.replaceAll("_", " ");
const listed = (items: string[]) =>
  items.length < 3 ? items.join(" and ") : `${items.slice(0, -1).join(", ")} and ${items.at(-1)}`;
const some = (labels: string[]) =>
  labels.length > 3 ? `${labels.slice(0, 3).join("; ")}; and ${labels.length - 3} more` : labels.join("; ");

/**
 * The lines a figure needs when it reads a fact PersonaGen ties to occupation only by broad group (map.occupation_ties)
 * for a narrower occupation: one picked by a condition (nurses who work shifts) or split by (shift workers by
 * occupation group). `sets` are the figures' conditions, one list a figure (several for groups counted side by side),
 * each with every condition the figure is within (who, among, pictured) as conditionsOf makes them; `read` the names of
 * the fields they are split by. `people` are all the rows, to tell an occupation from its broad group. Lines to print,
 * or none: facts read the same way share one.
 */
export function broadLines(
  map: Pick<PeopleMap, "fields" | "occupation_ties">,
  people: Row[],
  sets: Condition[][],
  read: string[] = [],
): string[] {
  const facts = map.occupation_ties?.facts;
  if (!facts) return [];
  const nameOf = (condition: Condition) => condition.path.split(".").pop() ?? "";
  const fieldAt = (name: string) => map.fields.findIndex((field) => field.name === name);
  // The code of the one value a person holds in an occupation field, or null for none.
  const codeAt = (row: Row, f: number) => {
    const [v] = valuesAt(map.fields[f], row, f);
    return v === undefined ? null : (map.fields[f].values?.[v].code ?? null);
  };
  const splitBy = read.filter((name) => OCCUPATION.includes(name));
  // Each fact asked about: the occupations it is read for, with their broad groups, and the groups a split crosses.
  const found = new Map<string, { jobs: Map<string, string[]>; split: string[] | null }>();
  for (const conditions of sets) {
    const jobs = conditions.filter((c) => OCCUPATION.includes(nameOf(c)) && c.codes);
    // A split takes each field on its own: an occupation's line reads only the facts the group is picked by.
    const within = new Set(conditions.map(nameOf));
    const asked = [...new Set([...within, ...read])].filter((name) => facts[name]);
    if (!asked.length || (!jobs.length && !splitBy.length)) continue;
    const picked = jobs.length ? people.filter((row) => matches(jobs, row)) : [];
    const who = describeConditions(jobs);
    for (const name of asked) {
      const tie = facts[name];
      const b = fieldAt(tie.by);
      if (b < 0) continue;
      const values = map.fields[b].values ?? [];
      const groups = tie.groups ?? values.map((v) => [v.code]);
      // A person with no occupation is in no group.
      const groupOf = new Map<string | null, number>(
        groups.flatMap((group, g) => group.map((code): [string, number] => [code, g])),
      );
      const labelOf = (g: number) =>
        listed(groups[g].map((code) => values.find((v) => v.code === code)?.label ?? code));
      if (!found.has(name)) found.set(name, { jobs: new Map(), split: null });
      const entry = found.get(name)!;
      if (picked.length) {
        // Occupations a finer table ties the fact to have figures of their own.
        const own =
          tie.except &&
          Object.entries(tie.except).every(([field, codes]) => {
            const f = fieldAt(field);
            return (
              f >= 0 &&
              picked.every((row) => {
                const code = codeAt(row, f);
                return code !== null && codes.includes(code);
              })
            );
          });
        const touched = new Set(picked.map((row) => groupOf.get(codeAt(row, b))).filter((g) => g !== undefined));
        const whole = people.filter((row) => {
          const g = groupOf.get(codeAt(row, b));
          return g !== undefined && touched.has(g);
        }).length;
        if (!own && touched.size && picked.length < WHOLE * whole)
          entry.jobs.set(who, [...touched].sort((x, y) => x - y).map(labelOf));
      }
      if (within.has(name) && splitBy.some((by) => by !== tie.by || groups.some((group) => group.length > 1)))
        entry.split = groups.map((_, g) => labelOf(g)).filter((label) => !/^not in employment$/i.test(label));
    }
  }
  const ways = new Map<string, { jobs: Map<string, string[]>; split: string[] | null; facts: string[] }>();
  for (const [name, entry] of found) {
    if (!entry.jobs.size && !entry.split) continue;
    const key = JSON.stringify([[...entry.jobs], entry.split]);
    ways.set(key, { ...entry, facts: [...(ways.get(key)?.facts ?? []), words(name)] });
  }
  const SET_APART = "set apart only through other facts such as age, sex and hours";
  return [...ways.values()].flatMap(({ jobs, split, facts: read }) => {
    const what = listed(read);
    const lines: string[] = [];
    if (jobs.size === 1) {
      const [[who, labels]] = [...jobs];
      const theirs =
        labels.length > 1
          ? `have their broad groups' ${what} (${some(labels)})`
          : `have the ${what} of ${labels[0]} as a whole`;
      lines.push(
        [
          `Rough for this occupation: PersonaGen ties ${what} to occupation only by broad group, so ${who} ${theirs}, ${SET_APART}.`,
          `Do not quote or compare ${what} among them without a published figure.`,
        ].join(" "),
      );
    } else if (jobs.size > 1) {
      const groups = [...jobs].map(([who, labels]) => `${who}: ${labels.join(" or ")}`).join("; ");
      lines.push(
        [
          `Rough for these occupations: PersonaGen ties ${what} to occupation only by broad group,`,
          `so each has the ${what} of its broad group as a whole (${groups}), ${SET_APART}.`,
          `Do not quote or compare ${what} among them without a published figure.`,
        ].join(" "),
      );
    }
    if (split)
      lines.push(
        [
          `Rough by occupation: PersonaGen ties ${what} to occupation only by broad group (${some(split)}),`,
          `so the occupations within one share its ${what}, ${SET_APART}.`,
          `Do not quote or compare one occupation's ${what} without a published figure.`,
        ].join(" "),
      );
    return lines;
  });
}
