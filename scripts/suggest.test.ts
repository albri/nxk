import assert from "node:assert/strict";
import test from "node:test";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Log } from "./log.ts";
import type { RulesOn } from "./suggest-count.ts";
import {
  countKeys,
  nearestThreshold,
  problems,
  thresholdsOf,
  type Suggestion,
  type SuggestionsSpec,
} from "./suggest-form.ts";
import type { NoteItem } from "./suggest-print.ts";
import { effectiveN, rakeWhatFits, weightedShare } from "./groups.ts";
import {
  addCustomers,
  addSuggestion,
  emptyProduct,
  findProduct,
  knownShares,
  productHome,
  type CountedSuggestion,
} from "./product.ts";

test("a rule's thresholds are read as figures in every 100", () => {
  assert.deepEqual(thresholdsOf("Add a phone route if more than 5 in every 100 adults cannot use the page"), [5]);
  assert.deepEqual(
    thresholdsOf("Keep it unless fewer than 1 in 4 members can afford it, or under 12.5 in 100"),
    [25, 12.5],
  );
  assert.deepEqual(thresholdsOf("Show the deadline before payment"), []);
  assert.deepEqual(thresholdsOf("unless 100 in 100 lose"), [], "a whole is not a threshold");
});

test("a count near the rule's threshold is a close call; one far from it is not", () => {
  const close = nearestThreshold(
    [
      { label: "Online only rules out", value: 9.6, n: 20000 },
      { label: "Desk", value: 40, n: 20000 },
    ],
    [10],
  );
  assert.ok(close);
  assert.equal(close.label, "Online only rules out");
  assert.equal(close.close, true);
  const far = nearestThreshold([{ label: "Card first rules out", value: 31.8, n: 20000 }], [5]);
  assert.ok(far);
  assert.equal(far.close, false);
  assert.ok(Math.abs(far.gap - 26.8) < 1e-9);
  // A tenth of a large threshold, and a wide margin on a small audience, both widen what counts as close.
  assert.equal(nearestThreshold([{ label: "x", value: 27.5, n: 20000 }], [30])?.close, true);
  assert.equal(nearestThreshold([{ label: "x", value: 26.5, n: 20000 }], [30])?.close, false);
  assert.equal(nearestThreshold([{ label: "x", value: 14, n: 60 }], [10])?.close, true);
  assert.equal(nearestThreshold([{ label: "x", value: 9, n: 20000 }], []), null);
});

test("a suggestion on the owner's term names their option, the count its rule is about, and an offer", () => {
  const suggestion: Suggestion = {
    suggestion: "How to cancel",
    rule: "Worth raising if 5 in 100 or more cannot cancel online",
    terms: ["hours-1"],
    options: [
      {
        name: "Online only",
        needs: ["internet_use_frequency=daily"],
        bears_on: ["age_years=75..120", "home_tenure=rented"],
      },
      { name: "Online and post" },
    ],
  };
  assert.deepEqual(countKeys(suggestion), [
    "term hours-1",
    "Online only: rules out",
    "Online only: harder for age_years=75..120",
    "Online only: harder for home_tenure=rented",
    "Online only: harder for any",
  ]);
  const spec: SuggestionsSpec = { country: "uk", request: "request.md", suggestions: [suggestion] };
  const said = problems(spec, null).join("\n");
  assert.match(said, /say in "count" which count.*"Online only: rules out"/);
  assert.match(said, /answers the owner's terms: name their option in "as_asked"/);
  assert.match(said, /has no "offer"/);
  Object.assign(suggestion, { count: "Online only: rules out", as_asked: "Online only", offer: "add a postal form" });
  assert.deepEqual(problems(spec, null), []);
  suggestion.as_asked = "Post only";
  assert.match(problems(spec, null).join("\n"), /"as_asked" must be the name of the option that is what the owner set/);
  // An empty list is allowed: nothing turns people away.
  assert.deepEqual(problems({ ...spec, suggestions: [] }, null), []);
  // A term that is always there (English, the device) is not the owner's: a suggestion on it alone is a choice.
  assert.deepEqual(
    problems(
      {
        ...spec,
        suggestions: [{ suggestion: "Plain words", terms: ["english"], options: [{ name: "a" }, { name: "b" }] }],
      },
      null,
    ),
    [],
  );
});

test("raking weights the audience to the owner's shares, and leaves out only the shares the audience cannot hold", () => {
  // 1,000 people: a fifth are older, half rent. The owner says half their customers are older and a fifth rent.
  interface Person {
    old: boolean;
    rents: boolean;
    owns: boolean;
  }
  const rows: Person[] = Array.from({ length: 1000 }, (_, i) => ({
    old: i % 5 === 0,
    rents: i % 2 === 0,
    owns: i % 2 === 1,
  }));
  const conditions = [{ test: (row: Person) => row.old }, { test: (row: Person) => row.rents }];
  const { w, kept, left } = rakeWhatFits(rows, conditions, [0.5, 0.2]);
  assert.deepEqual([kept, left], [[0, 1], []]);
  assert.ok(w);
  const share = (test: (row: Person) => boolean) =>
    weightedShare(
      w,
      rows.flatMap((row, i) => (test(row) ? [i] : [])),
    );
  assert.ok(Math.abs(share((row) => row.old) - 0.5) < 1e-4);
  assert.ok(Math.abs(share((row) => row.rents) - 0.2) < 1e-4);
  assert.ok(Math.abs(w.reduce((s, x) => s + x, 0) / w.length - 1) < 1e-9);
  assert.ok(effectiveN(w) < 1000 && effectiveN(w) > 300);
  assert.equal(effectiveN(new Float64Array(10).fill(1)), 10);
  // A mask and a list of positions give the same share.
  const mask = Uint8Array.from(rows, (row) => (row.old ? 1 : 0));
  assert.ok(Math.abs(weightedShare(w, mask) - share((row) => row.old)) < 1e-12);
  assert.equal(rakeWhatFits(rows, [{ test: () => false }], [0.3]).w, null, "no one in the audience is like that");
  assert.equal(rakeWhatFits(rows, [{ test: () => true }], [0.3]).w, null, "everyone in the audience is like that");
  // A share the audience cannot hold is left out on its own; the other shares are still met.
  const some = rakeWhatFits(rows, [conditions[0], { test: () => false }, conditions[1]], [0.5, 0.1, 0.2]);
  assert.deepEqual(
    [some.kept, some.left.map((x) => [x.k, x.why])],
    [[0, 2], [[1, "no one in this audience is like that"]]],
  );
  assert.ok(some.w);
  assert.ok(
    Math.abs(
      weightedShare(
        some.w,
        rows.flatMap((row, i) => (row.old ? [i] : [])),
      ) - 0.5,
    ) < 1e-4,
  );
  // Renters and owners are the same people turned round: 60 in 100 renting cannot hold with 60 in 100 owning.
  const clash = rakeWhatFits(rows, [{ test: (row) => row.rents }, { test: (row) => row.owns }], [0.6, 0.6]);
  assert.deepEqual(clash.kept, [0]);
  assert.match(
    clash.left[0].why,
    /cannot hold together with the shares before it \(the closest fit is \d+\.\d in 100 off\)/,
  );
});

test("the product file keeps one entry a fact and a decision, and never uses a guess as the owner's word", () => {
  let product = addCustomers(emptyProduct(), { fact: "age_years=65..120", share: "40", source: "owner" }, "2026-11-15");
  product = addCustomers(
    product,
    { fact: "age_years=65..120", share: "45", source: "measured", note: "booking system" },
    "2026-11-16",
  );
  product = addCustomers(product, { fact: "home_tenure=rented", share: "unknown", source: "owner" }, "2026-11-16");
  product = addCustomers(product, { fact: "region=wales", share: "30", source: "guess" }, "2026-11-16");
  assert.equal(product.customers.length, 3);
  assert.deepEqual(product.customers[0], {
    fact: "age_years=65..120",
    share: 45,
    source: "measured",
    note: "booking system",
    date: "2026-11-16",
  });
  assert.equal(product.customers[1].share, null);
  assert.deepEqual(
    knownShares(product).map((entry) => entry.fact),
    ["age_years=65..120"],
  );
  assert.throws(() => addCustomers(product, { fact: "x=y", share: "140", source: "owner" }), /0 to 100/);
  assert.throws(() => addCustomers(product, { fact: "x=y", share: "4", source: "hunch" }), /source must be one of/);
  // Only the folder, the name and the pick matter to which entry is kept.
  product = addSuggestion(product, {
    folder: ".",
    suggestion: "How to cancel",
    pick: "Online only",
  } as CountedSuggestion);
  product = addSuggestion(product, {
    folder: ".",
    suggestion: "How to cancel",
    pick: "Online and post",
  } as CountedSuggestion);
  product = addSuggestion(product, {
    folder: "booking",
    suggestion: "How to cancel",
    pick: "Online only",
  } as CountedSuggestion);
  assert.deepEqual(
    product.suggestions.map((d) => `${d.folder} ${d.pick}`),
    [". Online and post", "booking Online only"],
  );
});

test("the product file is found from any folder below the project's root, and not above it", () => {
  const root = mkdtempSync(join(tmpdir(), "nxk-product-"));
  const project = join(root, "shop"),
    deep = join(project, "web", "pages");
  mkdirSync(join(project, ".git"), { recursive: true });
  mkdirSync(deep, { recursive: true });
  writeFileSync(join(root, "nxk.json"), "{}"); // another product's file, above this project
  assert.equal(findProduct(deep), null);
  assert.equal(productHome(deep), project);
  writeFileSync(join(project, "nxk.json"), "{}");
  assert.equal(findProduct(deep), join(project, "nxk.json"));
});

test("a note line says the people first (about how many, of whom, who), what stops them, and the offer", async () => {
  const { noteLine, about } = await import("./suggest-print.ts");
  assert.equal(about(39.1), "about 39");
  assert.equal(about(0.4), "under 1");
  const ruled = {
    barrier: 'are ruled out by "Online only"',
    value: 12.4,
    customers: null,
    who: "who do not go online daily",
  };
  assert.equal(
    noteLine(
      { suggestion: "How to book", offer: "add a phone line beside the form." },
      { ruled, condition: null, whom: "adults in Leeds" },
    ),
    '- How to book: about 12 in every 100 of adults in Leeds, who do not go online daily, are ruled out by "Online only" (counted). Say yes and I\'ll add a phone line beside the form.',
  );
  // With no words for who they are, the people run straight into what stops them.
  assert.equal(
    noteLine(
      { suggestion: "How to book", offer: "add a phone line" },
      { ruled: { ...ruled, who: null }, condition: null, whom: "adults" },
    ),
    '- How to book: about 12 in every 100 of adults are ruled out by "Online only" (counted). Say yes and I\'ll add a phone line.',
  );
  // Among people like the owner's customers, and a close call's condition.
  assert.match(
    noteLine(
      { suggestion: "How to book", offer: "add a phone line" },
      {
        ruled: { ...ruled, customers: 20.2 },
        condition: "more so if many of your customers are aged 65 or over",
        whom: "adults",
      },
    ),
    /about 12 in every 100 of adults \(about 20 among people like your customers\), who .*, are ruled out by "Online only" \(counted\), more so if many of your customers are aged 65 or over\. Say yes/,
  );
});

test("the note keeps at most three items, largest first, and says when nothing is worth raising", async () => {
  const { printNote, NOTE_LEAD } = await import("./suggest-print.ts");
  const run = (raised: NoteItem[], quiet: string[] = [], ruleLines: RulesOn[] = []) => {
    const printed: string[] = [],
      records: Record<string, unknown>[] = [];
    const log: Pick<Log, "line" | "record"> = {
      line: (text = "") => printed.push(text),
      record: (type, data) => records.push({ type, ...data }),
    };
    printNote(log, { raised, quiet, ruleLines });
    return { text: printed.join("\n"), records };
  };
  const item = (name: string, size: number): NoteItem => ({
    name,
    size,
    line: `- ${name}: about ${size} in every 100 (counted). Say yes and I'll x.`,
  });
  const four = run([item("a", 5), item("b", 30), item("c", 12), item("d", 20)], ["e"]);
  assert.ok(four.text.includes(`${NOTE_LEAD}\n- b: about 30`));
  assert.match(four.text, /- b: .*\n- d: .*\n- c: /);
  assert.match(four.text, /Smaller, and left out of the note \(at most 3\): a\./);
  assert.match(four.text, /Not worth raising, under the figure in each rule: e\./);
  // The line that says what "counted" means comes with the note, so the reply needs no second check to add it.
  assert.match(
    four.text,
    /what the label means: "counted: on 200,000 made-up adults that match official statistics, a rough guide"/,
  );
  assert.deepEqual(
    four.records.map((r) => r.suggestion),
    ["b", "d", "c"],
  );
  const none = run([], ["e"]);
  assert.match(none.text, /Nothing here is worth raising \(e: under the figure in each rule\)\. .*give no note/);
  assert.ok(!none.text.includes(NOTE_LEAD));
  // What the rules say is for the session to judge, with what to do if a term goes against them.
  const rules = run(
    [],
    [],
    [
      { name: '"One month\'s notice"', says: "Rules (sourced, https://example.com)" },
      { name: '"fixed for the year"', says: "Rules (sourced, https://example.com)" },
    ],
  );
  assert.match(rules.text, /- What the rules say about "One month's notice", "fixed for the year": Rules/);
  assert.match(rules.text, /open the reply with that: the law by name/);
});
