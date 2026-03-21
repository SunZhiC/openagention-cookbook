import { describe, it, expect } from "vitest";
import { ToolRegistry } from "@openagention/runtime";
import {
  SkillLoader,
  codeReviewSkill,
  testingSkill,
  refactoringSkill,
} from "../skill-loader.js";

// ── Tests ──────────────────────────────────────────────────────────

describe("SkillLoader", () => {
  it("register and load a skill", () => {
    const loader = new SkillLoader();
    loader.register(codeReviewSkill);

    const skill = loader.load(codeReviewSkill.id);
    expect(skill.id).toBe("skill_code_review");
    expect(skill.name).toBe("Code Review");
    expect(skill.tools.length).toBe(3);
  });

  it("list returns all registered skills", () => {
    const loader = new SkillLoader();
    loader.register(codeReviewSkill);
    loader.register(testingSkill);
    loader.register(refactoringSkill);

    const skills = loader.list();
    expect(skills.length).toBe(3);
    const ids = skills.map((s) => s.id);
    expect(ids).toContain("skill_code_review");
    expect(ids).toContain("skill_testing");
    expect(ids).toContain("skill_refactoring");
  });

  it("has returns true for registered skill", () => {
    const loader = new SkillLoader();
    loader.register(codeReviewSkill);

    expect(loader.has(codeReviewSkill.id)).toBe(true);
  });

  it("has returns false for unknown skill", () => {
    const loader = new SkillLoader();

    expect(loader.has("skill_nonexistent")).toBe(false);
  });

  it("load throws for unknown skill", () => {
    const loader = new SkillLoader();

    expect(() => loader.load("skill_nonexistent")).toThrow(
      'skill "skill_nonexistent" not found',
    );
  });

  it("inject adds skill tools to ToolRegistry", () => {
    const loader = new SkillLoader();
    loader.register(codeReviewSkill);

    const registry = new ToolRegistry();
    loader.inject(codeReviewSkill.id, registry);

    const toolNames = registry.list().map((t) => t.name);
    expect(toolNames).toContain("readFile");
    expect(toolNames).toContain("analyzeCode");
    expect(toolNames).toContain("suggestFix");
    expect(toolNames.length).toBe(3);
  });

  it("inject skips tools that already exist in registry (no collision)", async () => {
    const loader = new SkillLoader();
    loader.register(codeReviewSkill);

    const registry = new ToolRegistry();
    // Pre-register a tool with the same name
    registry.register(
      {
        name: "readFile",
        description: "Pre-existing readFile tool.",
        parameters: { type: "object", properties: {}, required: [] },
      },
      async () => "pre-existing",
    );

    loader.inject(codeReviewSkill.id, registry);

    // The pre-existing tool should still be there (not overwritten)
    const result = await registry.dispatch("readFile", {});
    expect(result).toBe("pre-existing");
    // Should have 3 tools total (readFile pre-existing + analyzeCode + suggestFix)
    expect(registry.list().length).toBe(3);
  });

  it("inject throws when skill is not registered", () => {
    const loader = new SkillLoader();
    const registry = new ToolRegistry();

    expect(() => loader.inject("skill_nonexistent", registry)).toThrow(
      'skill "skill_nonexistent" not found',
    );
  });

  it("injected tool handlers return descriptive strings", async () => {
    const loader = new SkillLoader();
    loader.register(codeReviewSkill);

    const registry = new ToolRegistry();
    loader.inject(codeReviewSkill.id, registry);

    const result = await registry.dispatch("readFile", { path: "test.ts" });
    expect(result).toContain("[Code Review]");
    expect(result).toContain("readFile");
    expect(result).toContain("test.ts");
  });
});
