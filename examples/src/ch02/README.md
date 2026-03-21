# Chapter 2: Tool Registry

## Goal

Demonstrate a `ToolRegistry` with `listFiles`, `readFile`, and `writeFile`,
then run the agent loop against those registered handlers.

## Run

```bash
pnpm example:ch2
pnpm --filter @openagention/examples exec tsx src/ch02/index.ts
```

## Execution mode

**Live-capable with mock default.** By default the example uses
`MockProvider` fixtures, so no API key is required unless you set
`LIVE_API=true`.

## Expected output

The example lists the simulated `src` directory, reads a source file, writes
`src/helpers.ts`, prints the final in-memory file system, and reports the
generic agent-loop trace count.

## Chapter link

[Chapter 2 — Tool Registry](../../../docs/course)
