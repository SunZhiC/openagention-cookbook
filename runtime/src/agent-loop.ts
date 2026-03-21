import type { Message, ChatProvider, TraceEvent } from "@openagention/core";
import type { ToolRegistry } from "./tool-registry.js";

export interface AgentLoopConfig {
  maxTurns: number;
  timeout: number;
  tools: ToolRegistry;
  model?: string;
  provider: ChatProvider;
}

export interface AgentLoopResult {
  messages: Message[];
  traceEvents: TraceEvent[];
}

let _nextEventId = 1;
function eventId(): string {
  return `evt_${String(_nextEventId++).padStart(4, "0")}`;
}

/**
 * Core agent loop: send messages to LLM, dispatch tool calls, repeat.
 */
export class AgentLoop {
  private config: AgentLoopConfig;

  constructor(config: AgentLoopConfig) {
    this.config = config;
  }

  async run(messages: Message[]): Promise<AgentLoopResult> {
    const traceEvents: TraceEvent[] = [];
    const conversation = [...messages];

    // Record initial user messages
    for (const msg of messages) {
      traceEvents.push({
        id: eventId(),
        timestamp: new Date().toISOString(),
        type: "message",
        data: { role: msg.role, content: msg.content },
      });
    }

    for (let turn = 0; turn < this.config.maxTurns; turn++) {
      // Call the provider with a timeout
      let response: Message;
      let timeoutId: ReturnType<typeof setTimeout> | undefined;
      try {
        response = await Promise.race([
          this.config.provider.chat(conversation, this.config.tools.list()),
          new Promise<never>(
            (_, reject) =>
              (timeoutId = setTimeout(
                () => reject(new Error("Agent loop timeout")),
                this.config.timeout,
              )),
          ),
        ]);
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        traceEvents.push({
          id: eventId(),
          timestamp: new Date().toISOString(),
          type: "error",
          data: { code: "PROVIDER_ERROR", message: errorMsg },
        });
        throw err;
      } finally {
        if (timeoutId) clearTimeout(timeoutId);
      }

      // Record assistant message
      conversation.push(response);
      traceEvents.push({
        id: eventId(),
        timestamp: new Date().toISOString(),
        type: "message",
        data: { role: response.role, content: response.content },
      });

      // If no tool calls, we're done
      if (!response.tool_calls || response.tool_calls.length === 0) {
        break;
      }

      // Dispatch each tool call
      for (const tc of response.tool_calls) {
        let parsedArgs: Record<string, unknown>;
        try {
          parsedArgs = JSON.parse(tc.function.arguments) as Record<
            string,
            unknown
          >;
        } catch {
          // Malformed tool JSON — record error and continue
          traceEvents.push({
            id: eventId(),
            timestamp: new Date().toISOString(),
            type: "tool_call",
            data: {
              toolName: tc.function.name,
              arguments: {},
              callId: tc.id,
            },
          });

          const errorMsg = `Malformed tool arguments: ${tc.function.arguments}`;
          traceEvents.push({
            id: eventId(),
            timestamp: new Date().toISOString(),
            type: "tool_result",
            data: { callId: tc.id, result: errorMsg, isError: true },
          });

          conversation.push({
            role: "tool",
            content: errorMsg,
            tool_call_id: tc.id,
          });
          continue;
        }

        traceEvents.push({
          id: eventId(),
          timestamp: new Date().toISOString(),
          type: "tool_call",
          data: {
            toolName: tc.function.name,
            arguments: parsedArgs,
            callId: tc.id,
          },
        });

        let result: string;
        let isError = false;
        try {
          result = await this.config.tools.dispatch(
            tc.function.name,
            parsedArgs,
          );
        } catch (err) {
          result = err instanceof Error ? err.message : String(err);
          isError = true;
        }

        traceEvents.push({
          id: eventId(),
          timestamp: new Date().toISOString(),
          type: "tool_result",
          data: { callId: tc.id, result, isError },
        });

        conversation.push({
          role: "tool",
          content: result,
          tool_call_id: tc.id,
        });
      }
    }

    return { messages: conversation, traceEvents };
  }
}
