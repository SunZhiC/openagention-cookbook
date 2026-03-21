# Chapter 7: Worktree Isolation

## Goal

Demonstrate the simulated WorktreeManager lifecycle: creating an isolated worktree record for a task, working in it, and marking it complete in the in-memory manager.

## Run

```bash
pnpm example:ch7
pnpm --filter @openagention/examples exec tsx src/ch07/index.ts
```

## Execution mode

**Live-capable with mock default.** By default the example uses
`MockProvider` fixtures, so no API key is required unless you set
`LIVE_API=true`. The worktree manager in this runnable example is still an
in-memory simulation.

## Expected output

A simulated worktree is created for a feature branch, the agent lists it, marks it as merged in memory, and then prints the remaining worktree state plus the basic agent-loop trace.

## API cost estimate

- **LIVE_API=false** (default): Free (uses MockProvider fixtures)
- **LIVE_API=true**: ~$0.01 per run

## Chapter link

[Chapter 7 — Worktree Isolation](../../../docs/course)
