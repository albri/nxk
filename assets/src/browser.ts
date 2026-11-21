// The headless Chromium the figure build and the video build draw in, found through two environment variables, as
// build.ts explains:
//   PLAYWRIGHT_CORE  the folder of an installed playwright-core, when Node cannot import it from here
//   CHROMIUM         the browser binary: Playwright's own Chromium, Chrome or Brave
import { existsSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

// The part of Playwright the builds use: Chromium launched, pages opened, text measured and pictures taken. The
// callbacks given to evaluate run in the page, with the dom lib's globals.
export interface Chromium {
  launch(options: { executablePath?: string; headless: boolean; args?: string[] }): Promise<Browser>;
}
export interface Browser {
  newPage(): Promise<Page>;
  newContext(options: { viewport: { width: number; height: number }; deviceScaleFactor: number }): Promise<Context>;
  close(): Promise<void>;
}
export interface Context {
  newPage(): Promise<Page>;
  close(): Promise<void>;
}
export interface Page {
  setContent(html: string): Promise<void>;
  evaluate<R>(callback: () => R | Promise<R>): Promise<R>;
  evaluate<R, A>(callback: (arg: A) => R | Promise<R>, arg: A): Promise<R>;
  locator(selector: string): Locator;
  waitForTimeout(ms: number): Promise<void>;
  screenshot(options: { path?: string; fullPage?: boolean; type?: "png" | "jpeg" }): Promise<Buffer>;
}
export interface Locator {
  evaluate<E extends Element, R>(callback: (element: E) => R | Promise<R>): Promise<R>;
  screenshot(options: { path: string; omitBackground?: boolean }): Promise<Buffer>;
}

export async function loadChromium(): Promise<Chromium> {
  const tries: string[] = [];
  if (process.env.PLAYWRIGHT_CORE)
    for (const f of ["index.ts", "index.js"]) tries.push(pathToFileURL(join(process.env.PLAYWRIGHT_CORE, f)).href);
  tries.push("playwright-core", "playwright");
  for (const name of tries)
    try {
      const m: { chromium?: Chromium; default?: { chromium?: Chromium } } = await import(name);
      const c = m.chromium ?? m.default?.chromium;
      if (c) return c;
    } catch {
      /* the next */
    }
  throw new Error("Needs playwright-core: install it, or set PLAYWRIGHT_CORE to its folder.");
}

export async function launch(chromium: Chromium): Promise<Browser> {
  const candidates = process.env.CHROMIUM
    ? [process.env.CHROMIUM]
    : [
        undefined,
        "/Applications/Brave Browser.app/Contents/MacOS/Brave Browser",
        "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
        "/Applications/Chromium.app/Contents/MacOS/Chromium",
        "/usr/bin/brave-browser",
        "/usr/bin/google-chrome",
        "/usr/bin/chromium",
        "/usr/bin/chromium-browser",
      ].filter((p) => p === undefined || existsSync(p));
  for (const executablePath of candidates)
    try {
      return await chromium.launch({ executablePath, headless: true });
    } catch {
      /* the next */
    }
  throw new Error("No Chromium found: set CHROMIUM to a Chromium, Chrome or Brave binary.");
}
