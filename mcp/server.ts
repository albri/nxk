#!/usr/bin/env node
// nxk as a Model Context Protocol server (stdio): the tools (tools.ts), the product's knowledge base (nxk.json,
// scripts/product.ts), and the method, in these instructions and the guides (guides/). The three ways in are agents,
// not prompts, each started by the owner with a skill: research (agents/researcher.md, /nxk:research), the second look
// (agents/second-look.md, /nxk:look) and the panel (agents/panel.md, /nxk:meet). Claude Code starts the server from
// the plugin (.claude-plugin/plugin.json). See mcp/README.md.
import { readFileSync } from "node:fs";
import { serve } from "./protocol.ts";
import { TOOLS } from "./tools.ts";

// Kept to one line on purpose. Instructions that described nxk, with its tools loaded upfront, cut the session's own
// answers short and lost blind comparisons with plain Claude even where nxk added nothing: its presence in the context
// took from the answer. So the session is told nothing about nxk but to leave its tools alone and, only when the owner asks
// for nxk, which agent to hand it to; /nxk:research, /nxk:look and /nxk:meet say how to brief each.
const INSTRUCTIONS = [
  "nxk's tools and guides are for nxk's own agents, not for you: do the owner's work as you would without nxk.",
  "Only when the owner asks for nxk, hand it over: a question about people to nxk:researcher, a look at work to nxk:second-look, meeting a group to nxk:panel.",
  "If you are one of nxk's agents, follow your brief: product first, then guide topic second-look or guide topic research.",
].join(" ");

const banner: { name?: string; version: string } = JSON.parse(
  readFileSync(new URL("../.claude-plugin/plugin.json", import.meta.url), "utf8"),
);
serve({
  name: banner.name ?? "nxk",
  version: banner.version,
  instructions: INSTRUCTIONS,
  tools: TOOLS,
});
