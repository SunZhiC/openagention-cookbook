/**
 * Chapter 15 — MCP Protocol
 *
 * Demonstrates MCP discovery and registration flow:
 *   - Connects to mock MCP servers over stdio/http transports
 *   - Discovers remote tool metadata
 *   - Bridges discovered tools into ToolRegistry
 *   - Dispatches MCP-backed tools through the same registry API
 */
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { Message } from "@openagention/core";
import { MockProvider, ToolRegistry } from "@openagention/runtime";

const __dirname = dirname(fileURLToPath(import.meta.url));

function loadFixtures(): Message[] {
  const raw = readFileSync(
    join(__dirname, "__fixtures__", "responses.json"),
    "utf-8",
  );
  return JSON.parse(raw) as Message[];
}

interface McpTool {
  name: string;
  description: string;
  inputSchema: {
    type: "object";
    properties: Record<string, unknown>;
    required?: string[];
  };
}

interface McpServerConfig {
  name: string;
  transport: "stdio" | "http";
  command?: string;
  args?: string[];
  url?: string;
  env?: Record<string, string>;
}

interface MockMcpServer {
  initialize(): Promise<void>;
  listTools(): Promise<McpTool[]>;
  callTool(name: string, args: Record<string, unknown>): Promise<unknown>;
  close(): Promise<void>;
}

class InMemoryMcpServer implements MockMcpServer {
  constructor(
    private tools: McpTool[],
    private handlers: Record<
      string,
      (args: Record<string, unknown>) => Promise<unknown> | unknown
    >,
  ) {}

  async initialize(): Promise<void> {
    return;
  }

  async listTools(): Promise<McpTool[]> {
    return this.tools;
  }

  async callTool(
    name: string,
    args: Record<string, unknown>,
  ): Promise<unknown> {
    const handler = this.handlers[name];
    if (!handler) {
      throw new Error(`Unknown MCP tool: ${name}`);
    }
    return handler(args);
  }

  async close(): Promise<void> {
    return;
  }
}

class McpClient {
  private tools: McpTool[] = [];

  constructor(
    private config: McpServerConfig,
    private server: MockMcpServer,
  ) {}

  async connect(): Promise<void> {
    await this.server.initialize();
    console.log(
      JSON.stringify({
        event: "mcp_connected",
        server: this.config.name,
        transport: this.config.transport,
      }),
    );
  }

  async discoverTools(): Promise<McpTool[]> {
    this.tools = await this.server.listTools();
    console.log(
      JSON.stringify({
        event: "mcp_tools_discovered",
        server: this.config.name,
        toolCount: this.tools.length,
        tools: this.tools.map((tool) => tool.name),
      }),
    );
    return this.tools;
  }

  async callTool(
    name: string,
    args: Record<string, unknown>,
  ): Promise<unknown> {
    return this.server.callTool(name, args);
  }

  get name(): string {
    return this.config.name;
  }

  async disconnect(): Promise<void> {
    await this.server.close();
  }
}

async function registerMcpTools(
  client: McpClient,
  registry: ToolRegistry,
): Promise<void> {
  const tools = await client.discoverTools();

  for (const tool of tools) {
    registry.register(
      {
        name: tool.name,
        description: tool.description,
        parameters: tool.inputSchema,
      },
      async (args) => {
        const result = await client.callTool(tool.name, args);
        return typeof result === "string" ? result : JSON.stringify(result);
      },
    );
  }

  console.log(
    JSON.stringify({
      event: "mcp_tools_registered",
      server: client.name,
      count: tools.length,
    }),
  );
}

interface McpManifest {
  mcpServers: Record<string, McpServerConfig>;
}

function expandEnvVars(config: McpServerConfig): McpServerConfig {
  const expanded = { ...config, env: { ...config.env } };

  for (const [key, value] of Object.entries(expanded.env ?? {})) {
    if (
      typeof value === "string" &&
      value.startsWith("${") &&
      value.endsWith("}")
    ) {
      const envName = value.slice(2, -1);
      expanded.env![key] = process.env[envName] ?? "";
    }
  }

  return expanded;
}

async function connectAllServers(
  manifest: McpManifest,
  registry: ToolRegistry,
  servers: Record<string, MockMcpServer>,
): Promise<McpClient[]> {
  const clients: McpClient[] = [];

  for (const [serverId, config] of Object.entries(manifest.mcpServers)) {
    const expandedConfig = expandEnvVars(config);
    const server = servers[serverId];
    if (!server) {
      throw new Error(`Missing mock server for ${serverId}`);
    }

    const client = new McpClient(expandedConfig, server);
    await client.connect();
    await registerMcpTools(client, registry);
    clients.push(client);

    console.log(
      JSON.stringify({
        event: "mcp_server_ready",
        serverId,
        transport: expandedConfig.transport,
      }),
    );
  }

  return clients;
}

async function main() {
  console.log("═══ Chapter 15: MCP Protocol ═══\n");

  const registry = new ToolRegistry();
  const manifest: McpManifest = {
    mcpServers: {
      filesystem: {
        name: "filesystem",
        transport: "stdio",
        command: "npx",
        args: ["-y", "@modelcontextprotocol/server-filesystem", "/workspace"],
      },
      github: {
        name: "github",
        transport: "http",
        url: "https://example.com/mcp/github",
        env: { GITHUB_TOKEN: "${GITHUB_TOKEN}" },
      },
    },
  };

  const servers: Record<string, MockMcpServer> = {
    filesystem: new InMemoryMcpServer(
      [
        {
          name: "search_codebase",
          description: "Search source files for a symbol or text fragment.",
          inputSchema: {
            type: "object",
            properties: {
              query: { type: "string" },
            },
            required: ["query"],
          },
        },
        {
          name: "run_linter",
          description: "Run the lint command for a target path.",
          inputSchema: {
            type: "object",
            properties: {
              target: { type: "string" },
            },
            required: ["target"],
          },
        },
      ],
      {
        search_codebase: ({ query }) =>
          `Found 3 matches for "${String(query)}" in src/mcp-client.ts`,
        run_linter: ({ target }) =>
          `Lint passed for ${String(target)} with 0 warnings`,
      },
    ),
    github: new InMemoryMcpServer(
      [
        {
          name: "create_pr",
          description: "Create a draft pull request from the current branch.",
          inputSchema: {
            type: "object",
            properties: {
              title: { type: "string" },
            },
            required: ["title"],
          },
        },
      ],
      {
        create_pr: ({ title }) => ({
          url: "https://github.com/openagention/openagention/pull/123",
          title,
          state: "draft",
        }),
      },
    ),
  };

  const clients = await connectAllServers(manifest, registry, servers);

  console.log("\n── Registered tools ──");
  console.log(
    `  ${registry
      .list()
      .map((tool) => tool.name)
      .join(", ")}`,
  );

  console.log("\n── Tool dispatch ──");
  const searchResult = await registry.dispatch("search_codebase", {
    query: "McpClient",
  });
  console.log(`  search_codebase -> ${searchResult}`);

  const lintResult = await registry.dispatch("run_linter", {
    target: "src/mcp-client.ts",
  });
  console.log(`  run_linter -> ${lintResult}`);

  const prResult = await registry.dispatch("create_pr", {
    title: "feat: add MCP bridge",
  });
  console.log(`  create_pr -> ${prResult}`);

  const provider = new MockProvider(loadFixtures());
  const summary = await provider.chat(
    [{ role: "user", content: "Summarize the MCP setup." }],
    registry.list(),
  );

  console.log("\n── Summary ──");
  console.log(`  ${summary.content}`);

  for (const client of clients) {
    await client.disconnect();
  }

  console.log("\n═══ Done ═══");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
