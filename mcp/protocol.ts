// A Model Context Protocol server over stdio, with no dependencies: newline-delimited JSON-RPC 2.0 on stdin and stdout.
// It answers initialize, ping, tools/list and tools/call, and can send the client one kind of request of its own,
// elicitation/create (a question for the user), when the client said at initialize that it can show one. Revision
// 2025-11-25, negotiated down to what the client asks for when that is older. A client asking for a newer revision is
// answered with 2025-11-25 and connects as an older client does.
//
// Nothing but protocol messages may go to stdout: logs go to stderr.
import { createInterface } from "node:readline";

export const VERSIONS = ["2025-11-25", "2025-06-18", "2025-03-26", "2024-11-05"];

// ---------------------------------------------------------------------------------------------------------------
// JSON-RPC 2.0

/** A request's id: a number or a string. The server numbers its own requests "nxk-1", "nxk-2", ... */
export type RequestId = string | number;

/** A JSON object: a request's params, a result, a tool's arguments. */
export type JsonObject = Record<string, unknown>;

/** A request: a method and its params, answered by a response with the same id. */
export interface Request<P = JsonObject> {
  jsonrpc: "2.0";
  id: RequestId;
  method: string;
  params?: P;
}

/** Why a request failed: -32700 (not JSON), -32601 (no such method) or -32602 (bad params, such as no such tool). */
export interface ErrorObject {
  code: number;
  message: string;
  data?: unknown;
}

/** The answer to a request that succeeded. */
export interface ResultResponse<R = JsonObject> {
  jsonrpc: "2.0";
  id: RequestId;
  result: R;
}

/** The answer to a request that failed; its id is null when the message could not be read at all. */
export interface ErrorResponse {
  jsonrpc: "2.0";
  id: RequestId | null;
  error: ErrorObject;
}

/** What the server writes: an answer to one of the client's requests, or a request of its own (a form). */
export type Outgoing = ResultResponse<object> | ErrorResponse | ElicitRequest;

/**
 * A message from the client as read, before it is known which kind it is: a request (id and method), a notification
 * (method, no id), or the answer to one of the server's own requests (id, and result or error). Nothing in it is
 * trusted: each field is read as it is handled.
 */
export interface Incoming {
  jsonrpc?: string;
  id?: RequestId;
  method?: string;
  params?: JsonObject;
  result?: unknown;
  error?: ErrorObject;
}

// ---------------------------------------------------------------------------------------------------------------
// MCP

/** A program and its version, as the client and the server name themselves at initialize. */
export interface Implementation {
  name: string;
  version: string;
}

/** What the client can do, as it said at initialize. Only one is read: whether it can show the user a form. */
export interface ClientCapabilities {
  elicitation?: object;
  [capability: string]: unknown;
}

/** initialize's params: the revision the client speaks, what it can do, and its name. */
export interface InitializeParams {
  protocolVersion: string;
  capabilities?: ClientCapabilities;
  clientInfo?: Implementation;
}

/** initialize's result: the revision agreed, that the server has tools (a list that never changes), and its name. */
export interface InitializeResult {
  protocolVersion: string;
  capabilities: { tools: { listChanged: boolean } };
  serverInfo: Implementation;
  instructions?: string;
}

/** The client the server is connected to, as initialize left it. */
export interface Client {
  capabilities: ClientCapabilities;
  info?: Implementation;
  protocolVersion: string;
}

/**
 * A JSON Schema, as far as the tools write one: for a tool's arguments and the values inside them, or for the fields
 * of a form put to the user.
 */
export interface Schema {
  type?: "string" | "number" | "integer" | "boolean" | "array" | "object";
  title?: string;
  description?: string;
  enum?: string[];
  default?: unknown;
  minimum?: number;
  maximum?: number;
  minItems?: number;
  items?: Schema;
  properties?: Record<string, Schema>;
  required?: string[];
}

/** The schema of a tool's arguments, or of a form's fields: an object, named property by property. */
export interface ObjectSchema extends Schema {
  type: "object";
  properties: Record<string, Schema>;
}

/** Hints to the client about what a tool does: whether it only reads, and whether it reaches the world outside. */
export interface ToolAnnotations {
  readOnlyHint?: boolean;
  destructiveHint?: boolean;
  idempotentHint?: boolean;
  openWorldHint?: boolean;
}

/** A tool as tools/list describes it to the client. */
export interface ToolDefinition {
  name: string;
  title?: string;
  description: string;
  inputSchema: ObjectSchema;
  annotations?: ToolAnnotations;
}

/** tools/list's result. */
export interface ListToolsResult {
  tools: ToolDefinition[];
}

/** A tool's arguments, by name, as the client sent them. */
export type Arguments = JsonObject;

/** tools/call's params: the tool, and its arguments. */
export interface CallToolParams {
  name: string;
  arguments?: Arguments;
}

/** tools/call's result: the tool's text, flagged when it is an error the model should read as one. */
export interface CallToolResult {
  content: { type: "text"; text: string }[];
  isError?: boolean;
  /**
   * MCP's structured result, which nxk never sends: Claude Code gives the model a tool's structured content in place of
   * its text, and the text is the interface.
   */
  structuredContent?: JsonObject;
}

/** elicitation/create's params: a form, with the message the user reads and the fields they fill in. */
export interface ElicitParams {
  mode: "form";
  message: string;
  requestedSchema: ObjectSchema;
}

/** The one request the server sends: a form for the user to fill in. */
export interface ElicitRequest extends Request<ElicitParams> {
  method: "elicitation/create";
  params: ElicitParams;
}

/** What the user did with a form: filled it in (accept, with what they entered), declined it, or cancelled it. */
export interface ElicitResult {
  action: "accept" | "decline" | "cancel";
  content?: Record<string, string | number | boolean>;
}

/** The client's answer to one of the server's forms: its result, or a cancel with the error it answered with. */
type FormAnswer = ElicitResult & { error?: ErrorObject };

/** What a tool's run returns: its text, and whether it is an error. */
export interface ToolOutput {
  text: string;
  error?: boolean;
}

/** What a tool's run is given beside its arguments: a way to ask the user, and the client. */
export interface ToolContext {
  elicit: (message: string, requestedSchema: ObjectSchema) => Promise<ElicitResult | null>;
  client: Client;
}

/** A tool the server lists and runs. */
export interface Tool extends ToolDefinition {
  run(args: Arguments, context: ToolContext): Promise<ToolOutput>;
}

/** What serve is given: the server's name and version, what it tells the client's model, and its tools in order. */
export interface ServerInfo {
  name: string;
  version: string;
  instructions?: string;
  tools: Tool[];
}

/** Where the server reads and writes: stdin and stdout unless given. */
export interface Streams {
  input?: NodeJS.ReadableStream;
  output?: NodeJS.WritableStream;
}

/**
 * Arguments as the tool's schema types them. A model that calls a tool before its schema is loaded (Claude Code defers
 * most MCP tools) sends "true" for a boolean, "3" for a number and a JSON string for an array or object, and the call
 * would fail on its types. Anything else is left as sent.
 */
export function coerce(schema: Schema | undefined, args: Arguments): Arguments {
  const props = schema?.properties ?? {},
    out = { ...args };
  for (const [key, value] of Object.entries(out)) {
    const type = props[key]?.type;
    if (typeof value !== "string" || typeof type !== "string") continue;
    const text = value.trim();
    if (type === "boolean" && /^(true|false)$/i.test(text)) out[key] = text.toLowerCase() === "true";
    else if ((type === "number" || type === "integer") && text !== "" && Number.isFinite(Number(text)))
      out[key] = Number(text);
    else if (type === "array" || type === "object") {
      let parsed: unknown;
      try {
        parsed = JSON.parse(text);
      } catch {
        continue;
      }
      if (
        type === "array"
          ? Array.isArray(parsed)
          : parsed !== null && typeof parsed === "object" && !Array.isArray(parsed)
      )
        out[key] = parsed;
    }
  }
  return out;
}

/**
 * Serves `tools` until the input closes. A tool's run returns { text, error? } (nxk's add what they meant as they
 * printed: mcp/common.ts ToolResult), and only the text goes back. There is no structured content: Claude Code gives
 * the model a tool's structuredContent in place of its text, and the text is what tells the model what a figure means
 * and what to do next. context.elicit(message, schema) asks the user through the client and resolves to
 * { action, content }, or to null when the client cannot ask: it says it has no forms, or it cancelled the form without
 * the user choosing (a non-interactive session cancels every form). Only "accept" and "decline" are the user's answers.
 */
export function serve(
  { name, version, instructions, tools }: ServerInfo,
  { input = process.stdin, output = process.stdout }: Streams = {},
): { close: () => void } {
  let client: Client = { capabilities: {}, protocolVersion: VERSIONS[0] };
  let nextId = 1;
  // The server's own requests (forms), waiting for the client's answer.
  const waiting = new Map<RequestId, (answer: FormAnswer | undefined) => void>();
  const send = (message: Outgoing) => output.write(`${JSON.stringify(message)}\n`);
  const reply = (id: RequestId, result: object) => send({ jsonrpc: "2.0", id, result });
  const fail = (id: RequestId, code: number, message: string) => send({ jsonrpc: "2.0", id, error: { code, message } });

  const elicit = (message: string, requestedSchema: ObjectSchema): Promise<ElicitResult | null> => {
    if (!client.capabilities?.elicitation) return Promise.resolve(null);
    const id = `nxk-${nextId++}`;
    send({ jsonrpc: "2.0", id, method: "elicitation/create", params: { mode: "form", message, requestedSchema } });
    return new Promise<FormAnswer | undefined>((resolve) => waiting.set(id, resolve)).then((answer) =>
      answer?.action === "accept" || answer?.action === "decline" ? answer : null,
    );
  };

  const listed = (): ToolDefinition[] =>
    tools.map(({ name: n, title, description, inputSchema, annotations }) => ({
      name: n,
      title,
      description,
      inputSchema,
      ...(annotations ? { annotations } : {}),
    }));

  async function call(id: RequestId, params: CallToolParams | undefined) {
    const tool = tools.find((t) => t.name === params?.name);
    if (!tool) return fail(id, -32602, `Unknown tool: ${params?.name}`);
    try {
      const out = await tool.run(coerce(tool.inputSchema, params?.arguments ?? {}), { elicit, client });
      reply(id, {
        content: [{ type: "text", text: out.text }],
        ...(out.error ? { isError: true } : {}),
      } satisfies CallToolResult);
    } catch (error) {
      reply(id, {
        content: [{ type: "text", text: error instanceof Error ? error.message : String(error) }],
        isError: true,
      } satisfies CallToolResult);
    }
  }

  async function handle(message: Incoming) {
    // A reply to one of our own requests.
    if (message.id !== undefined && !message.method) {
      const resolve = waiting.get(message.id);
      if (resolve) {
        waiting.delete(message.id);
        // The only request the server sends is a form, so a result is the form's.
        resolve(
          message.error ? { action: "cancel", error: message.error } : (message.result as FormAnswer | undefined),
        );
      }
      return;
    }
    const { id, method, params } = message;
    if (id === undefined) return; // a notification: nothing to answer
    switch (method) {
      case "initialize": {
        const init = params as InitializeParams | undefined;
        const asked = init?.protocolVersion;
        client = {
          capabilities: init?.capabilities ?? {},
          info: init?.clientInfo,
          protocolVersion: asked !== undefined && VERSIONS.includes(asked) ? asked : VERSIONS[0],
        };
        return reply(id, {
          protocolVersion: client.protocolVersion,
          capabilities: { tools: { listChanged: false } },
          serverInfo: { name, version },
          ...(instructions ? { instructions } : {}),
        } satisfies InitializeResult);
      }
      case "ping":
        return reply(id, {});
      case "tools/list":
        return reply(id, { tools: listed() } satisfies ListToolsResult);
      case "tools/call":
        return call(id, params as CallToolParams | undefined);
      default:
        return fail(id, -32601, `Method not found: ${method}`);
    }
  }

  const lines = createInterface({ input });
  lines.on("line", (line) => {
    if (!line.trim()) return;
    let message: Incoming | Incoming[];
    try {
      message = JSON.parse(line);
    } catch {
      return send({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } });
    }
    for (const one of Array.isArray(message) ? message : [message])
      handle(one).catch((error) => process.stderr.write(`nxk: ${error?.stack ?? error}\n`));
  });
  // A stdio server exits when its input closes: the client has gone.
  if (input === process.stdin) lines.on("close", () => process.exit(0));
  return { close: () => lines.close() };
}
