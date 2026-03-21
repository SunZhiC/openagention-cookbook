import type { ToolDefinition } from "@openagention/core";

/** Handler function for a registered tool. */
export type ToolHandler = (args: Record<string, unknown>) => Promise<string>;

/**
 * Registry that maps tool definitions to their handler functions.
 * Provides type-safe registration and dispatch.
 */
export class ToolRegistry {
  private definitions = new Map<string, ToolDefinition>();
  private handlers = new Map<string, ToolHandler>();

  /** Register a tool definition together with its handler. */
  register(definition: ToolDefinition, handler: ToolHandler): void {
    this.definitions.set(definition.name, definition);
    this.handlers.set(definition.name, handler);
  }

  /** Dispatch a call to a registered tool by name. */
  async dispatch(name: string, args: Record<string, unknown>): Promise<string> {
    const handler = this.handlers.get(name);
    if (!handler) {
      throw new Error(`Unknown tool: ${name}`);
    }
    return handler(args);
  }

  /** Return all registered tool definitions. */
  list(): ToolDefinition[] {
    return [...this.definitions.values()];
  }

  /** Check whether a tool is registered. */
  has(name: string): boolean {
    return this.definitions.has(name);
  }
}
