import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import type { FactRecord, LogRecord, MarkedRecord } from "../scripts/log.ts";
import { markedFields, nudgeFor, topOf, versionsApart } from "./nudge.ts";

// What scan.ts and people.ts record beside the lines they print: a fact that matters, and a fact that marks a group out.
const fact = (field: string, low: string, high: string): FactRecord => ({ type: "fact", field, low, high });
const marked = (field: string, gap: number): MarkedRecord => ({ type: "marked", field, gap });

test("an option scan's reading gives the fact that matters most, with the codes at both ends", () => {
  const records: LogRecord[] = [
    { type: "line", text: "Facts that matter most (22 of 25 fields):" },
    fact("new_technology_adoption", "last_or_never", "among_the_first_to_try_it"),
    fact("y", "a", "b"),
  ];
  assert.deepEqual(topOf(records), {
    field: "new_technology_adoption",
    low: "last_or_never",
    high: "among_the_first_to_try_it",
  });
  // A numeric code is printed by its title, which cannot be read back as a condition.
  assert.equal(topOf([fact("current_occupation", "6135 Care", "2314 Teachers")]), null);
});

test("a profile's widest gaps name the fields to split by, leaving out the group's own and the derived summaries", () => {
  const records = [
    marked("main_travel_mode", 50),
    marked("vehicles_in_household", 31),
    marked("life_stage", 28),
    marked("age_years", 40),
  ];
  assert.deepEqual(markedFields(records, ["age_years"]), ["main_travel_mode", "vehicles_in_household"]);
});

test("each answer names one next move: a count is profiled, a profile split, a scan read at both ends of its top fact", () => {
  const folder = mkdtempSync(join(tmpdir(), "nxk-nudge-"));
  const count = nudgeFor({
    tool: "people",
    args: { action: "count", who: "a=1; b=2" },
    records: [],
    folder,
    country: "uk",
  });
  assert.match(count[0], /^Next: people \{"action":"profile","who":"a=1"\}\./);
  const split = nudgeFor({
    tool: "people",
    args: { action: "profile", who: "a=1" },
    records: [marked("c", 31)],
    folder,
    country: "uk",
  });
  assert.match(split[0], /^Next: people \{"action":"split","who":"a=1","by":\["c"\]\}/);
  const read = nudgeFor({
    tool: "options_scan",
    args: { label: "s", read_only: true },
    records: [fact("f", "lo", "hi")],
    folder,
    country: "uk",
  });
  assert.match(read[0], /^Next: options_scan \{"label":"s","read_only":true,"who":"f=lo; f=hi"\}/);
  // A group read is then split by that fact, inside the first group.
  const inside = nudgeFor({
    tool: "options_scan",
    args: { label: "s", read_only: true, who: "a=1; b=2" },
    records: [],
    folder,
    country: "uk",
  });
  assert.match(inside[0], /"who":"a=1,f=lo; a=1,f=hi"/);
  // After suggest, close call or not, nothing more is asked of the owner: the work is built and the reply checked.
  for (const records of [
    [{ type: "close_call" }],
    [{ type: "line", text: "Not a close call.", label: "counted" }],
  ] satisfies LogRecord[][])
    assert.match(
      nudgeFor({ tool: "suggest", args: {}, records, folder, country: "uk" })[0],
      /^Next: note_check, once you have built what was asked/,
    );
  // A tool's own next move is not doubled, and a scan left running names none.
  assert.deepEqual(
    nudgeFor({
      tool: "sweep",
      args: {},
      records: [{ type: "next", text: "Next: for each lens with lines, say which choice those people meet." }],
      folder,
      country: "uk",
    }),
    [],
  );
  assert.deepEqual(
    nudgeFor({ tool: "ideas_scan", args: { label: "s" }, records: [{ type: "running" }], folder, country: "uk" }),
    [],
  );
});

test("a group read of several versions is split by the fact where the versions differ most, from the saved answers", () => {
  const folder = mkdtempSync(join(tmpdir(), "nxk-nudge-")),
    dir = join(folder, ".nxk", "scans", "options", "v");
  mkdirSync(dir, { recursive: true });
  // Renters prefer "cheap", owners "plan"; tenure moves the two furthest apart. Pets move both alike.
  const tenure = {
    owned_outright: [0.1, 0.3],
    owned_with_a_mortgage_or_loan: [0.1, 0.25],
    rented_from_a_private_landlord_or_letting_agency: [0.4, 0.1],
  };
  const pets = { dogs_only: [0.3, 0.3], no_pets: [0.1, 0.1] };
  [0, 1].forEach((k) =>
    writeFileSync(
      join(dir, `scan-${["cheap", "plan"][k]}.jsonl`),
      [
        ...Object.entries(tenure).map(([code, p]) =>
          JSON.stringify({ id: `home_and_travel.home_tenure=${code}`, p: p[k] }),
        ),
        ...Object.entries(pets).map(([code, p]) =>
          JSON.stringify({ id: `home_and_travel.pets_in_household=${code}`, p: p[k] }),
        ),
      ].join("\n"),
    ),
  );
  assert.deepEqual(versionsApart(folder, "v", "uk"), {
    field: "home_tenure",
    low: "owned_outright",
    high: "rented_from_a_private_landlord_or_letting_agency",
  });
  const inside = nudgeFor({
    tool: "options_scan",
    args: { label: "v", read_only: true, who: "age_years=18..29; age_years=65..120" },
    records: [],
    folder,
    country: "uk",
  });
  assert.match(
    inside[0],
    /"who":"age_years=18\.\.29,home_tenure=owned_outright; age_years=18\.\.29,home_tenure=rented_from_a_private_landlord_or_letting_agency"/,
  );
  // A group already cut by that fact is split by the next one that pulls the versions apart (pets move both alike, so
  // none), or profiled when there is none.
  assert.equal(versionsApart(folder, "v", "uk", ["home_tenure"]), null);
  assert.match(
    nudgeFor({
      tool: "options_scan",
      args: { label: "v", read_only: true, who: "home_tenure=owned_outright" },
      records: [],
      folder,
      country: "uk",
    })[0],
    /^Next: people \{"action":"profile"/,
  );
});
