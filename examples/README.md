# OpenAgention Examples

Runnable examples for all 16 chapters of the OpenAgention course.

## Quick Start

```bash
# From the repo root
pnpm install

# Run any chapter example
pnpm --filter @openagention/examples exec tsx src/ch01/index.ts
```

By default, examples use **MockProvider** (no API key needed). To use a live LLM:

```bash
LIVE_API=true OPENAI_API_KEY=sk-... pnpm --filter @openagention/examples exec tsx src/ch01/index.ts
```

## Examples

| Ch  | Title                  | Concepts                                     | Run                         |
| --- | ---------------------- | -------------------------------------------- | --------------------------- |
| 01  | Minimal Coding Loop    | Agent loop, readFile tool, trace events      | `npx tsx src/ch01/index.ts` |
| 02  | Tool Registry          | Multiple tools, readFile/writeFile/listFiles | `npx tsx src/ch02/index.ts` |
| 03  | Planner                | Multi-step plans, Task state transitions     | `npx tsx src/ch03/index.ts` |
| 04  | Memory                 | Context window, summarization, checkpoints   | `npx tsx src/ch04/index.ts` |
| 05  | Safe File Editing      | Patch engine, unified diffs, verification    | `pnpm example:ch5`          |
| 06  | Approvals & Sandboxing | ApprovalPolicy, tool denial, fallback        | `pnpm example:ch6`          |
| 07  | Worktree Isolation     | WorktreeManager, branch isolation, lifecycle | `pnpm example:ch7`          |
| 08  | Execution Lanes        | Local/worktree/cloud modes, lane events      | `pnpm example:ch8`          |
| 09  | Supervisor-Worker      | Multi-agent, task decomposition, dispatch    | `npx tsx src/ch09/index.ts` |
| 10  | DAG Scheduling         | Dependency graph, parallel batches, ordering | `npx tsx src/ch10/index.ts` |
| 11  | Review Queue           | State machine, approve/reject/revise         | `npx tsx src/ch11/index.ts` |
| 12  | Handoff & Continuation | Checkpoints, agent handoff, context transfer | `npx tsx src/ch12/index.ts` |
| 13  | Skills                 | SkillLoader, tool injection, code review     | `npx tsx src/ch13/index.ts` |
| 14  | Automations            | Triggers, AutomationRunner, test coverage    | `npx tsx src/ch14/index.ts` |
| 15  | Assembly (Capstone)    | Full pipeline, supervisor+scheduler+review   | `npx tsx src/ch15/index.ts` |
| 16  | Observability          | 7 failure modes, error recovery, tracing     | `npx tsx src/ch16/index.ts` |

## LIVE_API mode

When `LIVE_API=true`, examples call the OpenAI API. Estimated cost per run is $0.01-0.05 depending on chapter complexity. When `LIVE_API` is unset or false (default), examples replay pre-recorded mock responses at zero cost.
