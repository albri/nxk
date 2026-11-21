import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { exploring, ranTool } from "../hooks/stop-check.ts";
import { sellsToBusinesses } from "../scripts/businesses.ts";
import { ownCorners, scoresOf } from "../scripts/corners.ts";
import type { PeopleMap } from "../scripts/population.ts";
import {
  addScan,
  addSegment,
  addStudy,
  emptyProduct,
  scansDir,
  type NewSegment,
  type Product,
  type Scan,
  type ScanCorner,
  type ScanIdea,
  type StudyStatus,
} from "../scripts/product.ts";
import { fieldsToScan, probesOf } from "../scripts/scan-answers.ts";
import { logText, run as scriptRun } from "../scripts/testing.ts";
import { roomFor, strengthOf } from "./common.ts";
import { businessOf, moneyOf, ordered, planOf, priceOf, scoped, type Scoped } from "./explorer.ts";
import type { Arguments } from "./protocol.ts";
import { seedProduct, start } from "./testing.ts";

// Saved answers as discover.ts keeps them, for two offers: an app wanted by people in work, juniors and students, a
// clerk by retired people, people offline and directors.
const ANSWERS = {
  app: {
    "home_and_travel.home_tenure=owned_outright": 0.1,
    "home_and_travel.home_tenure=owned_with_a_mortgage_or_loan": 0.3,
    "home_and_travel.home_tenure=rented_from_a_private_landlord_or_letting_agency": 0.25,
    "work.economic_activity_status=in_employment": 0.3,
    "work.economic_activity_status=retired": 0.05,
    "work.economic_activity_status=student_not_in_employment": 0.35,
    "digital_and_media.internet_use_frequency=daily_or_almost_daily": 0.3,
    "digital_and_media.internet_use_frequency=never_used_the_internet": 0.01,
    "work.job_level=entry_level_or_trainee": 0.35,
    "work.job_level=experienced": 0.25,
    "work.job_level=senior_or_lead": 0.2,
    "work.job_level=director_or_executive": 0.15,
    "work.job_level=not_in_employment": 0.05,
  },
  clerk: {
    "home_and_travel.home_tenure=owned_outright": 0.3,
    "home_and_travel.home_tenure=owned_with_a_mortgage_or_loan": 0.1,
    "home_and_travel.home_tenure=rented_from_a_private_landlord_or_letting_agency": 0.1,
    "work.economic_activity_status=in_employment": 0.1,
    "work.economic_activity_status=retired": 0.35,
    "work.economic_activity_status=student_not_in_employment": 0.05,
    "digital_and_media.internet_use_frequency=daily_or_almost_daily": 0.1,
    "digital_and_media.internet_use_frequency=never_used_the_internet": 0.4,
    "work.job_level=entry_level_or_trainee": 0.05,
    "work.job_level=experienced": 0.1,
    "work.job_level=senior_or_lead": 0.2,
    "work.job_level=director_or_executive": 0.35,
    "work.job_level=not_in_employment": 0.3,
  },
};

// nxk.json's scans as these tests save them: with no date, and corners whose strength is left out or null (the
// explorer works it out from the odds).
type SeededCorner = Omit<ScanCorner, "strength"> & { strength?: null };
interface SeededScan extends Omit<Scan, "date" | "corners"> {
  corners: SeededCorner[];
}
interface Seeded {
  discovery: { scans: SeededScan[] };
}

function seed(dir: string): void {
  const kb = join(dir, "nxk.json"),
    product: Seeded = JSON.parse(readFileSync(kb, "utf8"));
  const corner = (key: string, among: string, share: number, odds: number) => ({
    key,
    among,
    label: among,
    share,
    odds,
    strength: null,
    keen: 0.3,
    room: 0.2,
  });
  product.discovery.scans.push({
    id: "scan1",
    kind: "ideas",
    label: "first",
    ideas: [
      { key: "app", offer: "An app that files your paperwork, £4.99 a month." },
      { key: "clerk", offer: "A named clerk who does your forms by phone, £9.99 a month." },
      { key: "form", offer: "A form-filling service by post, £2 a month." },
    ],
    corners: [
      corner("clerk", "economic_activity_status=retired", 0.2, 2.5),
      corner("app", "economic_activity_status=student_not_in_employment", 0.05, 2.8),
      { ...corner("form", "household_type=one_person_household", 0.1, 2.2), label: "Lives alone", keen: 0.2 },
    ],
    nothing_for: [
      { among: "has_long_term_condition=yes", label: "Has a long-term condition", share: 0.3, best: "app" },
    ],
  });
  writeFileSync(kb, JSON.stringify(product));
  const spec = join(dir, ".nxk", "scans", "ideas-uk.spec");
  mkdirSync(spec, { recursive: true });
  for (const [key, answers] of Object.entries(ANSWERS))
    writeFileSync(
      join(spec, `scan-${key}.jsonl`),
      Object.entries(answers)
        .map(([id, p]) => JSON.stringify({ id, r: 0, p, usd: 0.001 }))
        .join("\n"),
    );
}

test("prices and the business's side: customers needed for the owner's target, as a share of the group", () => {
  assert.deepEqual(priceOf("Text reminders, £2.49 a month."), { text: "£2.49", per: "month", monthly: 2.49 });
  assert.equal(priceOf("£120 a year")?.monthly, 10);
  assert.equal(priceOf("£40 once")?.monthly, null);
  assert.equal(priceOf("no price"), null);
  // Only the owner's figures: the rest of the product is not read.
  const product = {
    money: [
      { name: "margin", value: 50, source: "owner" },
      { name: "target profit a month", value: 1000, source: "owner" },
      { name: "exploration budget", value: 1, source: "guess" },
    ],
  } as Scoped;
  assert.deepEqual(moneyOf(product, null), { margin: 50, target: 1000, budget: null });
  // With no budget given for the product, the plugin's scan budget stands in.
  assert.equal(moneyOf(product, 1).budget, 1);
  const side = businessOf({ offer: "£10 a month", share: 0.01 }, moneyOf(product), "uk");
  assert.equal(side.needed, 200);
  assert.match(
    side.line,
    /200 paying customers make 1000 a month: 1 in every 2,774 of this group nationwide \(computed\)/,
  );
  // Where the owner sells, the group there is the market.
  assert.match(
    businessOf({ offer: "£10 a month", share: 0.001 }, moneyOf(product), "uk", { where: "Leeds" }).line,
    /of this group in Leeds \(computed\)/,
  );
  // Sold to businesses, or a group cut by its work: customers are businesses, never set against adults.
  assert.ok(
    sellsToBusinesses("an electrical maintenance contract for small shops, restaurants and offices. $175 a month"),
  );
  assert.ok(!sellsToBusinesses("a home electrical membership. $19 a month"));
  // Written as a list, or priced per user or per business.
  assert.ok(sellsToBusinesses("one app for plumbers, electricians and HVAC businesses. $29 per user a month"));
  assert.ok(sellsToBusinesses("A job, quote and invoice app for a one-person plumbing, electrical or HVAC business."));
  assert.ok(sellsToBusinesses("an invoicing app. $25 a month per business"));
  assert.ok(sellsToBusinesses("subcontracting to small homebuilders and remodelers"));
  assert.ok(!sellsToBusinesses("a travel card for a business trip abroad, £5 a month"));
  assert.ok(!sellsToBusinesses("a meal box for nurses, care workers and warehouse staff on shifts"));
  const b2b = businessOf(
    { offer: "a maintenance contract for small shops. $175 a month", share: 0.023 },
    { margin: 30, target: 2000 },
    "us",
    { where: "Georgia" },
  );
  assert.equal(b2b.takeUp, undefined);
  assert.match(
    b2b.line,
    /39 paying customers make 2000 a month \(computed\); sold to businesses: set paying customers against a count of that kind of business in Georgia, not against this group of adults: firms counted with people \(unit firms\) by their size, sector, industry and place, or a published count \(sourced: Census Bureau County Business Patterns, opened with source_check\)/,
  );
  assert.match(
    businessOf(
      { offer: "$19 a month", among: "employer_sector=self_employed_or_family_business", share: 0.02 },
      { margin: null, target: null },
      "us",
    ).line,
    /a group cut by its work: .* in the owner's area/,
  );
  // An offer scanned at work is sold to businesses whatever its words say.
  const asked = businessOf(
    { offer: "a job scheduling app for field teams. $29 per user a month", at_work: "software_and_saas", share: 0.03 },
    { margin: 80, target: 5000 },
    "us",
  );
  assert.equal(asked.takeUp, undefined);
  assert.match(asked.line, /sold to businesses: set paying customers against a count of that kind of business/);
});

test("a corner no keener on its offer than everyone is not followed, however much it prefers it to the others", () => {
  const c = (key: string, keen: number, room: number, odds = 2.5) => ({
    key,
    keen,
    room,
    odds,
    strength: strengthOf(odds),
    share: 0.1,
  });
  assert.deepEqual(
    ordered([c("cold", 0.09, 0.09), c("keen", 0.3, 0.2), c("none", 0.5, 0.2, 1.1), c("faint", 0.25, 0.2, 1.3)]).map(
      (x) => x.key,
    ),
    ["keen", "faint"],
  );
  // The owner's own offer leads, whatever the others' strength, and is never set aside as cold: its lead is who wants it.
  assert.deepEqual(
    ordered([c("keen", 0.3, 0.2, 3), { ...c("theirs", 0.21, 0.2, 1.3), own: true }]).map((x) => x.key),
    ["theirs", "keen"],
  );
  // A quarter keener than everyone at least: 15% against 13% is a group cold on the whole list.
  assert.deepEqual(
    ordered([c("pet_plan", 0.15, 0.13, 4.2)]).map((x) => x.key),
    [],
  );
});

test("the explorer walks one research question: keep, split, rivals, budget, widen, then report", async () => {
  const s = start();
  try {
    await s.ready;
    const next = async () => (await s.call("explore_next", {})).content[0].text;
    // The explorer reads one research question at a time: with none open, research_start comes first.
    assert.match(await next(), /Next \(stop\): research_start/);
    const opened = (await s.call("research_start", { question: "Who would want help with paperwork?", country: "uk" }))
      .content[0].text;
    assert.match(opened, /^Research r1 opened: "Who would want help with paperwork\?"/);
    assert.match(opened, /Path now: research/);
    seed(s.dir);

    let text = await next();
    assert.match(
      text,
      /^Research r1: "Who would want help with paperwork\?" \(UK\)\. Its scans so far cost 2\.6 US cents for 2 versions; no budget set\./,
    );
    assert.match(
      text,
      /Not followed: form's corner \(Lives alone\) prefers it x2\.20 over their other offers but is barely keener on it than everyone, 20% against 20% of all adults/,
    );
    assert.match(text, /Next \(free\): segment_add \{"from_scan":"scan1","idea":"clerk"/); // strong corners, then the bigger first
    assert.match(
      text,
      /Groups no offer serves \(latest scan\):\n {2}- Has a long-term condition: 30\.0 in every 100 adults nationwide \(counted\)/,
    );
    // Nothing has been looked into yet: no line on what it found.
    assert.doesNotMatch(text, /Looked further/);
    await s.call("segment_add", { from_scan: "scan1", idea: "clerk", label: "retired people" });
    text = await next();
    assert.match(text, /Next \(free\): segment_add \{"from_scan":"scan1","idea":"app"/);
    // A move made since the first call: what it found, against the lead the explorer started from.
    assert.match(
      text,
      /\nKeep in the reply, outside any draft: "Looked further at who it is for \(kept 1 group\): the lead is retired people, for \\"clerk\\"\. Result: confirmed; as at the first look\."$/,
    );
    await s.call("segment_add", { from_scan: "scan1", idea: "app", label: "students" });

    assert.match(await next(), /Next \(free\): corner_split \{"segment":"s1"\}/);
    assert.match(await next(), /Nothing has changed since the last call: its move \(split\) was not made/);
    const split = (await s.call("corner_split", { segment: "s1" })).content[0].text;
    assert.match(split, /^s1 \(retired people\): .* prefer clerk x\d\.\d\d over their average offer/);
    assert.match(
      split,
      /Keenest inside it:\n {2}.*\(counted\); x\d\.\d\d, \d+% keen \(simulated\)\. among: economic_activity_status=retired,/,
    );
    assert.match(
      split,
      /\nKeep in the reply, outside any draft: "Looked further at who inside retired people prefers \\"clerk\\" most: .*\. Result: (changed|confirmed|could not tell)[;.]/,
    );
    await s.call("corner_split", { segment: "s2" });
    // The splits are the research question's, not the product's.
    assert.deepEqual(JSON.parse(readFileSync(join(s.dir, "nxk.json"), "utf8")).research[0].explore.splits, [
      "s1",
      "s2",
    ]);

    // Rivals need a web search: the session is told the move after it, for when it has none. Research asks the owner
    // nothing but a budget: never their margin, target or a choice.
    text = await next();
    assert.match(text, /Next \(web\): segment_rival \{"segment":"s1"/);
    assert.match(
      text,
      /If you cannot, tell the owner the rivals are not looked up yet, and go on to the move after it: owner_ask \{"kind":"figure","topic":"exploration budget"/,
    );
    await s.call("segment_rival", { segment: "s1", none_found: "searched 'paperwork help for pensioners'" });
    await s.call("segment_rival", { segment: "s2", none_found: "searched 'student admin app'" });

    text = await next();
    assert.match(text, /Next \(owner\): owner_ask \{"kind":"figure","topic":"exploration budget"/);
    assert.match(text, /business: £9\.99 a month; the owner's margin and target profit are not known yet/);
    // Figures the owner gave anyway size each lead's business side.
    await s.call("owner_answer", { kind: "figure", topic: "margin", value: 60 });
    await s.call("owner_answer", { kind: "figure", topic: "target profit a month", value: 3000 });
    assert.match(
      await next(),
      /business: at £9\.99 a month and 60% margin, 501 paying customers make 3000 a month: .* of this group nationwide \(computed\)/,
    );

    await s.call("owner_answer", { kind: "figure", topic: "exploration budget", value: 0.5 });
    text = await next();
    assert.match(text, /Next \(paid\): ideas_scan \{"label":"widen1",.*"max_usd":0\.47\}/);
    assert.equal(exploring(JSON.parse(readFileSync(join(s.dir, "nxk.json"), "utf8")))?.step, "widen");

    // The widen ran and found no strong corner among its new offers: it is counted dry, the gap is not offered again,
    // and with nothing left worth doing the explorer says report.
    const kb = join(s.dir, "nxk.json"),
      product: Seeded = JSON.parse(readFileSync(kb, "utf8"));
    product.discovery.scans.push({
      id: "scan2",
      kind: "ideas",
      label: "widen1",
      ideas: [...product.discovery.scans[0].ideas, { key: "care", offer: "Forms help for carers, £3 a month." }],
      corners: [
        ...product.discovery.scans[0].corners,
        { key: "care", among: "has_long_term_condition=yes", label: "x", share: 0.3, odds: 1.1, keen: 0.2, room: 0.2 },
      ],
      nothing_for: [],
    });
    writeFileSync(kb, JSON.stringify(product));
    text = await next();
    assert.match(text, /Next \(stop\): guide \{"topic":"research"\}/);
    assert.match(text, /2 strong lead\(s\), kept, split and looked up\. Report the findings/);
    assert.match(text, /This ends the exploring: report what the research found/);
    assert.equal(JSON.parse(readFileSync(kb, "utf8")).research[0].explore.dry, 1);
    assert.equal(exploring(JSON.parse(readFileSync(kb, "utf8"))), null);
    // No tool picks a segment for the owner.
    assert.ok(!(await s.request("tools/list")).result.tools.some((t) => t.name === "segment_choose"));
  } finally {
    s.close();
  }
});

test("two research questions in one folder never mix their leads; a saved scan is read when the question names it", async () => {
  const s = start();
  try {
    await s.ready;
    const next = async () => (await s.call("explore_next", {})).content[0].text;
    await s.call("research_start", { question: "Who would want help with paperwork?", country: "uk" });
    seed(s.dir);
    assert.match(await next(), /Next \(free\): segment_add \{"from_scan":"scan1","idea":"clerk"/);
    // A second question closes the first and starts from nothing: scan1 is not its.
    const second = (await s.call("research_start", { question: "Who would pay for dog walking?", budget: 1 }))
      .content[0].text;
    assert.match(second, /^Research r2 opened/);
    assert.match(second, /Budget for scans: \$1, as the owner gave it/);
    let text = await next();
    assert.match(
      text,
      /^Research r2: "Who would pay for dog walking\?" \(UK\)\. No scan of its own has answers yet, of a budget of \$1\./,
    );
    assert.match(text, /Next \(stop\): product/);
    assert.match(text, /Nothing has been scanned in this research yet/);
    const kb: Product = JSON.parse(readFileSync(join(s.dir, "nxk.json"), "utf8"));
    assert.deepEqual(
      kb.research.map((r) => [r.id, r.status]),
      [
        ["r1", "closed"],
        ["r2", "open"],
      ],
    );
    // A third question about the saved scan reads it, and its spend is not counted against this question's budget.
    const bad = await s.call("research_start", { question: "What did it find?", include: ["nope"] });
    assert.equal(bad.isError, true);
    assert.match(bad.content[0].text, /No saved scan nope/);
    await s.call("research_start", { question: "What did my paperwork scan find?", include: ["first"], budget: 0.5 });
    text = await next();
    assert.match(text, /No scan of its own has answers yet, of a budget of \$0\.5\./);
    assert.match(text, /Next \(free\): segment_add \{"from_scan":"scan1","idea":"clerk"/);
  } finally {
    s.close();
  }
});

test("the next move after a tool in research is the one explore_next names, read from the open question", async () => {
  const s = start();
  try {
    await s.ready;
    await s.call("research_start", { question: "Who would want help with paperwork?", country: "uk" });
    seed(s.dir);
    const named = async () => /^Next \(\w+\): (.+)$/m.exec((await s.call("explore_next", {})).content[0].text)?.[1];
    for (const [tool, args] of [
      ["segment_add", { from_scan: "scan1", idea: "clerk", label: "retired people" }],
      ["segment_add", { from_scan: "scan1", idea: "app", label: "students" }],
      // A split is kept with the question, not the product: read from the product, s1 would be named again.
      ["corner_split", { segment: "s1" }],
      ["corner_split", { segment: "s2" }],
      ["segment_rival", { segment: "s1", none_found: "searched 'paperwork help for pensioners'" }],
      ["segment_rival", { segment: "s2", none_found: "searched 'student admin app'" }],
      ["owner_answer", { kind: "figure", topic: "exploration budget", value: 0.5 }],
    ] satisfies [string, Arguments][]) {
      const text = (await s.call(tool, args)).content[0].text;
      const nudge = text.split("\n").find((line) => line.startsWith("Next: "));
      assert.equal(nudge?.startsWith(`Next: ${await named()}`), true, `${tool}: ${nudge}`);
    }
  } finally {
    s.close();
  }
});

test("the stop hook holds an exploring session once, only for a move Claude can make after progress", () => {
  const said = (name: string) =>
    JSON.stringify({ type: "assistant", message: { content: [{ type: "tool_use", name, input: {} }] } });
  assert.equal(ranTool(said("mcp__plugin_nxk_nxk__explore_next"), "explore_next"), true);
  assert.equal(ranTool(said("mcp__plugin_nxk_nxk__product"), "explore_next"), false);
  // The explorer keeps its state on the open research question.
  const explore = (kind: string, progress: boolean, status: StudyStatus = "open") =>
    ({
      research: [{ id: "r1", status, explore: { next: { kind, step: "x", tool: "y" }, progress } }],
    }) as Product; // only its research question is read
  assert.ok(exploring(explore("free", true)));
  assert.equal(exploring(explore("free", true, "closed")), null);
  assert.ok(exploring(explore("paid", true)));
  assert.equal(exploring(explore("free", false)), null);
  assert.equal(exploring(explore("owner", true)), null);
  assert.equal(exploring(explore("web", true)), null);
  assert.equal(exploring(explore("stop", true)), null);
  assert.equal(exploring({} as Product), null);
});

for (const work of [false, true])
  test(`a group's keenness reads the same in the scan, in corner_split and when a part of it is kept${work ? ", for offers asked at work" : ""}`, async () => {
    // Offers asked at work are read among the people in work (discover.ts), sizes still of all adults.
    const room = roomFor("uk", work);
    const scored = Object.entries(ANSWERS).map(([key, answers]) => ({
      key,
      ...scoresOf(room, new Map(Object.entries(answers))),
    }));
    const clerk = ownCorners(room, scored).ideas.find((c) => c.key === "clerk");
    assert.ok(clerk);
    const among = [
      ...clerk.facts.map((f) => `${f.field}=${f.code}`),
      ...(work ? ["organisation_size!=not_in_employment"] : []),
    ].join(",");
    const s = start();
    try {
      await s.ready;
      seedProduct(s.dir, {
        name: "Paperwork",
        description: "Help with household paperwork",
        stage: "idea",
        country: "uk",
      });
      seed(s.dir);
      const kb = join(s.dir, "nxk.json"),
        product: Seeded = JSON.parse(readFileSync(kb, "utf8"));
      product.discovery.scans[0].corners = [
        {
          key: "clerk",
          among,
          label: "x",
          share: clerk.share * room.scale,
          odds: clerk.odds,
          keen: clerk.keen,
          room: clerk.room,
          ...(work ? { room_of: "people in work" } : {}),
        },
      ];
      if (work) for (const idea of product.discovery.scans[0].ideas) idea.buying_category = "professional_services";
      writeFileSync(kb, JSON.stringify(product));
      // Among the people in work clerk's corner may be weak: it is kept by naming it.
      const corner = (
        await s.call("segment_add", {
          from_scan: "scan1",
          idea: "clerk",
          label: "the corner",
          ...(work ? { among } : {}),
        })
      ).content[0].text;
      assert.match(
        corner,
        new RegExp(
          `^Kept s1: the corner \\(.*\\): ${(Math.round(1000 * clerk.share * room.scale) / 10).toFixed(1)} in every 100 UK adults`,
        ),
      );
      assert.match(
        corner,
        new RegExp(`% keen there against \\d+% of ${work ? "people in work" : "all adults"} \\(simulated\\)`),
      );
      // Among the people in work the corner is small (directors who own outright): show its small parts too.
      const split = (await s.call("corner_split", { segment: "s1", ...(work ? { min: 0.01 } : {}) })).content[0].text;
      assert.equal(/prefer clerk x(\d+\.\d\d)/.exec(split)?.[1], clerk.odds.toFixed(2));
      assert.match(
        split,
        new RegExp(
          `^s1 \\(the corner\\): ${(Math.round(1000 * clerk.share * room.scale) / 10).toFixed(1)} in every 100 adults .* of ${work ? "people in work" : "all adults"} \\(simulated\\)`,
        ),
      );
      const keenest = split.split("Keenest inside it:\n")[1].split("\n")[0];
      const sub = /\(counted\); x(\d+\.\d\d), .* among: (.+)$/.exec(keenest);
      assert.ok(sub);
      const [, x, part] = sub;
      const kept = (await s.call("segment_add", { from_scan: "scan1", idea: "clerk", among: part, label: "a part" }))
        .content[0].text;
      assert.match(kept, new RegExp(`prefer clerk x${x.replace(".", "\\.")} over their average idea`));
    } finally {
      s.close();
    }
  });

test("a paid scan runs one at a time in the background: a call while it runs sends nothing, the explorer waits, then reads", async () => {
  const s = start();
  try {
    await s.ready;
    seedProduct(s.dir, {
      name: "Paperwork",
      description: "Help with household paperwork",
      stage: "idea",
      country: "uk",
    });
    await s.call("research_start", { question: "Who would want help with paperwork?" });
    seed(s.dir);
    const scans = join(s.dir, ".nxk", "scans"),
      run = join(scans, "first.run.json");
    writeFileSync(
      run,
      JSON.stringify({ pid: process.pid, started: new Date(Date.now() - 5 * 60000).toISOString(), label: "first" }),
    );
    // What the scan printed so far, and what it meant (the pace it records beside the line).
    const paced = "Paced to 50,000 tokens a minute: about 14 minutes.";
    writeFileSync(join(scans, "first.run.log"), `${paced}\n`);
    writeFileSync(
      join(scans, "first.run.jsonl"),
      logText([scriptRun("scan", "simulated", paced, { type: "paced", minutes: 14 })]),
    );
    const ideas = ["a", "b", "c"].map((key) => ({ key, offer: `Offer ${key}, £1 a month.` }));
    const refused = (await s.call("ideas_scan", { label: "second", ideas, max_usd: 0.1 })).content[0].text;
    assert.match(
      refused,
      /^Another scan \(first\) is still running in the background: started 5 minutes ago, paced to about 14 minutes, so about 9 more\. Nothing new was sent: one scan runs at a time\. Calling ideas_scan with label "first" waits for it/,
    );
    let text = (await s.call("explore_next", {})).content[0].text;
    assert.match(text, /Next \(wait\): ideas_scan \{"label":"first"\}/);
    assert.doesNotMatch(text, /Nothing has changed since the last call/);
    assert.equal(exploring(JSON.parse(readFileSync(join(s.dir, "nxk.json"), "utf8"))), null);
    writeFileSync(run, JSON.stringify({ pid: 2 ** 22 + 12345, started: new Date().toISOString(), label: "first" })); // no such process: finished
    text = (await s.call("explore_next", {})).content[0].text;
    assert.match(
      text,
      /Next \(free\): ideas_scan \{"label":"first"\}\nWhy: The scan first has finished in the background: read it/,
    );
    // Another scan is not started over one finished and unread: its record would be dropped unread.
    const unread = await s.call("ideas_scan", { label: "second", ideas, max_usd: 0.1 });
    assert.ok(unread.isError);
    assert.match(
      unread.content[0].text,
      /^The scan first has finished and is not read yet: read it first with ideas_scan and label "first" alone/,
    );
    assert.ok(existsSync(run));
  } finally {
    s.close();
  }
});

// Synthetic saved answers for every field a scan with `picked` named asks about: each idea leans its own way on each value.
export function answersFor(keys: string[], picked: string[] = []): Record<string, { id: string; p: number }[]> {
  const map: PeopleMap = JSON.parse(readFileSync(new URL("../maps/uk.json", import.meta.url), "utf8"));
  const wanted = new Set(fieldsToScan(map.fields, { picked }).names);
  const lean = (text: string) => {
    let h = 7;
    for (const c of text) h = (h * 31 + c.charCodeAt(0)) % 9973;
    return 0.05 + (0.9 * h) / 9973;
  };
  return Object.fromEntries(
    keys.map((key) => [
      key,
      [
        { id: "base", p: 0.2 },
        ...map.fields
          .filter((f) => wanted.has(f.name))
          .flatMap((f) =>
            probesOf(f).map((probe) => ({ id: `${f.path}=${probe.code}`, p: lean(`${key}:${probe.code}`) })),
          ),
      ],
    ]),
  );
}

test("a scan finished in the background is read by its label alone, with the offers and fields it began with", async () => {
  const s = start();
  try {
    await s.ready;
    seedProduct(s.dir, {
      name: "Paperwork",
      description: "Help with household paperwork",
      stage: "idea",
      country: "uk",
    });
    const scans = join(s.dir, ".nxk", "scans"),
      spec = join(scans, "ideas-uk.spec");
    mkdirSync(spec, { recursive: true });
    // app is the owner's own offer: its lead is who wants it, with how keen by age and gender.
    const ideas = ["app", "clerk", "pack"].map((key) => ({
      key,
      offer: `Offer ${key}, £3 a month.`,
      fields: ["home_tenure"],
      ...(key === "app" ? { own: true } : {}),
    }));
    for (const [key, rows] of Object.entries(answersFor(["app", "clerk", "pack"], ["home_tenure"])))
      writeFileSync(
        join(spec, `scan-${key}.jsonl`),
        rows.map((r) => JSON.stringify({ ...r, r: 0, usd: 0, m: "gemini-decision-1" })).join("\n"),
      );
    writeFileSync(
      join(scans, "first.run.json"),
      JSON.stringify({ pid: 2 ** 22 + 12345, started: new Date().toISOString(), label: "first", ideas }),
    );
    writeFileSync(join(scans, "first.run.log"), "Kept to the Tier 1 limits: about 1 minute.\n");
    writeFileSync(
      join(scans, "first.run.jsonl"),
      logText([
        scriptRun(
          "scan",
          "simulated",
          "Kept to the Tier 1 limits: about 1 minute.",
          { type: "paced", minutes: 1 },
          "Spent $0.000 on this spec.",
          { type: "spent", usd: 0 },
        ),
      ]),
    );
    // With no decision-model key, the product tool still points at it: reading needs none.
    const told = (await s.call("product", {})).content[0].text;
    assert.match(
      told,
      /A scan \(first\) has finished in the background and is not read yet: call ideas_scan with label "first" alone/,
    );
    assert.match(told, /- First: A scan \(first\)/);
    const read = (await s.call("ideas_scan", { label: "first" })).content[0].text;
    assert.match(read, /through the decision model gemini-decision-1, each asked about the same 11 of the map's/);
    assert.doesNotMatch((await s.call("product", {})).content[0].text, /in the background/);
    assert.match(read, /Saved in nxk\.json as scan1\./);
    const scan: Scan = JSON.parse(readFileSync(join(s.dir, "nxk.json"), "utf8")).discovery.scans[0];
    assert.deepEqual([scan.label, scan.model, scan.ideas[0].fields], ["first", "gemini-decision-1", ["home_tenure"]]);
    assert.match(read, /Your offer as you wrote it: the people keenest on it/);
    assert.match(read, /\n {4}by age: 18 to 24 \d+%/);
    const app = scan.corners.find((c) => c.key === "app"),
      clerk = scan.corners.find((c) => c.key === "clerk");
    assert.equal(scan.ideas[0].own, true);
    assert.equal(app?.own, true);
    assert.deepEqual(
      app?.by?.map((lean) => lean.by),
      ["age", "gender"],
    );
    assert.ok(clerk);
    assert.equal(clerk.own, undefined);
    assert.equal(existsSync(join(scans, "first.run.json")), false);
    assert.match(
      (await s.call("ideas_scan", { label: "second" })).content[0].text,
      /^Give three or more offers in ideas/,
    );
  } finally {
    s.close();
  }
});

test("research about one place reads its scan among the people there, and its leads are of them", async () => {
  const s = start();
  try {
    await s.ready;
    seedProduct(s.dir, { name: "Treasure", description: "A promotional game", stage: "idea", country: "uk" });
    await s.call("research_start", { question: "Who in Scotland would play it?", where: "region=scotland" });
    const spec = join(s.dir, ".nxk", "scans", "ideas-uk.spec");
    mkdirSync(spec, { recursive: true });
    for (const [key, rows] of Object.entries(answersFor(["app", "clerk", "pack"], ["home_tenure"])))
      writeFileSync(
        join(spec, `scan-${key}.jsonl`),
        rows.map((r) => JSON.stringify({ ...r, r: 0, usd: 0, m: "gemini-decision-1" })).join("\n"),
      );
    const ideas = ["app", "clerk", "pack"].map((key) => ({
      key,
      offer: `Offer ${key}, £3 a month.`,
      fields: ["home_tenure"],
      buying_category: "household",
      ...(key === "app" ? { own: true } : {}),
    }));
    const read = (await s.call("ideas_scan", { label: "placed", ideas, read_only: true })).content[0].text;
    // Every group, and how keen it is, is of the adults in Scotland, not the whole country.
    assert.match(read, /What follows is read among the \d+ generated adults in Scotland, where the owner sells/);
    assert.match(read, /odds of adults in Scotland/);
    const scan: Scan = JSON.parse(readFileSync(join(s.dir, "nxk.json"), "utf8")).discovery.scans.at(-1);
    assert.ok(scan.corners.length);
    for (const corner of scan.corners) {
      assert.match(corner.among, /(^|,)region=scotland$/);
      assert.match(corner.label, /, in Scotland$/);
      assert.equal(corner.room_of, "adults in Scotland");
    }
  } finally {
    s.close();
  }
});

test("two products in one repository keep their scans apart, beside their own nxk.json", () => {
  const root = mkdtempSync(join(tmpdir(), "nxk-mono-"));
  try {
    mkdirSync(join(root, ".git"));
    for (const app of ["gym", "cafe"]) {
      mkdirSync(join(root, "apps", app, "src"), { recursive: true });
      writeFileSync(join(root, "apps", app, "nxk.json"), "{}");
    }
    assert.equal(scansDir(join(root, "apps", "cafe", "src")), join(root, "apps", "cafe", ".nxk", "scans"));
    assert.equal(scansDir(join(root, "apps", "gym")), join(root, "apps", "gym", ".nxk", "scans"));
    assert.equal(scansDir(join(root, "docs")), join(root, ".nxk", "scans"));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("a scan started for one research question stays with it, and holds another only until that one scans", () => {
  const dir = mkdtempSync(join(tmpdir(), "nxk-plan-")),
    scans = scansDir(dir);
  mkdirSync(scans, { recursive: true });
  try {
    // r1 started a scan in the background; r2 is open now and has scanned nothing yet.
    let product = addStudy({ ...emptyProduct(), country: "uk" }, { question: "First" }).product;
    product = addStudy(product, { question: "Second" }).product;
    const running = (study: string) =>
      writeFileSync(
        join(scans, "first.run.json"),
        JSON.stringify({ pid: process.pid, started: new Date().toISOString(), label: "first", study }),
      );
    running("r1");
    // r2's first scan has to wait for the folder's one scan.
    assert.equal(planOf(product, dir, "uk").move.step, "scan");
    // Once r2 has a lead of its own to look into, it goes on while r1's scan runs.
    product = addScan(product, {
      kind: "ideas",
      label: "own",
      study: "r2",
      ideas: [{ key: "a" } as ScanIdea], // only its key is read
      corners: [],
      nothing_for: [],
    }).product;
    product = addSegment(product, {
      label: "Renters",
      among: "home_tenure=rented_from_a_private_landlord_or_letting_agency",
      share: 0.2,
    } as NewSegment).product; // a segment with no people counted nor scan behind it
    assert.equal(planOf(product, dir, "uk").move.step, "rivals");
    // Its own scan is waited for before anything else.
    running("r2");
    assert.equal(planOf(product, dir, "uk").move.step, "scan");
    // r1's scan, read while r2 is open, stays r1's.
    product = addScan(product, {
      kind: "ideas",
      label: "first",
      study: "r1",
      ideas: [{ key: "b" } as ScanIdea],
      corners: [],
      nothing_for: [],
    }).product;
    assert.deepEqual(
      scoped(product).discovery.scans.map((x) => x.label),
      ["own"],
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
