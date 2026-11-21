// PersonaGen's catalogue of a country, for build-maps.ts: every field, its values and their shares.
// The catalogue is static for a release, so it is fetched once and kept in the cache directory (NXK_CACHE_DIR, default
// the system temp directory). A cached copy under a day old is used with no request; an older one is revalidated with its
// ETag, and a 304 costs no body. PERSONAGEN_URL (default https://api.personagen.dev) and PERSONAGEN_API_KEY are optional.
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const FRESH_MS = 24 * 60 * 60 * 1000;

/**
 * Where loadCatalogue asks and keeps its copy: the PersonaGen server and key (PERSONAGEN_URL and PERSONAGEN_API_KEY
 * when not given), the cache directory, whether to revalidate a fresh copy, and where it says what it did.
 */
export interface CatalogueOptions {
  base?: string;
  key?: string;
  dir?: string;
  refresh?: boolean;
  log?: (line: string) => void;
}

/** The catalogue of a country as JSON text, from the cache when it is fresh or still current. */
export async function loadCatalogue(
  country: string,
  { base, key, dir, refresh = false, log = () => {} }: CatalogueOptions = {},
): Promise<string> {
  if (!["uk", "us"].includes(country)) throw new Error("Country must be uk or us.");
  base ??= process.env.PERSONAGEN_URL ?? "https://api.personagen.dev";
  key ??= process.env.PERSONAGEN_API_KEY;
  dir ??= process.env.NXK_CACHE_DIR ?? join(tmpdir(), "nxk-personagen");
  // The cache is per server, so a local API and the hosted one never share a file.
  const slot = join(dir, base.replace(/[^a-z0-9]+/gi, "_"));
  const body = join(slot, `${country}.json`);
  const tagFile = `${body}.etag`;
  await mkdir(slot, { recursive: true });
  const cached = await readFile(body, "utf8").catch(() => undefined);
  const tag = await readFile(tagFile, "utf8").catch(() => undefined);
  if (cached && !refresh) {
    const age = Date.now() - (await stat(body)).mtimeMs;
    if (age < FRESH_MS) {
      log(`${country}: cached, no request`);
      return cached;
    }
  }
  const headers: Record<string, string> = { Accept: "application/json" };
  if (key) headers["X-API-Key"] = key;
  if (cached && tag) headers["If-None-Match"] = tag;
  const response = await fetch(`${base}/${country}/catalogue`, { headers, signal: AbortSignal.timeout(30000) });
  if (response.status === 304 && cached) {
    await writeFile(body, cached); // restarts the day
    log(`${country}: unchanged (304), no body`);
    return cached;
  }
  if (!response.ok) throw new Error(`Catalogue ${response.status}: ${(await response.text()).slice(0, 300)}`);
  const text = await response.text();
  await writeFile(body, text);
  const etag = response.headers.get("etag");
  if (etag) await writeFile(tagFile, etag);
  log(`${country}: fetched ${text.length} characters`);
  return text;
}
