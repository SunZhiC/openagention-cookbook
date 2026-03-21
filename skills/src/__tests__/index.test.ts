import { describe, it, expect } from "vitest";

import {
  AutomationRunner,
  SkillLoader,
  codeReviewSkill,
  refactoringSkill,
  testingSkill,
} from "../index.js";
import * as automationRunnerModule from "../automation-runner.js";
import * as skillLoaderModule from "../skill-loader.js";

describe("@openagention/skills exports", () => {
  it("re-exports the public skill API", () => {
    expect(AutomationRunner).toBe(automationRunnerModule.AutomationRunner);
    expect(SkillLoader).toBe(skillLoaderModule.SkillLoader);
    expect(codeReviewSkill).toBe(skillLoaderModule.codeReviewSkill);
    expect(testingSkill).toBe(skillLoaderModule.testingSkill);
    expect(refactoringSkill).toBe(skillLoaderModule.refactoringSkill);
  });
});
