import assert from "node:assert/strict";
import test from "node:test";
import { termProblems, termsOfSpec, type Suggestion, type SuggestionsSpec } from "./suggest-form.ts";
import { conditionsOf } from "./groups.ts";
import type { Clash } from "./log.ts";
import type { Field } from "./population.ts";
import {
  countFits,
  hoursFits,
  listedClashes,
  listedOpen,
  listedTerms,
  unansweredClashes,
  requirementMissing,
  clashesIn,
  sentencesOf,
  sizeFits,
  termsIn,
  unlistedTerms,
  type NotClash,
} from "./terms.ts";

const SIGNUP = `Build the sign-up flow for Fork & Field, a US meal-kit service. People choose recipes each week and we deliver the ingredients.

- Boxes are for 2 or 4 people, with 2, 3, 4 or 5 recipes a week. A serving costs $11.49 at the smallest box, falling to $8.99 at the largest. Shipping is $9.99 a box.
- New customers get 50% off their first box.
- We deliver to most of the lower 48 states, on a weekday the customer picks.
- It is a weekly subscription. Customers can skip a week or cancel online, up to 5 days before a delivery.`;

const PRICING = `Build the pricing page for Pennywise, a UK budgeting app. It links to your bank accounts and shows where your money goes each month.

- Free: one linked account, this month's spending by category.
- Family: everything in Plus for up to five people with shared budgets. £7.99 a month, or £64.99 a year.

We take payment by card or Direct Debit.`;

const CANCEL = "- There is an off-peak membership at £22 a month (weekdays 9am to 4pm, and weekends after 2pm).";

// A small population: household size and work, 10 people.
const fields = [
  {
    name: "people_in_household",
    path: "household_and_family.people_in_household",
    tier: "A",
    values: ["1", "2", "3", "4", "5", "8_or_more"].map((code) => ({ code, label: code })),
  },
  {
    name: "full_time_or_part_time",
    path: "work.full_time_or_part_time",
    tier: "A",
    values: [
      { code: "full_time", label: "Full time" },
      { code: "part_time", label: "Part time" },
      { code: "not_in_employment", label: "Not in work" },
    ],
  },
  {
    name: "shift_work",
    path: "work.shift_work",
    tier: "B",
    values: [
      { code: "regular_daytime_schedule", label: "Days" },
      { code: "night_shift", label: "Nights" },
      { code: "not_in_employment", label: "Not in work" },
    ],
  },
] as Field[];
const people = [
  [0, 0, 0],
  [1, 0, 1],
  [1, 1, 2],
  [2, 2, 2],
  [3, 0, 0],
  [3, 0, 0],
  [1, 0, 0],
  [4, 1, 0],
  [5, 2, 2],
  [1, 0, 0],
];

test("sentences split on bullets and full stops, not on the point in a price", () => {
  assert.deepEqual(sentencesOf("- Plus is £4.99 a month. It has a trial.\nFamily is £7.99."), [
    "Plus is £4.99 a month.",
    "It has a trial.",
    "Family is £7.99.",
  ]);
});

test("the terms of a request are found by kind, in a fixed order, with the ones every build has", () => {
  const signup = termsIn(SIGNUP);
  const ids = signup.map((t) => t.id);
  assert.deepEqual(ids, ["size-1", "hours-1", "price", "commitment", "place-1", "channel", "english", "device"]);
  assert.match(signup[0].quotes[0], /2 or 4 people/);
  assert.equal(signup.find((t) => t.id === "price")?.quotes.length, 2); // prices are gathered into one term
  const pricing = termsIn(PRICING).map((t) => t.id);
  for (const id of ["size-1", "access", "label-1", "payment"]) assert.ok(pricing.includes(id), id);
  assert.equal(termsIn(CANCEL)[0].id, "hours-1");
  // A place named by its clinics.
  assert.ok(
    termsIn("Build the booking flow for Brightwell Physio, three physiotherapy clinics in Leeds.").some(
      (t) => t.id === "place-1",
    ),
  );
});

test("sizes and hours come with a suggestion for whom they fit", () => {
  assert.deepEqual(sizeFits(fields, ["Boxes are for 2 or 4 people, with 2, 3, 4 or 5 recipes a week."]), [
    "people_in_household=2|4",
  ]);
  assert.deepEqual(sizeFits(fields, ["Everything in Plus for up to five people."]), ["people_in_household=1|2|3|4|5"]);
  assert.deepEqual(hoursFits(fields), [
    "full_time_or_part_time=part_time|not_in_employment",
    "shift_work=night_shift",
    "usual_work_location=works_only_from_home",
  ]);
});

test("a condition with != holds for anyone without those values", () => {
  const [c] = conditionsOf(fields, ["full_time_or_part_time!=full_time"]);
  assert.equal(people.filter(c.test).length, 4);
  assert.match(c.text, /^not /);
});

test("a term's fit is anyone in any of its groups", () => {
  const counted = countFits(fields, people, ["people_in_household=2|4"]);
  assert.equal(counted.fits, 0.6);
  const free = countFits(fields, people, [
    "full_time_or_part_time=part_time|not_in_employment",
    "shift_work=night_shift",
  ]);
  assert.equal(free.fits, 0.5); // two part time, two not in work, one on nights
});

test("the owner's terms are the model's list, each quote checked against the request as written", () => {
  const request =
    "- There is an off-peak membership at £22 a month (weekdays 9am to 4pm, and weekends after 2pm).\n- Members can’t   bring guests.";
  const { terms, problems } = listedTerms(
    [
      { quote: "£22 a month", kind: "price" },
      { quote: "weekdays 9am to 4pm", kind: "hours" },
      { quote: "weekends after 2pm", kind: "hours" },
      { quote: "Members can't bring guests", kind: "other" },
    ],
    request,
  );
  assert.deepEqual(problems, []);
  assert.deepEqual(
    terms.map((t) => t.id),
    ["price-1", "hours-1", "hours-2", "other-1", "english", "device"],
  );
  // A quote the owner did not write, or a kind that is not one, is refused; a missing list is asked for.
  const wrong = listedTerms(
    [
      { quote: "£25 a month", kind: "price" },
      { quote: "£22 a month", kind: "money" },
    ],
    request,
  ).problems.join("\n");
  assert.match(wrong, /"£25 a month" is not in the request as written/);
  assert.match(wrong, /kind "money", which is not one of: size, hours, price/);
  assert.match(listedTerms(undefined, request).problems[0], /^List the terms the owner fixed/);
  assert.deepEqual(
    listedTerms([], request).terms.map((t) => t.id),
    ["english", "device"],
  );
});

test("word patterns only point at sentences the list may have missed", () => {
  const request = "Standard membership is £32 a month on a 12-month contract. Open weekdays 6am to 10pm.";
  // A sentence whose term is listed, of its kind or as other, is covered; the rest are hints.
  assert.deepEqual(
    unlistedTerms(listedTerms([{ quote: "£32 a month", kind: "price" }], request).terms, request).map((u) => u.kind),
    ["hours", "commitment"],
  );
  assert.deepEqual(
    unlistedTerms(
      listedTerms(
        [
          { quote: "12-month contract", kind: "other" },
          { quote: "£32", kind: "price" },
          { quote: "6am to 10pm", kind: "hours" },
        ],
        request,
      ).terms,
      request,
    ),
    [],
  );
});

test("suggest refuses a term with no fits, a quote not in the request, and a suggestion naming a term not listed", () => {
  const spec = {
    suggestions: [{ suggestion: "Off-peak", terms: ["hours-9"] }],
    terms: [
      { term: "hours-1", kind: "hours", quote: "weekdays 9am to 4pm", fits: [] },
      { term: "price", fits_everyone: "old" },
    ],
  } as SuggestionsSpec;
  const { terms: found, problems } = termsOfSpec(spec, CANCEL);
  assert.match(problems.join("\n"), /term "price" has no "quote"/);
  const text = termProblems(spec, found).join("\n");
  assert.match(text, /term "hours-1" .* has no "fits"/);
  assert.match(text, /names term "hours-9", which is not in "terms"/);
  assert.match(text, /term "english" .* has no "fits"/);
  const fixed = {
    suggestions: [{ suggestion: "Off-peak", terms: ["hours-1"] }],
    terms: [
      { term: "hours-1", kind: "hours", quote: "weekdays 9am to 4pm", fits: ["full_time_or_part_time=part_time"] },
      { term: "price-1", kind: "price", quote: "£22 a month", fits_everyone: "given" },
      { term: "english", fits_everyone: "x" },
      { term: "device", fits_everyone: "x" },
    ],
  } as SuggestionsSpec;
  const ok = termsOfSpec(fixed, CANCEL);
  assert.deepEqual(ok.problems, []);
  assert.deepEqual(termProblems(fixed, ok.terms), []);
});

test("suggest wants what the rules say about a commitment, with a link opened, or a reason it was not looked up", () => {
  const request = `${CANCEL}\n- Standard membership is £32 a month on a 12-month contract.`;
  const base = (commitment: { rules?: string; rules_not_found?: string }): SuggestionsSpec =>
    ({
      suggestions: [] as Suggestion[],
      terms: [
        { term: "price-1", kind: "price", quote: "£32 a month", fits_everyone: "given" },
        { term: "commitment-1", kind: "commitment", quote: "12-month contract", fits_everyone: "given", ...commitment },
        { term: "english", fits_everyone: "x" },
        { term: "device", fits_everyone: "x" },
      ],
    }) as SuggestionsSpec;
  const found = termsOfSpec(base({}), request).terms;
  assert.match(termProblems(base({}), found).join("\n"), /term "commitment-1" has no "rules" with a link/);
  assert.ok(
    !termProblems(base({}), found).some((p) => /term "price-1".*(rules|market)/.test(p)),
    "a price needs no look-up",
  );
  const opened = [
    {
      url: "https://gov.example/subscriptions",
      words: "traders must let consumers end a contract in a straightforward way",
    },
  ];
  assert.deepEqual(
    termProblems(
      base({ rules: "Ending must be straightforward (Example Government, 2026, https://gov.example/subscriptions)" }),
      found,
      opened,
    ),
    [],
  );
  assert.match(
    termProblems(
      base({ rules: "Ending must be straightforward (2026, https://gov.example/subscriptions)" }),
      found,
    ).join("\n"),
    /"rules": https:\/\/gov\.example\/subscriptions was not opened/,
  );
  assert.deepEqual(termProblems(base({ rules_not_found: "no web access: for the owner to check" }), found), []);
});

test("requirements, defaults, limits and later charges are terms; a library card is not a payment", () => {
  const ids = (text: string) => termsIn(text).map((t) => t.id);
  const rent = ids(
    "Applicants need income of 3 times the rent, two recent pay stubs and a credit score of 650 or more.",
  );
  assert.ok(rent.includes("requirement-1"), rent.join());
  assert.match(requirementMissing("a credit score of 650").join(), /credit scores/);
  assert.ok(ids("Travel insurance at £12, and have it selected.").includes("default"));
  assert.ok(ids("Up to three food parcels in six months.").includes("limit-1"));
  assert.ok(ids("Units in arrears for 45 days are sold at auction to cover the lien.").includes("later"));
  assert.ok(ids("The room rate is non-refundable.").includes("commitment"));
  const library = ids("Join online with your email and mobile number, and collect your library card at a branch.");
  assert.ok(!library.includes("payment"), library.join());
  assert.ok(library.includes("requirement-1"), library.join());
});

test("a request that contradicts itself is put back to the owner", () => {
  const clashes = clashesIn(
    [
      "Fees are fixed for the year from September, and we review them every term.",
      "No refunds for holidays, but parents can take two weeks a year without paying.",
      "Funded hours are free; every child pays the £60 consumables charge.",
    ].join(" "),
  );
  assert.deepEqual(
    clashes.map((c) => c.what),
    [
      "a price fixed and a price reviewed",
      "no refunds or discounts, and a time that is not paid for",
      "something free, and a charge everyone pays",
    ],
  );
  assert.deepEqual(
    clashesIn("Prices are fixed for 12 months. No refunds after 14 days. Delivery is free over £40."),
    [],
  );
});

test("the clashes the agent listed are checked against the request, each side in the owner's words", () => {
  const request = "Fees are fixed for the year, and we review them every term. Funded hours are free.";
  assert.deepEqual(listedClashes([{ a: "Fees are fixed for the year", b: "we review them every term" }], request), {
    clashes: [{ a: "Fees are fixed for the year", b: "we review them every term" }],
    problems: [],
  });
  assert.match(
    listedClashes([{ a: "Fees are fixed", b: "reviewed each term" }], request).problems[0],
    /^clash 1: "b" is not in the request as written/,
  );
  assert.match(listedClashes([{ a: "", b: "" }], request).problems[0], /"a" and "b" are not in the request/);
  assert.match(listedClashes(null, request).problems[0], /^List where the request contradicts itself/);
  assert.deepEqual(listedClashes([], request), { clashes: [], problems: [] });
});

test("a place the patterns read as a contradiction is answered either way: listed in clashes, or set aside with why", () => {
  const request = [
    "Fees are fixed for the year from September, and we review them every term.",
    "No refunds or discounts for sickness, holidays or closures, but parents can take two weeks' holiday a year without paying.",
  ].join(" ");
  const what = (clashes: Clash[], not?: NotClash[]) => unansweredClashes(request, clashes, not).map((c) => c.what);
  assert.deepEqual(what([]), [
    "a price fixed and a price reviewed",
    "no refunds or discounts, and a time that is not paid for",
  ]);
  assert.deepEqual(what([{ a: "Fees are fixed for the year from September", b: "we review them every term" }]), [
    "no refunds or discounts, and a time that is not paid for",
  ]);
  assert.deepEqual(
    what(
      [{ a: "Fees are fixed for the year from September", b: "we review them every term" }],
      [{ quote: "parents can take two weeks' holiday a year without paying", why: "an allowance, not a refund" }],
    ),
    [],
  );
  // Set aside with no reason is not answered.
  assert.equal(what([], [{ quote: "parents can take two weeks' holiday a year without paying", why: "" }]).length, 2);
});

test("what only the owner can say is listed by a short name each, or [] when the request gives all of it", () => {
  assert.deepEqual(listedOpen([{ topic: "return window" }, { topic: " who pays return postage " }]), {
    open: ["return window", "who pays return postage"],
    problems: [],
  });
  assert.deepEqual(listedOpen([]), { open: [], problems: [] });
  assert.match(listedOpen(null).problems[0], /^List in open what the work needs/);
  assert.match(listedOpen([{ topic: "" }]).problems[0], /^open 1 has no "topic"/);
  assert.match(listedOpen([{ topic: "Return window" }, { topic: "return window." }]).problems[0], /is listed twice/);
  assert.match(
    listedOpen([{ topic: "how many days a customer has to tell us they want to send an item back" }]).problems[0],
    /a short name of a few words/,
  );
});
