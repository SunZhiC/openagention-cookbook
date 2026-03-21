import { describe, it, expect } from "vitest";
import type { Message } from "@openagention/core";

import { MockProvider } from "../mock-provider.js";

describe("MockProvider", () => {
  it("replays responses from the beginning after reset()", async () => {
    const responses: Message[] = [
      { role: "assistant", content: "first" },
      { role: "assistant", content: "second" },
    ];

    const provider = new MockProvider(responses);

    expect(await provider.chat([], [])).toEqual(responses[0]);
    expect(await provider.chat([], [])).toEqual(responses[1]);

    provider.reset();

    expect(await provider.chat([], [])).toEqual(responses[0]);
  });
});
