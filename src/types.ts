export type LogLevel = "debug" | "info" | "warn" | "error" | "silent";
export type AgentMode = "agent" | "plan" | "ask";
export type ExecutorId = "cursor";
export type PermissionMode = "autonomous" | "allow-all";

export interface SpawnSpec {
  command: string;
  args: string[];
  env?: NodeJS.ProcessEnv;
}

export interface TodoItem {
  id: string;
  content: string;
  status?: "pending" | "in_progress" | "completed" | "cancelled";
}

export interface TodoProgress {
  total: number;
  completed: number;
  inProgress: number;
  pending: number;
  cancelled: number;
}

export interface CursorQuestion {
  id: string;
  prompt: string;
  options: Array<{ id: string; label: string }>;
  allowMultiple?: boolean;
}

export interface QuestionAnswer {
  questionId: string;
  selectedOptionIds: string[];
}

export interface CapturedPlan {
  name?: string;
  overview?: string;
  detail?: string;
  entries?: Array<{ content: string; status?: string; priority?: string }>;
}

export interface PermissionDecision {
  action: "allow" | "reject";
  summary: string;
  reason?: string;
}

export interface DelegationResult {
  sessionId: string;
  resumed: boolean;
  executor: ExecutorId;
  result: string;
  stopReason?: string;
  workspace: string;
  mode: AgentMode;
  projectContextFiles?: string[];
  filesReportedByEditTools?: string[];
  plan?: CapturedPlan;
  todos?: TodoItem[];
  todoProgress?: TodoProgress;
  cursorQuestions?: CursorQuestion[];
  permissionDecisions?: PermissionDecision[];
  protocolWarnings?: string[];
  cancelRequested?: boolean;
  effectiveModel?: string;
  partial?: boolean;
}
