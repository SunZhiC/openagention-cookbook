# Chapter 4: Memory

## Goal

Demonstrate context growth, in-memory summarization, and checkpoint creation
inside a long-running agent session.

## Run

```bash
pnpm example:ch4
pnpm --filter @openagention/examples exec tsx src/ch04/index.ts
```

## Execution mode

**Live-capable with mock default.** By default the example uses
`MockProvider` fixtures, so no API key is required unless you set
`LIVE_API=true`. The checkpoint demo keeps summaries and checkpoints
in-process; it is not full persistence or filesystem restore.

## Expected output

The example reads two files, prints token-growth estimates, runs
`summarizeContext`, creates one checkpoint, prints the saved summary, and
reports the generic agent-loop trace count.

## Chapter link

[Chapter 4 — Memory, Summaries, and Context Control](../../../docs/course)
