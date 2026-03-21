# Chapter 13: Skills

## Goal

Demonstrate skill registration and injection by loading bundled skills into a
`SkillLoader`, injecting the code-review tools into a `ToolRegistry`, and then
running the agent with those tools.

## Run

```bash
pnpm example:ch13
pnpm --filter @openagention/examples exec tsx src/ch13/index.ts
```

## Execution mode

**Mock-only.** This chapter uses fixture-backed `MockProvider` responses and
has no live provider branch. Skills are bundled and injected in-process; they
are not a sandbox boundary or a remote skill marketplace.

## Expected output

The example registers three skills, injects the code-review tools, runs
`readFile`, `analyzeCode`, and `suggestFix`, and prints the final review
summary.

## Chapter link

[Chapter 13 — Skills](../../../docs/course)
