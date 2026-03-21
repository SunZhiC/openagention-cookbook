# Chapter 3: Planner

## Goal

Demonstrate a planning pass that creates tasks with `createPlan`, then
executes each step with `executeStep` while printing task-state progress.

## Run

```bash
pnpm example:ch3
pnpm --filter @openagention/examples exec tsx src/ch03/index.ts
```

## Execution mode

**Live-capable with mock default.** By default the example uses
`MockProvider` fixtures, so no API key is required unless you set
`LIVE_API=true`.

## Expected output

The planner creates four tasks, the example prints each `pending -> running ->
done` transition to stdout, and the final output includes the task summary plus
the generic `AgentLoop` trace count.

## Chapter link

[Chapter 3 — Planner and Task Graph](../../../docs/course)
