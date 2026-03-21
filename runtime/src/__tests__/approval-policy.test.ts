import { describe, it, expect } from "vitest";
import {
  ApprovalPolicy,
  allowAll,
  denyDangerous,
  askForWrites,
} from "../approval-policy.js";

describe("ApprovalPolicy", () => {
  describe("allowAll policy", () => {
    it("returns 'allow' for any tool", () => {
      expect(allowAll.evaluate({ name: "shell", arguments: {} })).toBe("allow");
      expect(allowAll.evaluate({ name: "readFile", arguments: {} })).toBe("allow");
      expect(allowAll.evaluate({ name: "anything", arguments: {} })).toBe("allow");
    });
  });

  describe("denyDangerous policy", () => {
    it("returns 'deny' for shell/exec tools", () => {
      expect(denyDangerous.evaluate({ name: "shell", arguments: {} })).toBe("deny");
      expect(denyDangerous.evaluate({ name: "exec", arguments: {} })).toBe("deny");
      expect(denyDangerous.evaluate({ name: "runCommand", arguments: {} })).toBe("deny");
      expect(denyDangerous.evaluate({ name: "bash", arguments: {} })).toBe("deny");
    });

    it("returns 'allow' for safe tools like readFile", () => {
      expect(denyDangerous.evaluate({ name: "readFile", arguments: {} })).toBe("allow");
      expect(denyDangerous.evaluate({ name: "listFiles", arguments: {} })).toBe("allow");
    });
  });

  describe("askForWrites policy", () => {
    it("returns 'allow' for read operations", () => {
      expect(askForWrites.evaluate({ name: "readFile", arguments: {} })).toBe("allow");
      expect(askForWrites.evaluate({ name: "listFiles", arguments: {} })).toBe("allow");
      expect(askForWrites.evaluate({ name: "search", arguments: {} })).toBe("allow");
      expect(askForWrites.evaluate({ name: "grep", arguments: {} })).toBe("allow");
    });

    it("returns 'ask' for write operations", () => {
      expect(askForWrites.evaluate({ name: "writeFile", arguments: {} })).toBe("ask");
      expect(askForWrites.evaluate({ name: "applyPatch", arguments: {} })).toBe("ask");
      expect(askForWrites.evaluate({ name: "deleteFile", arguments: {} })).toBe("ask");
    });

    it("returns 'deny' for shell operations", () => {
      expect(askForWrites.evaluate({ name: "shell", arguments: {} })).toBe("deny");
      expect(askForWrites.evaluate({ name: "exec", arguments: {} })).toBe("deny");
    });

    it("returns default 'ask' for unknown tools", () => {
      expect(askForWrites.evaluate({ name: "unknownTool", arguments: {} })).toBe("ask");
    });
  });

  describe("custom policy", () => {
    it("first matching rule wins", () => {
      const policy = new ApprovalPolicy([
        { label: "deny-write", match: "writeFile", action: "deny" },
        { label: "allow-all", match: /.*/, action: "allow" },
      ]);
      // writeFile matches the first rule → deny
      expect(policy.evaluate({ name: "writeFile", arguments: {} })).toBe("deny");
      // readFile matches the second rule → allow
      expect(policy.evaluate({ name: "readFile", arguments: {} })).toBe("allow");
    });

    it("returns default action when no rules match", () => {
      const policy = new ApprovalPolicy(
        [{ label: "only-read", match: "readFile", action: "allow" }],
        "deny",
      );
      expect(policy.evaluate({ name: "readFile", arguments: {} })).toBe("allow");
      expect(policy.evaluate({ name: "other", arguments: {} })).toBe("deny");
    });
  });

  describe("matchedRule", () => {
    it("returns the label of the first matching rule", () => {
      expect(
        denyDangerous.matchedRule({ name: "shell", arguments: {} }),
      ).toBe("deny-shell");
    });

    it("returns null when no rule matches", () => {
      const policy = new ApprovalPolicy(
        [{ label: "only-read", match: "readFile", action: "allow" }],
        "deny",
      );
      expect(policy.matchedRule({ name: "other", arguments: {} })).toBeNull();
    });
  });
});
