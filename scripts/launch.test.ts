import assert from "node:assert/strict";
import test from "node:test";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const LAUNCH = new URL("./launch.mjs", import.meta.url).pathname;
const root = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

// With type stripping turned off, this Node runs no TypeScript, as one older than 22.18 would not.
const launch = (entry: string, { input = "", old = false } = {}) =>
  spawnSync(process.execPath, [...(old ? ["--no-experimental-strip-types"] : []), LAUNCH, entry], {
    input,
    encoding: "utf8",
    timeout: 20000,
  });

/** What the test reads of the plugin's manifest and its hooks.json. */
interface Manifest {
  mcpServers: Record<string, { command: string; args: string[] }>;
}
interface HookFile {
  hooks: Record<string, { matcher?: string; hooks: { type: string; command: string }[] }[]>;
}

test("every way into the plugin starts through the launcher", () => {
  const plugin: Manifest = JSON.parse(root(".claude-plugin/plugin.json"));
  assert.deepEqual(plugin.mcpServers.nxk.args, ["${CLAUDE_PLUGIN_ROOT}/scripts/launch.mjs", "mcp/server.ts"]);
  const file: HookFile = JSON.parse(root("hooks/hooks.json"));
  const commands = Object.values(file.hooks)
    .flat()
    .flatMap((h) => h.hooks.map((x) => x.command));
  assert.equal(commands.length, 3);
  for (const command of commands)
    assert.match(command, /^node "\$\{CLAUDE_PLUGIN_ROOT\}\/scripts\/launch\.mjs" hooks\/[\w-]+\.ts$/);
});

test("on a Node that cannot run TypeScript, the launcher names the version it needs in one line", () => {
  const server = launch("mcp/server.ts", { old: true });
  assert.equal(server.status, 1);
  assert.equal(server.stdout, "");
  assert.match(
    server.stderr.trim(),
    /^nxk needs Node 22\.18 or later, .* is Node v[\d.]+\. Update Node, then start Claude Code again\.$/,
  );
  // A hook warns the owner and lets the work go on.
  const hook = launch("hooks/stop-check.ts", { input: "{}", old: true });
  assert.equal(hook.status, 0);
  assert.match(JSON.parse(hook.stdout).systemMessage, /^nxk needs Node 22\.18 or later/);
});

// The server's own tests start it through the launcher (mcp/testing.ts), as the plugin does.
test("on a Node that can, the launcher runs the entry point as if Node had been given it", () => {
  // A hook runs only when it is the script Node started with: nxk's second look, stopped on one look, is held.
  const dir = mkdtempSync(join(tmpdir(), "nxk-launch-"));
  const own = join(dir, "agent.jsonl");
  writeFileSync(
    own,
    [
      {
        type: "assistant",
        message: {
          content: [{ type: "tool_use", id: "t0", name: "mcp__plugin_nxk_nxk__people", input: { action: "count" } }],
        },
      },
      {
        type: "user",
        message: {
          content: [{ type: "tool_result", tool_use_id: "t0", content: [{ type: "text", text: "Counted." }] }],
        },
      },
    ]
      .map((e) => JSON.stringify(e))
      .join("\n"),
  );
  const input = {
    cwd: dir,
    hook_event_name: "SubagentStop",
    agent_type: "nxk:second-look",
    agent_transcript_path: own,
    transcript_path: own,
  };
  const hook = launch("hooks/stop-check.ts", { input: JSON.stringify(input) });
  assert.equal(hook.status, 0);
  assert.match(JSON.parse(hook.stdout).reason, /Dig one more round/);
});
