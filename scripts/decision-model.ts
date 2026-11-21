// Which decision model answers a scan, how it is reached, how fast it may be asked and what it costs. One place decides
// this for the scan, the tools that report on it and the hooks, from what is set: the plugin's settings (NXK_* in the
// server, CLAUDE_PLUGIN_OPTION_* in hooks), the usual environment variables, then key files in ~/.config/nxk. Keys are
// read, never printed: what this returns names where a key came from, not the key.
//
// Every route here takes TypeSafe's System One requests (state and a questions object), Google's in its own variant
// (google.ts). Limits and prices are as the providers published them in November 2026 (mcp/guides/scan.md).
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

/** How requests reach the model (ROUTES). */
export type Route = "google" | "gateway" | "openrouter" | "typesafe" | "custom";
/** A route with keys of its own: every route but a custom URL. */
export type Provider = Exclude<Route, "custom">;
/** Google's tiers (GOOGLE_TIERS). */
export type Tier = "free" | "tier1" | "tier2" | "tier3";

/** A provider's published limits: requests and tokens a minute, and requests a day (null for no daily cap). */
export interface Limits {
  label: string;
  rpm: number;
  tpm: number;
  rpd: number | null;
}

/** A decision model nxk knows: the id each route takes it by, and its published price. */
export interface Model {
  routes: Partial<Record<Provider, string>>;
  usdPerMillion: number;
}

/** A key, and where it came from (a variable, a file or the settings). */
export interface Key {
  key: string;
  from: string;
}

/** A saved answer row: `m` is the model it came from, missing on rows saved before the model was recorded. */
export interface SavedRow {
  m?: string;
  [field: string]: unknown;
}

/** The decision setup when a key set reaches the model. */
export interface RoutedSetup {
  /** The model's one name (canonical). */
  model: string;
  route: Route;
  /** Where the requests are posted. */
  url: string;
  /** The model id the route takes. */
  wire: string;
  /** The key, never printed. */
  key: string;
  /** Where the key came from, for messages. */
  from: string;
  /** Google's tier as set; null when none is, and on every other route. */
  tier: Tier | null;
  /** The published limits: on Google, the tier's (the Free Tier's when none is set); null elsewhere. */
  limits: Limits | null;
  /** The price, in US dollars a million input tokens. */
  usdPerMillion: number;
  /**
   * Where that price came from: the owner set it, the provider published it, or nxk assumed it for a model it has no
   * price for.
   */
  price: "set" | "published" | "assumed";
  /** False only on Google's Free Tier. */
  charged: boolean;
  reason: null;
}

/**
 * The decision setup when no key set reaches the model: `reason` says why. It has none of a routed setup's other
 * fields, so reading one gives undefined.
 */
export type UnroutedSetup = { model: string; route: null; reason: string } & Partial<
  Record<Exclude<keyof RoutedSetup, "model" | "route" | "reason">, undefined>
>;

/** What decisionSetup returns: `route` says which. */
export type DecisionSetup = RoutedSetup | UnroutedSetup;

export const ROUTES: Record<Route, { name: string; url: string | null }> = {
  google: { name: "Google's Decisions API", url: "https://generativelanguage.googleapis.com/v1beta/decisions" },
  gateway: { name: "Vercel AI Gateway", url: "https://ai-gateway.vercel.sh/typesafe/v1/systemone" },
  openrouter: {
    name: "OpenRouter (its decisions endpoint is in alpha)",
    url: "https://openrouter.ai/api/alpha/decisions",
  },
  typesafe: { name: "TypeSafe", url: "https://api.typesafe.ai/v1/systemone" },
  custom: { name: "NXK_DECISION_URL", url: null },
};

// The decision models nxk knows, under one name each, with the id each route uses and the published price (US dollars
// a million input tokens; output is free). A model not listed is sent as named, through the gateway or OpenRouter.
export const MODELS: Record<string, Model> = {
  "gemini-decision-1": {
    routes: {
      google: "gemini-decision-1",
      gateway: "google/gemini-decision-1",
      openrouter: "google/gemini-decision-1",
    },
    usdPerMillion: 0.1,
  },
  "jev-1.14.0": {
    routes: { typesafe: "jev-1.14.0", gateway: "typesafe-ai/jev-1.14.0", openrouter: "typesafe/jev-1.14" },
    usdPerMillion: 0.042,
  },
  "jev-1.13.0": {
    routes: { typesafe: "jev-1.13.0", gateway: "typesafe-ai/jev-1.13.0", openrouter: "typesafe/jev-1.13" },
    usdPerMillion: 0.042,
  },
};
export const DEFAULT_MODEL = "gemini-decision-1";

/**
 * A model's one name, whatever route's id it was given as. A moving alias (jev-latest, typesafe-ai/jev) is pinned to
 * the newest version nxk knows, so saved answers always name a fixed model.
 * @param model  as given; none is the default model
 */
export function canonical(model: string | null | undefined): string {
  const m = String(model ?? "").trim();
  if (!m) return DEFAULT_MODEL;
  for (const [name, known] of Object.entries(MODELS))
    if (m === name || Object.values(known.routes).includes(m)) return name;
  if (/^(typesafe(-ai)?\/)?jev(-latest|-preview)?$/.test(m)) return "jev-1.14.0";
  return m.replace(/^google\//, "");
}
/** The model a saved answer row came from. */
export const modelOf = (row: SavedRow): string => canonical(row?.m);

// Google's tiers (per project, not per key; requests a day reset at midnight Pacific).
export const GOOGLE_TIERS: Record<Tier, Limits> = {
  free: { label: "Free Tier", rpm: 200, tpm: 50000, rpd: 10000 },
  tier1: { label: "Tier 1", rpm: 1500, tpm: 1000000, rpd: 50000 },
  tier2: { label: "Tier 2", rpm: 5000, tpm: 4000000, rpd: null },
  tier3: { label: "Tier 3", rpm: 15000, tpm: 10000000, rpd: null },
};
/** The tier as set: "Tier 2", "tier2", "paid" (the lowest paid tier) or "free"; null when not set. */
export function tierOf(text: string | null | undefined): Tier | null {
  const t = String(text ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
  if (!t || t === "notset") return null;
  if (t.startsWith("free")) return "free";
  if (t === "paid") return "tier1";
  // A tier only when Google's tiers have it.
  const tier = t as Tier;
  return GOOGLE_TIERS[tier] ? tier : null;
}

/** A setting passed from the plugin is unset when empty, or when Claude Code left its placeholder in place. */
const set = (value: string | undefined) => {
  const v = String(value ?? "").trim();
  return v && !v.startsWith("${user_config.") ? v : "";
};
// The plugin's settings reach hooks as CLAUDE_PLUGIN_OPTION_<KEY>; the server gets them as NXK_* (plugin.json).
const OPTIONS: Record<string, string> = {
  NXK_GEMINI_API_KEY: "GEMINI_API_KEY",
  NXK_GEMINI_TIER: "GEMINI_TIER",
  NXK_DECISION_KEY: "GATEWAY_API_KEY",
  NXK_OPENROUTER_API_KEY: "OPENROUTER_API_KEY",
  NXK_TYPESAFE_API_KEY: "TYPESAFE_API_KEY",
  NXK_DECISION_MODEL: "DECISION_MODEL",
  NXK_PERSONAGEN_API_KEY: "PERSONAGEN_API_KEY",
  NXK_SCAN_BUDGET: "SCAN_BUDGET",
};
/** A setting by its NXK_ name, from the server's variables or, in hooks, the plugin's option of the same setting. */
const read = (env: NodeJS.ProcessEnv, name: string) =>
  set(env[name]) || (OPTIONS[name] ? set(env[`CLAUDE_PLUGIN_OPTION_${OPTIONS[name]}`]) : "");

export const KEYS = {
  google: { names: ["NXK_GEMINI_API_KEY", "GEMINI_API_KEY"], files: ["gemini-key"] },
  gateway: { names: ["NXK_DECISION_KEY", "AI_GATEWAY_API_KEY"], files: ["decision-key", "vercel-ai-gateway-key"] },
  openrouter: { names: ["NXK_OPENROUTER_API_KEY", "OPENROUTER_API_KEY"], files: ["openrouter-key"] },
  typesafe: { names: ["NXK_TYPESAFE_API_KEY", "TYPESAFE_API_KEY"], files: ["typesafe-key", "jev-key"] },
  personagen: { names: ["NXK_PERSONAGEN_API_KEY", "PERSONAGEN_API_KEY"], files: ["personagen-key"] },
};
/** Where a PersonaGen key can be set, for messages. */
export const PERSONAGEN_KEY_HOW = [
  "make one at https://personagen.dev/signup and set it as personagen_api_key in the plugin's settings",
  "(/plugin configure nxk@nxk), PERSONAGEN_API_KEY, or the file ~/.config/nxk/personagen-key, never in the chat",
].join(" ");
/**
 * Whether a PersonaGen key is set, for drawing narrow audiences (people_pull).
 * @param home  the home folder
 */
export const personagenKey = (env = process.env, home = homedir()): Key | null => keyFor("personagen", env, home);

/** The folder of key and tier files: NXK_CONFIG_DIR when set (an eval with no key points it at an empty folder), else ~/.config/nxk. */
const configDir = (env: NodeJS.ProcessEnv, home: string) => set(env.NXK_CONFIG_DIR) || join(home, ".config", "nxk");

/**
 * The first key found for a route, and where (from names the variable or file, never the key).
 * @param route  a route, or personagen
 * @param home  the home folder
 */
export function keyFor(route: keyof typeof KEYS, env = process.env, home = homedir()): Key | null {
  for (const name of KEYS[route].names)
    if (read(env, name))
      return { key: read(env, name), from: name.startsWith("NXK_") ? "the plugin's settings" : name };
  for (const file of KEYS[route].files) {
    const path = join(configDir(env, home), file);
    if (existsSync(path)) {
      const key = readFileSync(path, "utf8").trim();
      if (key) return { key, from: set(env.NXK_CONFIG_DIR) ? `${path}` : `~/.config/nxk/${file}` };
    }
  }
  return null;
}

/**
 * The decision setup: { model, route, url, wire (the model id the route takes), key, from, tier, limits, usdPerMillion,
 * charged, reason }. route is null, with `reason`, when no key set reaches the model. The route is the model's own
 * provider when its key is set, else the gateway, else OpenRouter. limits are { rpm, tpm, rpd } where the provider
 * publishes them (Google, by tier); elsewhere null, and the scan slows when the service says it is busy.
 * @param home  the home folder
 */
export function decisionSetup(env = process.env, home = homedir()): DecisionSetup {
  const given = read(env, "NXK_DECISION_MODEL"),
    model = canonical(given);
  // undefined for a model nxk does not know.
  const known: Model | undefined = MODELS[model];
  const tierFile = join(configDir(env, home), "gemini-tier");
  // The plugin's setting defaults to the words "not set", which must fall through to the variable and the file.
  const tier =
    tierOf(read(env, "NXK_GEMINI_TIER")) ??
    tierOf(set(env.GEMINI_TIER)) ??
    tierOf(existsSync(tierFile) ? readFileSync(tierFile, "utf8") : "");
  const usdPerMillion = Number(set(env.NXK_DECISION_USD_PER_M) || (known?.usdPerMillion ?? 0.1));
  /** @param url  only the custom route has no url of its own, and it always comes with one */
  const make = (route: Route, found: Key, url = ROUTES[route].url as string): RoutedSetup => {
    const google = route === "google";
    // On Google with no tier set, keep to the Free Tier's limits: they are safe on every tier.
    const limits = google ? GOOGLE_TIERS[tier ?? "free"] : null;
    // A custom endpoint takes the model as the owner named it (or the gateway's id); a known route, its own id.
    const wire = route === "custom" ? given || known?.routes.gateway || model : (known?.routes[route] ?? model);
    // A model nxk has no published price for is priced at an assumed rate: said, since spending limits count with it.
    const price = set(env.NXK_DECISION_USD_PER_M) ? "set" : known ? "published" : "assumed";
    return {
      model,
      route,
      url,
      wire,
      key: found.key,
      from: found.from,
      tier: google ? tier : null,
      limits,
      usdPerMillion,
      price,
      charged: !(google && tier === "free"),
      reason: null,
    };
  };
  const custom = set(env.NXK_DECISION_URL);
  if (custom) {
    const route = custom.includes("generativelanguage.googleapis.com") ? "google" : "custom";
    const found =
      route === "google"
        ? keyFor("google", env, home)
        : (keyFor("gateway", env, home) ?? keyFor("openrouter", env, home) ?? keyFor("typesafe", env, home));
    if (found) return make(route, found, custom);
    return { model, route: null, reason: `NXK_DECISION_URL is set, but no key for it is` };
  }
  // The model's own routes, then the gateway and OpenRouter, each once.
  const order = ([...(known ? Object.keys(known.routes) : []), "gateway", "openrouter"] as Provider[]).filter(
    (r, i, all) => all.indexOf(r) === i,
  );
  for (const route of order) {
    if (known && !known.routes[route]) continue;
    const found = keyFor(route, env, home);
    if (found) return make(route, found);
  }
  const names: Record<Provider, string> = {
    google: "a Google AI Studio key",
    gateway: "a Vercel AI Gateway key",
    openrouter: "an OpenRouter key",
    typesafe: "a TypeSafe key",
  };
  return {
    model,
    route: null,
    reason: `No key for ${model}: it needs ${order
      .filter((r) => !known || known.routes[r])
      .map((r) => names[r])
      .join(", or ")} (guide topic scan). ${KEY_WHERE}`,
  };
}

/** Where an owner puts a key: never the chat, where it would be kept in the transcript. */
export const KEY_WHERE =
  "The owner sets it themselves in the plugin's settings (/plugin configure nxk@nxk) or in a file in ~/.config/nxk/; never ask for a key in the chat";

/** Minutes a scan of `requests` requests and `tokens` tokens should take under the setup's limits (null when unpaced). */
export function minutesFor(setup: DecisionSetup, requests: number, tokens: number): number | null {
  if (!setup.limits) return null;
  return Math.max(1, Math.ceil(Math.max(tokens / setup.limits.tpm, requests / setup.limits.rpm)));
}

/**
 * What to say when an audience is too thin among the shipped people: draw more, or how to be able to.
 * @param home  the home folder
 */
export const biggerDraw = (env = process.env, home = homedir()): string =>
  personagenKey(env, home)
    ? "A bigger draw: people_pull (a PersonaGen key is set)."
    : `A bigger draw: people_pull, once a PersonaGen key is set (${PERSONAGEN_KEY_HOW}).`;

/**
 * The owner's standing allowance for scans on one request, in US dollars, set once so that nxk need not ask before every scan: the
 * plugin's scan_budget setting, NXK_SCAN_BUDGET_USD, or the file scan-budget in the config folder. null when none is
 * set, and then the owner is asked before each paid scan.
 * @param home  the home folder
 */
export function scanBudget(env = process.env, home = homedir()): number | null {
  const file = join(configDir(env, home), "scan-budget");
  const raw =
    read(env, "NXK_SCAN_BUDGET") ||
    set(env.NXK_SCAN_BUDGET_USD) ||
    (existsSync(file) ? readFileSync(file, "utf8").trim() : "");
  const n = Number(String(raw).replace(/^\$/, ""));
  return raw && Number.isFinite(n) && n > 0 ? n : null;
}

/**
 * One line on whether a scan needs the owner's go-ahead first.
 * @param budget  in US dollars (scanBudget)
 */
export const describeBudget = (budget: number | null): string =>
  budget
    ? [
        `Scan budget: up to $${budget} on scans for this request without asking first (scan_budget in the plugin's settings):`,
        "keep every max_usd within what is left, and tell the owner what the scans cost. Beyond it, ask first.",
      ].join(" ")
    : "Scan budget: none set, so before a paid scan tell the owner what it would cost and ask (scan_budget in the plugin's settings lets them allow small scans once).";

/**
 * The setup in a few lines, for the product tool and the session's start: scans, their budget, narrow audiences.
 * @param home  the home folder
 */
export function describeSetup(env = process.env, home = homedir()): string[] {
  const decision = decisionSetup(env, home);
  return [
    describeDecision(decision),
    ...(decision.route ? [describeBudget(scanBudget(env, home))] : []),
    personagenKey(env, home)
      ? "Narrow audiences: a PersonaGen key is set, so people_pull can draw more people for a group too thin among the 200,000 shipped."
      : "Narrow audiences: no PersonaGen key, so a group of under a few hundred of the 200,000 shipped people stays rough (personagen_api_key in the plugin's settings lets people_pull draw more).",
  ];
}

/** One line on what scans will use, for the owner and the model: never a key. */
export function describeDecision(setup: DecisionSetup = decisionSetup()): string {
  if (!setup.route)
    return `Scans: new scans unavailable. ${setup.reason}. The tools that send nothing (people, terms, sweep, decide) and reading a scan already saved need no key.`;
  const via = setup.route === "custom" ? setup.url : ROUTES[setup.route].name;
  const noCharge = setup.tier === "free" ? ", no charge; Google may use what is sent" : "";
  // On Google, the setup always has the tier's limits.
  const tier =
    setup.route !== "google"
      ? ""
      : setup.tier
        ? `, ${GOOGLE_TIERS[setup.tier].label} (${(setup.limits as Limits).tpm.toLocaleString("en-GB")} tokens a minute${noCharge})`
        : ", tier not set: kept to the Free Tier's 50,000 tokens a minute (set gemini_tier in the plugin's settings, or write it in ~/.config/nxk/gemini-tier)";
  const price =
    setup.price === "assumed"
      ? ` nxk has no published price for ${setup.model}: it assumes $${setup.usdPerMillion} a million input tokens, and spending limits count with that; set NXK_DECISION_USD_PER_M to its real price.`
      : "";
  return `Scans: ${setup.model} through ${via}${tier}. Key from ${setup.from}.${price}`;
}
