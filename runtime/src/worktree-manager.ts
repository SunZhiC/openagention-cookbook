/**
 * WorktreeManager — Simulated git worktree management.
 *
 * Educational implementation that tracks worktrees in memory.
 * No real git operations are performed — this teaches the concepts
 * of worktree-based isolation for multi-agent coding systems.
 */

import type { Worktree } from "@openagention/core";

let _nextId = 1;
function worktreeId(): string {
  return `wt_${String(_nextId++).padStart(3, "0")}`;
}

/**
 * Manages a set of simulated worktrees.
 * Each worktree is linked to a branch and a task.
 */
export class WorktreeManager {
  private worktrees = new Map<string, Worktree>();
  private basePath: string;

  /**
   * @param basePath - Simulated base directory for worktrees
   */
  constructor(basePath: string = "/tmp/worktrees") {
    this.basePath = basePath;
  }

  /**
   * Create a new worktree for a given branch and task.
   * In a real system this would run `git worktree add`.
   */
  create(branch: string, taskId: string): Worktree {
    // Check for duplicate: same task shouldn't have two active worktrees
    const existing = this.findByTask(taskId);
    if (existing && existing.status === "active") {
      throw new Error(
        `WorktreeManager: task "${taskId}" already has an active worktree (${existing.id})`,
      );
    }

    const id = worktreeId();
    const wt: Worktree = {
      id,
      path: `${this.basePath}/${branch}`,
      branch,
      taskId,
      status: "active",
    };

    this.worktrees.set(id, wt);
    return wt;
  }

  /**
   * Remove (clean up) a worktree by ID.
   * Sets status to "abandoned" if still active, then deletes.
   * In a real system this would run `git worktree remove`.
   */
  remove(worktreeId: string): void {
    const wt = this.worktrees.get(worktreeId);
    if (!wt) {
      throw new Error(`WorktreeManager: worktree "${worktreeId}" not found`);
    }
    this.worktrees.delete(worktreeId);
  }

  /** List all tracked worktrees. */
  list(): Worktree[] {
    return [...this.worktrees.values()];
  }

  /** Find the worktree associated with a task, if any. */
  findByTask(taskId: string): Worktree | undefined {
    for (const wt of this.worktrees.values()) {
      if (wt.taskId === taskId) {
        return wt;
      }
    }
    return undefined;
  }

  /**
   * Mark a worktree as merged (work is complete and integrated).
   */
  markMerged(worktreeId: string): Worktree {
    const wt = this.worktrees.get(worktreeId);
    if (!wt) {
      throw new Error(`WorktreeManager: worktree "${worktreeId}" not found`);
    }
    wt.status = "merged";
    return wt;
  }

  /**
   * Clean up orphaned worktrees — those whose status is "abandoned"
   * or that have been active longer than expected.
   * Returns the list of removed worktree IDs.
   */
  cleanupOrphaned(): string[] {
    const removed: string[] = [];
    for (const [id, wt] of this.worktrees) {
      if (wt.status === "abandoned") {
        this.worktrees.delete(id);
        removed.push(id);
      }
    }
    return removed;
  }

  /**
   * Mark a worktree as abandoned (e.g., task failed or was cancelled).
   */
  markAbandoned(worktreeId: string): Worktree {
    const wt = this.worktrees.get(worktreeId);
    if (!wt) {
      throw new Error(`WorktreeManager: worktree "${worktreeId}" not found`);
    }
    wt.status = "abandoned";
    return wt;
  }
}
