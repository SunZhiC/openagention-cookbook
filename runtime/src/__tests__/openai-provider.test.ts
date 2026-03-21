import type { Message, ToolDefinition } from "@openagention/core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { createCompletion, openAIConstructor } = vi.hoisted(() => ({
  createCompletion: vi.fn(),
  openAIConstructor: vi.fn(),
}));

(vi.mock as (...args: unknown[]) => void)(
  "openai",
  () => {
    class OpenAI {
      chat = {
        completions: {
          create: createCompletion,
        },
      };

      constructor(config: { apiKey: string }) {
        openAIConstructor(config);
      }
    }

    return { default: OpenAI };
  },
  { virtual: true },
);

import { OpenAIProvider } from "../openai-provider.js";

describe("OpenAIProvider", () => {
  beforeEach(() => {
    createCompletion.mockReset();
    openAIConstructor.mockReset();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("throws when OPENAI_API_KEY is missing", async () => {
    const provider = new OpenAIProvider();

    await expect(provider.chat([], [])).rejects.toThrow(
      "OPENAI_API_KEY environment variable is not set",
    );
    expect(createCompletion).not.toHaveBeenCalled();
  });

  it("maps messages and tools into OpenAI chat completions", async () => {
    vi.stubEnv("OPENAI_API_KEY", "test-key");
    createCompletion.mockResolvedValue({
      choices: [
        {
          message: {
            content: "Use the result from the tool.",
            tool_calls: [
              {
                id: "call_1",
                type: "function",
                function: {
                  name: "lookupFile",
                  arguments: '{"path":"src/app.ts"}',
                },
              },
              {
                id: "call_ignored",
                type: "computer_use_preview",
              },
            ],
          },
        },
      ],
    });

    const provider = new OpenAIProvider("gpt-test");
    const messages: Message[] = [
      { role: "system", content: "You are a coding assistant." },
      { role: "user", content: "Inspect the app entrypoint." },
      {
        role: "assistant",
        content: "Calling lookupFile",
        tool_calls: [
          {
            id: "call_local",
            type: "function",
            function: {
              name: "lookupFile",
              arguments: '{"path":"src/main.ts"}',
            },
          },
        ],
      },
      {
        role: "tool",
        content: "console.log('hello');",
      },
    ];
    const tools: ToolDefinition[] = [
      {
        name: "lookupFile",
        description: "Read a source file",
        parameters: {
          type: "object",
          properties: {
            path: { type: "string" },
          },
          required: ["path"],
        },
      },
    ];

    const result = await provider.chat(messages, tools);

    expect(openAIConstructor).toHaveBeenCalledWith({ apiKey: "test-key" });
    expect(createCompletion).toHaveBeenCalledWith({
      model: "gpt-test",
      messages: [
        { role: "system", content: "You are a coding assistant." },
        { role: "user", content: "Inspect the app entrypoint." },
        {
          role: "assistant",
          content: "Calling lookupFile",
          tool_calls: [
            {
              id: "call_local",
              type: "function",
              function: {
                name: "lookupFile",
                arguments: '{"path":"src/main.ts"}',
              },
            },
          ],
        },
        {
          role: "tool",
          content: "console.log('hello');",
          tool_call_id: "",
        },
      ],
      tools: [
        {
          type: "function",
          function: {
            name: "lookupFile",
            description: "Read a source file",
            parameters: tools[0]!.parameters,
          },
        },
      ],
    });
    expect(result).toEqual({
      role: "assistant",
      content: "Use the result from the tool.",
      tool_calls: [
        {
          id: "call_1",
          type: "function",
          function: {
            name: "lookupFile",
            arguments: '{"path":"src/app.ts"}',
          },
        },
      ],
    });
  });

  it("omits the tools payload when no tools are registered", async () => {
    vi.stubEnv("OPENAI_API_KEY", "test-key");
    createCompletion.mockResolvedValue({
      choices: [{ message: { content: null } }],
    });

    const provider = new OpenAIProvider();
    const result = await provider.chat(
      [{ role: "user", content: "Reply without tools." }],
      [],
    );

    expect(createCompletion).toHaveBeenCalledWith(
      expect.objectContaining({
        tools: undefined,
      }),
    );
    expect(result).toEqual({
      role: "assistant",
      content: "",
      tool_calls: undefined,
    });
  });

  it("throws when OpenAI returns no choices", async () => {
    vi.stubEnv("OPENAI_API_KEY", "test-key");
    createCompletion.mockResolvedValue({ choices: [] });

    const provider = new OpenAIProvider();

    await expect(
      provider.chat([{ role: "user", content: "hello" }], []),
    ).rejects.toThrow("Empty response from OpenAI");
  });
});
