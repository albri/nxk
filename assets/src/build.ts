#!/usr/bin/env node
// Draws the README figures from the data in assets/src/data/:
//
//   node assets/src/build.ts                    # all of them
//   node assets/src/build.ts header idea        # some: header, idea, how-it-works, evidence, icons
//   node assets/src/build.ts --png=/some/dir    # also a PNG of each, at twice the size, in that folder
//   node assets/src/build.ts --data=/a --out=/b # data from another folder, SVGs to another folder (to try a data file)
//
// For each figure it writes assets/<name>-light.svg and -dark.svg, fonts embedded and nothing loaded from outside, and
// for each icon (icons.ts) assets/icons/<name>-light.svg and -dark.svg; with --png, also a sheet of the icons.
//
// Text is measured in a headless Chromium, so lines wrap with the real fonts. This repository installs neither, so
// the build reads two environment variables:
//   PLAYWRIGHT_CORE  the folder of an installed playwright-core (any project's node_modules/playwright-core), when
//                    Node cannot import it from here
//   CHROMIUM         the browser binary: Playwright's own Chromium, Chrome or Brave. Unset, Playwright's own is tried,
//                    then Brave and Chrome in their usual places
// For example:
//   PLAYWRIGHT_CORE=~/some-project/node_modules/playwright-core \
//   CHROMIUM="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" node assets/src/build.ts
//
// The numbers in the header and the opening figure come from data/idea-counts.json, which node assets/src/count.ts
// counts on the shipped people. A figure whose data is not ready yet is skipped with a note, never drawn with made-up
// values.

/// <reference lib="dom" />
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { W, themes, kit, svgDoc, fontCss, type Drawn, type Kit, type Measure, type Theme } from "./kit.ts";
import { ICONS, iconFile } from "./icons.ts";
import type { EvidenceWords } from "./evidence.ts";
import type { HowWords } from "./how.ts";
import type { IdeaCounts } from "./hundred.ts";
import type { IdeaWords } from "./idea.ts";

/** Every data file, by its name without .json. */
interface FigureData {
  idea: IdeaWords;
  "idea-counts": IdeaCounts;
  how: HowWords;
  evidence: EvidenceWords;
}

/** A figure's module: it draws from the data in a theme, and may say why its data is not ready to draw. */
interface Figure {
  draw(data: FigureData, t: Theme, k: Kit): Promise<Drawn>;
  notReady?(data: FigureData): string | null;
}

// The part of Playwright the build uses: Chromium launched, pages opened, text measured and pictures taken. The
// callbacks given to evaluate run in the page, with the dom lib's globals.
interface Chromium {
  launch(options: { executablePath?: string; headless: boolean }): Promise<Browser>;
}
interface Browser {
  newPage(): Promise<Page>;
  newContext(options: { viewport: { width: number; height: number }; deviceScaleFactor: number }): Promise<Context>;
  close(): Promise<void>;
}
interface Context {
  newPage(): Promise<Page>;
  close(): Promise<void>;
}
interface Page {
  setContent(html: string): Promise<void>;
  evaluate<R>(callback: () => R | Promise<R>): Promise<R>;
  evaluate<R, A>(callback: (arg: A) => R | Promise<R>, arg: A): Promise<R>;
  locator(selector: string): Locator;
  waitForTimeout(ms: number): Promise<void>;
  screenshot(options: { path: string; fullPage?: boolean }): Promise<Buffer>;
}
interface Locator {
  evaluate<E extends Element, R>(callback: (element: E) => R | Promise<R>): Promise<R>;
  screenshot(options: { path: string; omitBackground?: boolean }): Promise<Buffer>;
}

const FIGURES: Record<string, string> = {
  header: "header.ts",
  idea: "idea.ts",
  "how-it-works": "how.ts",
  evidence: "evidence.ts",
};
const SRC = new URL("./", import.meta.url);
const OUT = new URL("../", import.meta.url);

async function loadChromium(): Promise<Chromium> {
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

async function launch(chromium: Chromium): Promise<Browser> {
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

async function measurer(browser: Browser): Promise<Measure> {
  const page = await browser.newPage();
  await page.setContent(`<!doctype html><style>${fontCss()}</style><body></body>`);
  await page.evaluate(async () => {
    for (const spec of [
      '500 20px "nxk-display"',
      '600 20px "nxk-display"',
      '400 20px "nxk-sans"',
      '600 20px "nxk-sans"',
      '400 20px "nxk-mono"',
      '500 20px "nxk-mono"',
    ])
      await document.fonts.load(spec, "Aa");
  });
  const cache = new Map<string, number>();
  return async (text, font) => {
    const key = `${font}|${text}`;
    if (!cache.has(key))
      cache.set(
        key,
        await page.evaluate(
          ([f, s]: [string, string]) => {
            // The page keeps one canvas context for every call; a new canvas always has a 2D one.
            const kept = window as Window & { __ctx?: CanvasRenderingContext2D };
            const c = (kept.__ctx ??= document.createElement("canvas").getContext("2d") as CanvasRenderingContext2D);
            c.font = f;
            return c.measureText(s).width;
          },
          [font, text],
        ),
      );
    return cache.get(key)!;
  };
}

async function png(browser: Browser, svg: string, width: number, height: number, file: string): Promise<void> {
  const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 2 });
  const page = await context.newPage();
  // drawn as an <img>, as GitHub shows it, so the embedded fonts are tested the same way
  await page.setContent(
    `<!doctype html><body style="margin:0;background:transparent"><img id="f" width="${width}" height="${height}" src="data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}"></body>`,
  );
  await page.locator("#f").evaluate((img: HTMLImageElement) => img.decode());
  await page.waitForTimeout(250);
  await page.locator("#f").screenshot({ path: file, omitBackground: true });
  await context.close();
}

const args = process.argv.slice(2);
const option = (name: string) => args.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);
const pngDir = option("png");
const dataDir = option("data") ?? fileURLToPath(new URL("data/", SRC));
const outDir = option("out") ?? fileURLToPath(OUT);
const wanted = args.filter((a) => !a.startsWith("-"));
for (const name of wanted)
  if (!FIGURES[name] && name !== "icons")
    throw new Error(`No figure ${name}: one of ${Object.keys(FIGURES).join(", ")}, icons`);
for (const dir of [pngDir, outDir]) if (dir) mkdirSync(dir, { recursive: true });

// every data file, by its name without .json: idea, idea-counts, how, compare
const data = Object.fromEntries(
  readdirSync(dataDir)
    .filter((f) => f.endsWith(".json"))
    .map((f) => [f.slice(0, -5), JSON.parse(readFileSync(join(dataDir, f), "utf8"))]),
) as FigureData;

const browser = await launch(await loadChromium());
try {
  const measure = await measurer(browser);
  for (const name of (wanted.length ? wanted : Object.keys(FIGURES)).filter((n) => n !== "icons")) {
    const figure: Figure = await import(new URL(FIGURES[name], SRC).href);
    const notReady = figure.notReady?.(data);
    if (notReady) {
      console.log(`${name}: skipped, ${notReady}`);
      continue;
    }
    for (const [theme, t] of Object.entries(themes)) {
      const k = kit(measure);
      const fig = await figure.draw(data, t, k);
      const svg = svgDoc({ ...fig, fill: fig.fill ?? t.card, fonts: k.used });
      const base = `${name}-${theme}`;
      writeFileSync(join(outDir, `${base}.svg`), svg);
      if (pngDir) await png(browser, svg, W, Math.ceil(fig.height), join(pngDir, `${base}.png`));
      console.log(`${base}: ${W}x${Math.ceil(fig.height)}, svg ${(svg.length / 1024).toFixed(0)} KB`);
    }
  }
  // the icons, as their own files for the README's text, and a sheet of them to look at
  if (!wanted.length || wanted.includes("icons")) {
    const iconDir = join(outDir, "icons");
    mkdirSync(iconDir, { recursive: true });
    for (const [theme, t] of Object.entries(themes))
      for (const name of Object.keys(ICONS)) writeFileSync(join(iconDir, `${name}-${theme}.svg`), iconFile(name, t));
    console.log(`icons: ${Object.keys(ICONS).length} in two themes, in ${iconDir}`);
    if (pngDir)
      for (const [theme, t] of Object.entries(themes)) {
        const cells = Object.keys(ICONS)
          .map(
            (name) =>
              `<figure><div class="big">${iconFile(name, t, 72)}</div><div class="row">${iconFile(name, t, 24)}${iconFile(name, t, 16)}</div><figcaption>${name}</figcaption></figure>`,
          )
          .join("");
        const context = await browser.newContext({ viewport: { width: 980, height: 420 }, deviceScaleFactor: 2 });
        const page = await context.newPage();
        const ground = theme === "light" ? "#ffffff" : "#0d1117";
        const style =
          `body{margin:0;padding:28px;background:${ground};display:grid;grid-template-columns:repeat(5,1fr);gap:22px;font:13px "nxk-mono";color:${t.ink3}}` +
          "figure{margin:0}.row{display:flex;gap:12px;align-items:center;margin-top:10px}";
        await page.setContent(`<!doctype html><style>${fontCss(["mono"])}${style}</style>${cells}`);
        await page.screenshot({ path: join(pngDir, `icons-${theme}.png`), fullPage: true });
        await context.close();
      }
  }
} finally {
  await browser.close();
}
