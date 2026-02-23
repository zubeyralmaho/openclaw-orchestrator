import type { TaskNode, TaskResult } from "../planner/types.js";

export interface AgentAdapter {
  name: string;
  type: "openclaw" | "http" | "function" | string;
  description?: string;
  capabilities?: string[];

  execute(task: TaskNode): Promise<TaskResult>;
  healthCheck?(): Promise<boolean>;
}
