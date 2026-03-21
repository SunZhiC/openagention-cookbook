# Chapter 1: Minimal Coding Loop

## Goal

Demonstrate the minimal `AgentLoop`: a user request enters the loop, the
model calls `readFile` twice, and the final assistant message summarizes the
project structure.

## Run

```bash
pnpm example:ch1
pnpm --filter @openagention/examples exec tsx src/ch01/index.ts
```

## Execution mode

**Live-capable with mock default.** By default the example uses
`MockProvider` fixtures, so no API key is required unless you set
`LIVE_API=true`.

## Expected output

The example prints the user prompt, two `readFile` tool calls with matching
tool results, a final assistant summary, and the raw `message` /
`tool_call` / `tool_result` trace event list.

## Chapter link

[Chapter 1 — Minimal Coding Loop](../../../docs/course)
