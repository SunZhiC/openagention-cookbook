# Chapter 5: Safe File Editing

## Goal

Demonstrate patch-based file editing: the agent reads a file, generates a unified diff to fix a bug, applies the patch with PatchEngine, then verifies the result.

## Run

```bash
pnpm example:ch5
pnpm --filter @openagention/examples exec tsx src/ch05/index.ts
```

## Execution mode

**Live-capable with mock default.** By default the example uses
`MockProvider` fixtures, so no API key is required unless you set
`LIVE_API=true`.

## Expected output

The agent reads `src/math.ts`, applies a unified diff through `applyPatch`, verifies the updated file contents, and prints the base `AgentLoop` trace event types.

## API cost estimate

- **LIVE_API=false** (default): Free (uses MockProvider fixtures)
- **LIVE_API=true**: ~$0.01 per run

## Chapter link

[Chapter 5 — Safe File Editing](../../../docs/course)
