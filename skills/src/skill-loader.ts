/**
 * SkillLoader — Registry and injection of skill definitions.
 *
 * A Skill bundles related tool definitions under a single identity.
 * The SkillLoader manages registration, lookup, and injection of
 * a skill's tools into a ToolRegistry for agent use.
 */

import type { Skill, ToolDefinition } from "@openagention/core";
import type { ToolRegistry } from "@openagention/runtime";

// ── Built-in sample skills ────────────────────────────────────────────

/** Code review skill — tools for reading, analysing, and suggesting fixes. */
export const codeReviewSkill: Skill = {
  id: "skill_code_review",
  name: "Code Review",
  description:
    "Tools for reviewing code: read files, analyse quality, suggest fixes.",
  tools: [
    {
      name: "readFile",
      description: "Read the contents of a source file for review.",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string", description: "File path to read." },
        },
        required: ["path"],
      },
    },
    {
      name: "analyzeCode",
      description: "Analyse code quality and report issues.",
      parameters: {
        type: "object",
        properties: {
          code: { type: "string", description: "Source code to analyse." },
          language: { type: "string", description: "Programming language." },
        },
        required: ["code"],
      },
    },
    {
      name: "suggestFix",
      description: "Suggest a fix for a detected code issue.",
      parameters: {
        type: "object",
        properties: {
          issue: { type: "string", description: "Description of the issue." },
          code: {
            type: "string",
            description: "Original code with the issue.",
          },
        },
        required: ["issue", "code"],
      },
    },
  ],
};

/** Testing skill — tools for running tests, generating cases, checking coverage. */
export const testingSkill: Skill = {
  id: "skill_testing",
  name: "Testing",
  description:
    "Tools for automated testing: run tests, generate cases, check coverage.",
  tools: [
    {
      name: "runTests",
      description: "Run the test suite and return results.",
      parameters: {
        type: "object",
        properties: {
          testPattern: {
            type: "string",
            description: "Glob pattern for test files.",
          },
        },
        required: ["testPattern"],
      },
    },
    {
      name: "generateTestCase",
      description: "Generate a test case for a given function.",
      parameters: {
        type: "object",
        properties: {
          functionName: {
            type: "string",
            description: "Name of the function to test.",
          },
          code: { type: "string", description: "Source code of the function." },
        },
        required: ["functionName", "code"],
      },
    },
    {
      name: "checkCoverage",
      description: "Check code coverage and report uncovered lines.",
      parameters: {
        type: "object",
        properties: {
          module: {
            type: "string",
            description: "Module or file to check coverage for.",
          },
        },
        required: ["module"],
      },
    },
  ],
};

/** Refactoring skill — tools for finding duplication, extracting functions, renaming. */
export const refactoringSkill: Skill = {
  id: "skill_refactoring",
  name: "Refactoring",
  description:
    "Tools for refactoring code: find duplication, extract functions, rename symbols.",
  tools: [
    {
      name: "findDuplication",
      description: "Scan codebase for duplicated code blocks.",
      parameters: {
        type: "object",
        properties: {
          directory: { type: "string", description: "Directory to scan." },
        },
        required: ["directory"],
      },
    },
    {
      name: "extractFunction",
      description: "Extract a code block into a named function.",
      parameters: {
        type: "object",
        properties: {
          code: { type: "string", description: "Code block to extract." },
          name: { type: "string", description: "Name for the new function." },
        },
        required: ["code", "name"],
      },
    },
    {
      name: "renameSymbol",
      description: "Rename a symbol across the codebase.",
      parameters: {
        type: "object",
        properties: {
          oldName: { type: "string", description: "Current symbol name." },
          newName: { type: "string", description: "New symbol name." },
        },
        required: ["oldName", "newName"],
      },
    },
  ],
};

// ── SkillLoader ───────────────────────────────────────────────────────

/**
 * Manages a registry of Skills. Supports registration, lookup,
 * and injection of a skill's tools into a ToolRegistry.
 */
export class SkillLoader {
  private skills = new Map<string, Skill>();

  constructor() {
    // starts with an empty registry
  }

  /** Register a skill definition. */
  register(skill: Skill): void {
    this.skills.set(skill.id, skill);
  }

  /** Load a skill by its ID. Throws if not found. */
  load(skillId: string): Skill {
    const skill = this.skills.get(skillId);
    if (!skill) {
      throw new Error(`SkillLoader: skill "${skillId}" not found`);
    }
    return skill;
  }

  /** Return all registered skills. */
  list(): Skill[] {
    return [...this.skills.values()];
  }

  /** Check whether a skill is registered. */
  has(skillId: string): boolean {
    return this.skills.has(skillId);
  }

  /**
   * Inject a skill's tools into a ToolRegistry.
   *
   * Each tool definition from the skill is registered with a
   * simulated handler that returns a descriptive string.
   */
  inject(skillId: string, registry: ToolRegistry): void {
    const skill = this.load(skillId);

    for (const tool of skill.tools) {
      if (!registry.has(tool.name)) {
        registry.register(tool, async (args: Record<string, unknown>) => {
          return `[${skill.name}] ${tool.name} executed with args: ${JSON.stringify(args)}`;
        });
      }
    }
  }
}
