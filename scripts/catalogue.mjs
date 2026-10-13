#!/usr/bin/env node
// Read PersonaGen's live catalogue without paying for it twice.
//
//   node scripts/catalogue.mjs uk                    sections and their fields (about 1 KB)
//   node scripts/catalogue.mjs uk --group work       one section as a table
//   node scripts/catalogue.mjs uk --grep tenure      only the field rows that mention a word
//   node scripts/catalogue.mjs uk --field home_tenure  every value of one field, with shares
//   add --refresh to revalidate now
//
// The catalogue is static for a release, so it is fetched once and kept in the cache directory (NXK_CACHE_DIR, default
// the system temp directory). A cached copy under a day old is used with no request; an older one is revalidated with its
// ETag and a 304 costs no body. The Markdown form (about 80 KB, 22 KB on the wire) serves the index, --group and --grep; the
// JSON form (0.6 to 2 MB) is fetched only for --field.
// PERSONAGEN_URL (default https://api.personagen.dev) and PERSONAGEN_API_KEY are optional.
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const FRESH_MS = 24 * 60 * 60 * 1000;

/** The catalogue of a country in one form, from the cache when it is fresh or still current. Returns the text. */
export async function loadCatalogue(country, form, { base, key, dir, refresh = false, log = () => {} } = {}) {
  if (!["uk", "us"].includes(country)) throw new Error("Country must be uk or us.");
  base ??= process.env.PERSONAGEN_URL ?? "https://api.personagen.dev";
  key ??= process.env.PERSONAGEN_API_KEY;
  dir ??= process.env.NXK_CACHE_DIR ?? join(tmpdir(), "nxk-personagen");
  // The cache is per server, so a local API and the hosted one never share a file.
  const slot = join(dir, base.replace(/[^a-z0-9]+/gi, "_"));
  const body = join(slot, `${country}.${form === "json" ? "json" : "md"}`);
  const tagFile = `${body}.etag`;
  await mkdir(slot, { recursive: true });
  const cached = await readFile(body, "utf8").catch(() => undefined);
  const tag = await readFile(tagFile, "utf8").catch(() => undefined);
  if (cached && !refresh) {
    const age = Date.now() - (await stat(body)).mtimeMs;
    if (age < FRESH_MS) { log(`${country} ${form}: cached, no request`); return cached; }
  }
  const headers = { Accept: form === "json" ? "application/json" : "text/markdown" };
  if (key) headers["X-API-Key"] = key;
  if (cached && tag) headers["If-None-Match"] = tag;
  const response = await fetch(`${base}/${country}/catalogue`, { headers, signal: AbortSignal.timeout(30000) });
  if (response.status === 304 && cached) {
    await writeFile(body, cached); // restarts the day
    log(`${country} ${form}: unchanged (304), no body`);
    return cached;
  }
  if (!response.ok) throw new Error(`Catalogue ${response.status}: ${(await response.text()).slice(0, 300)}`);
  const text = await response.text();
  await writeFile(body, text);
  const etag = response.headers.get("etag");
  if (etag) await writeFile(tagFile, etag);
  log(`${country} ${form}: fetched ${text.length} characters`);
  return text;
}

/** The sections of a Markdown catalogue: [{ key, title, rows: [row text] }], and what comes before the first one. */
export function parseSections(markdown) {
  const [head, ...parts] = markdown.split(/\n## /);
  const sections = parts.map((part) => {
    const [title, ...rest] = part.split("\n");
    const key = /\(([a-z_]+)\)\s*$/.exec(title)?.[1] ?? title;
    const lines = rest.filter((line) => line.startsWith("| ") && !line.startsWith("| field |"));
    return { key, title, rows: lines, text: `## ${part.trimEnd()}` };
  });
  return { head, sections };
}

export function indexOf(markdown) {
  const { head, sections } = parseSections(markdown);
  const version = head.split("\n").find((line) => line.startsWith("API ")) ?? "";
  const lines = [version];
  for (const { key, title, rows } of sections) {
    const names = rows.map((row) => row.split("|")[1].trim());
    lines.push(`${key}: ${title.replace(/\s*\(.*$/, "")}, ${names.length} fields: ${names.join(", ")}`);
  }
  const planned = markdown.split("\n").find((line) => line.startsWith("Not generated yet"));
  if (planned) lines.push(planned);
  return lines.join("\n");
}

export function grepRows(markdown, word) {
  const needle = word.toLowerCase();
  return parseSections(markdown).sections
    .flatMap(({ key, rows }) => rows.filter((row) => row.toLowerCase().includes(needle)).map((row) => `[${key}] ${row}`))
    .join("\n");
}

/** One field of the JSON catalogue in full: its meaning, universe, filter form and every value with its share. */
export function describeField(catalogue, name) {
  for (const group of catalogue.groups) {
    const field = group.fields.find((candidate) => candidate.name === name);
    if (!field) continue;
    const lines = [
      `${field.name} (path ${field.path}; ${field.kind}; ${field.filterable ? "filterable" : "not filterable"})`,
      `meaning: ${field.meaning}`,
      `universe: ${field.universe}${field.universe_share ? ` (${field.universe_share} of adults)` : ""}`,
    ];
    if (field.range) lines.push(`range: ${field.range.min} to ${field.range.max}${field.range.unit ? ` ${field.range.unit}` : ""}${field.quantiles ? `; quantiles ${JSON.stringify(field.quantiles)}` : ""}`);
    if (field.outside_universe) lines.push(`everyone outside the universe is ${field.outside_universe.value}`);
    if (field.share_note) lines.push(`share note: ${field.share_note}`);
    for (const value of field.values ?? []) lines.push(`${value.code}\t${value.label}\t${value.share ?? ""}`);
    return lines.join("\n");
  }
  throw new Error(`No field named ${name}. Use --grep to look for it.`);
}

async function main(argv) {
  const args = argv.slice(2);
  const country = args.find((arg) => !arg.startsWith("--") && ["uk", "us"].includes(arg));
  const option = (name) => { const at = args.indexOf(`--${name}`); return at < 0 ? undefined : args[at + 1]; };
  if (!country) {
    console.error("Usage: node scripts/catalogue.mjs <uk|us> [--group key | --grep word | --field name] [--refresh]");
    process.exit(2);
  }
  const options = { refresh: args.includes("--refresh"), log: (line) => console.error(line) };
  if (option("field")) {
    console.log(describeField(JSON.parse(await loadCatalogue(country, "json", options)), option("field")));
    return;
  }
  const markdown = await loadCatalogue(country, "md", options);
  if (option("group")) {
    const section = parseSections(markdown).sections.find(({ key }) => key === option("group"));
    if (!section) throw new Error(`No section ${option("group")}. Run without options for the list.`);
    console.log(section.text);
  } else if (option("grep")) {
    console.log(grepRows(markdown, option("grep")) || "No field row mentions that word.");
  } else {
    console.log(indexOf(markdown));
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main(process.argv).catch((error) => { console.error(error.message); process.exit(1); });
}
