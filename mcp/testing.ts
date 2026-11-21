// What the server's tests share: the server started in a fresh project, spoken to as a client would.
import { spawn } from "node:child_process";
import { mkdirSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createInterface } from "node:readline";
import type { Country } from "../scripts/population.ts";
import { emptyProduct, today, writeProduct, type ProductSummary } from "../scripts/product.ts";
import type {
  Arguments,
  CallToolParams,
  CallToolResult,
  ElicitParams,
  ElicitRequest,
  ElicitResult,
  ErrorObject,
  InitializeParams,
  InitializeResult,
  ListToolsResult,
  RequestId,
} from "./protocol.ts";

/**
 * A reply, as a test reads it. JSON-RPC sends a result or an error: a test reads the one it expects, and reading the
 * other throws, which fails it.
 */
export interface Reply<R = unknown> {
  jsonrpc: "2.0";
  id: RequestId;
  result: R;
  error: ErrorObject;
}

/** The server in a fresh project, spoken to as a client would. */
export interface TestServer {
  /** The project. */
  dir: string;
  /** initialize's reply; nxk's server always gives its instructions. */
  ready: Promise<Reply<InitializeResult & { instructions: string }>>;
  request(method: "tools/list"): Promise<Reply<ListToolsResult>>;
  request(method: string, params?: object): Promise<Reply>;
  /** A tool's result. */
  call(name: string, args: Arguments): Promise<CallToolResult>;
  /** The forms the server asked the user to fill in, in order. */
  asked: ElicitParams[];
  /** How the user answers the forms from here on; with none given, each is cancelled. */
  answer(f: (params: ElicitParams) => ElicitResult): void;
  close(): void;
}

/** An nxk.json in `dir` that records a product and its country, as an owner's project might have it. */
export function seedProduct(dir: string, { country, ...product }: ProductSummary & { country: Country }): void {
  writeProduct(join(dir, "nxk.json"), { ...emptyProduct(), country, product: { ...product, date: today() } });
}

/** Whether what the server wrote is a form for the user rather than a reply. */
const isForm = (m: Reply | ElicitRequest): m is ElicitRequest => "method" in m && m.method === "elicitation/create";

/** Start the server in a fresh project, as the plugin starts it (through scripts/launch.mjs). */
export function start({ elicitation = false }: { elicitation?: boolean } = {}): TestServer {
  const dir = mkdtempSync(join(tmpdir(), "nxk-mcp-"));
  mkdirSync(join(dir, ".git"));
  const child = spawn(process.execPath, [new URL("../scripts/launch.mjs", import.meta.url).pathname, "mcp/server.ts"], {
    env: { ...process.env, CLAUDE_PROJECT_DIR: dir, NXK_LOG: "" },
    stdio: ["pipe", "pipe", "inherit"],
  });
  const waiting = new Map<RequestId, (reply: Reply) => void>(),
    asked: ElicitParams[] = [];
  let id = 0,
    onAsk: ((params: ElicitParams) => ElicitResult) | null = null;
  createInterface({ input: child.stdout }).on("line", (line) => {
    // A reply to one of the test's requests, or a form the server asks the user to fill in.
    const m: Reply | ElicitRequest = JSON.parse(line);
    if (isForm(m)) {
      asked.push(m.params);
      const answer = onAsk ? onAsk(m.params) : { action: "cancel" };
      child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", id: m.id, result: answer })}\n`);
      return;
    }
    waiting.get(m.id)?.(m);
    waiting.delete(m.id);
  });
  function request(
    method: "initialize",
    params: InitializeParams,
  ): Promise<Reply<InitializeResult & { instructions: string }>>;
  function request(method: "tools/list"): Promise<Reply<ListToolsResult>>;
  function request(method: "tools/call", params: CallToolParams): Promise<Reply<CallToolResult>>;
  function request(method: string, params?: object): Promise<Reply>;
  function request(method: string, params?: object): Promise<Reply> {
    return new Promise((resolve) => {
      const n = ++id;
      waiting.set(n, resolve);
      child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", id: n, method, params })}\n`);
    });
  }
  const call = async (name: string, args: Arguments) => (await request("tools/call", { name, arguments: args })).result;
  const ready = request("initialize", {
    protocolVersion: "2025-11-25",
    capabilities: elicitation ? { elicitation: {} } : {},
    clientInfo: { name: "test", version: "0" },
  });
  return {
    dir,
    ready,
    request,
    call,
    asked,
    answer: (f) => {
      onAsk = f;
    },
    close: () => child.kill(),
  };
}
