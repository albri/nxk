import assert from "node:assert/strict";
import test from "node:test";
import { findClaims, paymentsRead, settles, tickedBoxes } from "./delivered.ts";

const page = (body: string, head = "") =>
  `<!doctype html><html><head><title>t</title>${head}</head><body>${body}</body></html>`;

test("findClaims flags invented proof and leaves plain copy alone", () => {
  const t =
    "Most popular. Trusted by 2,000 customers. 4.8 out of 5. Join 10,000 members. 92% of customers stay. “This changed how our whole team works every day” — Sam R. Review your order.";
  const m = findClaims(t).map((c) => c.match.toLowerCase());
  for (const x of ["most popular", "trusted by", "4.8 out of 5", "92% of customers"])
    assert.ok(
      m.some((y) => y.includes(x)),
      x,
    );
  assert.ok(m.some((y) => y.includes("join 10,000")));
  assert.ok(m.some((y) => y.startsWith("“")));
  assert.equal(findClaims("Review your order. Pick a plan.").length, 0);
});

test("payments read by word patterns, where the text does not already say what they need", () => {
  const read = (text: string) => paymentsRead(text).map((p) => p.kind);
  assert.deepEqual(read(page("<p>Plus: $6.99 a month. Start your 14-day free trial. Cancel any time.</p>")), [
    "free_trial",
  ]);
  assert.deepEqual(
    read(
      page(
        "<p>Plus: $6.99 a month. Start your 14-day free trial. When your trial ends you pay $6.99 a month. Cancel any time before.</p>",
      ),
    ),
    [],
  );
  assert.deepEqual(
    read(page("<p>Try Plus free for 14 days. When the trial ends you go back to the free plan.</p>")),
    [],
  );
  assert.deepEqual(read(page("<p>Membership: £32 a month, rolling.</p>")), ["repeating"]);
  assert.deepEqual(read(page("<p>Membership: £32 a month, rolling. Cancel online any time.</p>")), []);
  assert.deepEqual(read("Hi Sam,\n\nStart your 14-day free trial of Plus today. Plus is £6.99 a month."), [
    "free_trial",
    "repeating",
  ]);
  assert.deepEqual(read("Refunds: we refund any unopened item within 14 days of delivery."), []);
  // Pointing to an attachment for the new premium does not say what the renewal costs.
  assert.deepEqual(
    read(
      "Your policy renews automatically on [renewal date]. Your renewal schedule is attached and shows your new premium.",
    ),
    ["renewal"],
  );
  assert.deepEqual(
    read(
      "Your policy renews automatically on [renewal date] at [new premium], against [last year's premium] last year.",
    ),
    [],
  );
  assert.deepEqual(read("Renew your library card online once a year. Joining is free."), []);
});

test("the words declared for a payment do what its kind needs", () => {
  assert.ok(
    settles("free_trial", "When the trial ends, Plus is £6.99 a month") &&
      settles("free_trial", "After 14 days you go back to the free plan, and nothing is charged"),
  );
  assert.ok(!settles("free_trial", "Cancel any time"));
  assert.ok(
    settles("renewal", "It renews on 1 March at [new premium]") &&
      !settles("renewal", "Your new premium is in the attached schedule"),
  );
  assert.ok(settles("repeating", "Cancel from your account at any time"));
});

test("on a page, a box beside a payment or a consent is never ticked for the person", () => {
  assert.equal(
    tickedBoxes(
      page(
        '<label><input type="checkbox" name="insurance" checked> Add travel insurance (£12)</label><p>Total £148</p>',
      ),
    ).length,
    1,
  );
  assert.equal(
    tickedBoxes(page('<label><input type="checkbox" name="insurance"> Add travel insurance (£12)</label>')).length,
    0,
  );
  assert.equal(
    tickedBoxes(page('<label><input type="checkbox" name="remember" checked> Keep me signed in</label>')).length,
    0,
  );
  assert.equal(tickedBoxes("- [x] Add gadget insurance, £4 a month").length, 0); // a ticked box only counts on a page
});
