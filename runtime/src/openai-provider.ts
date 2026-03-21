import type { Message, ToolDefinition, ChatProvider } from "@openagention/core";

/**
 * ChatProvider backed by the OpenAI SDK.
 *
 * `openai` is a **peer dependency** — the consuming project must install it.
 */
export class OpenAIProvider implements ChatProvider {
  private model: string;

  constructor(model = "gpt-4o") {
    this.model = model;
  }

  async chat(messages: Message[], tools: ToolDefinition[]): Promise<Message> {
    // Dynamic import so we only fail if actually called without the dep
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { default: OpenAI } = await import("openai");

    const apiKey = process.env["OPENAI_API_KEY"];
    if (!apiKey) {
      throw new Error("OPENAI_API_KEY environment variable is not set");
    }

    const client = new OpenAI({ apiKey });

    const openaiTools = tools.map((t) => ({
      type: "function" as const,
      function: {
        name: t.name,
        description: t.description,
        parameters: t.parameters as Record<string, unknown>,
      },
    }));

    const response = await client.chat.completions.create({
      model: this.model,
      messages: messages.map((m) => {
        if (m.role === "tool") {
          return {
            role: "tool" as const,
            content: m.content,
            tool_call_id: m.tool_call_id ?? "",
          };
        }
        if (m.role === "assistant" && m.tool_calls) {
          return {
            role: "assistant" as const,
            content: m.content,
            tool_calls: m.tool_calls.map((tc) => ({
              id: tc.id,
              type: "function" as const,
              function: {
                name: tc.function.name,
                arguments: tc.function.arguments,
              },
            })),
          };
        }
        return { role: m.role, content: m.content };
      }),
      tools: openaiTools.length > 0 ? openaiTools : undefined,
    });

    const choice = response.choices[0];
    if (!choice) {
      throw new Error("Empty response from OpenAI");
    }

    const msg = choice.message;
    return {
      role: "assistant",
      content: msg.content ?? "",
      tool_calls: msg.tool_calls
        ?.filter(
          (tc): tc is Extract<typeof tc, { function: unknown }> =>
            "function" in tc,
        )
        .map((tc) => ({
          id: tc.id,
          type: "function" as const,
          function: {
            name: tc.function.name,
            arguments: tc.function.arguments,
          },
        })),
    };
  }
}
