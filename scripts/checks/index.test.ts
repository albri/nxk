import assert from "node:assert/strict";
import test from "node:test";
import { check } from "../note.ts";
import { run } from "../testing.ts";
import { CHECKS, CHECK_KINDS, runChecks, type Check, type CheckContext } from "./index.ts";

test("every check says what it is for and is of a known kind, once", () => {
  const ids = CHECKS.map((c) => c.id);
  assert.equal(new Set(ids).size, ids.length, `ids repeat: ${ids.filter((id, i) => ids.indexOf(id) !== i)}`);
  for (const c of CHECKS) {
    assert.ok(CHECK_KINDS.includes(c.kind), `${c.id}: kind ${c.kind}`);
    assert.ok(typeof c.why === "string" && c.why.length > 20, `${c.id}: why`);
    assert.equal(typeof c.run, "function", `${c.id}: run`);
  }
});

test("a hint only ever warns, whatever it asks for", () => {
  // Neither check reads the reply, so it is left empty.
  const reply = {} as CheckContext;
  const loud: Check[] = [
    { id: "loud", kind: "hint", why: "a word pattern that would fail", run: (ctx, { fail }) => fail("no") },
  ];
  assert.deepEqual(runChecks(reply, loud), [{ level: "WARN", message: "no", check: "loud" }]);
  const strict: Check[] = [
    { id: "strict", kind: "format", why: "text nxk prints, looked for", run: (ctx, { fail }) => fail("no") },
  ];
  assert.equal(runChecks(reply, strict)[0].level, "FAIL");
});

test("on a reply full of word-pattern trouble and nothing to trace, nothing fails", () => {
  // Owner's share, take-up, firms, words, everyone, a group not counted, invented proof, a trial: all prose.
  const log = [run("people", "counted", "24.5 in every 100 adults (counted)")];
  const reply = [
    "About 24.5 in every 100 of your customers would buy it (counted, of US adults).",
    "Roughly a third of the people who could buy would switch, and everyone else would stay.",
    "I can't size landlords, and no fact records them.",
    "Offer a 14-day free trial; it is the most popular choice.",
    "counted: on 200,000 made-up US adults that match official statistics, a rough guide",
  ].join("\n");
  const found = check(reply, log);
  assert.deepEqual(
    found.filter((f) => f.level === "FAIL"),
    [],
  );
  const hinted = new Set(found.map((f) => f.check));
  for (const id of ["owners-share", "label-words", "everyone", "uncounted", "invented-proof", "payments-read"])
    assert.ok(hinted.has(id), id);
  for (const f of found) assert.equal(CHECKS.find((c) => c.id === f.check)?.kind, "hint", f.check);
});
