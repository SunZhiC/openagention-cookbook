// ── Conversation primitives ────────────────────────────────────────

/** A message in the agent conversation. */
export interface Message {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  tool_calls?: ToolCall[];
  tool_call_id?: string;
}

/** A tool call requested by the model. */
export interface ToolCall {
  id: string;
  type: "function";
  function: {
    name: string;
    arguments: string;
  };
}

/** A tool execution result. */
export interface ToolResult {
  tool_call_id: string;
  content: string;
  is_error?: boolean;
}

// ── Tool definition ────────────────────────────────────────────────

/** Schema for a tool the agent can invoke. */
export interface ToolDefinition {
  name: string;
  description: string;
  parameters: object;
}

// ── Task & state ───────────────────────────────────────────────────

export type TaskState =
  | "pending"
  | "running"
  | "blocked"
  | "review"
  | "done"
  | "failed";

export interface Task {
  id: string;
  name: string;
  goal: string;
  state: TaskState;
  worktreeId?: string;
  parentTaskId?: string;
  traceEvents: string[];
}

// ── Thread & Run ───────────────────────────────────────────────────

export type ExecutionLane = "local" | "worktree" | "cloud";

export interface Checkpoint {
  id: string;
  runId: string;
  timestamp: string;
  snapshot: string;
  resumable: boolean;
}

export interface Run {
  id: string;
  threadId: string;
  tasks: Task[];
  lane: ExecutionLane;
  checkpoints: Checkpoint[];
}

export interface Thread {
  id: string;
  title: string;
  runs: Run[];
}

// ── Worktree ───────────────────────────────────────────────────────

export interface Worktree {
  id: string;
  path: string;
  branch: string;
  taskId: string;
  status: "active" | "merged" | "abandoned";
}

// ── Review ─────────────────────────────────────────────────────────

export interface ReviewItem {
  id: string;
  taskId: string;
  content: string;
  state: "pending" | "approved" | "rejected" | "revised";
  reviewer?: string;
  feedback?: string;
}

// ── Skill & Automation ─────────────────────────────────────────────

export interface Skill {
  id: string;
  name: string;
  description: string;
  tools: ToolDefinition[];
}

export interface Automation {
  id: string;
  name: string;
  trigger: string;
  skillId: string;
  status: string;
}

// ── Chat provider interface ────────────────────────────────────────

/**
 * Abstraction over LLM chat completion so the agent loop
 * can be tested with mocks or swapped to different providers.
 */
export interface ChatProvider {
  chat(messages: Message[], tools: ToolDefinition[]): Promise<Message>;
}
