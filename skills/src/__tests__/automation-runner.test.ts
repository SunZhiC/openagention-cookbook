import { describe, it, expect } from "vitest";
import type { Message, Automation } from "@openagention/core";
import { MockProvider } from "@openagention/runtime";
import { SkillLoader, testingSkill } from "../skill-loader.js";
import { AutomationRunner } from "../automation-runner.js";

// ── Helpers ────────────────────────────────────────────────────────

function createSetup(responses: Message[]) {
  const loader = new SkillLoader();
  loader.register(testingSkill);

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

  return { loader, runner, automation };
}

// ── Tests ──────────────────────────────────────────────────────────

describe("AutomationRunner", () => {
  it("register and trigger an automation", async () => {
    const responses: Message[] = [
      {
        role: "assistant",
        content: "Running tests.",
        tool_calls: [
          {
            id: "call_1",
            type: "function",
            function: {
              name: "runTests",
              arguments: JSON.stringify({ testPattern: "**/*.test.ts" }),
            },
          },
        ],
      },
      { role: "assistant", content: "All tests pass." },
    ];

    const { runner, automation } = createSetup(responses);
    runner.register(automation);

    const result = await runner.trigger(automation.id);
    expect(result.automationId).toBe("auto_ci_tests");
    expect(result.status).toBe("completed");
    expect(result.output.length).toBeGreaterThan(0);
  });

  it("getStatus returns idle for newly registered automation", () => {
    const { runner, automation } = createSetup([]);
    runner.register(automation);

    expect(runner.getStatus(automation.id)).toBe("idle");
  });

  it("getStatus returns completed after successful trigger", async () => {
    const responses: Message[] = [{ role: "assistant", content: "Done." }];

    const { runner, automation } = createSetup(responses);
    runner.register(automation);

    await runner.trigger(automation.id);
    expect(runner.getStatus(automation.id)).toBe("completed");
  });

  it("trigger unknown automation throws", async () => {
    const { runner } = createSetup([]);

    await expect(runner.trigger("auto_nonexistent")).rejects.toThrow(
      'automation "auto_nonexistent" not found',
    );
  });

  it("getStatus for unknown automation throws", () => {
    const { runner } = createSetup([]);

    expect(() => runner.getStatus("auto_nonexistent")).toThrow(
      'automation "auto_nonexistent" not found',
    );
  });

  it("list returns registered automations", () => {
    const { runner, automation } = createSetup([]);
    runner.register(automation);

    const automations = runner.list();
    expect(automations.length).toBe(1);
    expect(automations[0]!.id).toBe("auto_ci_tests");
    expect(automations[0]!.name).toBe("CI Test Runner");
  });

  it("completed automation has trace events", async () => {
    const responses: Message[] = [
      {
        role: "assistant",
        content: "Running.",
        tool_calls: [
          {
            id: "call_1",
            type: "function",
            function: {
              name: "runTests",
              arguments: JSON.stringify({ testPattern: "**/*.test.ts" }),
            },
          },
        ],
      },
      { role: "assistant", content: "Done." },
    ];

    const { runner, automation } = createSetup(responses);
    runner.register(automation);

    const result = await runner.trigger(automation.id);
    expect(result.traceEvents.length).toBeGreaterThan(0);

    // Should have state_change events (idle→running, running→completed)
    const stateChanges = result.traceEvents.filter(
      (e) => e.type === "state_change",
    );
    expect(stateChanges.length).toBeGreaterThanOrEqual(2);

    // Should have a message event
    const messages = result.traceEvents.filter((e) => e.type === "message");
    expect(messages.length).toBeGreaterThanOrEqual(1);
  });

  it("automation with missing skill fails gracefully", async () => {
    const loader = new SkillLoader();
    // Do NOT register testingSkill
    const provider = new MockProvider([]);
    const runner = new AutomationRunner({
      loader,
      provider,
      timeout: 30_000,
    });

    const automation: Automation = {
      id: "auto_broken",
      name: "Broken Automation",
      trigger: "code_pushed",
      skillId: "skill_nonexistent",
      status: "idle",
    };
    runner.register(automation);

    const result = await runner.trigger(automation.id);
    expect(result.status).toBe("failed");
    expect(runner.getStatus(automation.id)).toBe("failed");

    // Should have error trace event
    const errors = result.traceEvents.filter((e) => e.type === "error");
    expect(errors.length).toBeGreaterThanOrEqual(1);
  });

  it("timeout updates status and emits timeout trace events", async () => {
    const loader = new SkillLoader();
    loader.register(testingSkill);

    const hangingProvider: import("@openagention/core").ChatProvider = {
      async chat() {
        return new Promise(() => {});
      },
    };

    const runner = new AutomationRunner({
      loader,
      provider: hangingProvider,
      timeout: 10,
    });

    const automation: Automation = {
      id: "auto_timeout",
      name: "Timeout Automation",
      trigger: "code_pushed",
      skillId: testingSkill.id,
      status: "idle",
    };
    runner.register(automation);

    const result = await runner.trigger(automation.id);
    expect(result.status).toBe("timeout");
    expect(runner.getStatus(automation.id)).toBe("timeout");

    const errorEvent = result.traceEvents.find((e) => e.type === "error");
    expect(errorEvent).toBeDefined();
    expect((errorEvent!.data as { code: string }).code).toBe("TIMEOUT");

    const stateChanges = result.traceEvents.filter(
      (e) => e.type === "state_change",
    );
    expect(stateChanges).toHaveLength(2);
    expect((stateChanges[1]!.data as { to: string }).to).toBe("timeout");
  });
});
