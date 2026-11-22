import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { ranAnyTool, ranSuggest, recentLogs, unchecked, unsuggested } from "../hooks/stop-check.ts";
import { unnoted } from "../scripts/note.ts";
import { addSegment, type CustomerShare, type Product } from "../scripts/product.ts";
import { loggedNumbers, raisedOf, readLog, resolutionsOf } from "../scripts/records.ts";
import { logText, run, served } from "../scripts/testing.ts";
import type { Schema } from "./protocol.ts";
import { seedProduct, start } from "./testing.ts";

/** An agent's brief (agents/<agent>.md): the tools it loads (its ToolSearch `select:` list) and those it may not call. */
function briefOf(agent: string): { loads: string[]; blocks: string[] } {
  const brief = readFileSync(new URL(`../agents/${agent}.md`, import.meta.url), "utf8");
  return {
    loads: brief.match(/`select:([^`]+)`/)?.[1].split(",") ?? [],
    blocks: brief.match(/^disallowedTools: (.+)$/m)?.[1].split(/,\s*/) ?? [],
  };
}
const AGENTS = ["second-look", "researcher", "panel"];
const nxk = (name: string) => `mcp__plugin_nxk_nxk__${name}`;

test("the server says what it is and lists its tools; the three ways in are agents, not prompts", async () => {
  const s = start();
  try {
    const init = await s.ready;
    assert.equal(init.result.protocolVersion, "2025-11-25");
    assert.equal(init.result.serverInfo.name, "nxk");
    assert.match(init.result.instructions, /guide topic second-look or guide topic research/);
    const listed = (await s.request("tools/list")).result.tools;
    assert.deepEqual(
      listed.map((t) => t.name),
      [
        "product",
        "research_start",
        "owner_ask",
        "owner_answer",
        "outcome_record",
        "people",
        "sweep",
        "terms",
        "probe",
        "suggest",
        "sums",
        "note_check",
        "source_check",
        "people_pull",
        "options_scan",
        "guide",
        "ideas_deal",
        "ideas_scan",
        "segment_add",
        "segment_rival",
        "segments",
        "explore_next",
        "corner_split",
      ],
    );
    // None loads upfront: the session that does the owner's work never carries nxk's tools in its context. nxk's agents
    // load the ones they use with a tool search (agents/*.md, step 0).
    const loaded = new Set();
    for (const agent of AGENTS) {
      const { loads } = briefOf(agent);
      assert.ok(loads.includes(nxk("product")), agent);
      for (const name of loads) {
        assert.ok(
          listed.some((t) => nxk(t.name) === name),
          name,
        );
        loaded.add(name);
      }
    }
    // And every tool is one an agent loads: a tool none loads is never called.
    assert.deepEqual(
      listed.map((t) => t.name).filter((name) => !loaded.has(nxk(name))),
      [],
    );
    // Every input is typed: no tool takes a command line.
    for (const t of listed) {
      assert.equal(t.inputSchema.type, "object", t.name);
      assert.equal(t.inputSchema.properties.args, undefined, t.name);
    }
    const look = (await s.call("guide", { topic: "second-look" })).content[0].text;
    assert.match(look, /^# Second look: a choice for people/);
    // The second look never scans: where a scan would settle a point, it offers research.
    assert.match(
      look,
      /You never scan, and you offer research only in two cases: `product` lists a\s+scan saved here[\s\S]*Otherwise never offer it/,
    );
    // The owner starts each way in with one of the plugin's skills, /nxk:look, /nxk:research and /nxk:meet, which
    // Claude never starts on its own; each hands the work to its agent.
    for (const [skill, agent] of [
      ["look", "nxk:second-look"],
      ["research", "nxk:researcher"],
      ["meet", "nxk:panel"],
    ]) {
      const text = readFileSync(new URL(`../skills/${skill}/SKILL.md`, import.meta.url), "utf8");
      assert.match(text, /^disable-model-invocation: true$/m, skill);
      assert.ok(text.includes(agent), skill);
    }
    const research = (await s.call("guide", { topic: "research" })).content[0].text;
    assert.match(research, /^# Research/);
    // It reports strong leads among who pays, counted as firms when they are businesses, or that nothing stood out,
    // and never chooses for the owner.
    assert.match(research, /## Who pays, first[\s\S]*unit `firms`/);
    assert.match(
      research,
      /Who wants their offer,\*\* first[\s\S]*Other versions, strong leads[\s\S]*at most two leads to test[\s\S]*Or plainly nothing/,
    );
    assert.match(research, /in marked `own: true`/);
    assert.match(research, /never a choice made for\s+the owner/);
    // The session is told nothing about nxk but to leave its tools alone: the Stop hook asks for the second look after
    // the reply, and /nxk:research says how to brief the researcher.
    assert.match(init.result.instructions, /not for you: do the owner's work as you would without nxk/);
    // It names the agents only to hand over what the owner asks nxk for, and never describes nxk to the session.
    assert.match(init.result.instructions, /Only when the owner asks for nxk, hand it over/);
    assert.doesNotMatch(init.result.instructions, /200,000|PersonaGen|second look after/);
    assert.ok(init.result.instructions.length <= 400);
    assert.equal((await s.request("nonsense")).error.code, -32601);
    const older = start();
    assert.equal((await older.ready).result.protocolVersion, "2025-11-25");
    older.close();
  } finally {
    s.close();
  }
});

// The rule the agents' tool lists keep: research is the researcher's alone. Every tool of research (its paid scans,
// the question and its segments, the explorer) is in every other agent's disallowedTools, so no tool search can load it
// there, and the researcher loads them all. The other tools (counting, checking, the owner's answers) are loaded by the
// agents whose guide uses them and left unblocked elsewhere: they spend nothing and keep no research. No agent blocks a
// tool it loads.
test("research's tools are the researcher's alone: every other agent blocks them, and no agent blocks what it loads", async () => {
  const research = [
    "research_start",
    "options_scan",
    "ideas_deal",
    "ideas_scan",
    "segment_add",
    "segment_rival",
    "segments",
    "explore_next",
    "corner_split",
  ].map(nxk);
  const s = start();
  try {
    await s.ready;
    const listed = (await s.request("tools/list")).result.tools.map((t) => nxk(t.name));
    assert.deepEqual(
      research.filter((name) => !listed.includes(name)),
      [],
    );
    for (const agent of AGENTS) {
      const { loads, blocks } = briefOf(agent);
      assert.deepEqual(
        loads.filter((name) => blocks.includes(name)),
        [],
        agent,
      );
      const kept = agent === "researcher" ? loads : blocks;
      assert.deepEqual(
        research.filter((name) => !kept.includes(name)),
        [],
        agent,
      );
    }
  } finally {
    s.close();
  }
});

test("arguments sent as text are read as the schema types them", async () => {
  const { coerce } = await import("./protocol.ts");
  const schema: Schema = {
    properties: {
      read_only: { type: "boolean" },
      max_usd: { type: "number" },
      ideas: { type: "array" },
      where: { type: "object" },
      label: { type: "string" },
    },
  };
  assert.deepEqual(
    coerce(schema, {
      read_only: "true",
      max_usd: "0.4",
      ideas: '[{"key":"a"}]',
      where: '{"region":"wales"}',
      label: "true",
    }),
    { read_only: true, max_usd: 0.4, ideas: [{ key: "a" }], where: { region: "wales" }, label: "true" },
  );
  // What is not what the schema says is left for the tool to refuse.
  assert.deepEqual(coerce(schema, { read_only: "yes", ideas: "app, clerk", max_usd: "" }), {
    read_only: "yes",
    ideas: "app, clerk",
    max_usd: "",
  });
});

test("the way in is the second look, and research while one research_start opened is going", async () => {
  const s = start();
  try {
    await s.ready;
    const first = (await s.call("product", {})).content[0].text;
    assert.match(first, /Path: second-look/);
    // The second look quotes what research would cost: it never scans itself.
    assert.match(
      first,
      /Research: about 0\.7 US cents a version .*nothing scanned here yet.*only nxk's researcher runs it/,
    );
    seedProduct(s.dir, { name: "Harbour Dental", description: "a dental practice", stage: "live", country: "uk" });
    assert.match((await s.call("product", {})).content[0].text, /Path: second-look/);
    await s.call("research_start", { question: "Who would book a Saturday check-up?" });
    assert.match((await s.call("product", {})).content[0].text, /Path: research\n- Research r1, as the owner asked it/);
  } finally {
    s.close();
  }
});

test("a research question's place is counted and shown, and each segment counted there; who is refused as a place", async () => {
  const s = start();
  try {
    await s.ready;
    const opened = (await s.call("research_start", { question: "What second line could I add?", country: "us" }))
      .content[0].text;
    assert.match(opened, /give research_start its where/);
    // A place given to research is counted and shown with it.
    const placed = (
      await s.call("research_start", { question: "What second line could I add?", where: "region=georgia" })
    ).content[0].text;
    assert.match(placed, /Where: Georgia[^,]*, \d\.\d in every 100 US adults \(counted\)/);
    assert.doesNotMatch(placed, /give research_start its where/);
    assert.equal((await s.call("research_start", { question: "x", where: "age_years=18..34" })).isError, true);
    const kept = await s.call("segment_add", {
      label: "own business",
      among: "employer_sector=self_employed_or_family_business",
    });
    assert.match(
      kept.content[0].text,
      /nationwide \(counted\), about [\d.]+m\. In Georgia[^,]*, where the owner sells: [\d.]+ in every 100 adults there, about \d+k \(counted\)\. Adults by their work, not businesses/,
    );
  } finally {
    s.close();
  }
});

test("a question goes to the owner once: in chat without a form, recorded, never asked again", async () => {
  const s = start();
  try {
    await s.ready;
    const ask = await s.call("owner_ask", {
      kind: "share",
      country: "uk",
      fact: "age_years=65..120",
      question: "Of every 100 of your customers, about how many are aged 65 or over?",
    });
    assert.match(ask.content[0].text, /^No form here: do not hold up the work for it.*\(id q1, unknown true/);
    // Claude Code gives the model a tool's structured content in place of its text, so there is none: the text is the interface.
    assert.equal(ask.structuredContent, undefined);
    await s.call("owner_answer", { id: "q1", share: 45 });
    const again = await s.call("owner_ask", {
      kind: "share",
      country: "uk",
      fact: "age_years=65..120",
      question: "How many are 65 or over?",
    });
    assert.match(again.content[0].text, /Already answered, not asked again: age_years=65..120: 45 in every 100/);
    await s.call("owner_answer", { kind: "words", topic: "reception phone", answer: "01326 000000" });
    assert.match(
      (
        await s.call("owner_ask", {
          kind: "words",
          topic: "Reception phone",
          question: "What is the reception number?",
        })
      ).content[0].text,
      /Already answered/,
    );
    const kb: Product = JSON.parse(readFileSync(join(s.dir, "nxk.json"), "utf8"));
    assert.deepEqual(
      kb.customers.map((c) => [c.fact, c.share, c.source]),
      [["age_years=65..120", 45, "owner"]],
    );
    assert.equal(kb.facts[0].answer, "01326 000000");
    assert.deepEqual(
      kb.questions.map((q) => q.status),
      ["answered", "answered"],
    );
  } finally {
    s.close();
  }
});

test("with a form the owner answers in it, and a blank answer is recorded as not known", async () => {
  const s = start({ elicitation: true });
  try {
    await s.ready;
    s.answer(() => ({ action: "accept", content: { share: 85, unknown: false } }));
    const ask = await s.call("owner_ask", {
      kind: "share",
      country: "uk",
      fact: "current_education_enrolment=full_time_student",
      question: "How many of your tenants are full-time students?",
      why: "it changes who the viewing hours suit",
    });
    assert.match(ask.content[0].text, /Recorded: current_education_enrolment=full_time_student: 85 in every 100/);
    assert.match(s.asked[0].message, /viewing hours/);
    assert.equal(s.asked[0].requestedSchema.properties.share.maximum, 100);
    s.answer(() => ({ action: "accept", content: { unknown: false } }));
    assert.match(
      (
        await s.call("owner_ask", {
          kind: "words",
          topic: "guarantor alternatives",
          question: "What do you accept instead of a UK guarantor?",
        })
      ).content[0].text,
      /does not know/,
    );
    // A form cancelled without the owner choosing (a non-interactive session cancels every form) is not their answer:
    // the question stays open and is asked in chat.
    s.answer(() => ({ action: "cancel" }));
    const cancelled = (
      await s.call("owner_ask", { kind: "figure", topic: "monthly price", question: "What is the monthly price?" })
    ).content[0].text;
    assert.match(cancelled, /Ask the owner in chat, as written: "What is the monthly price\?"/);
    assert.equal(JSON.parse(readFileSync(join(s.dir, "nxk.json"), "utf8")).questions.at(-1).status, "open");
    // A share (a close call) does not hold up the build: recorded unknown now, asked in the reply, answered later.
    s.answer(() => ({ action: "cancel" }));
    const share = (
      await s.call("owner_ask", {
        kind: "share",
        fact: "age_years=65..120",
        question: "Of every 100 of your customers, about how many are aged 65 or over?",
      })
    ).content[0].text;
    const question = /id (q\d+)/.exec(share);
    assert.ok(question);
    const id = question[1];
    assert.match(
      share,
      /^No form here: do not hold up the work for it, and send no separate question\. Record unknown now .* the note's item says what it turns on/,
    );
    await s.call("owner_answer", { id, unknown: true, note: "asked in the reply" });
    assert.match(
      (await s.call("owner_answer", { id, share: 30 })).content[0].text,
      /Recorded: age_years=65\.\.120: 30 in every 100/,
    );
    assert.deepEqual(
      JSON.parse(readFileSync(join(s.dir, "nxk.json"), "utf8"))
        .customers.filter((c: CustomerShare) => c.fact === "age_years=65..120")
        .map((c: CustomerShare) => c.share),
      [30],
    );
    s.answer(() => ({ action: "decline" }));
    assert.match(
      (
        await s.call("owner_ask", {
          kind: "figure",
          topic: "holding deposit refund days",
          question: "How many days to refund?",
        })
      ).content[0].text,
      /did not answer \(decline\)/,
    );
  } finally {
    s.close();
  }
});

test("a segment is counted, kept and compared, and nxk never chooses one", async () => {
  const s = start();
  try {
    await s.ready;
    const add = await s.call("segment_add", {
      label: "full-time students aged 18 to 24",
      among: "current_education_enrolment=full_time_student,age_years=18..24",
      country: "uk",
    });
    assert.match(add.content[0].text, /Kept s1: .*4\.2 in every 100 UK adults nationwide \(counted\)/);
    await s.call("segment_rival", { segment: "s1", none_found: "searched 'student lets Manchester'" });
    const table = (await s.call("segments", {})).content[0].text;
    assert.match(table, /rivals: none found/);
    assert.match(table, /missing: not scanned/);
    assert.match(table, /Report them side by side, as findings: nxk never chooses one for the owner\./);
    // Nothing is recorded as the owner's choice: no audience, no product, no suggestion.
    const kb = JSON.parse(readFileSync(join(s.dir, "nxk.json"), "utf8"));
    assert.equal(kb.audience, null);
    assert.equal(kb.discovery.segments[0].status, "candidate");
    assert.deepEqual(kb.suggestions, []);
  } finally {
    s.close();
  }
});

test("a segment kept when its scan's saved answers could not be read shows no keenness, as one never scanned", async () => {
  const s = start();
  try {
    await s.ready;
    seedProduct(s.dir, {
      name: "Paperwork",
      description: "Help with household paperwork",
      stage: "idea",
      country: "uk",
    });
    // segment_add keeps the scan and the offer alone when it cannot read the scan's answers: no odds, keen or room.
    const file = join(s.dir, "nxk.json"),
      stored: Product = JSON.parse(readFileSync(file, "utf8"));
    const { product } = addSegment(stored, {
      label: "retired people",
      among: "economic_activity_status=retired",
      share: 0.2,
      people: 10_000_000,
      intent: { scan: "scan1", idea: "clerk" },
    });
    writeFileSync(file, JSON.stringify(product));
    const table = await s.call("segments", {});
    assert.equal(table.isError, undefined);
    assert.match(table.content[0].text, /^\[s1\] retired people \(candidate\)\n.*\n.*\n {2}keenness: -\n/);
  } finally {
    s.close();
  }
});

test("a scan's corner is kept only when the scan found one; its keenness is read against the group's average idea", async () => {
  const s = start();
  try {
    await s.ready;
    seedProduct(s.dir, { name: "Lets", description: "Rooms for students", stage: "idea", country: "uk" });
    const file = join(s.dir, "nxk.json"),
      kb = JSON.parse(readFileSync(file, "utf8"));
    const corner = (key: string, among: string, odds: number) => ({
      key,
      among,
      label: key,
      share: 0.05,
      odds,
      strength: null,
      keen: 0.3,
      room: 0.2,
    });
    // Recorded as typed ("plan-a"); discover.ts names its corner plan_a.
    kb.discovery.scans.push({
      id: "scan1",
      kind: "ideas",
      label: "t",
      ideas: [
        { key: "plan-a", offer: "Offer A" },
        { key: "b", offer: "Offer B" },
        { key: "c", offer: "Offer C" },
      ],
      corners: [
        corner("plan_a", "current_education_enrolment=full_time_student", 2.3),
        corner("b", "age_years=18..24", 1.5),
        corner("c", "age_years=65..", 1.1),
      ],
      nothing_for: [],
    });
    writeFileSync(file, JSON.stringify(kb));
    const none = await s.call("segment_add", { label: "older people", from_scan: "t", idea: "c" }); // by the label it was started with
    assert.ok(none.isError);
    assert.match(none.content[0].text, /c has no corner of its own in scan1: .*x1\.10/);
    // A scan still in the background is named as such, not as unknown.
    const scans = join(s.dir, ".nxk", "scans");
    mkdirSync(scans, { recursive: true });
    writeFileSync(
      join(scans, "later.run.json"),
      JSON.stringify({ label: "later", pid: process.pid, started: new Date().toISOString() }),
    );
    const running = await s.call("segment_add", { label: "x", from_scan: "later", idea: "b" });
    assert.match(
      running.content[0].text,
      /The scan later is still running: read it with ideas_scan and label "later" alone/,
    );
    rmSync(join(scans, "later.run.json"));
    assert.match(
      (await s.call("segment_add", { label: "x", from_scan: "nope", idea: "b" })).content[0].text,
      /No scan "nope": scan1 \(t\)/,
    );
    assert.match(
      (await s.call("segment_add", { label: "students", from_scan: "scan1", idea: "plan-a" })).content[0].text,
      /they prefer plan_a x2\.30 over their average idea \(strong\); 30% keen there against 20% of all adults/,
    );
    assert.match(
      (await s.call("segment_add", { label: "young adults", from_scan: "scan1", idea: "b" })).content[0].text,
      /x1\.50 over their average idea \(a lead to test\)/,
    );
    const again = (await s.call("segment_add", { label: "18 to 24s", among: " age_years=18..24" })).content[0].text;
    assert.match(again, /The same group was kept as s2 \("young adults"\); updated\. Kept s2: 18 to 24s/);
    const after: Product = JSON.parse(readFileSync(file, "utf8"));
    assert.deepEqual(
      after.discovery.segments.map((x) => x.label),
      ["students", "18 to 24s"],
    );
    assert.equal(after.discovery.segments[0].offer, "Offer A");
  } finally {
    s.close();
  }
});

test("scans share their saved answers, and a key scanned before under other words is refused before anything is sent", async () => {
  const s = start();
  try {
    await s.ready;
    const scans = join(s.dir, ".nxk", "scans");
    mkdirSync(scans, { recursive: true });
    writeFileSync(join(scans, "offers-uk.json"), JSON.stringify({ text_reminder: "Text reminders, £1.99 a month." }));
    const ideas = [
      { key: "text-reminder", offer: "Text reminders, £2.49 a month." },
      { key: "b", offer: "B" },
      { key: "c", offer: "C" },
    ];
    const refused = await s.call("ideas_scan", { ideas, max_usd: 0.01, country: "uk" });
    assert.ok(refused.isError);
    assert.match(refused.content[0].text, /^Nothing was sent\. text_reminder was scanned before with other words/);
    assert.equal(existsSync(join(scans, "ideas-uk.json")), false);
  } finally {
    s.close();
  }
});

test("tools run in the folder and log what they print there, the server's own tools too", async () => {
  const s = start();
  try {
    await s.ready;
    const out = await s.call("people", { folder: "work", action: "count", who: "age_years=65..120", country: "uk" });
    assert.match(out.content[0].text, /24\.2% of adults/);
    // unit firms counts the firms these people work for, said as firms.
    const firmCount = await s.call("people", {
      folder: "work",
      action: "count",
      who: "organisation_size=10_to_49_employees",
      unit: "firms",
      country: "uk",
    });
    assert.match(
      firmCount.content[0].text,
      /^10 to 49 employees: about [\d,]+ firms, \d+ in every 100 of the firms\.$/m,
    );
    await s.call("segment_add", { folder: "work", label: "over 65s", among: "age_years=65..120", country: "uk" });
    const runs = readLog(join(s.dir, "work", ".nxk", "log.jsonl"));
    assert.deepEqual(
      runs.map((r) => [r.tool, r.via, r.args[0]]),
      [
        ["people", "script", "count"],
        ["people", "script", "count"],
        ["segment_add", "server", undefined],
      ],
    );
    const [kept] = runs[2].records;
    assert.ok(kept.type === "line");
    assert.match(kept.text, /^Kept s1: over 65s .*24\.2 in every 100 UK adults nationwide \(counted\)/);
    assert.equal(kept.label, "counted");
    assert.ok(loggedNumbers(runs).counted.includes(24.2));
    // suggest takes the suggestions as an object, saves them in the folder, and refuses what it cannot count.
    // terms takes the terms the model read in the request, and refuses a quote the owner did not write.
    const gym = "A sign-up page for a UK gym. Twelve-month contract, £29 a month. Cancel any time.";
    const misquoted = await s.call("terms", {
      folder: "work",
      request: gym,
      terms: [{ quote: "£30 a month", kind: "price" }],
      buyer: "people",
      clashes: [{ a: "Twelve-month contract", b: "Cancel whenever" }],
      country: "uk",
    });
    assert.ok(misquoted.isError);
    assert.match(misquoted.content[0].text, /"£30 a month" is not in the request as written/);
    assert.match(misquoted.content[0].text, /clash 1: "b" is not in the request as written/);
    // What only the owner can say is listed too, [] when the request gives all of it.
    assert.match(misquoted.content[0].text, /List in open what the work needs/);
    const listed = await s.call("terms", {
      folder: "work",
      request: gym,
      terms: [
        { quote: "Twelve-month contract", kind: "commitment" },
        { quote: "£29 a month", kind: "price" },
      ],
      open: [{ topic: "joining fee" }, { topic: "reception phone" }],
      buyer: "people",
      clashes: [{ a: "Twelve-month contract", b: "Cancel any time" }],
      country: "uk",
    });
    assert.ok(!listed.isError, listed.content[0].text);
    assert.match(listed.content[0].text, /"term":"commitment-1","kind":"commitment","quote":"Twelve-month contract"/);
    // A listed clash is printed for the reply in the owner's words; a buyer that is a business, with the line to keep.
    assert.match(listed.content[0].text, /\n {2}Clash: "Twelve-month contract" against "Cancel any time"\n/);
    assert.doesNotMatch(listed.content[0].text, /Keep in the reply/);
    // Each open fact is kept as a record for note_check, and the reply is told how to put it.
    assert.match(listed.content[0].text, /only the owner can say, as you listed it in open:\n {2}"joining fee"\n/);
    assert.match(
      listed.content[0].text,
      /Leave a \[placeholder\] naming it in the page or draft.*"Yours to confirm: return window, 30 days\."/,
    );
    const openRuns = readLog(join(s.dir, "work", ".nxk", "log.jsonl"));
    assert.deepEqual(
      openRuns
        .at(-1)
        ?.records.filter((r) => r.type === "open")
        .map((r) => r.topic),
      ["joining fee", "reception phone"],
    );
    // An answer the owner gave on the topic is printed as theirs.
    await s.call("owner_answer", { folder: "work", kind: "words", topic: "Reception phone", answer: "029 2000 0000" });
    const answered = await s.call("terms", {
      folder: "work",
      request: gym,
      terms: [],
      open: [{ topic: "reception phone" }],
      buyer: "people",
      clashes: [],
      country: "uk",
    });
    assert.match(
      answered.content[0].text,
      /"reception phone": the owner said "029 2000 0000" \(nxk\.json\)\. Use it as theirs\./,
    );
    assert.doesNotMatch(answered.content[0].text, /Do not write one as settled/);
    // A request that fixes nothing, with nothing listed open, is asked to look again; it is not refused.
    const empty = await s.call("terms", {
      folder: "work",
      request: gym,
      terms: [],
      open: [],
      buyer: "people",
      clashes: [],
      country: "uk",
    });
    assert.ok(!empty.isError);
    assert.match(empty.content[0].text, /The request fixes no terms, and you listed nothing in open/);
    const firms = await s.call("terms", {
      folder: "work",
      request: gym,
      terms: [],
      open: [],
      buyer: "businesses",
      clashes: [],
      country: "uk",
    });
    assert.match(
      firms.content[0].text,
      /\nKeep in the reply, outside any draft: "These counts are of adults, not of businesses\."/,
    );
    // After terms, nothing is sized until the sweep has run.
    const early = await s.call("suggest", {
      folder: "work",
      suggestions: { country: "uk", request: "request.md", terms: [], suggestions: [] },
    });
    assert.ok(early.isError);
    assert.match(early.content[0].text, /^Nothing was counted\. Run sweep first/);
    await s.call("sweep", { folder: "work", pictured: "age_years=25..44" });
    const suggestion = {
      suggestion: "Card first",
      as_asked: "a",
      rule: "Worth raising if it rules out 5 in 100 or more",
      count: "term price",
      options: [
        { name: "a", needs: [] },
        { name: "b", needs: [] },
      ],
      offer: "s",
      watch: "w",
    };
    const refused = await s.call("suggest", {
      folder: "work",
      suggestions: { country: "uk", request: "request.md", terms: [], suggestions: [suggestion] },
    });
    assert.ok(refused.isError);
    assert.match(refused.content[0].text, /^Fix the suggestions first:\n- /);
    // The suggestions are kept in .nxk, beside the request they name, and .nxk keeps itself out of the owner's git.
    assert.equal(
      JSON.parse(readFileSync(join(s.dir, "work", ".nxk", "suggestions.json"), "utf8")).request,
      "request.md",
    );
    assert.ok(!existsSync(join(s.dir, "work", "suggestions.json")));
    assert.match(readFileSync(join(s.dir, "work", ".nxk", ".gitignore"), "utf8"), /^\*$/m);
    // Suggestions for another country than the product's are not counted.
    const moved = await s.call("suggest", {
      folder: "work",
      suggestions: { country: "us", request: "request.md", terms: [], suggestions: [{ ...suggestion, rule: "r" }] },
    });
    assert.ok(moved.isError);
    assert.match(moved.content[0].text, /records this product in the UK, but the suggestions say "country": "us"/);
    // The build guide's order: the sweep looks at the room first, and terms and suggest follow it. That sweep counts
    // for this round, which ends with a suggest; the next round's terms need a sweep of their own.
    const termsCall = () =>
      s.call("terms", {
        folder: "work",
        request: gym,
        terms: [],
        open: [],
        buyer: "people",
        clashes: [],
        country: "uk",
      });
    const none = { country: "uk", request: "request.md", terms: [], suggestions: [] };
    await s.call("sweep", { folder: "work", pictured: "age_years=25..44" });
    await termsCall();
    const ordered = await s.call("suggest", { folder: "work", suggestions: none });
    assert.doesNotMatch(ordered.content[0].text, /^Nothing was counted/);
    await termsCall();
    const nextRound = await s.call("suggest", { folder: "work", suggestions: none });
    assert.match(nextRound.content[0].text, /^Nothing was counted\. Run sweep first/);
  } finally {
    s.close();
  }
});

// note_check's verdict on a reply, as note.ts records it.
const note = (ready: boolean) =>
  run("note", null, ready ? "Ready to send." : "2 to fix before the reply goes to the owner.", {
    type: "verdict",
    ready,
    pays: null,
  });

test("a suggestion keeps the owner's option, raises the other with its size, and a close call asks nothing back", async () => {
  const s = start();
  try {
    await s.ready;
    const request = "A booking page for a UK hairdresser. Online booking only.";
    await s.call("terms", {
      request,
      terms: [{ quote: "Online booking only", kind: "channel" }],
      open: [],
      buyer: "people",
      clashes: [],
      country: "uk",
    });
    await s.call("sweep", { pictured: "age_years=25..44" });
    // Online only rules out the 24.2 in 100 aged 65 or over: a close call against 24.
    const suggestions = (rule: string) => ({
      country: "uk",
      request: "request.md",
      terms: [
        { term: "channel-1", kind: "channel", quote: "Online booking only", fits_everyone: "a test" },
        { term: "english", fits_everyone: "a test" },
        { term: "device", fits_everyone: "a test" },
      ],
      suggestions: [
        {
          suggestion: "Booking by phone",
          as_asked: "Online only",
          rule,
          count: "Online only: rules out",
          options: [
            { name: "Online only", needs: ["age_years=18..64"] },
            { name: "Phone too", needs: [] },
          ],
          offer: "add a phone number beside the booking form",
          terms: ["channel-1"],
        },
        {
          suggestion: "Email on the form",
          options: [
            { name: "Email required", needs: ["age_years=18..74"] },
            { name: "Email optional", needs: [] },
          ],
        },
      ],
    });
    const close = await s.call("suggest", {
      suggestions: suggestions("Worth raising if it rules out 24 in 100 or more"),
    });
    assert.ok(!close.isError, close.content[0].text);
    const text = close.content[0].text;
    assert.match(text, /As asked: "Online only", the owner's: it stays in the work/);
    assert.match(text, /A close call: 24\.2 against 24/);
    assert.match(
      text,
      /\nWorth considering:\n- Booking by phone: about 24 in every 100 of adults, who are not: .*, are ruled out by "Online only" \(counted\), more so if many of your customers are .*\. Say yes and I'll add a phone number beside the booking form\./,
    );
    // The choice left to the session names the option that turns away the fewest, and goes in no note.
    assert.match(
      text,
      /Email on the form: the owner set none of this, so it is yours to choose\. "Email optional" turns away the fewest/,
    );
    assert.doesNotMatch(text, /- Email on the form:/);
    const file = join(s.dir, ".nxk", "log.jsonl");
    assert.deepEqual(
      raisedOf(readLog(file)).map((r) => r.suggestion),
      ["Booking by phone"],
    );
    // No question goes back to the owner, and nothing waits on one.
    assert.doesNotMatch(text, /owner_ask/);
    assert.deepEqual(resolutionsOf(readLog(file)), []);
    // Far under its rule, nothing is worth raising, and the reply gets no note.
    const quiet = (
      await s.call("suggest", { suggestions: suggestions("Worth raising if it rules out 60 in 100 or more") })
    ).content[0].text;
    assert.match(quiet, /Nothing here is worth raising \(Booking by phone: under the figure in each rule\)/);
    assert.doesNotMatch(quiet, /Worth considering:/);
    const kb: Product = JSON.parse(readFileSync(join(s.dir, "nxk.json"), "utf8"));
    assert.deepEqual(
      kb.suggestions.map((d) => [d.suggestion, d.as_asked ?? null, d.raised ?? null, d.pick]),
      [
        ["Booking by phone", "Online only", false, "Online only"],
        ["Email on the form", null, null, "Email optional"],
      ],
    );
  } finally {
    s.close();
  }
});

test("the stop hook holds a session whose suggestions were counted until the note passes", () => {
  const suggest = run("suggest", "counted", "x"),
    terms = run("terms", "counted", "x");
  assert.equal(unchecked([run("people", "counted", "x")]), false);
  assert.equal(unchecked([suggest, note(false)]), true);
  assert.equal(unchecked([suggest, note(true)]), false);
  assert.equal(unchecked([note(true), suggest]), true);
  assert.equal(unsuggested([terms, served("product", "y")]), true);
  assert.equal(unsuggested([terms, suggest]), false);
  assert.equal(unsuggested([run("people", "counted", "x")]), false);
  const dir = mkdtempSync(join(tmpdir(), "nxk-hook-"));
  mkdirSync(join(dir, "a", "b", ".nxk"), { recursive: true });
  writeFileSync(join(dir, "a", "b", ".nxk", "log.jsonl"), logText([suggest]));
  assert.equal(recentLogs(dir, Date.now() - 1000).length, 1);
  assert.equal(recentLogs(dir, Date.now() + 1000).length, 0);
  const said = (content: object[]) => JSON.stringify({ type: "assistant", message: { content } });
  assert.equal(
    ranSuggest(
      [
        said([{ type: "text", text: "Run scripts/suggest.ts next" }]),
        JSON.stringify({ type: "user", message: { content: "call suggest with the suggestions" } }),
      ].join("\n"),
    ),
    false,
  );
  assert.equal(
    ranSuggest(
      said([{ type: "tool_use", name: "Bash", input: { command: "node ~/nxk/scripts/suggest.ts suggestions.json" } }]),
    ),
    false,
  );
  assert.equal(
    ranSuggest(said([{ type: "tool_use", name: "mcp__plugin_nxk_nxk__suggest", input: { suggestions: {} } }])),
    true,
  );
  assert.equal(
    ranSuggest(said([{ type: "tool_use", name: "Bash", input: { command: "cat scripts/suggest.ts | head -40" } }])),
    false,
  );
});

test("the stop hook holds a session that printed figures without suggest until the note passes", () => {
  assert.equal(unnoted([served("product", "x")]), false);
  assert.equal(unnoted([run("people", "counted", "31.0 in every 100")]), true);
  assert.equal(unnoted([run("scan", "simulated", "Simulated"), note(true)]), false);
  assert.equal(unnoted([note(true), run("sums", "computed", "12")]), true);
  // A tool whose run prints no figures of a kind (a page opened, a box dealt) owes no check.
  assert.equal(unnoted([note(true), run("source", null, "Found")]), false);
  const said = (content: object[]) => JSON.stringify({ type: "assistant", message: { content } });
  assert.equal(ranAnyTool(said([{ type: "tool_use", name: "mcp__plugin_nxk_nxk__people", input: {} }])), true);
  assert.equal(
    ranAnyTool(said([{ type: "tool_use", name: "Read", input: { file_path: "mcp__plugin_nxk_nxk__people.md" } }])),
    false,
  );
});

test("an outcome is set against what the scan said of each group, and kept with the product", async () => {
  const s = start();
  try {
    await s.ready;
    seedProduct(s.dir, { name: "Renewals", description: "Renewal reminders", stage: "live", country: "uk" });
    const file = join(s.dir, "nxk.json"),
      kb = JSON.parse(readFileSync(file, "utf8"));
    kb.discovery.scans.push({
      id: "scan1",
      kind: "ideas",
      label: "r",
      ideas: [
        { key: "app", offer: "An app" },
        { key: "b", offer: "B" },
        { key: "c", offer: "C" },
      ],
      corners: [],
      nothing_for: [],
    });
    kb.suggestions.push({
      date: "2026-11-15",
      folder: ".",
      suggestion: "Price shown",
      pick: "monthly",
      watch: "trial starts",
    });
    writeFileSync(file, JSON.stringify(kb));
    // Saved answers as discover.ts keeps them: people with a mortgage keener on the app than outright owners.
    const spec = join(s.dir, ".nxk", "scans", "ideas-uk.spec");
    mkdirSync(spec, { recursive: true });
    const p = {
      owned_outright: 0.1,
      owned_with_a_mortgage_or_loan: 0.2,
      rented_from_a_private_landlord_or_letting_agency: 0.15,
    };
    writeFileSync(
      join(spec, "scan-app.jsonl"),
      Object.entries(p)
        .map(([code, x]) => JSON.stringify({ id: `home_and_travel.home_tenure=${code}`, r: 0, p: x }))
        .join("\n"),
    );
    assert.match(
      (await s.call("product", {})).content[0].text,
      /no result recorded: "Price shown" \(watch: trial starts\)/,
    );

    const groups = await s.call("outcome_record", {
      what: "Sign-ups from the advert, 1 to 14 December",
      kind: "groups",
      from_scan: "scan1",
      idea: "app",
      arms: [
        { name: "outright", among: "home_tenure=owned_outright", shown: 2000, took: 20 },
        { name: "mortgage", among: "home_tenure=owned_with_a_mortgage_or_loan", shown: 2000, took: 80 },
        { name: "over 65", among: "age_years=65..120", shown: 2000, took: 30 },
      ],
    });
    const g = groups.content[0].text;
    assert.match(g, /^Recorded o1 \(measured\): Sign-ups from the advert/);
    assert.match(g, /What nxk said beforehand: scan1, the offer app \(simulated\)/);
    assert.match(
      g,
      /outright against mortgage: -3\.00 points \(from -\d\.\d\d to -\d\.\d\d\)\. The scan said outright x0\.\d\d mortgage: agrees\./,
    );
    assert.match(g, /over 65: the scan did not ask about age_years/);
    assert.doesNotMatch(g, /widened/); // one pair was predicted: only it is a test

    const options = await s.call("outcome_record", {
      what: "Trial starts by price shown, December",
      kind: "options",
      suggestion: "price shown",
      arms: [
        { name: "monthly", shown: 1000, took: 50 },
        { name: "yearly", shown: 1000, took: 30 },
      ],
    });
    assert.match(
      options.content[0].text,
      /monthly against yearly: \+2\.00 points .*The counts favoured monthly: agrees/,
    );
    assert.doesNotMatch((await s.call("product", {})).content[0].text, /no result recorded/);

    const first = {
      what: "First 200 customers, from the booking system",
      kind: "customers",
      total: 200,
      arms: [{ name: "outright owners", among: "home_tenure=owned_outright", took: 20 }],
    };
    // The product has a scanned offer: results are not recorded unlinked unless the session says why.
    const unlinked = await s.call("outcome_record", first);
    assert.ok(unlinked.isError);
    assert.match(
      unlinked.content[0].text,
      /^Not recorded yet\. This product has scanned offers.*\n {2}scan1 app: "An app"/,
    );
    const customers = await s.call("outcome_record", { ...first, from_scan: "scan1", idea: "app" });
    assert.match(customers.content[0].text, /What nxk said beforehand: scan1, the offer app \(simulated\)/);
    assert.match(
      customers.content[0].text,
      /Kept as the owner's customers \(measured\), which suggest weights its counts by: home_tenure=owned_outright: 10 in 100/,
    );
    const after: Product = JSON.parse(readFileSync(file, "utf8"));
    assert.deepEqual(
      after.outcomes.map((o) => [o.id, o.claim, o.source]),
      [
        ["o1", "scan_groups", "measured"],
        ["o2", "decision_pick", "measured"],
        ["o3", "segment_customers", "measured"],
      ],
    );
    assert.equal(after.customers.find((c) => c.fact === "home_tenure=owned_outright")?.source, "measured");
    const record = (await s.call("product", {})).content[0].text;
    assert.match(
      record,
      /Track record, by what nxk said: .*a decision: the option it picked: 1 agreed, 0 disagreed, 0 too few to tell/,
    );

    const refused = await s.call("outcome_record", {
      what: "x",
      kind: "options",
      arms: [
        { name: "a", shown: 10, took: 11 },
        { name: "b", shown: 10, took: 1 },
      ],
    });
    assert.ok(refused.isError);
    assert.match(refused.content[0].text, /a: give how many saw it \(shown\) and how many of them took it/);
  } finally {
    s.close();
  }
});

test("the country is never assumed: counting asks for it, and the first one given is kept", async () => {
  const s = start();
  try {
    await s.ready;
    const asked = await s.call("people", { action: "count", who: "age_years=65..120" });
    assert.ok(asked.isError);
    assert.match(asked.content[0].text, /^Which country are these people in\?/);
    assert.ok((await s.call("research_start", { question: "Who would want laundry picked up?" })).isError);
    await s.call("research_start", { question: "Who would want laundry picked up?", country: "us" });
    const counted = await s.call("people", { action: "count", who: "age_years=65..120" });
    assert.ok(!counted.isError);
    assert.match(counted.content[0].text, /adults in the US/);
    // Another country than the product's is refused, not counted under its name; the owner moves it in nxk.json.
    const other = await s.call("people", { action: "count", who: "age_years=65..120", country: "uk" });
    assert.ok(other.isError);
    assert.match(other.content[0].text, /records this product in the US, but this call says country uk/);
  } finally {
    s.close();
  }
});

test("no tool falls back to a country: the explorer saves none, a share question asks, a new nxk.json keeps the one given", async () => {
  const s = start();
  try {
    await s.ready;
    const explored = (await s.call("explore_next", {})).content[0].text;
    assert.match(explored, /No research is open here/);
    assert.match(explored, /Next \(stop\): research_start/);
    const file = join(s.dir, "nxk.json"),
      saved = () => (existsSync(file) ? JSON.parse(readFileSync(file, "utf8")).country : undefined);
    assert.equal(saved(), undefined);
    const share = await s.call("owner_ask", {
      kind: "share",
      fact: "age_years=65..120",
      question: "How many of your customers are 65 or over?",
    });
    assert.ok(share.isError);
    assert.match(share.content[0].text, /Which country/);
    await s.call("owner_ask", { kind: "words", topic: "opening hours", question: "When are you open?", country: "us" });
    assert.equal(saved(), "us");
  } finally {
    s.close();
  }
});

test("opening research says research, and records no product decision", async () => {
  const s = start();
  try {
    await s.ready;
    seedProduct(s.dir, {
      name: "Local eyes",
      description: "A weekly visit to an ageing parent, $150 a month",
      stage: "idea",
      country: "us",
    });
    assert.match((await s.call("product", {})).content[0].text, /Path: second-look/);
    const opened = await s.call("research_start", { question: "Who would want a weekly visit to an ageing parent?" });
    assert.match(opened.content[0].text, /Path now: research/);
    // Opening research records no product decision.
    const kb = JSON.parse(readFileSync(join(s.dir, "nxk.json"), "utf8"));
    assert.equal(kb.audience, null);
    assert.equal(kb.product.stage, "idea");
  } finally {
    s.close();
  }
});

test("an option scan's saved answers: groups read alone, a reworded version refused, the same scan under a new label reused", async () => {
  const { decisionSetup } = await import("../scripts/decision-model.ts");
  const s = start();
  try {
    await s.ready;
    const spec = {
      surveyed: "November 2026",
      versions: { now: "A laundry service, $1.75 a pound.", cheaper: "A laundry service, $1.25 a pound." },
      questions: { act: { type: "choice", text: "What would you do next?", options: ["Try it", "Keep doing my own"] } },
      watch: ["act", "Try it"],
    };
    const dir = join(s.dir, ".nxk", "scans", "options", "first"),
      m = decisionSetup().model;
    mkdirSync(dir, { recursive: true });
    const rows = (p: number) =>
      [
        { id: "base", r: 0, p, m },
        { id: "household_and_family.household_type=one_person_household", r: 0, p: p + 0.1, m },
        { id: "household_and_family.household_type=couple_household_with_dependent_children", r: 0, p: p - 0.1, m },
      ]
        .map((row) => JSON.stringify(row))
        .join("\n");
    writeFileSync(join(dir, "scan-now.jsonl"), rows(0.2));
    writeFileSync(join(dir, "scan-cheaper.jsonl"), rows(0.3));

    const whole = await s.call("options_scan", { label: "first", spec, read_only: true, country: "us" });
    assert.ok(!whole.isError, whole.content[0].text);
    assert.match(whole.content[0].text, /Facts that matter most/);
    // Each read ends with what it found, against the first version: here the cheaper one comes first.
    assert.match(
      whole.content[0].text,
      /\nKeep in the reply, outside any draft: "Looked further at which version gets the answer \\"Try it\\" most: \\"cheaper\\" first for adults \(simulated\)\. Result: changed; \\"cheaper\\" over \\"now\\"\."\n/,
    );
    const groups = (
      await s.call("options_scan", { label: "first", read_only: true, who: "age_years=18..24; age_years=65..120" })
    ).content[0].text;
    assert.doesNotMatch(groups, /Facts that matter most|The fifth moved most/);
    assert.match(groups, /most: in 2 groups, \\"cheaper\\" first in 2 \(simulated\)\. Result: changed/);
    assert.deepEqual(
      resolutionsOf(readLog(join(s.dir, ".nxk", "log.jsonl"))).map((r) => [r.key, r.outcome]),
      [
        ["scan:first|", "changed"],
        ["scan:first|age_years=18..24; age_years=65..120", "changed"],
      ],
    );
    assert.match(groups, /^age_years 18 to 24: \d+ of 200000 people/m);
    assert.match(groups, /^age_years 65 to 120: \d+ of 200000 people/m);
    // The groups and what the read found, not the whole reading again.
    assert.ok(groups.length < 2400, `${groups.length} characters`);

    const reworded = await s.call("options_scan", {
      label: "first",
      spec: { ...spec, versions: { ...spec.versions, cheaper: "A laundry service, $1.10 a pound." } },
      max_usd: 0.01,
    });
    assert.ok(reworded.isError);
    assert.match(reworded.content[0].text, /^Nothing was sent\. cheaper was scanned under "first" with other words/);
    const asked = await s.call("options_scan", {
      label: "first",
      spec: { ...spec, watch: ["act", "Keep doing my own"] },
      read_only: true,
    });
    assert.match(asked.content[0].text, /^Nothing was sent\. The question, the answer followed or the date/);
    // The refused words were not kept: the label still reads as it was scanned.
    assert.ok(!(await s.call("options_scan", { label: "first", read_only: true, who: "age_years=18..24" })).isError);

    const again = await s.call("options_scan", { label: "students", spec, read_only: true });
    assert.match(
      again.content[0].text,
      /^The same versions and question as the scan "first": its saved answers are used/,
    );
    assert.ok(!existsSync(join(s.dir, ".nxk", "scans", "options", "students.json")));
  } finally {
    s.close();
  }
});

test("a country given once in a folder with no nxk.json is kept for later calls there, and can still change", async () => {
  const s = start();
  try {
    await s.ready;
    assert.ok(!(await s.call("people", { action: "find", word: "dog", country: "uk" })).isError);
    const counted = await s.call("people", { action: "count", who: "age_years=65..120" });
    assert.ok(!counted.isError, counted.content[0].text);
    assert.match(counted.content[0].text, /adults in the UK/);
    assert.ok(!existsSync(join(s.dir, "nxk.json")));
    assert.match(
      (await s.call("people", { action: "count", who: "age_years=65..120", country: "us" })).content[0].text,
      /adults in the US/,
    );
    assert.match(
      (await s.call("people", { action: "count", who: "age_years=65..120", folder: "elsewhere" })).content[0].text,
      /^Which country/,
    );
  } finally {
    s.close();
  }
});

test("find looks up several words in one call, from the map alone, and a word in thousands of place names lists 25", async () => {
  const s = start();
  try {
    await s.ready;
    const found = (await s.call("people", { action: "find", word: "mortgage, landlord", country: "uk" })).content[0]
      .text;
    assert.match(found, /^mortgage:\n {2}home_tenure \(tier A\)/m);
    assert.match(found, /^landlord:\n/m);
    assert.match(found, /home_tenure=rented_from_a_private_landlord_or_letting_agency/);
    const places = (await s.call("people", { action: "find", word: "city,laundry", country: "us" })).content[0].text;
    assert.ok(places.length < 20000, `${places.length} characters`);
    assert.match(places, /and [\d,]+ more of its [\d,]+ values mention "city": look one up by a word only it has/);
    assert.match(places, /^laundry:\n/m);
  } finally {
    s.close();
  }
});

test("an offer scanned at work stays sold to businesses in its segment, the explorer and the next steps, whatever its words", async () => {
  const s = start();
  try {
    await s.ready;
    const set = (
      await s.call("research_start", {
        question:
          "Who should we sell to first? It's an app for trade businesses: jobs, quotes and invoices. $29 per user a month",
        country: "us",
      })
    ).content[0].text;
    assert.match(set, /Sold to organisations: put it to the people with ideas_scan anyway.*buying_category/);
    const file = join(s.dir, "nxk.json"),
      kb = JSON.parse(readFileSync(file, "utf8"));
    const corner = (key: string, among: string, odds: number) => ({
      key,
      among,
      label: key,
      share: 0.05,
      odds,
      strength: null,
      keen: 0.3,
      room: 0.2,
    });
    // The offer's words do not say businesses; its category does.
    kb.discovery.scans.push({
      id: "scan1",
      kind: "ideas",
      label: "t",
      ideas: [
        {
          key: "crew",
          offer: "a job scheduling app for field teams. $29 per user a month",
          buying_category: "software_and_saas",
        },
        { key: "b", offer: "Offer B. $5 a month" },
        { key: "c", offer: "Offer C. $9 a month" },
      ],
      corners: [
        corner("crew", "organisation_size=fewer_than_10_employees", 2.3),
        corner("b", "age_years=18..24", 1.5),
        corner("c", "age_years=65..", 1.4),
      ],
      nothing_for: [],
    });
    writeFileSync(file, JSON.stringify(kb));
    await s.call("segment_add", { label: "small crews", from_scan: "scan1", idea: "crew" });
    const saved = JSON.parse(readFileSync(file, "utf8")).discovery.segments[0];
    assert.equal(saved.at_work, "software_and_saas");
    assert.match(
      (await s.call("segments", { price: 29, margin: 80, target: 5000 })).content[0].text,
      /customers: sold to businesses, so set the customers needed against a count of that kind of business[^\n]*firms counted with people \(unit firms\)/,
    );
    const explored = (await s.call("explore_next", {})).content[0].text;
    assert.match(
      explored,
      /small crews[\s\S]*business: \$29 a month; .*sold to businesses: set paying customers against a count of that kind of business/,
    );
    assert.doesNotMatch(
      explored.split("\n").find((line) => /^\s+business: .*\$5/.test(line)) ?? "",
      /sold to businesses/,
    );
  } finally {
    s.close();
  }
});
