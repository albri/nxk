// The generated people and their map: the packed people file (build-maps.ts writes it), each country's map and
// people loaded once in a process, the official counts of adults they stand for, and a person's values read from a
// row. Apart from loading, pure functions: no request is made here.
// `fields` are a map's fields; `people` are rows with one entry per field: a value's position in the field's list, a
// number for a numeric field, and null or -1 when the person has no listed value. A multi-valued field (kind "list")
// is an array of positions in a row read from JSON. In a packed row a list is a few words of bits, 15 to a word: bit
// v % 15 of word v / 15, the first word being the field's own entry and the rest the `field.words - 1` entries from
// `field.hi`. A longer list (the specific interests) is `field.slots`: the entries that each hold one of the person's
// values, or -1. Read rows through holds, valuesAt and numberAt, which take any of these.
import { readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { gunzipSync, gzipSync } from "node:zlib";
import { readIn } from "./cli.ts";

/** A country nxk ships a map and people for. */
export type Country = "uk" | "us";

/**
 * How firmly PersonaGen grounds a field: A is fitted to official statistics ("A-" a step below), B to other surveys,
 * C is modelled, and "-" is derived from other fields.
 */
export type Tier = "A" | "A-" | "B" | "C" | "-";

/** A coded value as a profile sends it: its official code and title (a local authority, an occupation). */
export interface CodedAs {
  code: string;
  title: string;
}

/** A specific interest as a profile sends it, the way PersonaGen lists a person's interests. */
export interface InterestAs {
  /** The family the interest belongs to, as read from the people's own interests. */
  family?: string;
  specific: string;
  intensity: string;
}

/** One value of a listed field. */
export interface FieldValue {
  code: string;
  label: string;
  /** The share of all adults holding it, as the map writes it: "33%", or "<1%" (shareOf reads it). */
  share: string;
  /** The catalogue's own share, of the field's universe (of people in work, for a work field), when it gives one. */
  share_of_universe?: string;
  /** What a profile sends for the value in place of its code: a coded value's code and title, or an interest. */
  as?: CodedAs | InterestAs[];
}

/** A numeric field's range: its lowest and highest values, and what the top means (100 means 100 or over). */
export interface NumericRange {
  min: number;
  max: number;
  unit?: string;
  note?: string;
}

/** Five points along a numeric field's range, among all adults: the 10th, 25th, 50th, 75th and 90th percentiles. */
export type Quantiles = Record<"p10" | "p25" | "p50" | "p75" | "p90", number>;

/** What every field says of itself. */
interface FieldInfo {
  /** The name a condition uses (age_years); unique in a map. */
  name: string;
  /** The group and the name (identity.age_years), as a people file lists its fields. */
  path: string;
  group: string;
  tier: Tier;
  meaning: string;
  /**
   * Where a packed people file keeps a list field, set on a copy of the field by placeLists: a list of up to 60
   * values in `words` words of bits, the first in the field's own entry and the rest from entry `hi`; a longer list
   * in `slots`, the entries that each hold one of the person's values. A field read with JSON people has none.
   */
  hi?: number;
  words?: number;
  slots?: number[];
}

/**
 * A field of listed values: categories, coded values (places, occupations), or a list a person can hold several of.
 * A long list runs from the most held value to the least.
 */
export interface ListedField extends FieldInfo {
  kind: "categorical" | "coded" | "list";
  values: FieldValue[];
  /** For a scale, its codes from the lowest or first to the last, without the values off it (not in work). */
  order?: string[];
  /** For a long list, how many values come first because 1% of adults or more hold them (3% for an interest). */
  common?: number;
  range?: undefined;
  quantiles?: undefined;
}

/** A numeric field (age, a count): a person holds a number in its range. */
export interface NumericField extends FieldInfo {
  kind: "range";
  range: NumericRange;
  quantiles: Quantiles;
  values?: undefined;
  order?: undefined;
  common?: undefined;
}

/** A fact recorded about people, as the map lists it. */
export type Field = ListedField | NumericField;

/** The kinds of field a map lists. */
export type FieldKind = Field["kind"];

/** The versions PersonaGen gives its catalogue (its `contract`), which a map keeps in its source. */
export interface PersonaGenVersions {
  api_version: string;
  persona_schema_version: string;
  generator_version: string;
  schema_version: string;
}

/** Where a map and the people shipped with it come from. */
export interface MapSource extends PersonaGenVersions {
  name: string;
  /** How many generated people the shares are counted from. */
  people: number;
  people_from: string;
  /** The version of the engine that wrote the people, when it was given. */
  engine?: string;
  shares: string;
  /** The day the map was built, as YYYY-MM-DD. */
  built: string;
}

/**
 * The map's `firms`: what the firm weight is, the firms an adult stands for on average, the share of adults with a
 * weight, and the employer sectors whose people mostly have none (no firm stands for them).
 */
export interface MapFirms {
  path: string;
  meaning: string;
  per_adult: number;
  held: string;
  not_counted: string[];
}

/**
 * A fact PersonaGen ties to occupation only by broad group (scripts/occupation-ties.ts): `by` is the occupation field
 * the groups are made of; `groups` its values that go together (each value alone when left out); `except`, by field,
 * the occupations a finer table does tie the fact to.
 */
export interface OccupationTie {
  by: string;
  groups?: string[][];
  except?: Record<string, string[]>;
}

/** The map's `occupation_ties`: what they are, and the facts tied, by name. */
export interface OccupationTies {
  meaning: string;
  facts: Record<string, OccupationTie>;
}

/**
 * A country's map (maps/<country>.json, which build-maps.ts writes): every fact recorded about people, its values and
 * the share of adults holding each.
 */
export interface PeopleMap {
  country: string;
  source: MapSource;
  fields: Field[];
  /** The firm weight the packed people keep for each person; none when the catalogue has no firm weight. */
  firms?: MapFirms;
  /** The facts tied to occupation only by broad group; none for a map built without the engine's evidence. */
  occupation_ties?: OccupationTies;
}

/** One person in a JSON people file: for each field, a value's position, a number, a list's positions, or null. */
export type JsonRow = (number | number[] | null)[];

/** One person in a packed people file: 16-bit entries, a view of the file's one buffer. */
export type PackedRow = Int16Array;

/** One person: a row with one entry per field, JSON or packed. Read it through holds, valuesAt and numberAt. */
export type Row = JsonRow | PackedRow;

/**
 * Where a people file's people come from, as its header says: the map's source for the people shipped with it, or,
 * for people drawn from PersonaGen (scripts/pull.ts), the audience, how PersonaGen sized it, and the draw.
 */
export interface PeopleSource {
  name: string;
  /** The audience people drawn from PersonaGen were drawn for, as conditions: figures are then of it, not of adults. */
  audience?: string;
  [detail: string]: unknown;
}

/** What every people file says: whose people they are, where they come from, and the paths of a row's fields. */
interface PeopleFileHeader {
  country: string;
  source: PeopleSource;
  fields: string[];
}

/** The line of JSON at the head of a packed people file. */
interface PackedHeader extends PeopleFileHeader {
  n: number;
  /** The entries of a row. */
  width: number;
  /** By field position: the entry where a list's further words of bits start, and how many words it takes. */
  hi: Record<string, number>;
  words: Record<string, number>;
  /** By field position: the entries that hold a longer list's values. */
  slots: Record<string, number[]>;
  /** The entry where a person's firm weight starts, when the file keeps firm weights. */
  firm?: number;
}

/** A packed people file, as readPeopleFile reads it: its rows are views of the one buffer read. */
export interface PackedPeopleFile extends PackedHeader {
  people: PackedRow[];
  packed: true;
}

/** A people file of JSON (from scripts/pull.ts), as readPeopleFile reads it. */
export interface JsonPeopleFile extends PeopleFileHeader {
  people: JsonRow[];
  packed: false;
}

export type PeopleFile = PackedPeopleFile | JsonPeopleFile;

/** A person's firm weight, or null when they have none. */
export type FirmWeightOf = (row: Row) => number | null;

/** A country's map and its people, as loadPeople reads them: shared, never to be changed. */
export interface LoadedPeople {
  /** The map, with the places of its list fields in a packed people file (placeLists). */
  map: PeopleMap;
  people: Row[];
  /** The audience the people were drawn for, when they were (figures are then of it, not of adults), or null. */
  drawnFor: string | null;
  /** Each person's firm weight, or null when the people file keeps none. */
  firmWeight: FirmWeightOf | null;
}

// The shipped people file is packed: "NXKP3\n", a line of JSON (country, source, fields, n, width, hi, words, slots,
// firm), then n rows of `width` 16-bit integers. A row holds one entry per field (a value's position, a number, or -1
// when the person has none) and, after them, the further words of the bits of each list of up to 60 values (15 bits to
// a word), then the further slots of each longer list (above), then, when the header has `firm`, the person's firm
// weight in two entries from there (below). A file from scripts/pull.ts is JSON. 200,000 people are 70 MB once
// loaded: the file is read into the one buffer the rows are views of.
const MAGIC = "NXKP3\n",
  WORD = 15,
  MAX_ENTRY = 32767;
const BITS = 60;
// A firm weight (PersonaGen's work.firm_weight: 1 divided by the number of people at the person's employer, as low as
// 0.00001) is a fraction no entry holds, so it is kept in billionths, in two entries of 15 bits each: high, then low.
// -1 in the first is no weight (not in work, or an employer that is not counted as a firm).
const FIRM_UNITS = 1e9,
  FIRM_WORD = 2 ** WORD;

/** Packs the people of a map, one row at a time, into a packed people file. */
export interface Packer {
  /** Packs row `i`; `firmWeight` is the person's firm weight, null for none, when the packer keeps them. */
  put(i: number, row: JsonRow, firmWeight?: number | null): void;
  /** The packed file, gzipped, with `header` (the map's country and source) at its head. */
  finish(header: { country: string; source: MapSource }): Buffer;
}

/**
 * Packs rows (JSON form: positions, numbers, arrays of positions for a list, null) for the map's fields. A list of
 * more than 60 values is held as slots, one value each: `most` gives, by field position, the most values one person
 * holds in it. With `firm`, each row also keeps the person's firm weight, given to put after the row (null for none).
 */
export function packer(
  fields: Field[],
  n: number,
  { most = {}, firm = false }: { most?: Record<number, number>; firm?: boolean } = {},
): Packer {
  const lists = fields.flatMap((field, f) => (field.kind === "list" && field.values.length <= BITS ? [f] : []));
  const long = fields.flatMap((field, f) => (field.kind === "list" && field.values.length > BITS ? [f] : []));
  // Both hold the positions of list fields only.
  for (const f of long)
    if (!(most[f] >= 1))
      throw new Error(
        `${fields[f].name} has ${(fields[f] as ListedField).values.length} values: give the most one person holds`,
      );
  let width = fields.length;
  const hi: Record<number, number> = {},
    words: Record<number, number> = {};
  for (const f of lists) {
    words[f] = Math.max(1, Math.ceil((fields[f] as ListedField).values.length / WORD));
    hi[f] = width;
    width += words[f] - 1;
  }
  const slots: Record<number, number[]> = Object.fromEntries(
    long.map((f): [number, number[]] => {
      const extra = Array.from({ length: most[f] - 1 }, (_, k) => width + k);
      width += extra.length;
      return [f, [f, ...extra]];
    }),
  );
  const firmAt = firm ? width : undefined;
  if (firm) width += 2;
  const block = new Int16Array(n * width);
  const fit = (x: number, field: Field) => {
    if (x > MAX_ENTRY) throw new Error(`${field.name} holds ${x}: more than a packed entry can`);
    return x;
  };
  return {
    put(i, row, firmWeight = null) {
      const at = i * width;
      if (firmAt !== undefined) {
        const units =
          firmWeight === null || firmWeight === undefined ? -1 : Math.round(Number(firmWeight) * FIRM_UNITS);
        if (!(units >= -1 && units <= FIRM_UNITS))
          throw new Error(`A firm weight of ${firmWeight}: a weight runs from 0 to 1, or is null`);
        block[at + firmAt] = units < 0 ? -1 : Math.floor(units / FIRM_WORD);
        block[at + firmAt + 1] = units < 0 ? -1 : units % FIRM_WORD;
      }
      fields.forEach((field, f) => {
        // A JSON row holds a position or a number for a field of one value, and an array of positions for a list.
        const x = row[f];
        if (field.kind !== "list") {
          block[at + f] = x === null || x === undefined || (x as number) < 0 ? -1 : fit(x as number, field);
          return;
        }
        if (slots[f]) {
          const held = [...new Set((x as number[] | null) ?? [])].sort((a, b) => a - b);
          if (held.length > slots[f].length)
            throw new Error(
              `A person holds ${held.length} values of ${field.name}, more than the ${slots[f].length} given`,
            );
          slots[f].forEach((s, k) => {
            block[at + s] = k < held.length ? fit(held[k], field) : -1;
          });
          return;
        }
        for (const v of (x as number[] | null) ?? []) {
          const word = (v / WORD) | 0;
          block[at + (word === 0 ? f : hi[f] + word - 1)] |= 1 << (v - word * WORD);
        }
      });
    },
    finish(header) {
      const head = Buffer.from(
        `${MAGIC}${JSON.stringify({ ...header, fields: fields.map((field) => field.path), n, width, hi, words, slots, ...(firm ? { firm: firmAt } : {}) })}\n`,
      );
      const pad = Buffer.alloc((4 - (head.length % 4)) % 4, 32);
      return gzipSync(Buffer.concat([head, pad, Buffer.from(block.buffer)]), { level: 6 });
    },
  };
}

/**
 * The map's fields with where a packed file keeps each list field's words (`hi`, `slots`), for the readers below. A
 * field that gets them is a copy: the fields given, as read once (keptFile), are not changed.
 */
export function placeLists(fields: Field[], file: PackedPeopleFile): Field[] {
  const placed = [...fields];
  for (const [f, hi] of Object.entries(file.hi ?? {}))
    placed[Number(f)] = { ...placed[Number(f)], hi, words: file.words[f] };
  for (const [f, slots] of Object.entries(file.slots ?? {})) placed[Number(f)] = { ...placed[Number(f)], slots };
  return placed;
}

/** A people file, packed or JSON: { country, source, fields, people, packed, hi, words, slots }. */
export function readPeopleFile(bytes: Buffer): PeopleFile {
  // The gzip trailer gives the unpacked size, so the output is one buffer from the start, and the rows are views of it.
  const buf = gunzipSync(bytes, { chunkSize: Math.max(64 * 1024, bytes.readUInt32LE(bytes.length - 4)) });
  if (buf.subarray(0, MAGIC.length).toString("latin1") !== MAGIC)
    return { ...JSON.parse(buf.toString("utf8")), packed: false };
  const end = buf.indexOf(10, MAGIC.length);
  const header: PackedHeader = JSON.parse(buf.subarray(MAGIC.length, end).toString("utf8"));
  const start = Math.ceil((end + 1) / 4) * 4;
  const count = header.n * header.width;
  const block =
    (buf.byteOffset + start) % 2
      ? new Int16Array(Uint8Array.from(buf.subarray(start, start + count * 2)).buffer)
      : new Int16Array(buf.buffer, buf.byteOffset + start, count);
  const people = Array.from({ length: header.n }, (_, i) => block.subarray(i * header.width, (i + 1) * header.width));
  return { ...header, people, packed: true };
}

// The maps and the people files are read once in a process, and again only when one changes (its size or the time it
// was written: a map rebuilt in place is read again). The MCP server runs the scripts in its own process, so a session
// reads a country's 200,000 people once, for its own tools and the scripts alike. What is read is shared: nothing may
// change it.
interface KeptRead {
  size: number;
  mtimeMs: number;
  value: unknown;
}
const kept = new Map<(bytes: Buffer) => unknown, Map<string, KeptRead>>();
/** A file as `parse` makes it from its bytes, read once while it is unchanged; `path` is found in `folder` when given. */
export function keptFile<T>(path: string, parse: (bytes: Buffer) => T, folder: string | null = null): T {
  const at = folder ? resolve(folder, String(path)) : String(path),
    seen = statSync(at, { throwIfNoEntry: false });
  if (!kept.has(parse)) kept.set(parse, new Map());
  const files = kept.get(parse)!,
    hit = files.get(at);
  // Every read kept for `parse` is what it made.
  if (seen && hit && hit.size === seen.size && hit.mtimeMs === seen.mtimeMs) return hit.value as T;
  const value = parse(folder ? readIn(folder, path) : readFileSync(at));
  if (seen) files.set(at, { size: seen.size, mtimeMs: seen.mtimeMs, value });
  return value;
}
const parseMap = (bytes: Buffer): PeopleMap => JSON.parse(bytes.toString("utf8"));
const shipped = (name: string) => fileURLToPath(new URL(`../maps/${name}`, import.meta.url));

/** A country's map, or the map file `map` (found in `folder`), as read once: shared, never to be changed. */
export const loadMap = (country: string, { map, folder }: { map?: string; folder?: string | null } = {}): PeopleMap =>
  keptFile(map ?? shipped(`${country}.json`), parseMap, folder);

const placed = new WeakMap<PeopleFile, WeakMap<PeopleMap, LoadedPeople>>();
/**
 * A country's map and its people: { map, people, drawnFor }. `people` can name another people file, such as one from
 * scripts/pull.ts; `drawnFor` is then the audience those people were drawn for, and figures are of it, not of adults.
 * `map` names another map; both are found in `folder`. Read once and shared: nothing may change them.
 */
export function loadPeople(
  country: string,
  { map, people, folder }: { map?: string; people?: string; folder?: string | null } = {},
): LoadedPeople {
  const file = keptFile(people ?? shipped(`${country}-people.bin.gz`), readPeopleFile, folder);
  if (file.country !== country) throw new Error(`The people file is for "${file.country}", not "${country}"`);
  const loaded = loadMap(country, { map, folder });
  if (!placed.has(file)) placed.set(file, new WeakMap());
  const withMap = placed.get(file)!;
  if (!withMap.has(loaded)) {
    if (file.packed && file.fields.join("\n") !== loaded.fields.map((field) => field.path).join("\n"))
      throw new Error("The people file and the map list different fields: rebuild both with scripts/build-maps.ts");
    withMap.set(loaded, {
      map: file.packed ? { ...loaded, fields: placeLists(loaded.fields, file) } : loaded,
      people: file.people,
      drawnFor: file.source?.audience ?? null,
      firmWeight: file.packed && Number.isInteger(file.firm) ? firmWeightAt(file.firm!) : null,
    });
  }
  return withMap.get(loaded)!;
}

/** A packed row's firm weight, where the file's header put it (`firm`), or null when the person has none. */
export const firmWeightAt =
  (at: number): FirmWeightOf =>
  (row) => {
    // Only a packed file keeps firm weights, so the rows are packed.
    const entries = row as PackedRow;
    return entries[at] < 0 ? null : (entries[at] * FIRM_WORD + entries[at + 1]) / FIRM_UNITS;
  };

/** What firmsAmong finds: the firms rows stand for, the rows with a weight, and how many people the sum is worth. */
export interface FirmCount {
  sum: number;
  /** The rows with a weight. */
  people: number;
  /** How many people of one weight each would give as close a count: few is a lead. */
  effective: number;
}

/**
 * The firms that rows stand for: the sum of their firm weights. Each person in work stands for 1 divided by the number
 * of people at their employer (a person's own one-person business is 1), so the people of one firm sum to one firm,
 * and the people a fact about their firm picks (its size, its industry, where it is) sum to the firms with it.
 * A fact about the person alone (their age) picks only some of a firm's people, and their sum is part of a firm: it
 * is not a count of firms (scripts/businesses.ts firmFacts says which facts count them).
 */
export function firmsAmong<R>(rows: R[], weightOf: (row: R) => number | null): FirmCount {
  let sum = 0,
    squares = 0,
    people = 0;
  for (const row of rows) {
    const w = weightOf(row);
    if (w === null) continue;
    sum += w;
    squares += w * w;
    people++;
  }
  return { sum, people, effective: squares ? (sum * sum) / squares : 0 };
}

/** About how many real firms a sum of firm weights over `total` generated people stands for in the country. */
export const firmsIn = (sum: number, total: number, country: Country): number =>
  total ? (sum / total) * ADULTS[country].n : 0;

/** An official count of adults, and where it comes from. */
export interface AdultCount {
  n: number;
  source: string;
}

// Adults aged 18 and over, from the latest official estimates by single year of age: ONS mid-2025 population
// estimates for the UK (MYE2, all persons), and the US Census Bureau's Vintage 2025 national estimates for the 50
// states and DC (nc-est2025-agesex-res, 1 July 2025). The generated people are drawn in proportion to the population,
// so a group's share of them, times these totals, is about how many real adults it is: the figure a plan (where to
// open, how many could buy) needs before the owner's reach and conversion are applied in sums.
export const ADULTS: Record<Country, AdultCount> = {
  uk: { n: 55_484_667, source: "ONS mid-2025 estimate, 55,484,667 adults in the UK" },
  us: { n: 269_763_509, source: "US Census Bureau Vintage 2025 estimate, 269,763,509 adults in the 50 states and DC" },
};

/** A list field whose values a packed file keeps in words of bits: placeLists gives it `hi` and `words` together. */
type BitsField = ListedField & { hi: number; words: number };
const inBits = (field: Field): field is BitsField => field.kind === "list" && field.hi !== undefined;

// The readers below take a JSON row or a packed one. Only a packed file's fields have `slots` or words of bits
// (placeLists), so where a reader takes those, the row is packed.

/** Whether the person in `row` holds value position `v` of field `f`. */
export function holds(field: Field, row: Row, f: number, v: number): boolean {
  const x = row[f];
  if (Array.isArray(x)) return x.includes(v);
  if (field.slots) return field.slots.some((s) => row[s] === v);
  if (inBits(field)) {
    const word = (v / WORD) | 0;
    return (
      word < field.words && (((row as PackedRow)[word === 0 ? f : field.hi + word - 1] >>> (v - word * WORD)) & 1) === 1
    );
  }
  return x === v;
}

/** The value positions the person holds in field `f`: one, several for a list, none when not listed. */
export function valuesAt(field: Field, row: Row, f: number): number[] {
  const x = row[f];
  if (Array.isArray(x)) return x;
  if (field.slots) return field.slots.map((s) => (row as PackedRow)[s]).filter((v) => v >= 0);
  if (inBits(field)) {
    const out = [],
      m = (field.values ?? []).length;
    for (let word = 0; word < field.words; word++)
      for (let b = (row as PackedRow)[word === 0 ? f : field.hi + word - 1]; b > 0; b &= b - 1) {
        const v = word * WORD + 31 - Math.clz32(b & -b);
        if (v < m) out.push(v);
      }
    return out;
  }
  return x === null || x === undefined || x < 0 ? [] : [x];
}

/** Whether a field's packed rows can say a person lacks a listed thing (a JSON row says it with an array). */
export const packedList = (field: Field): boolean =>
  field.kind === "list" && (field.hi !== undefined || field.slots !== undefined);

/** A numeric field's value, or null when the person has none. */
export const numberAt = (row: Row, f: number): number | null =>
  typeof row[f] === "number" && row[f] >= 0 ? row[f] : null;

/** The entries of a packed list field that hold its words of bits, in order. */
const wordsOf = (field: BitsField, f: number) => [
  f,
  ...Array.from({ length: field.words - 1 }, (_, w) => field.hi + w),
];

/**
 * For every value of a field, how many of the rows hold it, in one pass. The rows are all JSON or all packed; each
 * kind has its own plain loop, which at 200,000 people is several times faster than one loop that asks per row.
 */
export function valueCounts(field: Field, f: number, rows: Row[]): Float64Array {
  const m = (field.values ?? []).length,
    counts = new Float64Array(m),
    n = rows.length;
  if (!n) return counts;
  if (Array.isArray(rows[0])) {
    for (let i = 0; i < n; i++) {
      const x = rows[i][f];
      if (Array.isArray(x)) {
        for (const v of x) if (v < m) counts[v]++;
      } else if (x !== null && x !== undefined && x >= 0 && x < m) counts[x]++;
    }
  } else if (field.slots) {
    const slots = field.slots;
    for (let i = 0; i < n; i++) {
      const row = rows[i] as PackedRow;
      for (let k = 0; k < slots.length; k++) {
        const v = row[slots[k]];
        if (v >= 0 && v < m) counts[v]++;
      }
    }
  } else if (inBits(field)) {
    // Only the bits that are set are visited: b & -b is the lowest, 31 - clz32 its position.
    const at = wordsOf(field, f);
    for (let i = 0; i < n; i++) {
      const row = rows[i] as PackedRow;
      for (let w = 0; w < at.length; w++)
        for (let b = row[at[w]]; b > 0; b &= b - 1) {
          const v = w * WORD + 31 - Math.clz32(b & -b);
          if (v < m) counts[v]++;
        }
    }
  } else {
    for (let i = 0; i < n; i++) {
      const x = (rows[i] as PackedRow)[f];
      if (x >= 0 && x < m) counts[x]++;
    }
  }
  return counts;
}

/**
 * valueCounts for every listed field at once (an empty list for a numeric one). Packed rows are read once, person by
 * person, which is far faster than one pass a field: each pass reads the whole block again.
 */
export function countsByField(fields: Field[], rows: Row[]): Float64Array[] {
  if (!rows.length || Array.isArray(rows[0]))
    return fields.map((field, f) => (field.quantiles ? new Float64Array(0) : valueCounts(field, f, rows)));
  const out = fields.map((field) => new Float64Array(field.quantiles ? 0 : (field.values ?? []).length));
  // An entry that holds one value position (a single-valued field, or a slot of a long list) is counted the same way.
  const scalars: number[] = [],
    sOut: Float64Array[] = [],
    lOut: Float64Array[] = [],
    lWords: number[][] = [];
  fields.forEach((field, f) => {
    if (field.quantiles) return;
    if (field.slots)
      for (const s of field.slots) {
        scalars.push(s);
        sOut.push(out[f]);
      }
    else if (inBits(field)) {
      lOut.push(out[f]);
      lWords.push(wordsOf(field, f));
    } else {
      scalars.push(f);
      sOut.push(out[f]);
    }
  });
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i] as PackedRow;
    for (let k = 0; k < scalars.length; k++) {
      const x = row[scalars[k]],
        c = sOut[k];
      if (x >= 0 && x < c.length) c[x]++;
    }
    for (let k = 0; k < lOut.length; k++) {
      const c = lOut[k],
        at = lWords[k];
      for (let w = 0; w < at.length; w++)
        for (let b = row[at[w]]; b > 0; b &= b - 1) {
          const v = w * WORD + 31 - Math.clz32(b & -b);
          if (v < c.length) c[v]++;
        }
    }
  }
  return out;
}

/** A share as the map writes it ("33%", "<1%" or none) as a proportion, or null when there is none. */
export function shareOf(text: string | null | undefined): number | null {
  if (text === undefined || text === null || text === "") return null;
  return String(text).startsWith("<") ? 0.005 : Number.parseFloat(text) / 100;
}
