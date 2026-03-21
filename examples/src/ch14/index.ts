/**
 * Chapter 14 — Automations
 *
 * Demonstrates trigger-based automation execution:
 *   - Creates an AutomationRunner with the testingSkill
 *   - Registers an automation triggered by "code_pushed"
 *   - Triggers the automation and shows background execution
 *   - Prints the automation result and trace events
 */
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { Message, Automation } from "@openagention/core";
import { MockProvider } from "@openagention/runtime";
import {
  SkillLoader,
  testingSkill,
  AutomationRunner,
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
  console.log("═══ Chapter 14: Automations ═══\n");

  // ── Set up skill loader & automation runner ─────────────────────

  console.log("── Setting up automation ──");

  const loader = new SkillLoader();
  loader.register(testingSkill);

  const responses = loadFixtures();
  const provider = new MockProvider(responses);

  const runner = new AutomationRunner({
    loader,
    provider,
    timeout: 30_000,
  });

  const automation: Automation = {
    id: "auto_ci_tests",
    name: "CI Test Runner",
    trigger: "code_pushed",
    skillId: testingSkill.id,
    status: "idle",
  };

  runner.register(automation);
  console.log(
    `  Registered automation: ${automation.name} (trigger: ${automation.trigger})`,
  );
  console.log(`  Status: ${runner.getStatus(automation.id)}`);

  // ── Trigger the automation ──────────────────────────────────────

  console.log("\n── Triggering automation ──");

  const result = await runner.trigger(automation.id);

  // Show tool calls from trace events
  for (const evt of result.traceEvents) {
    if (evt.type === "tool_call") {
      const d = evt.data as {
        toolName: string;
        arguments: Record<string, unknown>;
      };
      const argsStr = JSON.stringify(d.arguments).slice(0, 50);
      console.log(`  → ${d.toolName}(${argsStr})`);
    }
  }

  // Show final message
  const finalMsgEvents = result.traceEvents.filter(
    (e) =>
      e.type === "message" && (e.data as { role: string }).role === "assistant",
  );
  if (finalMsgEvents.length > 0) {
    const last = finalMsgEvents[finalMsgEvents.length - 1]!;
    const content = (last.data as { content: string }).content;
    console.log(`  ${content.slice(0, 70)}`);
  }

  // ── Print result ────────────────────────────────────────────────

  console.log("\n── Result ──");
  console.log(`  Status: ${result.status}`);
  console.log(`  Trace events: ${result.traceEvents.length}`);
  console.log(`  Output: ${result.output.slice(0, 60)}...`);

  console.log("\n═══ Done ═══");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
