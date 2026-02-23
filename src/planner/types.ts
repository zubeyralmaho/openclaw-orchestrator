export type TaskNodeConfig = {
  model?: string;
  timeout?: number;
  retries?: number;
};

export type TaskResult = {
  status: "ok" | "error" | "timeout";
  output: string;
  metadata?: Record<string, unknown>;
};

export type TaskStatus = "pending" | "running" | "done" | "failed" | "skipped";

export type TaskNode = {
  id: string;
  task: string;
  dependsOn: string[];
  assignTo?: string;
  status: TaskStatus;
  result?: TaskResult;
  config?: TaskNodeConfig;
};

export type TaskGraph = {
  id: string;
  goal: string;
  nodes: TaskNode[];
  synthesizerPrompt?: string;
};
