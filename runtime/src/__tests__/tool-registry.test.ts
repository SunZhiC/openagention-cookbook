import { describe, it, expect } from "vitest";
import { ToolRegistry } from "../tool-registry.js";

function makeRegistry(): ToolRegistry {
  const reg = new ToolRegistry();
  reg.register(
    { name: "echo", description: "Echo input", parameters: {} },
    async (args) => `echo: ${args["msg"] as string}`,
  );
  reg.register(
    { name: "add", description: "Add two numbers", parameters: {} },
    async (args) => String((args["a"] as number) + (args["b"] as number)),
  );
  return reg;
}

describe("ToolRegistry", () => {
  it("register + dispatch returns correct result", async () => {
    const reg = makeRegistry();
    const result = await reg.dispatch("echo", { msg: "hello" });
    expect(result).toBe("echo: hello");
  });

  it("dispatch with different tool", async () => {
    const reg = makeRegistry();
    const result = await reg.dispatch("add", { a: 2, b: 3 });
    expect(result).toBe("5");
  });

  it("throws on unknown tool", async () => {
    const reg = makeRegistry();
    await expect(reg.dispatch("unknown", {})).rejects.toThrow("Unknown tool: unknown");
  });

  it("list returns all registered tool definitions", () => {
    const reg = makeRegistry();
    const tools = reg.list();
    expect(tools).toHaveLength(2);
    expect(tools.map((t) => t.name).sort()).toEqual(["add", "echo"]);
  });

  it("has returns true for registered tools", () => {
    const reg = makeRegistry();
    expect(reg.has("echo")).toBe(true);
    expect(reg.has("add")).toBe(true);
  });

  it("has returns false for unregistered tools", () => {
    const reg = makeRegistry();
    expect(reg.has("missing")).toBe(false);
  });
});
