/**
 * Chapter 1 — Minimal Coding Loop
 *
 * Demonstrates the simplest possible agent: user asks a coding question,
 * the LLM reads a file with a tool call, then answers.
 */
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { Message } from "@openagention/core";
import { AgentLoop, MockProvider, ToolRegistry } from "@openagention/runtime";

const __dirname = dirname(fileURLToPath(import.meta.url));

const useLiveApi = process.env["LIVE_API"] === "true";

if (useLiveApi && !process.env["OPENAI_API_KEY"]) {
  console.error(
    "LIVE_API=true but OPENAI_API_KEY is not set. " +
      "Either set the key or run without LIVE_API.",
  );
  process.exit(1);
}

// ── Tool registry ──────────────────────────────────────────────────

const tools = new ToolRegistry();

tools.register(
  {
    name: "readFile",
    description: "Read the contents of a file at the given path.",
    parameters: {
      type: "object",
      properties: {
        path: { type: "string", description: "File path to read" },
      },
      required: ["path"],
    },
  },
  async (args) => {
    const filePath = args["path"] as string;
    // Simulated file system for the demo
    const files: Record<string, string> = {
      "src/main.ts":
        'import { greet } from "./utils.js";\n\nconsole.log(greet("World"));',
      "src/utils.ts":
        "export function greet(name: string): string {\n  return `Hello, ${name}!`;\n}",
    };
    const content = files[filePath];
    if (content === undefined) {
      return `Error: file not found: ${filePath}`;
    }
    return content;
  },
);

// ── Provider ───────────────────────────────────────────────────────

async function getProvider() {
  if (useLiveApi) {
    const { OpenAIProvider } = await import("@openagention/runtime");
    return new OpenAIProvider();
  }
  const fixtureRaw = readFileSync(
    join(__dirname, "__fixtures__", "responses.json"),
    "utf-8",
  );
  const responses = JSON.parse(fixtureRaw) as Message[];
  return new MockProvider(responses);
}

// ── Main ───────────────────────────────────────────────────────────

async function main() {
  console.log("═══ Chapter 1: Minimal Coding Loop ═══\n");

  const provider = await getProvider();
  const loop = new AgentLoop({
    maxTurns: 10,
    timeout: 30_000,
    tools,
    provider,
  });

  const userMessage: Message = {
    role: "user",
    content: "Read the project source files and explain the code structure.",
  };
  console.log(`[user] ${userMessage.content}\n`);

  const result = await loop.run([userMessage]);

  // Print conversation
  for (const msg of result.messages.slice(1)) {
    if (msg.role === "assistant" && msg.tool_calls) {
      for (const tc of msg.tool_calls) {
        console.log(
          `[assistant → tool_call] ${tc.function.name}(${tc.function.arguments})`,
        );
      }
    } else if (msg.role === "tool") {
      const preview =
        msg.content.slice(0, 80) + (msg.content.length > 80 ? "..." : "");
      console.log(`[tool_result] ${preview}`);
    } else if (msg.role === "assistant") {
      console.log(`\n[assistant] ${msg.content}`);
    }
  }

  console.log(`\n── Trace: ${result.traceEvents.length} events recorded ──`);
  for (const evt of result.traceEvents) {
    console.log(`  ${evt.type.padEnd(14)} ${evt.id}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
