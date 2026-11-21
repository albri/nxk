#!/usr/bin/env node
// The sums for comparing options, done by the machine so that they are right. Each option is a chain of figures that
// multiply together (people who reach the point, share who start, share who pay, price, months they stay). It prints
// each option's result, the break-even for a figure you do not know, and which uncertain figure the choice hangs on.
//
//   node scripts/sums.ts --a="Card first: visitors=1000, start=4%, pay=60%, price=4.99, months=8" \
//                         --b="Email only: visitors=1000, start=12%, pay=?, price=4.99, months=8"
//   node scripts/sums.ts --a="Yearly default: buyers=100, yearly=70%, value=39.99" --b="Monthly default: buyers=100, yearly=30%..50%, value=39.99"
//   node scripts/sums.ts --unit="price=4.99, margin=70%, target=3000, cac=25, churn=6%, group=2.3%, adults=55484667"
//                         customers needed, payback and lifetime value for one kind of customer
//   node scripts/sums.ts --unit="customers=250, price=45, weeks=8, size=160000"
//                         the share of a counted group a number of customers the owner needs would be
//   node scripts/sums.ts --unit="margin=85%, target=10000, churn=4%" --a="Solo: price=29, cac=150" --b="Crew of 5: price=145, cac=400"
//                         the same for each option: the unit's figures shared, each option's own replacing them
//
// A figure is a number, a percentage, a range (30%..50%, for a figure you are unsure of) or ? (one figure, in one
// option, to solve for). Everything in an option multiplies; put a cost in as a margin (margin=70%).
import { argsOf, cli, Exit, type Out } from "./cli.ts";
import { openLog } from "./log.ts";

/** A figure of an option: a number, or a range from low to high (the same for a number). */
export interface KnownFactor {
  name: string;
  low: number;
  high: number;
  unknown?: undefined;
}

/** The one figure, in one option, to solve for (?). */
export interface UnknownFactor {
  name: string;
  unknown: true;
  low?: undefined;
  high?: undefined;
}

export type Factor = KnownFactor | UnknownFactor;

/** An option: its label (none when the text has none and no fallback is given), and the figures that multiply. */
export interface SumsOption {
  label: string | undefined;
  factors: Factor[];
}

/** Where an option's figures are taken: the low, the middle or the high of each range. */
export type At = "low" | "mid" | "high";

/** The value of the one unknown at which its option equals the best of the others, across their ranges. */
export interface BreakEven {
  option: string | undefined;
  name: string;
  value: number;
  low: number;
  high: number;
  against: string | undefined;
}

/** An uncertain figure across whose range the better option changes, and the value at which it changes. */
export interface Hinge {
  option: string | undefined;
  name: string;
  turn: number;
  low: number;
  high: number;
}

const number = (text: string) => {
  const t = text.trim();
  // A simple fraction ("1/10") is its value, as a decimal.
  const fraction = /^(\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)$/.exec(t);
  const value = fraction
    ? Number(fraction[1]) / Number(fraction[2])
    : t.endsWith("%")
      ? Number(t.slice(0, -1)) / 100
      : Number(t);
  if (!Number.isFinite(value))
    throw new Error(
      `"${text}" is not a number, a percentage, a range or ?. Write a fraction as a decimal, such as 0.1, or as a percentage, such as 10%`,
    );
  return value;
};

/** "Label: name=value, name=low..high, name=?" as an option. */
export function parseOption(text: string, fallback?: string): SumsOption {
  const at = text.indexOf(":");
  const label = at > 0 && !text.slice(0, at).includes("=") ? text.slice(0, at).trim() : fallback;
  const body = at > 0 && !text.slice(0, at).includes("=") ? text.slice(at + 1) : text;
  const factors = body
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part): Factor => {
      const [name, raw = ""] = part.split("=").map((x) => x.trim());
      if (!name || raw === "") throw new Error(`"${part}" should be name=value`);
      if (raw === "?") return { name, unknown: true };
      const [low, high] = raw.includes("..") ? raw.split("..").map(number) : [number(raw), number(raw)];
      return { name, low: Math.min(low, high), high: Math.max(low, high) };
    });
  if (!factors.length) throw new Error(`Option "${label}" has no figures`);
  return { label, factors };
}

const mid = (factor: KnownFactor) => (factor.low + factor.high) / 2;
/** The option's result with each figure at its low, middle or high value; `skip` leaves one figure out. */
export function product(option: SumsOption, at: At = "mid", skip: Factor | null = null): number {
  return option.factors.reduce(
    (total, factor) =>
      factor === skip || factor.unknown
        ? total
        : total * (at === "low" ? factor.low : at === "high" ? factor.high : mid(factor)),
    1,
  );
}

/** The value of the one unknown figure at which its option equals the best of the others (at their middle values). */
export function breakEven(options: SumsOption[]): BreakEven | null {
  const unknowns = options.flatMap((option) => option.factors.filter((factor) => factor.unknown));
  if (unknowns.length !== 1) return null;
  const option = options.find((candidate) => candidate.factors.some((factor) => factor.unknown))!,
    others = options.filter((candidate) => candidate !== option);
  if (!others.length) return null;
  const rest = product(option);
  const at = (how: At) => Math.max(...others.map((other) => product(other, how))) / rest;
  return {
    option: option.label,
    name: unknowns[0].name,
    value: at("mid"),
    low: at("low"),
    high: at("high"),
    against: others.reduce((best, other) => (product(other) > product(best) ? other : best)).label,
  };
}

/** The uncertain figures across whose range the better option changes, with the value at which it changes. */
export function hinges(options: SumsOption[]): Hinge[] {
  if (options.some((option) => option.factors.some((factor) => factor.unknown))) return [];
  const out: Hinge[] = [];
  for (const option of options) {
    for (const factor of option.factors) {
      if (factor.unknown || factor.low === factor.high) continue;
      const others = options.filter((candidate) => candidate !== option);
      const best = Math.max(...others.map((other) => product(other)));
      const turn = best / product(option, "mid", factor);
      if (turn > factor.low && turn < factor.high)
        out.push({ option: option.label, name: factor.name, turn, low: factor.low, high: factor.high });
    }
  }
  return out;
}

const show = (x: number) =>
  Math.abs(x) >= 100 ? x.toFixed(0) : Math.abs(x) >= 1 ? x.toFixed(2) : `${(100 * x).toFixed(1)}%`;

/** What the sums say about two or more options, as lines of text: each option's result, then the break-even or the margin. */
export function describeOptions(options: SumsOption[]): string[] {
  const out: string[] = [];
  for (const option of options) {
    const chain = option.factors
      .map(
        (factor) =>
          `${factor.name} ${factor.unknown ? "?" : factor.low === factor.high ? show(factor.low) : `${show(factor.low)} to ${show(factor.high)}`}`,
      )
      .join(" x ");
    const unknown = option.factors.some((factor) => factor.unknown),
      ranged = option.factors.some((factor) => !factor.unknown && factor.low !== factor.high);
    out.push(
      `${option.label}: ${chain}${unknown ? "" : ` = ${ranged ? `${show(product(option, "low"))} to ${show(product(option, "high"))} (middle ${show(product(option))})` : show(product(option))}`}`,
    );
  }
  const even = breakEven(options);
  if (even) {
    const spread =
      Math.abs(even.high - even.low) > 1e-9
        ? ` (between ${show(even.low)} and ${show(even.high)} across the other option's range)`
        : "";
    out.push(
      `Break-even: ${even.option} equals ${even.against} when ${even.name} is ${show(even.value)}${spread}. Above that, ${even.option} is ahead.`,
    );
    // Both are among the options: breakEven took their labels from them.
    const option = options.find((candidate) => candidate.label === even.option)!,
      against = options.find((candidate) => candidate.label === even.against)!;
    out.push(
      `Check: ${even.option} with ${even.name} at ${show(even.value)} = ${show(product(option) * even.value)}; ${even.against} = ${show(product(against))}.`,
    );
  } else if (options.every((option) => option.factors.every((factor) => !factor.unknown))) {
    const ranked = [...options].sort((a, b) => product(b) - product(a));
    const lead = product(ranked[0]) - product(ranked[1]);
    out.push(
      `At the middle of every range, ${ranked[0].label} is ahead of ${ranked[1].label} by ${show(lead)} (${((100 * lead) / product(ranked[1])).toFixed(0)}%).`,
    );
    const found = hinges(options);
    if (found.length)
      for (const hinge of found)
        out.push(
          `The choice hangs on ${hinge.name} in ${hinge.option}: it changes at ${show(hinge.turn)}, inside the range you gave (${show(hinge.low)} to ${show(hinge.high)}).`,
        );
    else if (options.some((option) => option.factors.some((factor) => factor.low !== factor.high)))
      out.push("No single uncertain figure changes the choice across the range you gave.");
  } else {
    // A take-up or conversion rate is the owner's to give: one the agent guessed would turn these sums into a forecast.
    out.push(
      [
        "These are the figures given multiplied out, not a forecast: a take-up, a conversion or how long people stay is the owner's to give, never yours.",
        "Give ? for the most uncertain one, in one option, and tell the owner the break-even instead.",
      ].join(" "),
    );
  }
  return out;
}

/**
 * The money a business needs from one kind of customer. `text` is "name=value, ..." with any of: price (a month, or
 * every `weeks` weeks), margin (the share of the price kept after the cost of serving), target (profit wanted a month),
 * fixed (fixed costs a month), customers (how many the owner says they need, instead of working it from a target), cac
 * (cost to win one customer), churn (share who leave each month), and the group the customers come from: size (how
 * many people it has, as counted), or group (its share of adults, from people.ts) with adults (how many adults that
 * share is of). Prints what follows from the figures given.
 */
const UNIT = ["price", "weeks", "margin", "target", "fixed", "customers", "cac", "churn", "group", "adults", "size"];
/** A share of a group to two figures: 0.16%, 0.64%, 4.2%, 31%. */
const shareOf = (x: number) => {
  const p = 100 * x;
  return `${p >= 10 ? p.toFixed(0) : p >= 1 ? p.toFixed(1) : Number(p.toPrecision(2))}%`;
};
const whole = (x: number) => Math.round(x).toLocaleString("en-GB");
export function unitEconomics(text: string): string[] {
  // A figure named twice keeps its last value: an option's own figures come after the shared ones.
  const given = Object.fromEntries(
    parseOption(`Unit: ${text}`).factors.map((factor) => [factor.name, factor.unknown ? null : mid(factor)]),
  );
  const out: string[] = [],
    { price, weeks, margin, customers, cac, churn, group, adults, size } = given;
  const target = given.target ?? 0,
    fixed = given.fixed ?? 0;
  if (!customers && (!price || !margin))
    throw new Error(
      "Give at least price=... and margin=..., or customers=... (how many customers the owner needs) with the group's size=...",
    );
  // A figure these sums do not use is said, never dropped silently: "seats=5" beside price=145 may already be in it.
  const unused = Object.keys(given).filter((name) => !UNIT.includes(name));
  if (unused.length)
    out.push(
      `Not used: ${unused.map((name) => `${name}=${given[name]}`).join(", ")}. price is what one customer (the whole account) pays a month: for 5 users at 29 each, give price=145.`,
    );
  // A price paid every few weeks (a groom every eight weeks) is turned into a month's.
  let monthly = price;
  if (price && weeks) {
    monthly = (price * 52) / 12 / weeks;
    out.push(`${show(price)} every ${weeks} weeks is ${show(monthly)} a month (x 52 / 12 / ${weeks}).`);
  }
  const perMonth = monthly && margin ? monthly * margin : null;
  if (perMonth && monthly && margin)
    out.push(
      `Each customer leaves ${show(perMonth)} a month after the cost of serving them (price ${show(monthly)} x margin ${show(margin)}).`,
    );
  let needed: number | null = null;
  // A number of customers the owner gives ("250 regular dogs") is taken as given; target is money, not a count.
  if (customers) {
    needed = Math.ceil(customers);
    out.push(`Customers needed: ${whole(needed)} (the figure given).`);
    if (monthly)
      out.push(
        `They pay ${show(needed * monthly)} a month${perMonth ? ` and leave ${show(needed * perMonth)} after the cost of serving them` : ""}.`,
      );
  } else if ((target || fixed) && perMonth) {
    needed = Math.ceil((target + fixed) / perMonth);
    out.push(
      `Customers needed for ${show(target)} a month${fixed ? ` over fixed costs of ${show(fixed)}` : ""}: ${needed}.`,
    );
  }
  const pool = size || (group && adults ? group * adults : null);
  if (needed && pool) {
    const of =
      !size && group && adults
        ? `its ${whole(pool)} people (${show(group)} of ${whole(adults)} adults)`
        : `its ${whole(pool)} people`;
    out.push(
      needed > pool
        ? `That is more than the whole group: ${whole(needed)} needed against ${of}.`
        : `That is 1 in ${whole(pool / needed)} of the group, ${shareOf(needed / pool)} of ${of}.`,
    );
  } else if (needed && (group || adults))
    out.push(
      "For the share of the group they are, give size=... (how many people the group has, as counted) or group=... (its share of adults) with adults=....",
    );
  if (churn && perMonth) {
    const lifetime = perMonth / churn;
    out.push(
      `At ${show(churn)} leaving a month, a customer stays ${(1 / churn).toFixed(1)} months on average and leaves ${show(lifetime)} in all.`,
    );
    if (cac) {
      const thin = lifetime / cac < 3 ? " Under 3 times is thin for a business that must pay for growth." : "";
      out.push(
        `Winning one costs ${show(cac)}: paid back in ${(cac / perMonth).toFixed(1)} months; lifetime value is ${(lifetime / cac).toFixed(1)} times the cost to win.${thin}`,
      );
    }
  } else if (cac && perMonth)
    out.push(
      `Winning one costs ${show(cac)}: paid back in ${(cac / perMonth).toFixed(1)} months, if they stay that long.`,
    );
  else if ((churn || cac) && !perMonth)
    out.push(
      `Not worked: ${[churn ? "churn" : "", cac ? "cac" : ""].filter(Boolean).join(" and ")}, which need price=... and margin=....`,
    );
  return out;
}

/**
 * The unit sums for each option: the unit's figures shared, each option's own replacing them, so that one call can
 * give both ("unit": margin, target, churn; "options": each size's price and cost to win).
 */
export function unitPerOption(unit: string, texts: string[]): string[] {
  return texts.flatMap((text, i) => {
    const { label, factors } = parseOption(text, `Option ${"ABCDEFGH"[i]}`);
    const own = factors
      .map((f) => `${f.name}=${f.unknown ? "?" : f.low === f.high ? f.low : `${f.low}..${f.high}`}`)
      .join(", ");
    return [`${label}:`, ...unitEconomics(`${unit}, ${own}`).map((line) => `  ${line}`)];
  });
}

export async function run(argv: string[], out: Out): Promise<void> {
  const { flags } = argsOf(argv);
  const unit = flags.unit;
  // The options are the one-letter flags (--a, --b, ...), in the order given.
  const texts = Object.entries(flags)
    .filter(([name]) => /^[a-z]$/.test(name))
    .map(([, text]) => text);
  if (unit && texts.length) {
    const log = openLog("sums", argv, { label: "computed", ...out });
    for (const line of unitPerOption(unit, texts)) log.line(line);
    return;
  }
  if (unit) {
    const log = openLog("sums", argv, { label: "computed", ...out });
    for (const line of unitEconomics(unit)) log.line(line);
    return;
  }
  if (texts.length < 2) {
    out.print(
      [
        'Give two or more options, each "Label: name=value, ...". A value is a number, a percentage, a range such as 30%..50%, or ? for the one figure to solve for.',
        'Or the money one kind of customer brings in, as unit: "price=4.99, margin=70%, target=3000, cac=25, churn=6%, group=2.3%, adults=55484667".',
      ].join("\n"),
    );
    throw new Exit(texts.length ? 1 : 0);
  }
  const log = openLog("sums", argv, { label: "computed", ...out });
  const options = texts.map((text, i) => parseOption(text, `Option ${"ABCDEFGH"[i]}`));
  for (const line of describeOptions(options)) log.line(line);
}

cli(import.meta.url, run);
