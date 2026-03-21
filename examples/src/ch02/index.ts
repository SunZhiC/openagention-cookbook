/**
 * Chapter 2 — Tool Registry
 *
 * Demonstrates registering multiple tools (readFile, writeFile, listFiles)
 * and the agent using them to explore and modify a small project.
 */
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { Message } from "@openagention/core";
import { AgentLoop, MockProvider, ToolRegistry } from "@openagention/runtime";

const __dirname = dirname(fileURLToPath(import.meta.url));
const useLiveApi = process.env["LIVE_API"] === "true";

if (useLiveApi && !process.env["OPENAI_API_KEY"]) {
  console.error("LIVE_API=true but OPENAI_API_KEY is not set.");
  process.exit(1);
}

// ── Simulated file system ──────────────────────────────────────────

const fs: Record<string, string> = {
  "src/app.ts": 'console.log("Hello from app");',
  "src/config.ts": "export const PORT = 3000;",
};

// ── Tool registry with 3 tools ─────────────────────────────────────

const tools = new ToolRegistry();

tools.register(
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
    return fs[p] ?? `Error: file not found: ${p}`;
  },
);

tools.register(
  {
    name: "writeFile",
    description: "Write content to a file (creates or overwrites).",
    parameters: {
      type: "object",
      properties: {
        path: { type: "string" },
        content: { type: "string" },
      },
      required: ["path", "content"],
    },
  },
  async (args) => {
    const p = args["path"] as string;
    const c = args["content"] as string;
    fs[p] = c;
    return `Wrote ${c.length} bytes to ${p}`;
  },
);

tools.register(
  {
    name: "listFiles",
    description: "List files in a directory.",
    parameters: {
      type: "object",
      properties: { directory: { type: "string" } },
      required: ["directory"],
    },
  },
  async (args) => {
    const dir = args["directory"] as string;
    const matches = Object.keys(fs).filter((f) => f.startsWith(dir));
    return matches.length > 0 ? matches.join("\n") : `No files in ${dir}`;
  },
);

// ── Provider ───────────────────────────────────────────────────────

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

// ── Main ───────────────────────────────────────────────────────────

async function main() {
  console.log("═══ Chapter 2: Tool Registry ═══\n");
  console.log(
    `Registered tools: ${tools
      .list()
      .map((t) => t.name)
      .join(", ")}\n`,
  );

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
      content: "Explore the src/ directory and add a helper module.",
    },
  ]);

  for (const msg of result.messages.slice(1)) {
    if (msg.role === "assistant" && msg.tool_calls) {
      console.log(`[assistant] ${msg.content}`);
      for (const tc of msg.tool_calls) {
        console.log(
          `  → tool_call: ${tc.function.name}(${tc.function.arguments})`,
        );
      }
    } else if (msg.role === "tool") {
      console.log(`  ← tool_result: ${msg.content}`);
    } else if (msg.role === "assistant") {
      console.log(`\n[assistant] ${msg.content}`);
    }
  }

  console.log("\n── Final simulated file system ──");
  for (const [path, content] of Object.entries(fs)) {
    console.log(
      `  ${path}: ${content.slice(0, 60)}${content.length > 60 ? "..." : ""}`,
    );
  }

  console.log(`\n── Trace: ${result.traceEvents.length} events ──`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
