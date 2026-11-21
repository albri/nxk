import assert from "node:assert/strict";
import test from "node:test";
import { breakEven, describeOptions, hinges, parseOption, product, unitEconomics, unitPerOption } from "./sums.ts";

test("parseOption reads a label, numbers, percentages, ranges and one unknown", () => {
  const option = parseOption("Card first: visitors=1000, start=4%, pay=30%..60%, price=4.99, stay=?", "Option A");
  assert.equal(option.label, "Card first");
  assert.deepEqual(
    option.factors.map((f) => f.name),
    ["visitors", "start", "pay", "price", "stay"],
  );
  assert.deepEqual(
    [option.factors[1].low, option.factors[2].low, option.factors[2].high, option.factors[4].unknown],
    [0.04, 0.3, 0.6, true],
  );
  assert.equal(parseOption("a=1, b=2", "Option B").label, "Option B");
  assert.throws(() => parseOption("X: start=lots", "X"), /not a number/);
  assert.throws(() => parseOption("X: start", "X"), /name=value/);
});

test("product multiplies the chain at the low, middle or high of each range", () => {
  const option = parseOption("A: n=100, start=10%..30%, price=5", "A");
  assert.ok(Math.abs(product(option, "low") - 50) < 1e-9);
  assert.ok(Math.abs(product(option) - 100) < 1e-9);
  assert.ok(Math.abs(product(option, "high") - 150) < 1e-9);
});

test("breakEven solves the one unknown and the answer checks out", () => {
  const a = parseOption("Card first: visitors=100, start=4%, pay=60%", "A");
  const b = parseOption("Email only: visitors=100, start=12%, pay=?", "B");
  const even = breakEven([a, b]);
  assert.ok(even);
  assert.equal(even.name, "pay");
  assert.ok(Math.abs(even.value - 0.2) < 1e-9);
  assert.ok(Math.abs(product(b) * even.value - product(a)) < 1e-9); // put it back in: the two options are equal
  assert.equal(breakEven([a, parseOption("B: visitors=100, start=12%, pay=30%", "B")]), null);
  assert.equal(breakEven([parseOption("A: x=?, y=2", "A"), parseOption("B: x=?, y=3", "B")]), null);
});

test("breakEven for the off-peak case that was once worked out wrong", () => {
  // A member who switches to off-peak pays 22 a month in place of 32. Switching pays if enough switchers would
  // otherwise have cancelled and paid nothing: 22 = 32 x (1 - cancel share) gives 10/32, about 31%.
  const offer = parseOption("Offer off-peak: members=100, price=22", "A");
  const none = parseOption("No offer: members=100, price=32, stay=?", "B");
  const even = breakEven([offer, none]);
  assert.ok(even);
  assert.ok(Math.abs(even.value - 22 / 32) < 1e-9); // at most 69% may stay anyway, so at least 31% must have been leaving
});

test("hinges names the uncertain figure that changes the choice", () => {
  const yearly = parseOption("Yearly default: buyers=100, value=50", "A");
  const monthly = parseOption("Monthly default: buyers=100, value=60, stay=60%..95%", "B");
  const found = hinges([yearly, monthly]);
  assert.equal(found.length, 1);
  assert.equal(found[0].name, "stay");
  assert.ok(Math.abs(found[0].turn - 50 / 60) < 1e-9);
  assert.equal(hinges([yearly, parseOption("B: buyers=100, value=60, stay=90%..95%", "B")]).length, 0);
});

test("unitEconomics gives customers needed, payback and lifetime value from the figures given", () => {
  const lines = unitEconomics("price=4.99, margin=70%, target=3000, cac=25, churn=6%, group=2.3%, adults=55484667");
  assert.match(lines.join("\n"), /Customers needed for 3000 a month: 859\./); // 3000 / (4.99 x 0.7) = 858.9
  assert.match(lines.join("\n"), /1 in 1,486 of the group/); // 0.023 x 55,484,667 / 859
  assert.match(lines.join("\n"), /paid back in 7\.2 months; lifetime value is 2\.3 times/);
  assert.throws(() => unitEconomics("price=4.99"), /margin/);
  // A figure the sums do not use is said, not dropped.
  assert.match(
    unitEconomics("price=145, margin=85%, seats=5")[0],
    /^Not used: seats=5\. price is what one customer \(the whole account\) pays a month/,
  );
});

test("a number of customers the owner gives is set against a counted group, with a price paid every few weeks", () => {
  // 250 regular dogs, £45 every eight weeks, against 160,000 dog-household adults in Leeds: a number of customers is a
  // figure of its own, not a money target, and the share of the group it needs is worked out here.
  const lines = unitEconomics("customers=250, price=45, weeks=8, size=160000");
  assert.equal(lines[0], "45.00 every 8 weeks is 24.38 a month (x 52 / 12 / 8).");
  assert.ok(lines.includes("Customers needed: 250 (the figure given)."));
  assert.ok(lines.includes("They pay 6094 a month."));
  assert.ok(lines.includes("That is 1 in 640 of the group, 0.16% of its 160,000 people."));
  assert.match(
    unitEconomics("customers=250, size=39000").at(-1) ?? "",
    /^That is 1 in 156 of the group, 0\.64% of its 39,000 people\.$/,
  );
  assert.match(unitEconomics("customers=500, size=300").at(-1) ?? "", /more than the whole group/);
  assert.match(unitEconomics("customers=250, group=2%").at(-1) ?? "", /give size=/);
  assert.match(unitEconomics("customers=250, size=39000, churn=5%").at(-1) ?? "", /^Not worked: churn/);
  assert.throws(() => unitEconomics("size=39000"), /customers=/);
  // Per option: the same need against each town's count.
  const towns = unitPerOption("customers=250, price=45, weeks=8", ["Leeds: size=160000", "York: size=39000"]);
  assert.ok(towns.includes("  That is 1 in 156 of the group, 0.64% of its 39,000 people."));
});

test("unit and options together: the unit sums for each option, its own figures replacing the shared ones", () => {
  const lines = unitPerOption("price=29, margin=85%, target=10000, cac=300, churn=4%", [
    "Solo: price=29",
    "Crew of 5: price=145, cac=600, churn=3%",
  ]);
  assert.equal(lines[0], "Solo:");
  assert.ok(lines.includes("  Customers needed for 10000 a month: 406."));
  const crew = lines.slice(lines.indexOf("Crew of 5:"));
  assert.ok(crew.includes("  Customers needed for 10000 a month: 82."));
  assert.ok(crew.some((line) => /Winning one costs 600: paid back in 4\.9 months/.test(line)));
});

test("describeOptions states a break-even and its check", () => {
  const lines = describeOptions([
    parseOption("Card: n=100, start=4%, pay=60%", "A"),
    parseOption("Email: n=100, start=12%, pay=?", "B"),
  ]);
  assert.ok(lines.some((line) => /Break-even: Email equals Card when pay is 20\.0%/.test(line)));
});

test("a simple fraction is read as its value, and a wrong figure is told to be a decimal", () => {
  const [factor] = parseOption("A: share=1/10", "A").factors;
  assert.equal(factor.low, 0.1);
  assert.throws(() => parseOption("A: share=a third", "A"), /as a decimal, such as 0\.1/);
});
