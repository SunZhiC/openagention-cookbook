import { describe, it, expect, beforeEach } from "vitest";
import { WorktreeManager } from "../worktree-manager.js";

describe("WorktreeManager", () => {
  let manager: WorktreeManager;

  beforeEach(() => {
    manager = new WorktreeManager("/tmp/test-worktrees");
  });

  it("creates a worktree and returns a valid Worktree object", () => {
    const wt = manager.create("feature/login", "task_001");
    expect(wt.id).toMatch(/^wt_\d+$/);
    expect(wt.path).toBe("/tmp/test-worktrees/feature/login");
    expect(wt.branch).toBe("feature/login");
    expect(wt.taskId).toBe("task_001");
    expect(wt.status).toBe("active");
  });

  it("lists all created worktrees", () => {
    manager.create("feature/a", "task_a");
    manager.create("feature/b", "task_b");
    const list = manager.list();
    expect(list).toHaveLength(2);
    expect(list.map((w) => w.branch).sort()).toEqual(["feature/a", "feature/b"]);
  });

  it("finds a worktree by taskId", () => {
    manager.create("feature/x", "task_x");
    const found = manager.findByTask("task_x");
    expect(found).toBeDefined();
    expect(found!.taskId).toBe("task_x");
  });

  it("returns undefined when finding by non-existent taskId", () => {
    expect(manager.findByTask("nope")).toBeUndefined();
  });

  it("removes a worktree by ID", () => {
    const wt = manager.create("feature/rm", "task_rm");
    expect(manager.list()).toHaveLength(1);
    manager.remove(wt.id);
    expect(manager.list()).toHaveLength(0);
  });

  it("throws when removing a non-existent worktree", () => {
    expect(() => manager.remove("wt_999")).toThrow("not found");
  });

  it("marks a worktree as merged", () => {
    const wt = manager.create("feature/merge", "task_merge");
    const merged = manager.markMerged(wt.id);
    expect(merged.status).toBe("merged");
  });

  it("marks a worktree as abandoned", () => {
    const wt = manager.create("feature/abandon", "task_abandon");
    const abandoned = manager.markAbandoned(wt.id);
    expect(abandoned.status).toBe("abandoned");
  });

  it("cleans up orphaned (abandoned) worktrees", () => {
    const wt1 = manager.create("feature/ok", "task_ok");
    const wt2 = manager.create("feature/orphan", "task_orphan");
    manager.markAbandoned(wt2.id);

    const removed = manager.cleanupOrphaned();
    expect(removed).toContain(wt2.id);
    expect(removed).not.toContain(wt1.id);
    expect(manager.list()).toHaveLength(1);
    expect(manager.list()[0]!.id).toBe(wt1.id);
  });

  it("prevents duplicate active worktrees for the same task", () => {
    manager.create("feature/dup", "task_dup");
    expect(() => manager.create("feature/dup2", "task_dup")).toThrow(
      "already has an active worktree",
    );
  });
});
