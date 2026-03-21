# Chapter 8: Execution Lanes

## Goal

Demonstrate the three execution lane modes (local, worktree, and `cloud`) by running the same task in each. In this runnable example, the `cloud` lane is only a higher-isolation simulation in the same process model, not a subprocess or security boundary.

## Run

```bash
pnpm example:ch8
pnpm --filter @openagention/examples exec tsx src/ch08/index.ts
```

## Execution mode

**Live-capable with mock default.** By default the example uses
`MockProvider` fixtures, so no API key is required unless you set
`LIVE_API=true`. The `cloud` lane here is an in-process higher-isolation
simulation, not a subprocess or security boundary.

## Expected output

The same read-only task runs in local, worktree, and cloud lanes. Each lane reports lane-specific `state_change` transitions plus the base agent-loop trace count.

## API cost estimate

- **LIVE_API=false** (default): Free (uses MockProvider fixtures)
- **LIVE_API=true**: ~$0.01-0.02 per run

## Chapter link

[Chapter 8 — Execution Lanes](../../../docs/course)
