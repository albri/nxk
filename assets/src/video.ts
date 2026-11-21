#!/usr/bin/env node
// Renders nxk's launch video, the one at the top of the README, from the scenes in video/scenes.ts and the words in
// data/video.json:
//
//   node assets/src/video.ts                  out/nxk-launch.mp4, and its first frame as out/nxk-launch-poster.png
//   node assets/src/video.ts --at=0,21,40     stills at those seconds, for checking (--at=all: one in each scene)
//   node assets/src/video.ts --sound          only the soundtrack, as a WAV
//   node assets/src/video.ts --out=/some/dir  stills, the WAV and the frames go there instead of a temporary folder
//
// The video is 1920 by 1080 at 30 frames a second, with sound, and starts on a finished title card: GitHub shows a
// video's first frame before it plays, and starts it muted, so every idea is in the words on screen as well. The mp4
// is not kept in the repository: GitHub plays a video in a README only when it is uploaded as an attachment, so
// out/ (which git ignores) is where it is written, ready to upload, with its first frame to check it by.
//
// Each frame is drawn in a headless Chromium (video/runtime.ts draws any moment on its own), and the sound is
// synthesised from the same cue sheet (video/sound.ts), so every sound lands on its frame. ffmpeg puts them together,
// evens out the loudness and keeps the file under GitHub's 10 MB limit for videos. It needs what build.ts needs
// (PLAYWRIGHT_CORE and CHROMIUM, as the top of build.ts says), and ffmpeg on PATH or in FFMPEG.
import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { launch, loadChromium, type Browser, type Page } from "./browser.ts";
import type { IdeaCounts } from "./hundred.ts";
import { install } from "./video/runtime.ts";
import { FPS, H, W, video, type VideoWords } from "./video/scenes.ts";
import { soundtrack } from "./video/sound.ts";

const ROOT = new URL("../../", import.meta.url);
const read = (path: string) => JSON.parse(readFileSync(new URL(path, ROOT), "utf8"));
const MP4 = fileURLToPath(new URL("out/nxk-launch.mp4", ROOT));
const POSTER = fileURLToPath(new URL("out/nxk-launch-poster.png", ROOT));
const LIMIT = 9.5 * 1024 * 1024; // under GitHub's 10 MB for a video attached on a free plan
const AUDIO = 112; // kb/s of AAC: the sound is soft and warm, so this is plenty, and leaves the picture more
const FFMPEG = process.env.FFMPEG || "ffmpeg";

const args = process.argv.slice(2);
const option = (name: string) => args.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);
const outDir = option("out") ?? mkdtempSync(join(tmpdir(), "nxk-video-"));
mkdirSync(outDir, { recursive: true });

const v = video(
  read("assets/src/data/video.json") as VideoWords,
  read("assets/src/data/idea-counts.json") as IdeaCounts,
  (read("maps/uk.json") as { fields: { name: string }[] }).fields.map((f) => f.name),
);
const frames = Math.round(v.duration * FPS);

function writeSound(file: string): void {
  writeFileSync(file, soundtrack({ cues: v.cues, sections: v.sections, duration: frames / FPS }));
}

async function open(browser: Browser): Promise<Page> {
  const context = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
  const page = await context.newPage();
  await page.setContent(v.html);
  await page.evaluate(async () => {
    for (const spec of [
      '600 40px "nxk-display"',
      '500 40px "nxk-display"',
      '400 40px "nxk-sans"',
      '600 40px "nxk-sans"',
      '400 40px "nxk-mono"',
    ])
      await document.fonts.load(spec, "Aa");
    await document.fonts.ready;
  });
  await page.evaluate(install, v.plan);
  return page;
}

async function shot(page: Page, t: number, file: string): Promise<void> {
  await page.evaluate((s: number) => (window as Window & { seek?: (t: number) => void }).seek?.(s), t);
  writeFileSync(file, await page.screenshot({ type: "png" }));
}

if (args.includes("--sound")) {
  const wav = join(outDir, "nxk-launch.wav");
  writeSound(wav);
  console.log(`sound: ${wav}`);
  process.exit(0);
}

const browser = await launch(await loadChromium());
try {
  const at = option("at");
  if (at) {
    const times = at === "all" ? v.stills : at.split(",").map(Number);
    const page = await open(browser);
    for (const t of times) {
      const file = join(outDir, `still-${t.toFixed(2).padStart(6, "0")}.png`);
      await shot(page, t, file);
      console.log(file);
    }
  } else {
    // the frames, drawn by a few pages at once, each taking every n-th frame
    const workers = Math.max(1, Number(option("workers") ?? 4));
    const pages = await Promise.all(Array.from({ length: workers }, () => open(browser)));
    const started = Date.now();
    let done = 0;
    await Promise.all(
      pages.map(async (page, w) => {
        for (let f = w; f < frames; f += workers) {
          await shot(page, f / FPS, join(outDir, `f${String(f).padStart(5, "0")}.png`));
          if (++done % 300 === 0)
            console.log(`${done} of ${frames} frames, ${((Date.now() - started) / 1000).toFixed(0)} s`);
        }
      }),
    );
    mkdirSync(fileURLToPath(new URL("out/", ROOT)), { recursive: true });
    writeFileSync(POSTER, readFileSync(join(outDir, "f00000.png")));
    const wav = join(outDir, "nxk-launch.wav");
    writeSound(wav);

    // the loudness, measured first, so the second pass can even it out without pumping
    const log = spawnSync(
      FFMPEG,
      ["-hide_banner", "-i", wav, "-af", "loudnorm=I=-18:TP=-1.5:LRA=11:print_format=json", "-f", "null", "-"],
      { encoding: "utf8" },
    ).stderr;
    const m = JSON.parse(log.slice(log.lastIndexOf("{"), log.lastIndexOf("}") + 1));
    const loud = `loudnorm=I=-18:TP=-1.5:LRA=11:measured_I=${m.input_i}:measured_TP=${m.input_tp}:measured_LRA=${m.input_lra}:measured_thresh=${m.input_thresh}:offset=${m.target_offset}:linear=true`;
    const encode = (video: string[]) =>
      execFileSync(FFMPEG, [
        "-y",
        "-loglevel",
        "error",
        "-framerate",
        String(FPS),
        "-i",
        join(outDir, "f%05d.png"),
        "-i",
        wav,
        ...video,
        "-pix_fmt",
        "yuv420p",
        "-af",
        loud,
        "-ar",
        "48000",
        "-c:a",
        "aac",
        "-b:a",
        `${AUDIO}k`,
        "-shortest",
        "-movflags",
        "+faststart",
        MP4,
      ]);
    encode(["-c:v", "libx264", "-preset", "veryslow", "-crf", "20", "-tune", "animation", "-g", "300"]);
    let size = statSync(MP4).size;
    if (size > LIMIT) {
      // too big at that quality: two passes at the bit rate that fits, less the sound's share
      const kbps = Math.floor(((LIMIT * 8) / v.duration - AUDIO * 1000) / 1000 / 1.03);
      console.log(`${(size / 1048576).toFixed(1)} MB at CRF 20; encoding again at ${kbps} kb/s`);
      const pass = ["-c:v", "libx264", "-preset", "veryslow", "-tune", "animation", "-g", "300", "-b:v", `${kbps}k`];
      execFileSync(FFMPEG, [
        "-y",
        "-loglevel",
        "error",
        "-framerate",
        String(FPS),
        "-i",
        join(outDir, "f%05d.png"),
        ...pass,
        "-pass",
        "1",
        "-passlogfile",
        join(outDir, "x264"),
        "-an",
        "-f",
        "mp4",
        "/dev/null",
      ]);
      encode([...pass, "-pass", "2", "-passlogfile", join(outDir, "x264")]);
      size = statSync(MP4).size;
    }
    console.log(`${MP4}: ${(size / 1048576).toFixed(2)} MB, ${v.duration} s`);
    console.log(`${POSTER}: the first frame`);
    if (!option("out")) rmSync(outDir, { recursive: true, force: true });
  }
} finally {
  await browser.close();
}
