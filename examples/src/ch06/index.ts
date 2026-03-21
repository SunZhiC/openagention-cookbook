/**
 * Chapter 6 — Approvals and Sandboxing
 *
 * Demonstrates how ApprovalPolicy gates tool calls: the agent tries
 * to execute a shell command, the policy denies it, and the agent
 * falls back to a safe approach. This demo shows policy gating and
 * restricted tool access, not a security-grade sandbox.
 */
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { Message } from "@openagention/core";
import {
  AgentLoop,
  MockProvider,
  ToolRegistry,
  denyDangerous,
} from "@openagention/runtime";
import type { ToolHandler } from "@openagention/runtime";

const __dirname = dirname(fileURLToPath(import.meta.url));
const useLiveApi = process.env["LIVE_API"] === "true";

if (useLiveApi && !process.env["OPENAI_API_KEY"]) {
  console.error("LIVE_API=true but OPENAI_API_KEY is not set.");
  process.exit(1);
}

// ── Simulated file system ─────────────────────────────────────────

const fs: Record<string, string> = {
  "package.json":
    '{ "name": "demo", "version": "1.0.0", "scripts": { "test": "vitest" } }',
  "src/app.ts": 'export function start() {\n  console.log("App started");\n}',
};

// ── Policy-gated tool registry ────────────────────────────────────

const tools = new ToolRegistry();
const policy = denyDangerous;

/**
 * Helper: wrap a tool handler with policy checks.
 * If the policy denies the call, the handler returns an error message
 * instead of executing.
 */
function gatedRegister(
  def: { name: string; description: string; parameters: object },
  handler: ToolHandler,
): void {
  tools.register(def, async (args) => {
    const decision = policy.evaluate({ name: def.name, arguments: args });
    const rule = policy.matchedRule({ name: def.name, arguments: args });

    if (decision === "deny") {
      console.log(`  [policy] DENIED "${def.name}" (rule: ${rule})`);
      return `Error: tool "${def.name}" was denied by approval policy (rule: ${rule}). Use a safe alternative.`;
    }
    if (decision === "ask") {
      console.log(`  [policy] ASK "${def.name}" — auto-approving for demo`);
    }

    return handler(args);
  });
}

gatedRegister(
  {
    name: "shell",
    description: "Execute a shell command.",
    parameters: {
      type: "object",
      properties: { command: { type: "string" } },
      required: ["command"],
    },
  },
  async (args) => {
    // In a real system this would execute the command
    return `Executed: ${args["command"]}`;
  },
);

gatedRegister(
  {
    name: "readFile",
    description: "Read the contents of a file.",
    parameters: {
      type: "object",
      properties: { path: { type: "string" } },
      required: ["path"],
    },
  },
  async (args) => {
    const p = args["path"] as string;
    const content = fs[p];
    if (!content) return `Error: file not found: ${p}`;
    return content;
  },
);

gatedRegister(
  {
    name: "listFiles",
    description: "List all files in the project.",
    parameters: { type: "object", properties: {} },
  },
  async () => {
    return Object.keys(fs).join("\n");
  },
);

// ── Provider ──────────────────────────────────────────────────────

async function getProvider() {
  if (useLiveApi) {
    const { OpenAIProvider } = await import("@openagention/runtime");
    return new OpenAIProvider();
  }
  const raw = readFileSync(
    join(__dirname, "__fixtures__", "responses.json"),
    "utf-8",
  );
  return new MockProvider(JSON.parse(raw) as Message[]);
}

// ── Main ──────────────────────────────────────────────────────────

async function main() {
  console.log("═══ Chapter 6: Approvals and Sandboxing ═══\n");

  const provider = await getProvider();
  const loop = new AgentLoop({
    maxTurns: 10,
    timeout: 30_000,
    tools,
    provider,
  });

  const result = await loop.run([
    {
      role: "user",
      content: "Run the tests for this project and tell me if they pass.",
    },
  ]);

  for (const msg of result.messages.slice(1)) {
    if (msg.role === "assistant" && msg.tool_calls) {
      console.log(`\n[assistant] ${msg.content}`);
      for (const tc of msg.tool_calls) {
        console.log(
          `  → ${tc.function.name}(${tc.function.arguments.slice(0, 60)})`,
        );
      }
    } else if (msg.role === "tool") {
      const preview =
        msg.content.slice(0, 80) + (msg.content.length > 80 ? "..." : "");
      console.log(`  ← ${preview}`);
    } else if (msg.role === "assistant") {
      console.log(`\n[assistant] ${msg.content}`);
    }
  }

  console.log(`\n── Trace: ${result.traceEvents.length} events ──`);
  for (const evt of result.traceEvents) {
    console.log(`  ${evt.type.padEnd(14)} ${evt.id}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
