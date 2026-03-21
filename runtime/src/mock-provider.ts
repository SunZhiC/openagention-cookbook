import type { Message, ToolDefinition, ChatProvider } from "@openagention/core";

/**
 * A mock ChatProvider that returns pre-recorded responses in order.
 * Used for testing and offline example runs.
 */
export class MockProvider implements ChatProvider {
  private responses: Message[];
  private cursor = 0;

  constructor(responses: Message[]) {
    this.responses = responses;
  }

  async chat(_messages: Message[], _tools: ToolDefinition[]): Promise<Message> {
    if (this.cursor >= this.responses.length) {
      throw new Error(
        `MockProvider exhausted: no response at index ${this.cursor}`,
      );
    }
    const response = this.responses[this.cursor]!;
    this.cursor++;
    return response;
  }

  /** Reset the cursor so the fixture can be replayed. */
  reset(): void {
    this.cursor = 0;
  }
}
