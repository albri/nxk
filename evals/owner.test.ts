import assert from "node:assert/strict";
import test from "node:test";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { judged } from "./grade.ts";
import {
  calibrationExamples,
  calibrationMisses,
  conversationOf,
  DONT_KNOW,
  FILL_IN,
  grounded,
  ownerFiles,
  ownerMessage,
  ownerPrompt,
  actionable,
  ownerTally,
  ownerTurn,
  parseOwner,
  placeholdersIn,
  putsToOwner,
  type Answer,
  type Decisions,
  type Offer,
} from "./owner.ts";
import { transcriptOf } from "./run.ts";

const knows = {
  request: "write our returns page",
  goals: "Sam sells refurbished laptops and wants fewer support emails.",
  knows: "- Returns are accepted within 30 days of delivery.",
};

test("an answer the owner's files do not hold, word for word, is not known: theirs to fill in, or the session's call", () => {
  const d = grounded(
    {
      answers: [
        { question: "how long to return", kind: "fact", answer: "30 days", quote: "within 30 days of delivery" },
        { question: "who pays postage", kind: "fact", answer: "the buyer", quote: "the buyer pays postage" },
        { question: "exchanges", kind: "fact", answer: "I don't know", quote: "" },
        { question: "phone field required", kind: "choice", answer: "I don't know", quote: "" },
        { question: "restocking fee", kind: "fact", answer: "none", quote: "" },
      ],
      offers: [],
    },
    knows,
  );
  assert.deepEqual(
    d.answers.map((a) => [a.answer, a.known, Boolean(a.ungrounded)]),
    [
      ["30 days", true, false],
      [FILL_IN, false, true],
      [FILL_IN, false, false],
      [DONT_KNOW, false, false],
      [FILL_IN, false, true],
    ],
  );
});

test("the owner's message is written from their decisions, and offers turned down alone need none", () => {
  const offers = [
    { offer: "add a line for people at home in the mornings.", yes: true },
    { offer: "add an evening class", yes: false },
  ] as Offer[];
  const answers = [
    { question: "How long to return?", answer: "30 days", known: true },
    { question: "Gym name", answer: FILL_IN, known: false },
    { question: "Collection day", answer: FILL_IN, known: false },
    { question: "Phone field required?", answer: DONT_KNOW, known: false },
  ] as Answer[];
  assert.equal(
    ownerMessage({ answers, offers }),
    [
      "Yes, please: add a line for people at home in the mornings.",
      "No to this, leave it as it is: add an evening class.",
      'About "How long to return": 30 days',
      "Mine to fill in, so leave these as blanks: Gym name; Collection day.",
      "I don't know; use your judgement on: Phone field required.",
      "Make those changes and nothing else, then tell me where it stands.",
    ].join("\n"),
  );
  // Only blanks the owner will fill in: said, and the conversation ends there, with nothing for the session to do.
  const fillOnly = { answers: answers.slice(1, 3), offers: [{ offer: "x", yes: false }] as Offer[] };
  assert.equal(actionable(fillOnly), false);
  assert.match(
    ownerMessage(fillOnly) ?? "",
    /leave these as blanks: Gym name; Collection day\.\nThat's all for now\.$/,
  );
  assert.equal(ownerMessage({ answers: [], offers: [{ offer: "x", yes: false }] as Offer[] }), null);
  assert.equal(ownerMessage({ answers: [], offers: [] }), null);
});

test("the owner model's answer is read from the JSON in it, whatever surrounds it", () => {
  const text =
    'Here you go:\n```json\n{"answers":[{"question":"q","answer":"a","quote":"z"}],"offers":[{"offer":"o","yes":true,"why":"goal"}]}\n```';
  assert.deepEqual(parseOwner(text), {
    answers: [{ question: "q", kind: "fact", answer: "a", quote: "z" }],
    offers: [{ offer: "o", yes: true, why: "goal" }],
  });
  assert.equal(parseOwner("no json here"), null);
  // A yes must be the boolean true.
  assert.equal(parseOwner('{"offers":[{"offer":"o","yes":"maybe"}]}')?.offers[0].yes, false);
});

test("a reply that asks and offers nothing, with no blank left, costs no call", async () => {
  assert.equal(putsToOwner("Fixed the footer typo."), false);
  assert.equal(putsToOwner("Done. Want me to add a map?"), true);
  assert.equal(putsToOwner("Say yes and I'll add a taster evening."), true);
  assert.equal(putsToOwner("Done.", ["return window"]), true);
  let called = 0;
  const said = await ownerTurn({ ...knows, reply: "Fixed the footer typo." }, { model: "m" }, async () => {
    called++;
    return { out: "" };
  });
  assert.equal(called, 0);
  assert.equal(said.message, null);
});

test("one owner turn: the model is asked once with no tools, and its decisions are grounded", async () => {
  const calls: { args: string[]; input?: string }[] = [];
  const said = await ownerTurn(
    { ...knows, reply: "How long do people have to return a laptop? Do you charge a restocking fee?" },
    { model: "m-1" },
    async (cmd, args, { input }) => {
      calls.push({ args, input });
      const result = JSON.stringify({
        answers: [
          {
            question: "How long to return",
            kind: "fact",
            answer: "30 days",
            quote: "Returns are accepted within 30 days",
          },
          { question: "Restocking fee", kind: "fact", answer: "10%", quote: "a 10% restocking fee" },
        ],
        offers: [],
      });
      return { out: JSON.stringify({ result, total_cost_usd: 0.01, modelUsage: { "m-1": {} } }) };
    },
  );
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0].args.slice(calls[0].args.indexOf("--tools"), calls[0].args.indexOf("--tools") + 2), [
    "--tools",
    "",
  ]);
  assert.match(
    calls[0].input ?? "",
    /<what you know>\n- Returns are accepted within 30 days of delivery\.\n<\/what you know>/,
  );
  assert.equal(said.cost, 0.01);
  assert.match(said.message ?? "", /About "How long to return": 30 days/);
  assert.match(said.message ?? "", /Mine to fill in, so leave these as blanks: Restocking fee\./);
  assert.equal(said.resume, true);
  assert.deepEqual(ownerTally([said]), { exchanges: 1, yes: 0, no: 0, known: 1, unknown: 1, fill: 1, ungrounded: 1 });
  // An owner model that never answers is an error, not an owner who said nothing.
  await assert.rejects(
    ownerTurn({ ...knows, reply: "Any questions?" }, { model: "m" }, async () => ({ out: "", err: "usage limit" })),
    /the owner did not answer: usage limit/,
  );
});

test("the owner sees the blanks left in the work, and what they said before", () => {
  const blanks = placeholdersIn([
    { path: "terms.md", text: "Deposit: [deposit amount]. See [our site](https://x). Tick [x] here. [deposit amount]" },
    {
      path: "site/join.html",
      text: '<h1>[Gym name]</h1><style>[type="text"]{}</style><script>const [k, v] = x;</script>',
    },
    { path: "site/app.js", text: "const [first payment date] = 1;" },
    { path: "notes.md", text: "Pattern [A-Za-z0-9], [^\\s@], [body.service], [k, v].\n```\n[in code]\n```" },
  ]);
  assert.deepEqual(blanks, ["deposit amount", "Gym name"]);
  const prompt = ownerPrompt({ ...knows, reply: "Done.", placeholders: blanks, said: ["Yes, please: add it."] });
  assert.match(prompt, /<blanks left in the work>\n\[deposit amount\]\n/);
  assert.match(prompt, /<what you said before>\nYes, please: add it\.\n/);
  assert.match(ownerPrompt({ request: "r", goals: null, knows: null, reply: "x" }), /no goals written down/);
});

test("graders and the judge read the conversation, told so only when the owner answered", () => {
  const one = conversationOf([{ after: "request", reply: "Done, with a note." }]);
  assert.equal(one, "Done, with a note.");
  assert.doesNotMatch(judged(one, []), /The owner answered during the work/);
  const scan = conversationOf([
    { after: "request", reply: "The scan is running." },
    { after: "come-back", reply: "The scan says X." },
  ]);
  assert.equal(scan, "The scan says X.");
  const talk = conversationOf([
    { after: "request", reply: "Email written. Say yes and I'll add a line." },
    { after: "owner", said: "Yes, please: add a line.", reply: "Added the line." },
  ]);
  assert.equal(
    talk,
    "Email written. Say yes and I'll add a line.\n\n---\nThe owner replied: Yes, please: add a line.\n---\n\nAdded the line.",
  );
  assert.match(
    judged(talk, []),
    /^The owner answered during the work: .* What the owner said yes to there, and every fact they gave there, is theirs/,
  );
  const closed = conversationOf([
    { after: "request", reply: "Page written, with [Gym name] left for you." },
    { after: "owner", said: "Mine to fill in, so leave these as blanks: Gym name.\nThat's all for now.", reply: "" },
  ]);
  assert.match(closed, /left for you\.\n\n---\nThe owner replied: Mine to fill in.*\nThat's all for now\.\n---$/);
});

test("the owner's files are read from the case, and the calibration examples say what each expects", () => {
  const dir = mkdtempSync(join(tmpdir(), "nxk-owner-"));
  mkdirSync(join(dir, "graders", "source"), { recursive: true });
  writeFileSync(join(dir, "graders", "source", "owner.md"), "Goals.\n");
  assert.deepEqual(ownerFiles(dir), { goals: "Goals.", knows: null });
  const examples = calibrationExamples();
  assert.ok(examples.length >= 8);
  for (const ex of examples) {
    assert.ok(ex.request && ex.reply && ex.expect, ex.name);
    assert.ok(
      ["yes", "no", "known", "unknown", "fill", "judgement", "notOffers", "quiet"].some((k) => k in ex.expect),
      ex.name,
    );
  }
  assert.ok(
    examples.some((x) => x.expect.yes) && examples.some((x) => x.expect.no) && examples.some((x) => x.expect.unknown),
  );
  // Misses name what was decided wrong.
  const said = {
    decisions: {
      offers: [{ offer: "add a taster evening", yes: false }],
      answers: [{ question: "Deposit amount", answer: DONT_KNOW, known: false }],
    } as Decisions,
    message: "x",
  };
  assert.deepEqual(calibrationMisses({ yes: ["taster"], known: ["deposit"], quiet: true }, said), [
    '"taster": no, expected yes',
    '"deposit": I don\'t know, expected an answer from the files',
    "expected nothing to say, said: x",
  ]);
});

test("a session's transcript includes its subagents', after its own lines", () => {
  const base = mkdtempSync(join(tmpdir(), "nxk-projects-"));
  mkdirSync(join(base, "-w", "s1", "subagents"), { recursive: true });
  writeFileSync(join(base, "-w", "s1.jsonl"), '{"type":"user"}\n{"type":"assistant"}\n');
  writeFileSync(join(base, "-w", "s1", "subagents", "agent-a.jsonl"), '{"type":"assistant","isSidechain":true}\n');
  assert.deepEqual(transcriptOf(["s1"], base), [
    '{"type":"user"}',
    '{"type":"assistant"}',
    '{"type":"assistant","isSidechain":true}',
  ]);
});
