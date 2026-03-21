/**
 * Chapter 13 — Skills
 *
 * Demonstrates skill-based tool injection:
 *   - Creates a SkillLoader and registers 3 built-in skills
 *   - Injects codeReviewSkill's tools into a ToolRegistry
 *   - Agent uses the injected tools to review a code snippet
 *   - Shows the skill → tool injection → agent execution flow
 */
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { Message } from "@openagention/core";
import { AgentLoop, MockProvider, ToolRegistry } from "@openagention/runtime";
import {
  SkillLoader,
  codeReviewSkill,
  testingSkill,
  refactoringSkill,
} from "@openagention/skills";

const __dirname = dirname(fileURLToPath(import.meta.url));

// ── Provider ──────────────────────────────────────────────────────

function loadFixtures(): Message[] {
  const raw = readFileSync(
    join(__dirname, "__fixtures__", "responses.json"),
    "utf-8",
  );
  return JSON.parse(raw) as Message[];
}

// ── Main ──────────────────────────────────────────────────────────

async function main() {
  console.log("═══ Chapter 13: Skills ═══\n");

  // ── Register skills ─────────────────────────────────────────────

  console.log("── Registering skills ──");

  const loader = new SkillLoader();
  loader.register(codeReviewSkill);
  loader.register(testingSkill);
  loader.register(refactoringSkill);

  for (const skill of loader.list()) {
    console.log(`  Registered: ${skill.name} (${skill.tools.length} tools)`);
  }
  console.log(`  Total skills: ${loader.list().length}`);

  // ── Inject skill tools into a ToolRegistry ──────────────────────

  console.log("\n── Injecting codeReviewSkill into ToolRegistry ──");

  const tools = new ToolRegistry();
  loader.inject(codeReviewSkill.id, tools);

  const toolNames = tools
    .list()
    .map((t) => t.name)
    .join(", ");
  console.log(`  Injected tools: ${toolNames}`);

  // ── Agent uses skill tools to review code ───────────────────────

  console.log("\n── Agent reviewing code with skill tools ──");

  const responses = loadFixtures();
  const provider = new MockProvider(responses);

  const loop = new AgentLoop({
    maxTurns: 10,
    timeout: 30_000,
    tools,
    provider,
  });

  const result = await loop.run([
    {
      role: "user",
      content: "Review the authentication module in src/auth.ts",
    },
  ]);

  for (const msg of result.messages.slice(1)) {
    if (msg.role === "assistant" && msg.tool_calls) {
      for (const tc of msg.tool_calls) {
        console.log(
          `  → ${tc.function.name}(${tc.function.arguments.slice(0, 50)})`,
        );
      }
    } else if (msg.role === "assistant") {
      console.log(`  ${msg.content.slice(0, 70)}`);
    }
  }

  console.log("\n═══ Done ═══");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
