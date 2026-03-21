# Chapter 15: MCP Protocol

## Goal

Demonstrate mock MCP server discovery and registration by bridging remote tool
definitions into the local `ToolRegistry`.

## Run

```bash
pnpm example:ch15
pnpm --filter @openagention/examples exec tsx src/ch15/index.ts
```

## Execution mode

**Mock-only.** This chapter uses fixture-backed `MockProvider` responses and
has no live provider branch. The MCP servers are in-memory teaching doubles,
not real stdio/HTTP transports or a security boundary.

## Expected output

The example logs `mcp_connected`, `mcp_tools_discovered`,
`mcp_tools_registered`, and `mcp_server_ready`, then dispatches
`search_codebase`, `run_linter`, and `create_pr` before printing a final MCP
setup summary.

## Chapter link

[Chapter 15 — MCP Protocol](../../../docs/course)
