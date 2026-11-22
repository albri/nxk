// The generated people as a room, for comparing several ideas at once: which people hold which facts, a score for
// every person from one idea's scan answers, and the three readings discovery prints. No request is made here.
//
//   alike        are the ideas wanted by the same people?
//   ownCorners   for each idea, the corner of the room that prefers it most to the other ideas
//   whiteSpace   the big corners keen on doing the job themselves, where every offer does worse than its own average
//   leftOut      the big corners who do it themselves as often as most, cold on every offer: what the offers' form costs
//
// A corner is a combination of up to three facts held by at least `minShare` of adults. Its size is counted on the
// people. How keen it is comes from the decision model and is simulated.
import { numberAt, valuesAt, type Field, type Row, type Tier } from "./population.ts";
import type { KeenBy } from "./product.ts";
import { dampingFor, logOdds, membersOf, type Holders } from "./scan-answers.ts";

const expit = (x: number) => 1 / (1 + Math.exp(-x));
const mean = (xs: ArrayLike<number>) => {
  let s = 0;
  for (let i = 0; i < xs.length; i++) s += xs[i];
  return s / xs.length;
};
const meanOver = (v: ArrayLike<number>, list: number[]) => {
  let s = 0;
  for (const i of list) s += v[i];
  return s / list.length;
};

// Fields that restate another field, left out when naming a corner so the same people are not named twice
// (decision_role is the highest of the purchasing roles). A person's part in their organisation's buying, and how it
// buys, do name corners: they were left out while discovery was for consumer ideas, and a B2B idea's corner was then
// named by consumer facts ("self-employed in an unincorporated business").
const NOT_NAMED = new Set([
  "usual_travel_to_work_mode",
  "workplace_fixed_or_mobile",
  "employment_contract_type",
  "full_time_or_part_time",
  "household_resource_context",
  "relationship_history_context",
  "decision_role",
  "gender",
  "has_children",
  "has_long_term_condition",
  "commute_pattern",
  "digital_skill_level",
]);

/** A value held by enough of the people to name a corner: its field and value, and who holds it. */
export interface Fact {
  field: string;
  path: string;
  code: string;
  label: string;
  tier: Tier;
  /** The positions of the people who hold it. */
  list: number[];
  /** The same people, as a mask over the room. */
  members: Uint8Array;
}

/** A fact as a corner names it, without its people. */
export type CornerFact = Omit<Fact, "list" | "members">;

/**
 * The generated people as a room (roomOf): the map's fields and the rows, the facts that can name a corner, and for
 * every field the groups a scan's answers apply to (scan-answers.ts membersOf), of 25 people or more.
 */
export interface Room {
  fields: Field[];
  people: Row[];
  N: number;
  facts: Fact[];
  groups: Holders[][];
  /** The smallest corner, as a share of the room. */
  minShare: number;
}

/**
 * The room: for every value held by between `minShare` and `maxShare` of the people, who holds it (`facts`), and for
 * every field the groups a scan's answers apply to (`groups`). `fields` is the map's field list and `people` the
 * rows of the people file, one value (or list of values) for each field.
 */
export function roomOf(
  fields: Field[],
  people: Row[],
  { minShare = 0.02, maxShare = 0.6 }: { minShare?: number; maxShare?: number } = {},
): Room {
  const N = people.length,
    facts: Fact[] = [];
  fields.forEach((field, f) => {
    // A long list names a corner by its common values only, which come first (scan-answers.ts probesOf).
    const named = field.values && field.common !== undefined ? field.values.slice(0, field.common) : field.values;
    if (!named || NOT_NAMED.has(field.name) || named.length > 40) return;
    const lists = named.map((): number[] => []);
    for (let i = 0; i < N; i++) for (const v of valuesAt(field, people[i], f)) if (v < lists.length) lists[v].push(i);
    named.forEach((value, v) => {
      // A person goes online with several devices; only the smartphone tells people apart.
      if (field.name === "devices_used_to_go_online" && value.code !== "smartphone") return;
      const list = lists[v];
      if (list.length < minShare * N || list.length > maxShare * N) return;
      const members = new Uint8Array(N);
      for (const i of list) members[i] = 1;
      facts.push({
        field: field.name,
        path: field.path,
        code: String(value.code),
        label: value.label ?? String(value.code),
        tier: field.tier,
        list,
        members,
      });
    });
  });
  const groups = fields.map((field, f) => membersOf(field, f, people).filter((g) => g.members.length >= 25));
  return { fields, people, N, facts, groups, minShare };
}

/**
 * Who is in work, as a mask over `people` (organisation_size other than not in employment), or null when the map does
 * not hold the field. Offers sold to organisations are read among them: people not in work answer "never" to every
 * one, and the corner search fitted noise among them ("has never used the internet + nobody in paid work" came out as
 * a field-service app's strong corner).
 */
export function workersOf(fields: Field[], people: Row[]): Uint8Array | null {
  const f = fields.findIndex((field) => field.name === "organisation_size");
  if (f < 0) return null;
  const off = (fields[f].values ?? []).findIndex((v) => v.code === "not_in_employment");
  const mask = new Uint8Array(people.length);
  people.forEach((row, i) => {
    const held = valuesAt(fields[f], row, f);
    if (held.length && !held.includes(off)) mask[i] = 1;
  });
  return mask;
}

/** One idea's scores: every person's log-odds (`l`) and probability (`p`), their mean, and the fields scanned. */
export interface Scores {
  l: Float64Array;
  p: Float64Array;
  mean: number;
  scanned: string[];
}

/** One idea's scores, with its key: what the readings below compare. */
export interface ScoredIdea extends Scores {
  key: string;
}

/**
 * One idea's scan answers as a score for every person: the same sum scan-answers.ts peopleAnswers makes (the level,
 * plus `damping` times each scanned field's effect for the value the person holds), without rebuilding the groups for
 * every idea. `answers` maps "path=code" to a probability. With no `damping` given, it is set by how many fields are
 * read (scan-answers.ts dampingFor), so that a corner's odds mean the same whether a scan asked about every field or
 * a few.
 */
export function scoresOf(room: Room, answers: Map<string, number>, { damping }: { damping?: number } = {}): Scores {
  const sum = new Float64Array(room.N),
    levels: number[] = [],
    scanned: string[] = [];
  room.fields.forEach((field, f) => {
    // The groups with an answer, each with it.
    const groups = room.groups[f].flatMap((g) => {
      const answer = answers.get(g.id);
      return answer === undefined ? [] : [{ members: g.members, answer }];
    });
    if (groups.length < 2) return;
    const total = groups.reduce((s, g) => s + g.members.length, 0);
    const level = groups.reduce((s, g) => s + g.members.length * g.answer, 0) / total;
    levels.push(level);
    scanned.push(field.name);
    const tot = new Float64Array(room.N),
      count = new Uint16Array(room.N);
    for (const g of groups) {
      const effect = logOdds(g.answer) - logOdds(level);
      for (const i of g.members) {
        tot[i] += effect;
        count[i]++;
      }
    }
    for (let i = 0; i < room.N; i++) if (count[i]) sum[i] += tot[i] / count[i];
  });
  if (!levels.length) throw new Error("No field of the map has scan answers for two or more of its values");
  const base = logOdds(mean(levels)),
    d = damping ?? dampingFor(levels.length);
  const l = Float64Array.from(sum, (s) => base + d * s),
    p = Float64Array.from(l, expit);
  return { l, p, mean: mean(p), scanned };
}

/** Correlation between two lists of scores across the people. */
export function correlation(a: ArrayLike<number>, b: ArrayLike<number>): number {
  const n = a.length,
    ma = mean(a),
    mb = mean(b);
  let ab = 0,
    aa = 0,
    bb = 0;
  for (let i = 0; i < n; i++) {
    const x = a[i] - ma,
      y = b[i] - mb;
    ab += x * y;
    aa += x * x;
    bb += y * y;
  }
  return aa && bb ? ab / Math.sqrt(aa * bb) : 0;
}

/** How alike two ideas' scores are across the people: their correlation, 1 when the same people want both. */
export interface Pair {
  a: string;
  b: string;
  r: number;
}

/** Whether ideas are wanted by the same people: the average correlation of two ideas' scores, and every pair. */
export interface Likeness {
  average: number;
  pairs: Pair[];
}

/**
 * Are the ideas wanted by the same people? Returns the average correlation between two ideas' scores (1 = the same
 * people want both) and every pair, most alike first.
 */
export function alike(ideas: Pick<ScoredIdea, "key" | "p">[]): Likeness {
  const pairs: Pair[] = [];
  for (let a = 0; a < ideas.length; a++)
    for (let b = a + 1; b < ideas.length; b++)
      pairs.push({ a: ideas[a].key, b: ideas[b].key, r: correlation(ideas[a].p, ideas[b].p) });
  pairs.sort((x, y) => y.r - x.r);
  return { average: pairs.length ? mean(pairs.map((pair) => pair.r)) : 1, pairs };
}

/** How far the corner search looks: up to `depth` facts, `width` corners kept a step, each fact adding `grow`. */
export interface SearchOptions {
  depth?: number;
  width?: number;
  grow?: number;
}

/** A corner as the search grows it: its facts, its people, and their mean score. */
interface Beam {
  parts: Fact[];
  list: number[];
  score: number;
}

/** The corner where `v` is highest on average: a beam search over one, two and three facts. */
function search(room: Room, v: ArrayLike<number>, { depth = 3, width = 40, grow = 0.08 }: SearchOptions = {}): Beam {
  let beam: Beam[] = room.facts.map((fact) => ({ parts: [fact], list: fact.list, score: meanOver(v, fact.list) }));
  let best: Beam | null = null;
  for (let d = 1; d <= depth; d++) {
    beam.sort((a, b) => b.score - a.score);
    if (!beam.length) break;
    // A further fact is named only when it adds something: a corner must beat the one it grew from by `grow`.
    if (!best || beam[0].score > best.score + grow) best = beam[0];
    if (d === depth) break;
    const next: Beam[] = [];
    for (const corner of beam.slice(0, width))
      for (const fact of room.facts) {
        if (corner.parts.some((part) => part.field === fact.field)) continue;
        const list = corner.list.filter((i) => fact.members[i]);
        if (list.length < room.minShare * room.N) continue;
        const score = meanOver(v, list);
        if (score > corner.score + grow) next.push({ parts: [...corner.parts, fact], list, score });
      }
    beam = next;
  }
  if (!best) throw new Error("No fact is held by enough of the people to name a corner");
  return best;
}
/** A corner: the facts that name it, its people, and its share of the room. */
export interface Corner {
  facts: CornerFact[];
  list: number[];
  share: number;
}

/** A corner with how many times more it favours what it was searched for (its odds). */
export interface OddsCorner extends Corner {
  odds: number;
}

/** A corner keen on one idea: its odds, and its mean answer (`keen`) against the room's (`room`). */
export interface KeenCorner extends OddsCorner {
  keen: number;
  room: number;
}

/** An idea's own corner (ownCorners), with the people keenest on it whatever they think of the others. */
export interface OwnCorner extends KeenCorner {
  key: string;
  keenest: KeenCorner;
}

/**
 * A big group nobody serves (whiteSpace): the way of doing it now they are keenest on, and how many times its own
 * average (`nowLift`); the best offer there, and its lift (under 1); and the offers' average lift.
 */
export interface EmptyCorner extends Corner {
  now: string;
  nowLift: number;
  best: string;
  lift: number;
  average: number;
}

const cornerOut = <E>(room: Room, corner: Pick<Beam, "parts" | "list">, extra: E): Corner & E => ({
  facts: corner.parts.map((part) => ({
    field: part.field,
    path: part.path,
    code: part.code,
    label: part.label,
    tier: part.tier,
  })),
  list: corner.list,
  share: corner.list.length / room.N,
  ...extra,
});

/**
 * The people keenest on one idea, whatever they think of the others: `odds` is how many times the idea's odds there
 * are its odds across everyone. Every idea has one. For the owner's own offer it is who wants it, the lead research
 * reports first; for an idea with no corner of its own, it is who it would still be for, so that no idea is put to the
 * owner without a group and a size.
 */
export function keenestOn(room: Room, idea: Pick<Scores, "l" | "p" | "mean">, options: SearchOptions = {}): KeenCorner {
  const own = mean(idea.l),
    corner = search(
      room,
      Float64Array.from(idea.l, (x) => x - own),
      options,
    );
  return cornerOut(room, corner, {
    odds: Math.exp(corner.score),
    keen: meanOver(idea.p, corner.list),
    room: idea.mean,
  });
}

// Age bands for leanBy: from each lower bound to the next.
const AGES = [18, 25, 35, 45, 55, 65, 75];

/**
 * How keen people are on one idea by age band and by gender, whatever they think of the others (simulated): the mean
 * answer in each group, with its share of the people read. Corners never name gender (NOT_NAMED), and a corner names
 * one age band at most, so this is the plain direction a published table gives. Groups under 2 in 100 of the people
 * are left out.
 */
export function leanBy(room: Room, idea: { p: ArrayLike<number> }): KeenBy[] {
  const out: KeenBy[] = [],
    N = room.N;
  const groups = (lists: number[][], labels: string[]) =>
    lists
      .map((list, g) => ({ label: labels[g], share: list.length / N, keen: list.length ? meanOver(idea.p, list) : 0 }))
      .filter((g) => g.share >= 0.02);
  const age = room.fields.findIndex((field) => field.name === "age_years");
  if (age >= 0) {
    const lists = AGES.map((): number[] => []);
    room.people.forEach((row, i) => {
      const x = numberAt(row, age);
      if (x === null) return;
      const band = AGES.findLastIndex((low) => x >= low);
      if (band >= 0) lists[band].push(i);
    });
    const labels = AGES.map((low, b) => (b < AGES.length - 1 ? `${low} to ${AGES[b + 1] - 1}` : `${low} and over`));
    out.push({ by: "age", groups: groups(lists, labels) });
  }
  const gender = room.fields.findIndex((field) => field.name === "gender");
  if (gender >= 0) {
    const values = room.fields[gender].values ?? [];
    const lists = values.map((): number[] => []);
    room.people.forEach((row, i) => {
      for (const v of valuesAt(room.fields[gender], row, gender)) if (v < lists.length) lists[v].push(i);
    });
    out.push({
      by: "gender",
      groups: groups(
        lists,
        values.map((v) => v.label ?? String(v.code)),
      ),
    });
  }
  return out.filter((x) => x.groups.length >= 2);
}

/** What ownCorners finds: each idea's own corner, and the corners most and least keen on the ideas as a whole. */
export interface OwnCorners {
  ideas: OwnCorner[];
  keen: OddsCorner;
  cold: OddsCorner;
}

/**
 * Each idea's own corner: the people who prefer it most to the other ideas. A person's score for an idea is taken
 * against their own average across all the ideas (in log-odds), so the people who are keen on everything are not
 * named for every idea. `odds` is how many times more they favour this idea than their average idea; `keen` and
 * `cold` are the corners most and least keen on the ideas as a whole.
 */
export function ownCorners(room: Room, ideas: ScoredIdea[], options: SearchOptions = {}): OwnCorners {
  const N = room.N,
    general = new Float64Array(N);
  for (const idea of ideas) for (let i = 0; i < N; i++) general[i] += idea.l[i] / ideas.length;
  const all = mean(general);
  const out = ideas.map((idea) => {
    const own = mean(idea.l);
    const corner = search(
      room,
      Float64Array.from(idea.l, (x, i) => x - own - (general[i] - all)),
      options,
    );
    return {
      key: idea.key,
      ...cornerOut(room, corner, {
        odds: Math.exp(corner.score),
        keen: meanOver(idea.p, corner.list),
        room: idea.mean,
      }),
    };
  });
  const keen = search(room, general, options),
    cold = search(
      room,
      Float64Array.from(general, (x) => -x),
      options,
    );
  return {
    ideas: out.map((corner, k) => ({ ...corner, keenest: keenestOn(room, ideas[k], options) })),
    keen: cornerOut(room, keen, { odds: Math.exp(keen.score - all) }),
    cold: cornerOut(room, cold, { odds: Math.exp(-cold.score - all) }),
  };
}

/** A group found by its facts: the strongest way of doing it now there, and the best offer there. */
interface ColdGroup {
  parts: Fact[];
  n: number;
  now: string;
  nowLift: number;
  best: string;
  lift: number;
  average: number;
}

/** What coldGroups looks for: the groups it keeps, and the order it keeps them in (first first). */
interface ColdTest {
  keeps: (group: ColdGroup) => boolean;
  rank: (a: ColdGroup, b: ColdGroup) => number;
}

/**
 * The big groups of one fact, or two together, held by `floor` of adults or more, that `test` keeps, each with the
 * way of doing it now (an idea in `now`) they are keenest on and the best of the other ideas, the offers, each as
 * many times its own average. Returns up to `keep` groups that are not mostly the same people as one already kept,
 * nor as one in `apart`, in `test`'s order. With no way of doing it now on the list, or no offer, none.
 */
function coldGroups(
  room: Room,
  ideas: Pick<ScoredIdea, "key" | "p" | "mean">[],
  test: ColdTest,
  {
    floor,
    keep,
    among,
    now,
    apart = [],
  }: { floor: number; keep: number; among: Set<string> | null; now: Set<string>; apart?: Corner[] },
): EmptyCorner[] {
  const ways = ideas.filter((idea) => now.has(idea.key)),
    offers = ideas.filter((idea) => !now.has(idea.key));
  if (!ways.length || !offers.length) return [];
  // `among` limits the groups to facts of those fields: the ones every idea was asked about. A group defined by a
  // fact that some idea was never asked about would look average for that idea whatever the truth.
  const N = room.N,
    min = floor * N,
    big = room.facts.filter((fact) => fact.list.length >= min && (!among || among.has(fact.field)));
  // Each group is scored as it is found and kept without its people: keeping a list for every pair of facts, with every
  // field asked about, ran out of memory. The lists of the few groups shown are made again at the end.
  const order = [...ways, ...offers],
    K = order.length,
    W = ways.length,
    sums = new Float64Array(K),
    scored: ColdGroup[] = [];
  // Each person's answers to every idea side by side, so the inner loop reads memory in order.
  const P = new Float64Array(N * K);
  for (let k = 0; k < K; k++) {
    const p = order[k].p;
    for (let i = 0; i < N; i++) P[i * K + k] = p[i];
  }
  const score = (parts: Fact[], n: number) => {
    let way = { key: "", lift: -Infinity },
      best = { key: "", lift: -Infinity },
      total = 0;
    for (let k = 0; k < K; k++) {
      const lift = sums[k] / n / order[k].mean;
      if (k < W) {
        if (lift > way.lift) way = { key: order[k].key, lift };
        continue;
      }
      total += lift;
      if (lift > best.lift) best = { key: order[k].key, lift };
    }
    const group = {
      parts,
      n,
      now: way.key,
      nowLift: way.lift,
      best: best.key,
      lift: best.lift,
      average: total / (K - W),
    };
    if (test.keeps(group)) scored.push(group);
  };
  for (const fact of big) {
    sums.fill(0);
    for (const i of fact.list) for (let k = 0, at = i * K; k < K; k++) sums[k] += P[at + k];
    score([fact], fact.list.length);
  }
  for (let a = 0; a < big.length; a++)
    for (let b = a + 1; b < big.length; b++) {
      if (big[a].field === big[b].field) continue;
      const [small, other] = big[a].list.length <= big[b].list.length ? [big[a], big[b]] : [big[b], big[a]];
      const members = other.members;
      let n = 0;
      sums.fill(0);
      for (const i of small.list)
        if (members[i]) {
          n++;
          for (let k = 0, at = i * K; k < K; k++) sums[k] += P[at + k];
        }
      if (n >= min) score([big[a], big[b]], n);
    }
  scored.sort(test.rank);
  const listOf = (parts: Fact[]) => {
    if (parts.length === 1) return parts[0].list;
    const [small, other] = parts[0].list.length <= parts[1].list.length ? parts : [parts[1], parts[0]];
    return small.list.filter((i) => other.members[i]);
  };
  const same = (a: number[], b: Set<number>, size: number) =>
    a.filter((i) => b.has(i)).length / Math.min(a.length, size) > 0.6;
  const kept: (ColdGroup & { list: number[] })[] = [];
  for (const corner of scored) {
    const list = listOf(corner.parts),
      set = new Set(list);
    if ([...apart, ...kept].some((k) => same(k.list, set, list.length))) continue;
    kept.push({ ...corner, list });
    if (kept.length >= keep) break;
  }
  return kept.map((corner) =>
    cornerOut(room, corner, {
      now: corner.now,
      nowLift: corner.nowLift,
      best: corner.best,
      lift: corner.lift,
      average: corner.average,
    }),
  );
}

/** What whiteSpace and leftOut are given: the ideas that are ways of doing it now, and where to look. */
export interface ColdOptions {
  /** The smallest group, as a share of the room. */
  floor?: number;
  keep?: number;
  /** The fields every idea was asked about: only their facts name a group. */
  among?: Set<string> | null;
  /** The keys of the ideas that are how people do it now without buying (by hand, a spreadsheet, a free template). */
  now?: Set<string>;
}

/**
 * The big groups nobody serves: people who want the job done but whom no offer suits. One fact, or two together, held
 * by `floor` of adults or more, where a way of doing it now (an idea in `now`: by hand, a spreadsheet, a free
 * template) is at least `demand` times its own average, and every other idea, the offers, does worse than its own
 * average. Returns up to `keep` groups that are not mostly the same people as one already kept, those the offers miss
 * by most first.
 *
 * With no way of doing it now on the list, nothing can be read, and none are returned: a group cold on every offer is
 * then most often a group that wants none of it (older adults, out of work, with a long-term condition, cold on
 * whatever is put to them), not one nobody serves. Going without is not a way of doing it now: people who would rather
 * go without do not want the job done.
 */
export function whiteSpace(
  room: Room,
  ideas: Pick<ScoredIdea, "key" | "p" | "mean">[],
  {
    floor = 0.05,
    keep = 5,
    among = null,
    now = new Set<string>(),
    demand = 1.1,
  }: ColdOptions & { demand?: number } = {},
): EmptyCorner[] {
  return coldGroups(
    room,
    ideas,
    {
      keeps: (g) => g.nowLift >= demand && g.lift < 1,
      rank: (a, b) => b.nowLift / b.lift - a.nowLift / a.lift,
    },
    { floor, keep, among, now },
  );
}

/**
 * Who the offers leave out: big groups who do it themselves at least as often as most people (a way of doing it now
 * at its own average or above), but are cold on every offer (each under `cold` of its own average). Not a gap the
 * offers can fill as they are, but what their form costs, which an owner may not have thought of (an app leaves out
 * people who do it by hand and use no apps). A group cold on everything is not one of them: it does not do it
 * themselves either. Groups mostly the same people as one in `apart` (the groups nobody serves) are left to it.
 * Returns up to `keep`, the most people the offers miss first (their share, times how far the best offer falls short).
 */
export function leftOut(
  room: Room,
  ideas: Pick<ScoredIdea, "key" | "p" | "mean">[],
  {
    floor = 0.05,
    keep = 3,
    among = null,
    now = new Set<string>(),
    cold = 0.9,
    apart = [],
  }: ColdOptions & { cold?: number; apart?: Corner[] } = {},
): EmptyCorner[] {
  return coldGroups(
    room,
    ideas,
    {
      keeps: (g) => g.nowLift >= 1 && g.lift < cold,
      rank: (a, b) => b.n * (1 - b.lift) - a.n * (1 - a.lift),
    },
    { floor, keep, among, now, apart },
  );
}

/** The share of people who are at least `by` times keener than the room on at least one idea. */
export function reached(room: Pick<Room, "N">, ideas: Pick<Scores, "p" | "mean">[], by = 1.2): number {
  let n = 0;
  for (let i = 0; i < room.N; i++) if (ideas.some((idea) => idea.p[i] >= by * idea.mean)) n++;
  return n / room.N;
}
