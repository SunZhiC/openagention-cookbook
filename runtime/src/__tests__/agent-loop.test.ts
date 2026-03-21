import { describe, it, expect } from "vitest";
import type { Message } from "@openagention/core";
import { AgentLoop } from "../agent-loop.js";
import { MockProvider } from "../mock-provider.js";
import { ToolRegistry } from "../tool-registry.js";

function makeTools(): ToolRegistry {
  const reg = new ToolRegistry();
  reg.register(
    { name: "greet", description: "Greet someone", parameters: {} },
    async (args) => `Hello, ${args["name"] as string}!`,
  );
  return reg;
}

describe("AgentLoop", () => {
  it("completes a simple conversation with no tool calls", async () => {
    const provider = new MockProvider([
      { role: "assistant", content: "Hi there!" },
    ]);
    const loop = new AgentLoop({
      maxTurns: 5,
      timeout: 5000,
      tools: makeTools(),
      provider,
    });

    const result = await loop.run([{ role: "user", content: "Hello" }]);
    // user + assistant
    expect(result.messages).toHaveLength(2);
    expect(result.messages[1]!.content).toBe("Hi there!");
  });

  it("handles tool_call → tool_result → final answer cycle", async () => {
    const provider = new MockProvider([
      {
        role: "assistant",
        content: "",
        tool_calls: [
          {
            id: "call_1",
            type: "function",
            function: { name: "greet", arguments: '{"name":"World"}' },
          },
        ],
      },
      { role: "assistant", content: "The greeting is: Hello, World!" },
    ]);

    const loop = new AgentLoop({
      maxTurns: 5,
      timeout: 5000,
      tools: makeTools(),
      provider,
    });

    const result = await loop.run([
      { role: "user", content: "Greet the world" },
    ]);
    // user + assistant(tool_call) + tool_result + assistant(final)
    expect(result.messages).toHaveLength(4);
    expect(result.messages[2]!.role).toBe("tool");
    expect(result.messages[2]!.content).toBe("Hello, World!");
    expect(result.messages[3]!.content).toBe("The greeting is: Hello, World!");
  });

  it("stops at maxTurns", async () => {
    // Provider always returns tool calls, so the loop should be bounded
    const responses: Message[] = Array.from({ length: 10 }, (_, i) => ({
      role: "assistant" as const,
      content: "",
      tool_calls: [
        {
          id: `call_${i}`,
          type: "function" as const,
          function: { name: "greet", arguments: '{"name":"Turn"}' },
        },
      ],
    }));

    const provider = new MockProvider(responses);
    const loop = new AgentLoop({
      maxTurns: 3,
      timeout: 5000,
      tools: makeTools(),
      provider,
    });

    const result = await loop.run([{ role: "user", content: "Go" }]);
    // Should have stopped after 3 turns, not exhausted all 10
    // Each turn: provider response + tool result = 2 messages per turn, plus initial user
    // 1 (user) + 3 * 2 (assistant + tool) = 7
    expect(result.messages).toHaveLength(7);
  });

  it("records trace events for each step", async () => {
    const provider = new MockProvider([
      {
        role: "assistant",
        content: "",
        tool_calls: [
          {
            id: "call_1",
            type: "function",
            function: { name: "greet", arguments: '{"name":"Test"}' },
          },
        ],
      },
      { role: "assistant", content: "Done" },
    ]);

    const loop = new AgentLoop({
      maxTurns: 5,
      timeout: 5000,
      tools: makeTools(),
      provider,
    });

    const result = await loop.run([{ role: "user", content: "Test" }]);

    const types = result.traceEvents.map((e) => e.type);
    expect(types).toContain("message");
    expect(types).toContain("tool_call");
    expect(types).toContain("tool_result");

    // At minimum: user message + assistant message + tool_call + tool_result + final assistant
    expect(result.traceEvents.length).toBeGreaterThanOrEqual(5);
  });

  it("throws and records error on timeout", async () => {
    const delayProvider: import("@openagention/core").ChatProvider = {
      async chat() {
        return new Promise((resolve) =>
          setTimeout(
            () => resolve({ role: "assistant", content: "too late" }),
            5000,
          ),
        );
      },
    };

    const loop = new AgentLoop({
      maxTurns: 5,
      timeout: 50,
      tools: makeTools(),
      provider: delayProvider,
    });

    await expect(
      loop.run([{ role: "user", content: "Hello" }]),
    ).rejects.toThrow(/timeout/i);
  });

  it("handles malformed tool_call arguments gracefully", async () => {
    const provider = new MockProvider([
      {
        role: "assistant",
        content: "",
        tool_calls: [
          {
            id: "call_bad",
            type: "function",
            function: { name: "greet", arguments: "NOT VALID JSON{{{" },
          },
        ],
      },
      { role: "assistant", content: "Recovered" },
    ]);

    const loop = new AgentLoop({
      maxTurns: 5,
      timeout: 5000,
      tools: makeTools(),
      provider,
    });

    const result = await loop.run([{ role: "user", content: "Go" }]);

    const toolCall = result.traceEvents.find((e) => e.type === "tool_call");
    expect(toolCall).toBeDefined();
    expect((toolCall!.data as { toolName: string }).toolName).toBe("greet");

    const toolResult = result.traceEvents.find((e) => e.type === "tool_result");
    expect(toolResult).toBeDefined();
    expect((toolResult!.data as { isError: boolean }).isError).toBe(true);
    expect((toolResult!.data as { result: string }).result).toContain(
      "Malformed tool arguments",
    );

    expect(result.messages.at(-1)!.content).toBe("Recovered");
  });

  it("handles empty response content", async () => {
    const provider = new MockProvider([{ role: "assistant", content: "" }]);

    const loop = new AgentLoop({
      maxTurns: 5,
      timeout: 5000,
      tools: makeTools(),
      provider,
    });

    const result = await loop.run([{ role: "user", content: "Hello" }]);
    // Empty content with no tool_calls should end the loop normally
    expect(result.messages).toHaveLength(2);
    expect(result.messages[1]!.content).toBe("");
  });

  it("MockProvider throws when fixtures are exhausted", async () => {
    const provider = new MockProvider([
      { role: "assistant", content: "Only one" },
    ]);

    // First call succeeds
    const loop = new AgentLoop({
      maxTurns: 5,
      timeout: 5000,
      tools: makeTools(),
      provider,
    });
    await loop.run([{ role: "user", content: "Hello" }]);

    // Second call should fail because the provider is exhausted
    // (cursor is now past the end)
    await expect(
      loop.run([{ role: "user", content: "Again" }]),
    ).rejects.toThrow(/MockProvider exhausted/);
  });

  it("handles non-Error throw from provider and records string message", async () => {
    const throwProvider: import("@openagention/core").ChatProvider = {
      async chat() {
        throw "raw string error from provider";
      },
    };

    const loop = new AgentLoop({
      maxTurns: 5,
      timeout: 5000,
      tools: makeTools(),
      provider: throwProvider,
    });

    await expect(loop.run([{ role: "user", content: "Hello" }])).rejects.toBe(
      "raw string error from provider",
    );
  });

  it("records error trace event when tool dispatch fails", async () => {
    const tools = new ToolRegistry();
    // Register nothing — any tool call will fail

    const provider = new MockProvider([
      {
        role: "assistant",
        content: "",
        tool_calls: [
          {
            id: "call_1",
            type: "function",
            function: { name: "missing", arguments: "{}" },
          },
        ],
      },
      { role: "assistant", content: "The tool failed." },
    ]);

    const loop = new AgentLoop({
      maxTurns: 5,
      timeout: 5000,
      tools,
      provider,
    });

    const result = await loop.run([{ role: "user", content: "Try" }]);

    // The tool result should contain the error message
    const toolResults = result.traceEvents.filter(
      (e) => e.type === "tool_result",
    );
    expect(toolResults).toHaveLength(1);
    expect((toolResults[0]!.data as { isError: boolean }).isError).toBe(true);
  });
});
