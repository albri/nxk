import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { unchecked } from "../hooks/stop-check.ts";
import { MEANINGS, legendFor } from "./checks/legend.ts";
import type { Finding } from "./checks/index.ts";
import type { ResolutionOutcome, ResolutionRecord } from "./log.ts";
import { check as checkReply, readDelivered, type CheckOptions } from "./note.ts";
import { clashesOf, loggedNumbers, openOf, ownerTermsOf, passed, raisedOf, readLog, type LogRun } from "./records.ts";
import { blocksOf, numbersIn, traced, type GivenNumber } from "./reply.ts";
import type { SourceRecord } from "./source.ts";
import { line, logText, run, served } from "./testing.ts";

// These tests are about the other checks: every reply carries the line that says what its labels mean (legend.test.ts).
const LEGEND = legendFor(Object.keys(MEANINGS), "uk");
const check = (text: string, runs: LogRun[] | null, options?: CheckOptions) =>
  checkReply(`${text}\n\n${LEGEND}`, runs, options);

// suggest's counts, and the sums it worked out from the owner's figures (computed, as suggest labels them).
const LOG = [
  run(
    "suggest",
    "counted",
    "  rules out 8.4 in every 100 of gym members (give or take 0.9)",
    line("  Card first: visitors 1000 x start 12.0% x pay ? x price 29.00", "computed"),
    line("  Break-even: Email only equals Card first when pay is 20.0%.", "computed"),
  ),
  run("sums", "computed", "Customers needed for 3000 a month: 859."),
];
// A note check that passed.
const PASSED = () => run("note", null, "Ready to send.", { type: "verdict", ready: true, pays: null });
const BLOCK = (loses: string, extra = "") => `I built the join page with your terms: joining is in the app.

Worth considering:
- Joining in the app only: ${loses} Say yes and I'll add joining at the front desk.${extra}`;
const fails = (findings: Finding[]) =>
  findings
    .filter((f) => f.level === "FAIL")
    .map((f) => f.message)
    .join("\n");
const failing = (findings: Finding[]) => fails(findings);
const warns = (findings: Finding[]) =>
  findings
    .filter((f) => f.level === "WARN")
    .map((f) => f.message)
    .join("\n");

test("numbers are read with their decimals and thousands", () => {
  assert.deepEqual(numbersIn("1,446 and 8.4 and 12%"), [
    { value: 1446, decimals: 0 },
    { value: 8.4, decimals: 1 },
    { value: 12, decimals: 0 },
  ]);
  assert.equal(traced({ value: 8.4, decimals: 1 }, [8.43]), true);
  assert.equal(traced({ value: 8, decimals: 0 }, [8.4]), true); // a whole number may round what a tool printed
  assert.equal(traced({ value: 8, decimals: 0 }, [8.6]), false);
  // A comma after a number ends it: "over £500, and full payment" holds 500, which may be the owner's own figure.
  assert.deepEqual(numbersIn("over £500, and £3, £5, or 1,446."), [
    { value: 500, decimals: 0 },
    { value: 3, decimals: 0 },
    { value: 5, decimals: 0 },
    { value: 1446, decimals: 0 },
  ]);
});

test("an owner's figure followed by a comma in their request is still theirs", async () => {
  const { ownerFigures } = await import("./note.ts");
  const dir = mkdtempSync(join(tmpdir(), "nxk-note-comma-"));
  writeFileSync(
    join(dir, "request.md"),
    "£75 call-out, then £50 an hour, a 50% deposit on any job over £500, and full payment on the day.\n",
  );
  const owner = ownerFigures(dir);
  assert.ok(owner.some((f) => f.value === 500 && f.kind === "money"));
  assert.doesNotMatch(fails(check("Watch: quotes over £500 accepted versus lapsed.", null, { owner })), /500/);
});

test("counted figures trace only to lines the tools printed as counted, not to the inputs of a sum", () => {
  const logged = loggedNumbers(LOG);
  assert.ok(logged.counted.includes(8.4));
  assert.ok(!logged.counted.includes(12));
  assert.ok(logged.computed.includes(20) && logged.computed.includes(859));
});

test("a figure with no label, or one no tool backs, is told the label that fits: the owner's own, or the tool's", () => {
  const owner = [1.75, 30];
  const log = [
    run("people", "counted", "A: 25.7% of adults (give or take 0.1)"),
    run("sums", "computed", "Break-even at 20.0% paying, $0.10 a day."),
  ];
  const bare = fails(
    check("We charge $1.75 a pound with a $30 minimum.\nAbout 25.7 in every 100 of gym members are left out.", log, {
      owner,
    }),
  );
  // The owner's own prices need no label (they are given); a count does.
  assert.doesNotMatch(bare, /1\.75/);
  assert.match(
    bare,
    /25\.7 in every 100 with no source\. .* Which fits: 25\.7 a tool printed as counted, so counted\./,
  );
  const wrong = fails(
    check("Prices of $1.75 and $30 (simulated).\nBreak-even at 20.0% of gym members paying (counted).", log, { owner }),
  );
  assert.match(
    wrong,
    /1\.75, 30 labelled simulated but no tool printed them\. .* Which fits: 1\.75, 30 the owner gave, so given\./,
  );
  assert.match(
    wrong,
    /20 labelled counted but no tool printed it\. .* Which fits: 20 a tool printed as computed, so computed\./,
  );
  // A figure of fewer than three significant digits matches some tool's output by chance, and money is never counted:
  // a scan's $0.10 must not take "counted" from a count's "give or take 0.1".
  assert.doesNotMatch(
    fails(check("About 12 in every 100 of gym members.\nThe scan cost $0.10 of your budget.", log, { owner })),
    /Which fits/,
  );
});

test("the owner's numbers come from the saved request and what nxk.json records the owner said", async () => {
  const { ownerFigures } = await import("./note.ts");
  const dir = mkdtempSync(join(tmpdir(), "nxk-note-owner-"));
  writeFileSync(join(dir, "request.md"), "Should I charge £40 an hour, or 10 lessons for £350?\n");
  writeFileSync(
    join(dir, "nxk.json"),
    JSON.stringify({
      version: 2,
      product: { name: "Tutor", description: "Maths tutoring, 2 sessions a week" },
      facts: [
        { topic: "rent", answer: "£900 a month", source: "owner" },
        { topic: "guess", answer: "about 55 pupils", source: "guess" },
      ],
      money: [{ name: "margin", value: 40, source: "owner" }],
      customers: [],
    }),
  );
  assert.deepEqual(
    ownerFigures(dir)
      .map((f) => f.value)
      .sort((a, b) => a - b),
    [2, 10, 40, 40, 350, 900],
  );
});

test("the owner's own figures are given, labelled or not, in the form they gave them", async () => {
  const { ownersFigure } = await import("./reply.ts");
  const owner: GivenNumber[] = [
    { value: 29, kind: "money" },
    { value: 9, kind: "plain" },
    { value: 85, kind: "%" },
  ];
  assert.ok(ownersFigure("$29", owner) && ownersFigure("85%", owner) && ownersFigure("9 months", owner));
  assert.ok(!ownersFigure("29%", owner) && !ownersFigure("$85", owner) && !ownersFigure("$30", owner));
  const log = [
    run("sums", "computed", "Customers needed for 10000 a month: 82.", "100 customers bring $14,500 a month."),
  ];
  // Unlabelled, the owner's price passes; a guess beside it still needs its label.
  assert.equal(fails(check(BLOCK("At $29 per user a month, first month free."), log, { owner })), "");
  assert.match(
    fails(check(BLOCK("At $29 per user, with an 85% margin and a $300 cost to win one."), log, { owner })),
    /\$300 with no source/,
  );
  // In a line labelled computed, the owner's price needs no tool behind it; the computed figure still does.
  assert.equal(
    fails(check(BLOCK("At $29 a user, 100 crews of five bring $14,500 a month (computed)."), log, { owner })),
    "",
  );
  assert.match(
    fails(check(BLOCK("At $29 a user, 100 crews of five bring $14,600 a month (computed)."), log, { owner })),
    /14600 labelled computed but no tool printed it/,
  );
  // A line of only the owner's figures labelled as a tool's is told they are given.
  assert.match(
    fails(check(BLOCK("At $29 a user (simulated)."), log, { owner })),
    /29 labelled simulated but no tool printed it\. .*the owner gave, so given/,
  );
  // "29%" is not the owner's "$29".
  assert.match(fails(check(BLOCK("29% of crews would switch."), log, { owner })), /29% with no source/);
});

test("the server's own tools: a figure traces to the label its line was made with; outcome results are measured", () => {
  const log = [
    served(
      "segments",
      line("  size: 12.3 in every 100 adults, about 6.6m (counted)", "counted"),
      line("  keenness: 40% keen there against 20% of all adults (simulated)", "simulated"),
    ),
    served("outcome_record", line("  over 65s: 30 of 200 took it, 15.0% (from 10.7% to 20.6%). Clear.", "measured")),
  ];
  const logged = loggedNumbers(log);
  assert.ok(logged.counted.includes(12.3) && !logged.counted.includes(40));
  assert.ok(logged.simulated.includes(40) && !logged.simulated.includes(12.3));
  assert.ok(logged.measured.includes(15) && !logged.counted.includes(15));
  assert.equal(fails(check(BLOCK("15.0% of over 65s who saw the advert took it (measured)."), log)), "");
  assert.match(
    fails(check(BLOCK("19.5% of over 65s who saw the advert took it (measured)."), log)),
    /19.5 labelled measured but no tool printed it/,
  );
});

test("discover's Who decides table is counted; the rest of a scan is simulated", () => {
  const log = [
    run(
      "discover",
      "simulated",
      line(
        "  x1.40  solo  2.5% of adults, about 6.8m | Construction Trades Workers | 20% there against 11%",
        "simulated",
        { counted: ["2.5% of adults, about 6.8m"] },
      ),
      "",
      line(
        "Who decides on software and SaaS, by the size of the organisation: counted on the generated people in work at each size.",
        "counted",
      ),
      line("  Fewer than 10 employees          6.5% of adults, about 17.6m", "counted"),
      line(
        "      how their organisation buys (of the people who work at one): the owner or one person decides 73%, informal quotes from a few suppliers 22%",
        "counted",
      ),
      "",
      "How keen, at work (simulated; the mean of everyone in work):",
      "  solo: 11% of people in work | signs off 13%",
    ),
  ];
  const logged = loggedNumbers(log);
  assert.ok([73, 22, 6.5].every((n) => logged.counted.includes(n)) && !logged.simulated.includes(73));
  assert.ok(logged.simulated.includes(20) && logged.simulated.includes(13) && !logged.counted.includes(13));
  assert.equal(
    fails(
      check(BLOCK("At firms under 10, 73% of the people who work there are where the owner decides (counted)."), log),
    ),
    "",
  );
});

test("a traced, labelled reply passes; an invented count, a bare figure and a missing line fail", () => {
  assert.equal(fails(check(BLOCK("App only rules out 8.4 in every 100 of gym members (counted)."), LOG)), "");
  assert.match(
    fails(check(BLOCK("App only rules out 12 in every 100 of gym members (counted)."), LOG)),
    /12 labelled counted but no tool printed it/,
  );
  assert.match(fails(check(BLOCK("App only rules out 8.4 in every 100 of gym members."), LOG)), /with no source/);
  assert.match(fails(check(BLOCK("[who it loses]"), LOG)), /brackets/);
  assert.match(fails(check(BLOCK("App only rules out 8.4 in every 100 of gym members (counted)."), null)), /no log/);
});

test("a passage marked imagined carries no figure; the counted line beside it and the label's meaning are not in it", () => {
  const walk = (said: string) =>
    `App only rules out 8.4 in every 100 of gym members (counted).\n\nWalk-through (imagined): She gets through her name and address, then ${said}.\nWould keep her: joining at the front desk.`;
  assert.equal(fails(check(walk("stops at the bank details"), LOG)), "");
  assert.match(fails(check(walk("balks at the £20 joining fee"), LOG)), /£20 in a passage marked imagined/);
  assert.match(fails(check(`> (imagined) "I'd pay 50% more for that."`, LOG)), /50% in a passage marked imagined/);
});

test("warnings: everyone or no one, and a count that does not say whom it is of", () => {
  const found = check(BLOCK("App only rules out 8.4 in every 100 (counted); nobody else loses."), LOG);
  assert.ok(found.some((f) => f.level === "WARN" && /everyone or no one/.test(f.message)));
  assert.ok(found.some((f) => f.level === "WARN" && /whom it is of/.test(f.message)));
  assert.ok(
    !check(BLOCK("Email only rules out no one (counted on gym members)."), LOG).some((f) =>
      /everyone or no one/.test(f.message),
    ),
  );
});

test("a sourced figure needs its link in the same line, a page opened with source.ts that holds it, and no log", () => {
  const counted = "App only rules out 8.4 in every 100 of gym members (counted).";
  const extra = "\nOther gyms charge £35 a month (sourced: Example Gym prices, 2026, https://example.com/prices).";
  const opened = [{ url: "https://example.com/prices/", words: "Standard membership £35 a month" }];
  assert.equal(fails(check(BLOCK(counted, extra), LOG, { sources: opened })), "");
  assert.match(
    fails(
      check(BLOCK(counted, "\nOther gyms charge £35 a month (sourced: Example Gym prices, 2026)."), LOG, {
        sources: opened,
      }),
    ),
    /sourced figure with no link/,
  );
  assert.match(fails(check(BLOCK(counted, extra), LOG)), /was not opened: run source_check with/);
  assert.match(
    fails(
      check(BLOCK(counted, extra), LOG, {
        sources: [{ url: "https://example.com/prices", words: "Standard membership £39 a month" }],
      }),
    ),
    /35 is not in the words checked/,
  );
  // A sourced line with no figure still needs its page opened.
  assert.match(
    fails(
      check(
        BLOCK(counted, "\nRivals let members cancel online (sourced: Rival, 2026, https://rival.example/help)."),
        LOG,
        { sources: opened },
      ),
    ),
    /rival\.example\/help was not opened/,
  );
  // The owner's own figure beside a sourced one is a warning, not a failure.
  const both = check(
    BLOCK(
      counted,
      "\nOther gyms charge £35 a month (sourced: Example Gym prices, 2026, https://example.com/prices); yours is £32 (given).",
    ),
    LOG,
    { sources: opened },
  );
  assert.equal(fails(both), "");
  assert.ok(both.some((f) => f.level === "WARN" && /32 is not in the words checked/.test(f.message)));
});

test("a check writes its verdict to the log after reading it, so the Stop hook sees a reply that passed", () => {
  const dir = mkdtempSync(join(tmpdir(), "nxk-note-"));
  writeFileSync(
    join(dir, "reply.md"),
    `${BLOCK("App only rules out 8.4 in every 100 of gym members (counted).")}\n${LEGEND}`,
  );
  const env = { ...process.env, NXK_LOG: join(dir, "log.jsonl") };
  writeFileSync(env.NXK_LOG, logText(LOG));
  const ran = spawnSync(process.execPath, [new URL("./note.ts", import.meta.url).pathname, "reply.md"], {
    cwd: dir,
    env,
    encoding: "utf8",
  });
  assert.equal(ran.status, 0, ran.stdout);
  assert.match(ran.stdout, /Ready to send/);
  const runs = readLog(env.NXK_LOG),
    last = runs.at(-1);
  assert.ok(last);
  assert.deepEqual([last.tool, last.args, passed(last)], ["note", ["reply.md"], true]);
  assert.deepEqual(
    last.records.find((r) => r.type === "verdict"),
    { type: "verdict", ready: true, pays: null, run: last.run },
  );
  assert.equal(unchecked(runs), false);
});

test("the note has at most three short items; a raise left out of the reply is pointed out", () => {
  const item = (name: string) =>
    `- ${name}: "Online only" rules out about 8 in every 100 of gym members (counted). Say yes and I'll add a desk.`;
  const raised = run(
    "suggest",
    "counted",
    "Worth considering:",
    item("Joining"),
    { type: "raise", suggestion: "Joining", line: item("Joining") },
    "  rules out 8.4 in every 100 of gym members (give or take 0.9)",
  );
  const log = [raised, run("note", null, "1 to fix.", { type: "verdict", ready: false, pays: null })];
  assert.deepEqual(raisedOf(log), [{ suggestion: "Joining", line: item("Joining") }]);
  const built = "I built the join page with your terms.";
  assert.equal(fails(check(`${built}\n\nWorth considering:\n${item("Joining")}`, log)), "");
  // Four items are too many for the owner to read beside the work.
  assert.match(
    fails(check(`${built}\n\n**Worth considering:**\n${["a", "b", "c", "d"].map(item).join("\n")}`, log)),
    /"Worth considering:" has 4 items: keep at most 3/,
  );
  // An item of more than a line or two fails: the owner reads a short point, not a paragraph.
  const long = `- Joining: ${"the app shuts out people who ".repeat(10)}(counted).`;
  assert.match(fails(check(`${built}\n\nWorth considering:\n${long}`, log)), /a note item of \d+ words, over 50/);
  // A raise with no note is the session's call, and only warned of.
  const quiet = check(built, log);
  assert.equal(fails(quiet), "");
  assert.match(
    warns(quiet),
    /suggest found 1 worth raising \(Joining\), and the reply has no "Worth considering:" note/,
  );
  // Once the reply has passed, the note is no longer owed.
  assert.doesNotMatch(warns(check(built, [raised, PASSED()])), /worth raising/);
});

test("the owner's terms are kept in what is delivered: a change is offered in the note, never made", () => {
  const terms = run(
    "terms",
    null,
    "2 terms the owner fixed in request.md",
    { type: "owner_term", id: "commitment-1", kind: "commitment", quotes: ["Twelve-month contract"] },
    { type: "owner_term", id: "price-1", kind: "price", quotes: ["£29 a month", "£20 joining fee"] },
    { type: "owner_term", id: "size-1", kind: "size", quotes: ["about 400 members"] },
  );
  const log = [...LOG, terms];
  assert.deepEqual(
    ownerTermsOf(log).map((t) => t.id),
    ["commitment-1", "price-1", "size-1"],
  );
  const page = (body: string) => [{ name: "site/join.html", text: `<html><body>${body}</body></html>` }];
  const kept = page("<p>£29 a month on a 12-month contract, plus a £20 joining fee.</p>");
  assert.equal(fails(check("I built site/join.html.", log, { delivered: kept })), "");
  // A contract softened to a rolling month, and the fee dropped: each figure the page leaves out is named.
  const softened = fails(
    check("I built site/join.html.", log, { delivered: page("<p>£29 a month, cancel any time.</p>") }),
  );
  assert.match(
    softened,
    /The owner set "Twelve-month contract" .*, and 12 is in nothing delivered \(site\/join\.html\)/,
  );
  assert.match(softened, /The owner set "£20 joining fee" .*, and 20 is in nothing delivered/);
  // A size is about the business, not a term the page repeats.
  assert.doesNotMatch(softened, /400/);
  // Number words and digits are the same figure.
  assert.equal(
    fails(check("x", log, { delivered: page("<p>Twelve months at £29 a month; joining fee £20.</p>") })),
    "",
  );
  // The Stop hook does not know which files the reply delivered, so it does not look.
  assert.doesNotMatch(fails(check("I built site/join.html.", log, { delivered: null })), /The owner set/);
});

test("a rule in what is delivered with a figure the owner gave nowhere is pointed out, with its line", () => {
  const owner = ["Twelve-month contract, £29 a month, £20 joining fee. Members can freeze for up to 2 months."];
  const page = (body: string) => [{ name: "site/join.html", text: `<html><body><p>${body}</p></body></html>` }];
  const found = (body: string, texts = owner) => warns(check("x", null, { delivered: page(body), ownerTexts: texts }));
  // The owner's own figures, and what follows from them (a year at £29 with the fee is £368), pass.
  assert.doesNotMatch(
    found(
      "£29 a month for 12 months. First payment £49, £368 over the year, cancel any time after. Freeze for 2 months, or a year of 12 months.",
    ),
    /in nothing the owner gave/,
  );
  // A notice period and a fee of the session's own are named, with the sentence.
  const added = found("Leave early with 30 days' notice. A £10 fee applies to missed payments.");
  assert.match(added, /site\/join\.html: "Leave early with 30 days' notice\.": 30 days is in nothing the owner gave/);
  assert.match(added, /"A £10 fee applies to missed payments\.": £10 is in nothing the owner gave/);
  // A [placeholder] is the owner's to fill, not a rule.
  assert.doesNotMatch(found("Returns within [return window: 30 days?]."), /in nothing the owner gave/);
  // A period the owner named with no number is one of it: "£60 a year" gives a permit that lasts 12 months.
  assert.doesNotMatch(
    found("The permit lasts for 12 months from the date it starts.", ["A resident permit is £60 a year."]),
    /in nothing the owner gave/,
  );
  assert.match(found("The permit lasts for 12 months.", ["A permit is £60, paid monthly."]), /12 months is in nothing/);
  // Words checked on a page opened with source_check count as given: the law's figure is not the session's.
  assert.doesNotMatch(
    found("You can cancel within 14 days.", [...owner, "the cancellation period ends at the end of 14 days"]),
    /in nothing the owner gave/,
  );
  // It only warns, and it says nothing when the owner's texts are not known.
  assert.equal(fails(check("x", null, { delivered: page("£10 fee."), ownerTexts: owner })), "");
  assert.doesNotMatch(warns(check("x", null, { delivered: page("£10 fee.") })), /in nothing the owner gave/);
});

test("without suggestions to report, no note is asked for; labels, traces and length still are", () => {
  const plain = "Leeds has 3.1 in every 100 of adults who own a dog (counted). York is yours to count next.";
  const log = [run("people", "counted", "  3.1 in every 100 of adults")];
  assert.equal(fails(check(plain, log)), "");
  assert.match(fails(check("Leeds has 3.1 in every 100 of adults who own a dog.", log)), /with no source/);
  assert.match(
    fails(check("Leeds has 4.2 in every 100 of adults who own a dog (counted).", log)),
    /4.2 labelled counted but no tool printed it/,
  );
  // Once a reply has passed after suggest, a later reply in the same folder owes nothing.
  assert.equal(unchecked([...LOG, PASSED()]), false);
  assert.equal(unchecked(LOG), true);
  assert.equal(fails(check(plain, [...LOG, PASSED(), ...log])), "");
});

test("what is delivered is checked: each file, each draft in the reply, or the reply itself", () => {
  const log = [run("people", "counted", "  3.1 in every 100 of adults")];
  const trial = {
    name: "emails/trial.md",
    text: "Start your 14-day free trial of Plus today. Plus is £6.99 a month. Cancel any time.",
  };
  // Word patterns read a trial the agent did not declare: a warning, never a failure.
  const read = check("The email is in emails/trial.md.", log, { delivered: [trial] });
  assert.equal(fails(read), "");
  assert.match(
    warns(read),
    /emails\/trial\.md: reads as a free trial with no line saying what is charged when it ends\. If it asks that of a person, .*give note_check pays: \{ "kind": "free_trial"/,
  );
  // Declared, the trial's words are found in what is delivered, and say what it turns into.
  const declared = (says: string, delivered = [trial]) =>
    fails(check("The email is in emails/trial.md.", log, { delivered, pays: [{ kind: "free_trial", says }] }));
  assert.match(
    declared("Cancel any time"),
    /pays: a free_trial, and "Cancel any time" does not say what is charged when the trial ends/,
  );
  assert.match(
    declared("When the trial ends, Plus is £6.99 a month."),
    /pays: "When the trial ends, Plus is £6\.99 a month\." is not in what is delivered \(emails\/trial\.md\)/,
  );
  assert.equal(
    declared("When the trial ends, Plus is £6.99 a month.", [
      { ...trial, text: `${trial.text} When the trial ends, Plus is £6.99 a month.` },
    ]),
    "",
  );
  // Words copied from a page with its tags and entities are read as its text.
  const page = {
    name: "emails/trial.html",
    text: "<p>If you do nothing, we charge <strong>$12.99 a month</strong>. Cancel in Settings &gt; Subscription.</p>",
  };
  assert.equal(declared("If you do nothing, we charge <strong>$12.99 a month</strong>.", [page]), "");
  assert.ok(
    !warns(
      check("The email is in emails/trial.md.", log, {
        delivered: [trial],
        pays: [{ kind: "free_trial", says: "Plus is £6.99 a month" }],
      }),
    ).includes("reads as a free trial"),
  );
  // A draft in the reply: its figures are the owner's terms (no label needed), its [placeholders] are the owner's to fill.
  const draft = [
    "Here is the reply for customers who write in about the rise:",
    "",
    "> Hi [first name],",
    "> From 1 April Plus goes from £8 to £10 a month. You can cancel any time from your account, or move to Basic at £5 a month.",
    "",
    "It names the cheaper plan first (given: the owner's prices).",
  ].join("\n");
  assert.equal(fails(check(draft, log)), "");
  assert.match(
    warns(
      check(
        draft.replace(
          " You can cancel any time from your account, or move to Basic at £5 a month.",
          " Start a 7-day free trial of Max today.",
        ),
        log,
      ),
    ),
    /the draft at line 3: reads as a free trial with no line/,
  );
  // With nothing delivered, the reply is what the owner takes away, and invented proof in it is flagged unless sourced.
  const advice = "Offer a 14-day free trial; it is the most popular choice.";
  assert.match(warns(check(advice, log)), /the reply: reads as a free trial with no line/);
  assert.ok(check(advice, log).some((f) => f.level === "WARN" && /most popular/.test(f.message)));
  // A reply with nothing delivered can be the customer's own text (a template reply), so a repeating payment in it is
  // still read: a stray hint on advice costs less than a missed cancel line in a message customers get.
  const template = "Thanks for getting in touch. Your plan is now £10 a month from 1 April.";
  assert.match(warns(check(template, log)), /repeating payment with no word on how to cancel/);
  assert.ok(!check("Trusted by 2,000 members, the owner says (given).", log).some((f) => /invented/.test(f.message)));
});

test("figures about people written in words are pointed out, as a hint", () => {
  assert.match(
    warns(check("A pack-led offer would lose about a third of the people who could buy from you.", [])),
    /a third of the people reads as a figure with no source/,
  );
  assert.match(
    warns(check("Leeds has about four times as many dog-owning adults as York.", [])),
    /four times as many reads as a figure/,
  );
  assert.match(warns(check("Two in five households have a dog.", [])), /Two in five reads as a figure/);
  assert.equal(fails(check("Two in five households have a dog.", [])), "");
  assert.doesNotMatch(
    warns(check("Leeds has about four times as many dog-owning adults as York (counted).", [])),
    /reads as a figure/,
  );
  assert.equal(warns(check("Half of the work is done, and a third option is to wait.", [])), "");
});

test("a contradiction the agent listed for terms is put to the owner outside the draft, both sides in their words", () => {
  const clashes = [
    { a: "Fees are fixed for the year", b: "we review them every term" },
    { a: "Funded hours are free", b: "every child pays the £60 charge" },
  ];
  const log = [
    run(
      "terms",
      "counted",
      line("3 terms in request.txt"),
      line(""),
      line("The request contradicts itself in 2 places, as you listed them."),
      clashes.map((c) => ({ type: "clash", ...c })),
    ),
  ];
  assert.deepEqual(clashesOf(log), clashes);
  const draft =
    "```\nFees are fixed for the year, and we review them every term. Funded hours are free; every child pays the £60 charge.\n```";
  const fails = (reply: string) =>
    check(reply, log).filter((f) => f.level === "FAIL" && /contradicts itself/.test(f.message)).length;
  assert.equal(fails(`Here is the policy.\n\n${draft}`), 2);
  // A paraphrase in the agent's own words does not put the owner's sides to them.
  assert.equal(
    fails(
      `Here is the policy.\n\n${draft}\n\nTo confirm:\n1. Fees are fixed but reviewed: which did you mean?\n2. Funded hours are free, yet a charge applies: is it optional?`,
    ),
    2,
  );
  assert.equal(
    fails(
      [
        "Here is the policy.",
        "",
        draft,
        "",
        "To confirm:",
        '1. You wrote "Fees are fixed for the year" and "we review them every term": I wrote that a review changes them from September. Which did you mean?',
        '2. "Funded hours are free", yet "every child pays the £60 charge": is the charge optional for funded children?',
      ].join("\n"),
    ),
    0,
  );
  // Both sides in one point: one in each of two points does not put the clash to the owner.
  assert.equal(
    fails(`${draft}\n\n- "Fees are fixed for the year": kept.\n- "We review them every term": kept too.`),
    2,
  );
  // Both sides listed, but neither asked nor marked as the owner's to confirm, are not put to them either.
  const listed =
    'Clashes: "Fees are fixed for the year" against "we review them every term"; "Funded hours are free" against "every child pays the £60 charge".';
  assert.equal(fails(`${draft}\n\n${listed}`), 2);
  assert.match(
    check(`${draft}\n\n${listed}`, log).find((f) => /contradicts itself/.test(f.message))?.message ?? "",
    /without putting them to the owner/,
  );
  assert.equal(fails(`${draft}\n\n${listed} I wrote the first reading of each, yours to confirm.`), 0);
  // A heading that marks the list marks each point under it.
  assert.equal(
    fails(
      [
        draft,
        "",
        "Contradictions, the reading I wrote, yours to confirm:",
        '- "Fees are fixed for the year" against "we review them every term": fixed; a review sets next September.',
        '- "Funded hours are free" against "every child pays the £60 charge": the charge is optional for funded children.',
      ].join("\n"),
    ),
    0,
  );
});

test("a fact only the owner can say, listed in open for terms, is asked or marked in the reply, never left settled", () => {
  const log = [
    run(
      "terms",
      "counted",
      line("0 terms the owner fixed in request.md"),
      ["return window", "who pays return postage", "shop email"].map((topic) => ({ type: "open", topic })),
    ),
  ];
  assert.deepEqual(openOf(log), ["return window", "who pays return postage", "shop email"]);
  const open = (reply: string, options?: CheckOptions) =>
    check(reply, log, options)
      .filter((f) => f.level === "FAIL" && f.check === "open-fact")
      .map((f) => f.message.match(/^"([^"]+)"/)?.[1]);
  const page = { name: "site/returns.html", text: "<p>Return within 30 days. Email [shop email] to start.</p>" };
  // Written as settled: the owner reads them as their own terms.
  assert.deepEqual(open("Returns: 30 days, and Larkrise pays the postage.", { delivered: [page] }), [
    "return window",
    "who pays return postage",
  ]);
  // A question, the mark, or a lead-in that carries it.
  assert.deepEqual(open("What return window do you want? Who pays return postage?", { delivered: [page] }), []);
  assert.deepEqual(
    open(
      `I could not ask you, so these are my suggestions, yours to confirm:\n- Return window: 30 days.\n- Who pays return postage: the customer.`,
      { delivered: [page] },
    ),
    [],
  );
  // The mark in one point does not cover a fact named in another; nor does a mark inside a draft.
  assert.deepEqual(
    open("- Return window: 30 days.\n- Who pays return postage: you, yours to confirm.", { delivered: [page] }),
    ["return window"],
  );
  assert.deepEqual(
    open("Here it is.\n\n```\nReturn window: 30 days, yours to confirm. Who pays return postage? You.\n```"),
    ["return window", "who pays return postage", "shop email"],
  );
  // A [placeholder] naming it in what is delivered leaves it open; a link's [text](url) is not one.
  assert.deepEqual(open("Return window and who pays return postage: yours to confirm.", { delivered: [page] }), []);
  assert.deepEqual(open("Return window and who pays return postage: yours to confirm.\n\nSee [shop email](x)."), [
    "shop email",
  ]);
  // A fact the owner has answered (nxk.json) is theirs, and no longer open.
  assert.deepEqual(
    open("Who pays return postage: yours to confirm.", { delivered: [page], answered: ["Return window"] }),
    [],
  );
});

test("a simulated share read as how many would act is pointed out, as a hint; a comparison is not", () => {
  const log = [run("scan", "simulated", "Simulated, of every 100 adults: 21.8 as_planned, 26.3 no_minimum.")];
  assert.equal(failing(check("Families: about 21.8 in 100 would book a first pickup (simulated).", log)), "");
  const fails = (reply: string) =>
    check(reply, log).filter((f) => f.level === "WARN" && /how many would act/.test(f.message)).length;
  assert.equal(fails("Families: about 21.8 in 100 would book a first pickup (simulated)."), 1);
  assert.equal(
    fails("Dropping the minimum moved keenness from 21.8 to 26.3 (simulated): families lean in more than students."),
    0,
  );
  // Saying a scan leaves how many would buy to a real test is the point, not a forecast.
  assert.equal(fails("Keenness moved from 21.8 to 26.3 (simulated). It leaves how many would buy to a real test."), 0);
});

test("a corner's size printed by discover is counted; how keen it is there is simulated", () => {
  const log = [
    run(
      "discover",
      "simulated",
      line(
        "  x1.29  landlord_plan     6.6% of adults, about 17.9m | Building with 5 to 19 apartments | 8% there against 12%",
        "simulated",
        { counted: ["6.6% of adults, about 17.9m"] },
      ),
    ),
  ];
  const logged = loggedNumbers(log);
  assert.deepEqual(logged.counted.sort(), [17.9, 6.6].sort());
  assert.ok(logged.simulated.includes(1.29) && logged.simulated.includes(8) && !logged.simulated.includes(17.9));
  assert.equal(
    fails(
      check(
        "The landlord plan's corner: about 17.9m adults in buildings of 5 to 19 flats (counted), 8% keen there (simulated).",
        log,
      ),
    ),
    "",
  );
});

test("a count of adults given as a share of the owner's own users is pointed out, as a hint", () => {
  const log = [run("people", "counted", "24.5 in every 100 adults (counted)")];
  assert.doesNotMatch(
    failing(check("About 24.5 in every 100 of your existing users would find $39.99 hard (counted).", log)),
    /share of the owner's own/,
  );
  const fails = (reply: string, l = log) =>
    check(reply, l).filter((f) => f.level === "WARN" && /share of the owner's own/.test(f.message)).length;
  assert.equal(fails("About 24.5 in every 100 of your existing users would find $39.99 hard (counted)."), 1);
  assert.equal(fails("About 24.5 in every 100 US adults would find $39.99 hard (counted)."), 0);
  assert.equal(fails("About 24.5 in every 100 people like your users would find it hard (counted)."), 0);
  assert.equal(
    fails("24.5 in every 100 of your customers (counted).", [
      ...log,
      run("suggest", "counted", "Among the owner's customers: 24.5 in every 100.", { type: "weighted" }),
    ]),
    0,
  );
});

test("a count of people given as a count of businesses is pointed out; a short count is a figure, and traces to the full one printed", () => {
  const log = [
    run(
      "people",
      "counted",
      "A. x: 12706 people, 6.4% of adults (give or take 0.1); about 17,000,000 of the adults in the US",
    ),
  ];
  assert.equal(failing(check("About 17m small businesses are run by one person (counted, of US adults).", log)), "");
  // Hints and failures together: the first are only ever warnings.
  const fails = (reply: string) => check(reply, log).map((f) => f.message);
  assert.match(
    fails("About 17m small businesses are run by one person (counted, of US adults).").join(" "),
    /a count of people given as a count of businesses \("17m small businesses"\)/,
  );
  assert.match(fails("Small businesses: about 17m (counted, of US adults).").join(" "), /count of businesses/);
  assert.match(fails("6.4% of shops would lean in (simulated, of US adults).").join(" "), /count of businesses/);
  assert.deepEqual(fails("About 17m adults who run businesses (counted, of US adults)."), []);
  assert.match(
    fails("Under 10 employees: the owner decides at 73% of firms (counted).").join(" "),
    /count of businesses \("73% of firms"\)/,
  );
  // How keen people are where they work, and a size said in adults, are not counts of businesses.
  for (const line of [
    "The crew offer scored 11% at firms under 10 and 10% at 10 to 49 (simulated).",
    "Keenness was 11% for firms under 10 (simulated).",
    "27% to 28% (simulated) among firms of under 10.",
    "Maintenance for small businesses: about 17m adults (counted).",
  ]) {
    assert.ok(!fails(line).some((m) => /count of businesses/.test(m)), line);
  }
  assert.match(
    fails("About 18m adults (counted, of US adults).").join(" "),
    /18 labelled counted but no tool printed it/,
  );
  // A count written short with no label is a figure like any other.
  assert.match(fails("Set the contracts against the 6.2m corner.").join(" "), /6\.2m with no source/);
  // A number of firms the people tool printed counting firms is a count of businesses, as it says; an adults count
  // quoted as firms is still pointed out beside it.
  const firms = [
    run(
      "people",
      "counted",
      "10 to 49 employees, and North West England: about 24,000 firms, under 1 in every 100 of the firms.",
      "Within all firms in the UK: about 5,500,000 firms, one-person businesses included.",
      { type: "firms", value: 24000 },
      { type: "firms", value: 5500000 },
      "A. x: 12706 people, 6.4% of adults (give or take 0.1); about 17,000,000 of the adults in the US",
    ),
  ];
  const firmHints = (reply: string) => check(reply, firms).filter((f) => /count of businesses/.test(f.message));
  assert.deepEqual(firmHints("About 24,000 firms with 10 to 49 staff in the North West (counted, of UK firms)."), []);
  assert.deepEqual(firmHints("About 5.5m firms in the UK (counted, of UK firms)."), []);
  assert.equal(firmHints("About 17m small businesses are run by one person (counted, of US adults).").length, 1);
  assert.match(firmHints("About 17m small businesses (counted).")[0].message, /count firms with the people tool/);
  // Computed contracts are the owner's sum, not a count of people.
  assert.deepEqual(
    check("You would need 20 contracts (computed).", [run("sums", "computed", "20")]).filter((f) =>
      /count of businesses/.test(f.message),
    ),
    [],
  );
});

test("blocksOf: a paragraph, or a point with the indented lines under it; a heading keeps the text under it", () => {
  const lines = [
    "Intro line",
    "goes on.",
    "",
    "- **A corner.**",
    "  - who: retired",
    "  - keen: 19%",
    "- Next point",
    "## Heading",
    "Body",
  ];
  assert.deepEqual(
    blocksOf(lines).map((b) => [b.start, b.lines.length]),
    [
      [0, 2],
      [3, 3],
      [6, 1],
      [7, 2],
    ],
  );
});

test("after a discovery read, a corner given with how keen it is needs its size; another group only warns", () => {
  const log = [run("discover", "simulated", "Own corners")];
  const found = (reply: string, l = log) =>
    check(reply, l)
      .filter((f) => /not how many|with no size/.test(f.message))
      .map((f) => f.level);
  // A corner put forward on how keen it is, with no size, fails; with its counted size it passes.
  assert.deepEqual(
    found(
      "- **Safe-at-Home visits** had the sharpest corner. Only 13% were keen there, against 12% overall (simulated).",
    ),
    ["FAIL"],
  );
  assert.deepEqual(
    found(
      "- **Safe-at-Home visits** had the sharpest corner: retired people living alone, about 2.8m US adults (counted). 19% were keen there (simulated).",
    ),
    [],
  );
  // The size in the indented lines under the point counts.
  assert.deepEqual(
    found(
      "- **Senior safety visit.** The corner is low-income adults.\n  - About 6.2m of US adults (counted).\n  - 19% keen there (simulated).",
    ),
    [],
  );
  assert.deepEqual(found("- **Families:** 21% were keen, against 9% of all adults (simulated)."), ["WARN"]);
  // What draws people, fact by fact, is not a group put forward; nor is an idea with no corner.
  assert.deepEqual(
    found("- **Draws:**\n  - Low household resources: simulated 42.2% keen.\n  - It has no corner of its own."),
    [],
  );
  // No discovery read, no rule.
  assert.deepEqual(found("- The sharpest corner: 13% were keen there (simulated).", [run("people", "counted")]), []);
});

test("a group the reply says it cannot count, with no published count, is pointed out, as a hint", () => {
  const log = [run("people", "counted", 'No fact about people mentions "landlord".')];
  assert.equal(
    fails(
      check(
        "1. **Retainers with landlords.** I can't size this group, because nxk counts people, not businesses.",
        log,
      ),
    ),
    "",
  );
  const found = (reply: string, l = log, sources: SourceRecord[] = []) =>
    check(reply, l, { sources }).filter((f) => f.level === "WARN" && /cannot count, with no published/.test(f.message))
      .length;
  // A group put first with no count is warned about, however the reply says it cannot count it.
  assert.equal(
    found("1. **Retainers with landlords.** I can't size this group, because nxk counts people, not businesses."),
    1,
  );
  assert.equal(found("- I can’t count landlords, because no fact in the population data records them."), 1);
  assert.equal(found("The population tool has no field for landlords or EV owners."), 1);
  assert.equal(
    found(
      "These are people, not businesses. That needs a published business count (Census County Business Patterns). I haven't opened one, so I give no figure.",
    ),
    1,
  );
  // A published count, opened and labelled, passes.
  const link = "https://www.census.gov/cbp";
  assert.equal(
    found(
      `- I can't count landlords: there are 4,120 lessors of residential buildings in Georgia (sourced: Census Bureau County Business Patterns, 2023, ${link}).`,
      log,
      [{ url: link, words: "Lessors of residential buildings 4,120" }],
    ),
    0,
  );
  // "No published count" passes only once a page was opened in looking for one.
  const none = "- I can't count EV owners in Georgia, and found no published count.";
  assert.equal(found(none), 1);
  assert.equal(found(none, [...log, run("source", null)]), 0);
});

test("a line a tool said to keep is in the reply, outside any draft, as written", () => {
  const log = [
    run(
      "terms",
      "counted",
      line("1 terms in request.md"),
      line(""),
      line("Sold to businesses: the buyer is a business, and nxk's people are adults."),
      { type: "keep", text: "These counts are of adults, not of businesses." },
    ),
  ];
  const rule = (reply: string, l = log) =>
    check(reply, l).filter((f) => f.level === "FAIL" && /a tool said to keep this line/.test(f.message));
  assert.equal(rule("I built the pricing page.").length, 1);
  assert.deepEqual(rule("I built the pricing page.\n\n**These counts are of adults, not of businesses.**"), []);
  // Other words for it, or the line inside a draft, are not the line kept.
  assert.equal(
    rule("I built the pricing page.\nThese counts are of adults who work at small firms, not of the firms.").length,
    1,
  );
  assert.equal(rule("I built the pricing page.\n\n> These counts are of adults, not of businesses.").length, 1);
  assert.deepEqual(rule("I built the pricing page.", [run("terms", "counted", line("1 terms"))]), []);
});

test("each step that looked further has its line in the reply, the latest of each", () => {
  const looked = (key: string, outcome: ResolutionOutcome, text: string): ResolutionRecord => ({
    type: "resolution",
    key,
    outcome,
    text,
  });
  const probe = [
    "Looked further at aged 65 or over, among adults: it is about the same, 24.2 in every 100 (counted),",
    "in every group of age, work, household, money, health and place. Result: confirmed; who your customers are does not move it.",
  ].join(" ");
  const again = probe.replace(
    "confirmed; who your customers are does not move it",
    "could not tell; no figure was given for where the choice changes",
  );
  const log = [
    run("probe", "counted", looked("probe:age_years=65..120|", "confirmed", probe)),
    run("probe", "counted", looked("probe:age_years=65..120|", "unclear", again)),
    run("suggest", "counted", line("=== Deposit")),
  ];
  const rule = (reply: string) =>
    check(reply, log)
      .filter((f) => f.level === "FAIL" && f.check === "looked-further")
      .map((f) => f.message);
  assert.equal(rule("I wrote the policy.").length, 1);
  assert.match(
    rule("I wrote the policy.")[0],
    /Put this line in the reply, outside any draft, as written: "Looked further at aged 65 or over.*could not tell/,
  );
  // The latest line for the group, in the reply's own words around it; the earlier one is not asked for.
  assert.deepEqual(rule(`I wrote the policy.\n\n- **${again}**`), []);
  assert.equal(rule(`I wrote the policy.\n\n${probe}`).length, 1);
  // Inside a draft it is not said to the owner.
  assert.equal(rule(`I wrote the policy.\n\n> ${again}`).length, 1);
});

const AT_WORK = [
  run(
    "discover",
    "simulated",
    "Asked at work: solo, crew. Each person answered for where they work.",
    { type: "at_work", ideas: ["solo", "crew"] },
    "",
    line(
      [
        "Who decides on software and SaaS, by the size of the organisation: counted on the generated people in work at each size.",
        "  Fewer than 10 employees          6.5% of adults, about 17.6m",
        "      how their organisation buys (of the people who work at one): the owner or one person decides 73%, informal quotes from a few suppliers 22%",
        "      their part in buying it (of the same people): gives final sign-off 41%, approves within a budget 12%, recommends 9%, uses or asks for it 30%",
        "  50 to 249 employees              4.1% of adults, about 11.0m",
        "      their part in buying it (of the same people): gives final sign-off 6%, approves within a budget 14%, recommends 18%, uses or asks for it 47%",
      ].join("\n"),
      "counted",
    ),
  ),
];

test("after an offer is asked at work, a reply that seems not to say who decides it is pointed out, as a hint", () => {
  const decides = (reply: string, l = AT_WORK) =>
    check(reply, l)
      .filter((f) => /who decides/i.test(f.message))
      .map((f) => f.level);
  const none =
    "Sell to crews of 2 to 10 first (my judgement). The owner is usually user and buyer, so there is no procurement. Bigger contractors take months to decide.";
  assert.ok(check(none, AT_WORK).some((f) => f.level === "WARN" && /seems not to say who decides it/.test(f.message)));
  assert.ok(decides(none).every((level) => level === "WARN"));
  const named = [
    "Sell to crews of 2 to 10 first (my judgement).",
    "",
    "In a crew the owner signs off: at firms under 10, 41% of the people in work give final sign-off themselves (counted). At 50 to 249, 6% do, and 14% approve within a budget (counted).",
  ].join("\n");
  assert.deepEqual(decides(named), []);
  // A size of firm put forward with no one deciding there is pointed out too.
  const half = `${named}\n\nBigger contractors take months to decide.`;
  assert.ok(
    check(half, AT_WORK).some(
      (f) => f.level === "WARN" && /name large firms without saying who decides/.test(f.message),
    ),
  );
  // No at-work reading in the log: no such hint.
  assert.deepEqual(decides(none, [run("discover", "simulated")]), []);
});

test("a reply that ranks sizes of firm and tests only one is pointed out, as a hint", () => {
  const log = [
    run("discover", "simulated", "Asked at work: solo, crew. Each person answered for where they work.", {
      type: "at_work",
      ideas: ["solo", "crew"],
    }),
  ];
  const ranks =
    "Sell first to crews of 2 to 10, where the owner signs off. Put solo operators second; there the owner decides alone.";
  const one = `${ranks}\n\nNext: talk to 20 owners of 3 to 8 person plumbing shops and count who asks for the free month.`;
  assert.ok(
    check(one, log).some(
      (f) =>
        f.level === "WARN" &&
        /seems to rank one-person, small firms, but its test with real firms reaches one size/.test(f.message),
    ),
  );
  assert.ok(!check(one, log).some((f) => f.level === "FAIL" && /test with real firms/.test(f.message)));
  for (const test of [
    "Run the same pitch to 15 solo operators to compare.",
    "Offer solos and crews the same deal and record sign-ups for each.",
  ]) {
    assert.ok(!check(`${one} ${test}`, log).some((f) => /test with real firms/.test(f.message)), test);
  }
  // A sentence quoting the scan is not a test.
  assert.ok(
    check(`${one} The crew offer scores 26% (simulated) against 11% for solos.`, log).some((f) =>
      /test with real firms/.test(f.message),
    ),
  );
  // A reply that does not rank sizes (a trade's second line, aimed at small businesses) is not held to it.
  const trade =
    "I'd start with maintenance contracts for small businesses, where the owner signs off. Talk to 10 shop owners this month.";
  assert.ok(!check(trade, log).some((f) => /test with real firms/.test(f.message)));
});

test("a list item or table row with no label takes its lead-in's, and a tool's label taken so is still traced", () => {
  const log = [run("people", "counted", "South East: 30.1%", "London: 28.7%", "Kent about 81,000")];
  const list =
    "Among adults giving 20 or more hours of care, the share who work is (counted):\n- South East: 30.1%\n- London: 28.7%";
  assert.ok(!check(list, log).some((f) => /with no source/.test(f.message)));
  const table =
    "Share who work (counted):\n\n| Region | Share |\n| --- | --- |\n| South East | 30.1% |\n| London | 28.7% |";
  assert.ok(!check(table, log).some((f) => /with no source/.test(f.message)));
  const nested = "- **Who leans in (counted):**\n  - Kent: about 81,000";
  assert.ok(!check(nested, log).some((f) => /with no source/.test(f.message)));
  // Taken from the lead-in, "counted" must still be a figure a tool printed.
  assert.ok(check("Counted:\n- Wales: 23.2%", log).some((f) => /labelled counted but no tool printed/.test(f.message)));
  // A line that is not a list item or a row takes nothing.
  assert.ok(check("All counted.\nWales has 23.2%.", log).some((f) => /with no source/.test(f.message)));
});

test("the length check holds the session's own prose to the words asked for, never the lines other checks ask for", async () => {
  const { REPLY_WORDS, requiredLines } = await import("./checks/form.ts");
  const prose = (n: number) => Array.from({ length: n }, () => "word").join(" ");
  const length = (text: string, runs: LogRun[] | null = null) =>
    checkReply(text, runs).filter((f) => f.check === "length");
  assert.equal(length(prose(REPLY_WORDS)).length, 0);
  assert.deepEqual(
    length(prose(REPLY_WORDS + 1)).map((f) => f.level),
    ["FAIL"],
  );
  assert.match(length(prose(REPLY_WORDS + 1))[0].message, /401 words of your own prose/);
  // The note and its items, a kept line, a look-further line, the list to confirm and a draft are not the session's
  // prose: a long reply made of them is only warned.
  const log = [
    run("terms", "counted", { type: "open", topic: "return window" }),
    run(
      "suggest",
      "counted",
      { type: "keep", text: "These counts are of adults, not of businesses." },
      { type: "resolution", key: "probe:x", outcome: "confirmed", text: "Looked further at x: y. Result: confirmed." },
    ),
  ];
  const long = [
    prose(200),
    "",
    "Worth considering:",
    `- Opening hours: ${prose(40)}`,
    `- Contract: ${prose(40)}`,
    `- Deposit: ${prose(40)}`,
    "",
    `Something else: ${prose(10)}`,
    "",
    "These counts are of adults, not of businesses.",
    "Looked further at x: y. Result: confirmed.",
    `Yours to confirm: return window, 30 days; ${prose(40)}`,
    "",
    "```",
    prose(80),
    "```",
  ].join("\n");
  const lines = long.split("\n");
  const required = requiredLines({
    lines,
    drafts: new Set([13, 14, 15]),
    runs: log,
  });
  assert.deepEqual(
    lines.flatMap((line, i) => (line.trim() && !required.has(i) ? [i] : [])),
    [0, 7],
  );
  assert.deepEqual(
    length(long, log).map((f) => f.level),
    ["WARN"],
  );
  assert.match(length(long, log)[0].message, /\(212 of them your own prose\)/);
  // The same mark on a question, or a question naming an open fact, is a point to the owner; other prose is not.
  assert.equal(requiredLines({ lines: ["What is your return window?"], drafts: new Set(), runs: log }).size, 1);
  assert.equal(requiredLines({ lines: ["What do you think?"], drafts: new Set(), runs: log }).size, 0);
});

test("a delivered file that is not found says where it looked", () => {
  const folder = mkdtempSync(join(tmpdir(), "nxk-"));
  assert.throws(
    () => readDelivered("letters/price-rise.md", folder),
    (error) => {
      assert.ok(error instanceof Error);
      assert.ok(error.message.includes(join(folder, "letters/price-rise.md")), error.message);
      return true;
    },
  );
});

test("a zero amount is not an unsourced figure", () => {
  const reply = `${BLOCK("App only rules out 8.4 in every 100 of gym members (counted).")}\n\n$0 was spent on the scan.`;
  assert.equal(fails(check(reply, LOG)), "");
});
