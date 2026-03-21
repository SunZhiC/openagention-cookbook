# Chapter 6: Approvals and Sandboxing

## Goal

Demonstrate how an ApprovalPolicy gates tool calls. The agent tries to execute a shell command, the policy denies it, and the agent falls back to a safe read-only approach. This example demonstrates policy gating and restricted tool access, not a security-grade sandbox.

## Run

```bash
pnpm example:ch6
pnpm --filter @openagention/examples exec tsx src/ch06/index.ts
```

## Execution mode

**Live-capable with mock default.** By default the example uses
`MockProvider` fixtures, so no API key is required unless you set
`LIVE_API=true`. This demo shows policy gating and restricted tool access,
not a security-grade sandbox.

## Expected output

The agent attempts a shell command, prints a `[policy] DENIED ...` log, falls back to reading files, and shows the standard `message` / `tool_call` / `tool_result` trace events.

## API cost estimate

- **LIVE_API=false** (default): Free (uses MockProvider fixtures)
- **LIVE_API=true**: ~$0.01 per run

## Chapter link

[Chapter 6 — Approvals and Sandboxing](../../../docs/course)
