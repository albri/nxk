// The 100 people behind the header and the opening figure, from the counts in data/idea-counts.json. The counts are
// rounded to 100 one level at a time (how a person goes online, then age within that, then work within that), so every
// total the figures print is the rounded share of its own count, and the parts add up to it.
import { shares } from "./kit.ts";

/** The people in one mix of how they go online, age and work. */
export interface Cell {
  online: string;
  age: string;
  work: string;
  n: number;
}

/** data/idea-counts.json, which count.ts writes: each way online, age band and kind of work, as conditions, and the cells. */
export interface IdeaCounts {
  _about: string;
  country: string;
  people: number;
  engine: string;
  built: string;
  online: Record<string, string>;
  age: Record<string, string>;
  work: Record<string, string>;
  cells: Cell[];
}

/** One of the 100: positions in age, work and online, and 1 when the sign-up leaves them out. */
export type Person = [age: number, work: number, online: number, out: number];

/** The 100 people, and the keys their positions are of. */
export interface Hundred {
  online: string[];
  age: string[];
  work: string[];
  /** How many of the 100 go online each way. */
  byOnline: number[];
  people: Person[];
}

const sum = (list: Cell[]) => list.reduce((s, c) => s + c.n, 0);

/** { online, age, work: the keys in order; byOnline: people of 100 per way online; people: [age, work, online, out] } */
export function hundred(counts: IdeaCounts): Hundred {
  const online = Object.keys(counts.online),
    age = Object.keys(counts.age),
    work = Object.keys(counts.work);
  const cells = (o: string, a?: string) =>
    counts.cells.filter((c) => c.online === o && (a === undefined || c.age === a));
  const byOnline = shares(
    online.map((o) => sum(cells(o))),
    100,
  );
  const people: Person[] = [];
  online.forEach((o, oi) => {
    const byAge = shares(
      age.map((a) => sum(cells(o, a))),
      byOnline[oi],
    );
    age.forEach((a, ai) => {
      const list = work.map((w) => cells(o, a).find((c) => c.work === w)?.n ?? 0);
      shares(list, byAge[ai]).forEach((n, wi) => {
        for (let i = 0; i < n; i++) people.push([ai, wi, oi, o === "phone" ? 0 : 1]);
      });
    });
  });
  return { online, age, work, byOnline, people };
}
