#!/usr/bin/env node
// Claude Code PreToolUse hook for nxk's tools. Before each call it keeps what the person typed in this session in
// .nxk/asked.md (scripts/product.ts askedFiles), so that note_check takes a figure they gave as given. It runs only
// when nxk is used, so a session that never uses it leaves nothing behind, and it prints nothing.
import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname } from "node:path";
import { isMain } from "../scripts/cli.ts";
import type { TranscriptEntry } from "../scripts/depth.ts";
import { askedFiles } from "../scripts/product.ts";

/** What a PreToolUse hook is given, as far as this one reads it. */
interface PreToolUseInput {
  cwd?: string;
  transcript_path?: string;
}

/** What the person typed in a session, oldest first: their own turns, without tool results or notes Claude Code adds. */
export function promptsIn(transcript: string): string[] {
  return String(transcript)
    .split("\n")
    .flatMap((line) => {
      let e: TranscriptEntry | null;
      try {
        e = JSON.parse(line);
      } catch {
        return [];
      }
      if (e?.type !== "user" || e.isMeta || e.message?.role !== "user") return [];
      const c = e.message.content;
      const text =
        typeof c === "string"
          ? c
          : Array.isArray(c) && c.length && c.every((p) => p?.type === "text")
            ? c.map((p) => p.text).join("\n")
            : "";
      const own = text.replace(/<([a-z][\w-]*)>[\s\S]*?<\/\1>/g, "").trim();
      return own ? [own] : [];
    });
}

/** Keeps the session's prompts not yet in the folder's asked.md. Never fatal: a prompt not kept only means its figures need a label. */
export function keep(input: PreToolUseInput): void {
  try {
    const cwd = input.cwd || process.cwd();
    if (!input.transcript_path || !existsSync(input.transcript_path)) return;
    const prompts = promptsIn(readFileSync(input.transcript_path, "utf8"));
    const file = askedFiles(cwd)[0];
    const kept = existsSync(file) ? readFileSync(file, "utf8") : "";
    const fresh = [...new Set(prompts)].filter((p) => !kept.includes(p));
    if (!fresh.length) return;
    mkdirSync(dirname(file), { recursive: true });
    appendFileSync(file, fresh.map((p) => `${p}\n\n`).join(""));
  } catch {
    /* see above */
  }
}

if (isMain(import.meta.url)) {
  let input: PreToolUseInput = {};
  try {
    input = JSON.parse(readFileSync(0, "utf8") || "{}");
  } catch {
    process.exit(0);
  }
  keep(input);
}
