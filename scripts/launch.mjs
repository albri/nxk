#!/usr/bin/env node
// The one file Node runs first, in plain JavaScript so that any Node can read it. nxk is TypeScript that Node 22.18 and
// later run as it is; an older Node fails on the first .ts file with a stack trace that never names the version. This
// says so in one line instead, then runs the entry point it is given, a path from the plugin's root:
//
//   node scripts/launch.mjs mcp/server.ts
//   node scripts/launch.mjs hooks/stop-check.ts
import { fileURLToPath } from "node:url";

const entry = process.argv[2] ?? "";
const target = new URL(`../${entry}`, import.meta.url);

if (!process.features?.typescript) {
  const message = [
    `nxk needs Node 22.18 or later, which runs its TypeScript as it is, but ${process.execPath} is Node ${process.version}.`,
    "Update Node, then start Claude Code again.",
  ].join(" ");
  // A hook's warning reaches the owner as a system message, and the work goes on. The MCP server's goes to its log, and
  // the server does not start.
  if (entry.startsWith("hooks/")) console.log(JSON.stringify({ systemMessage: message }));
  else {
    console.error(message);
    process.exitCode = 1;
  }
} else {
  // As if Node had been given the entry point itself: the hooks run only when they are the script Node started with.
  process.argv[1] = fileURLToPath(target);
  await import(target.href);
}
