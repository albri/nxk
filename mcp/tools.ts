// Every nxk tool, in the order the server lists them: what is known and the owner's answers (knowledge.ts), the
// build (build.ts), discovery (discovery.ts) and the explorer that says where discovery digs next (explore.ts).
// Tools that run in the server and print figures (logs: true) write what they print to the folder's log as a run of
// their own, each line with the kind its figures are as the tool made it (scripts/log.ts said), as the engine's
// scripts do, so that note_check can trace those figures too.
import { existsSync } from "node:fs";
import { fileSink, lineRecords, logFile, openLog } from "../scripts/log.ts";
import { BUILD } from "./build.ts";
import type { Country } from "../scripts/population.ts";
import { NO_COUNTRY, folderOf, kb, type NxkTool } from "./common.ts";
import { DISCOVERY } from "./discovery.ts";
import { EXPLORE } from "./explore.ts";
import { KNOWLEDGE } from "./knowledge.ts";
import { nudgeFor } from "./nudge.ts";

const logged = (tool: NxkTool): NxkTool =>
  !tool.logs
    ? tool
    : {
        ...tool,
        run: async (args, context) => {
          const result = await tool.run(args, context);
          if (!result.error) {
            const log = openLog(tool.name, [], {
              via: "server",
              sinks: [fileSink(logFile(process.env, folderOf(args)))].filter((sink) => sink !== null),
              print: () => {},
            });
            for (const { type, ...data } of result.records ?? lineRecords(result.text)) log.record(type, data);
          }
          return result;
        },
      };

// The country is never assumed. The first one a tool is given is kept in nxk.json (when there is one), and a tool asked
// without one before any is kept says so: a call that took a default would count the wrong population. The tools that
// count or scan people, and research_start, refuse to guess (needsCountry: true); the rest only keep the country given.

// The country an earlier call gave in a folder with no nxk.json yet, kept while the server runs, so that later calls
// there need not repeat it.
const given = new Map<string, Country>();
/** Whether a call gave a country nxk counts: its schema says uk or us, but a client may send anything. */
const counted = (country: string | undefined): country is Country => country === "uk" || country === "us";
const placed = (tool: NxkTool): NxkTool =>
  !tool.inputSchema?.properties?.country
    ? tool
    : {
        ...tool,
        run: async (args, context) => {
          let known: Country | null, folder: string;
          try {
            folder = folderOf(args);
            const { file, product, save } = kb(folder);
            known = product.country;
            if (!known && counted(args.country) && existsSync(file)) {
              save({ ...product, country: args.country });
              known = args.country;
            }
          } catch {
            return tool.run(args, context);
          } // an unreadable nxk.json is the tool's to report
          if (!known && counted(args.country)) given.set(folder, args.country);
          if (!known && !args.country && given.has(folder)) args = { ...args, country: given.get(folder) };
          if (!args.country && !known && tool.needsCountry) return { text: NO_COUNTRY, error: true };
          // Another country than the product's would count other people under its name: moving it is the owner's edit.
          if (known && args.country && args.country !== known)
            return {
              text: [
                `nxk.json records this product in the ${known.toUpperCase()},`,
                `but this call says country ${args.country}. Leave country out to count the product's own;`,
                "if the product has moved, change its country in nxk.json first.",
              ].join(" "),
              error: true,
            };
          const result = await tool.run(args, context);
          // A tool that made nxk.json keeps the country it was given, as one that found the file would have.
          if (!known && counted(args.country)) {
            const { file, product, save } = kb(folderOf(args));
            if (existsSync(file) && !product.country) save({ ...product, country: args.country });
          }
          return result;
        },
      };

// Every answer ends with the next move (nudge.ts), from what the answer meant: the records of the script that made it
// (mcp/common.ts runScript) or of the tool's own lines. It is added after the log is written: a nudge is not a figure.
const nudged = (tool: NxkTool): NxkTool => ({
  ...tool,
  run: async (args, context) => {
    const result = await tool.run(args, context);
    if (result.error || !result.text) return result;
    let lines: string[] = [];
    try {
      const folder = folderOf(args);
      const country = counted(args.country) ? args.country : (kb(folder).product.country ?? given.get(folder) ?? null);
      lines = nudgeFor({ tool: tool.name, args, records: result.records ?? [], folder, country });
    } catch {
      /* a nudge that cannot be worked out is left out, never an error */
    }
    return lines.length ? { ...result, text: `${result.text}\n\n${lines.join("\n")}` } : result;
  },
});

export const TOOLS: NxkTool[] = [...KNOWLEDGE, ...BUILD, ...DISCOVERY, ...EXPLORE].map(logged).map(placed).map(nudged);
