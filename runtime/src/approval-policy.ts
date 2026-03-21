/**
 * ApprovalPolicy — Gate tool calls with configurable rules.
 *
 * A policy is an ordered list of rules. Each rule matches tool calls
 * by name (string or regex) and returns an action: allow, deny, or ask.
 * First matching rule wins. If no rule matches, the default action applies.
 *
 * Educational implementation for teaching approval workflows.
 */

// ── Types ─────────────────────────────────────────────────────────

/** The three possible approval actions. */
export type ApprovalAction = "allow" | "deny" | "ask";

/** A tool call descriptor passed to the policy for evaluation. */
export interface ToolCallDescriptor {
  name: string;
  arguments: Record<string, unknown>;
}

/** A single rule in the approval policy. */
export interface ApprovalRule {
  /** Human-readable label for this rule. */
  label: string;
  /** Tool name pattern: exact string match or regex. */
  match: string | RegExp;
  /** Action to take when this rule matches. */
  action: ApprovalAction;
}

// ── ApprovalPolicy class ──────────────────────────────────────────

/**
 * Evaluates tool calls against an ordered list of rules.
 * First matching rule wins; unmatched calls get the default action.
 */
export class ApprovalPolicy {
  private rules: ApprovalRule[];
  private defaultAction: ApprovalAction;

  constructor(rules: ApprovalRule[], defaultAction: ApprovalAction = "ask") {
    this.rules = rules;
    this.defaultAction = defaultAction;
  }

  /**
   * Evaluate a tool call against the policy rules.
   * Returns the action from the first matching rule, or the default.
   */
  evaluate(toolCall: ToolCallDescriptor): ApprovalAction {
    for (const rule of this.rules) {
      if (this.matches(rule.match, toolCall.name)) {
        return rule.action;
      }
    }
    return this.defaultAction;
  }

  /**
   * Return the label of the first rule that matched, or null.
   * Useful for logging which rule triggered.
   */
  matchedRule(toolCall: ToolCallDescriptor): string | null {
    for (const rule of this.rules) {
      if (this.matches(rule.match, toolCall.name)) {
        return rule.label;
      }
    }
    return null;
  }

  private matches(pattern: string | RegExp, toolName: string): boolean {
    if (typeof pattern === "string") {
      return toolName === pattern;
    }
    return pattern.test(toolName);
  }
}

// ── Built-in policies ─────────────────────────────────────────────

/** Allow all tool calls unconditionally. */
export const allowAll = new ApprovalPolicy(
  [{ label: "allow-everything", match: /.*/, action: "allow" }],
  "allow",
);

/**
 * Deny dangerous tools (shell, exec, run commands).
 * Everything else is allowed.
 */
export const denyDangerous = new ApprovalPolicy(
  [
    { label: "deny-shell", match: /^(shell|exec|runCommand|bash)$/, action: "deny" },
    { label: "allow-rest", match: /.*/, action: "allow" },
  ],
  "allow",
);

/**
 * Ask for confirmation on write operations.
 * Read operations are allowed; everything else requires approval.
 */
export const askForWrites = new ApprovalPolicy(
  [
    { label: "allow-reads", match: /^(readFile|listFiles|search|grep)$/, action: "allow" },
    { label: "ask-writes", match: /^(writeFile|applyPatch|deleteFile|rename)$/, action: "ask" },
    { label: "deny-shell", match: /^(shell|exec|runCommand|bash)$/, action: "deny" },
  ],
  "ask",
);
