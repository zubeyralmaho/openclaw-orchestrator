import type { TaskGraph, TaskResult } from "../planner/types.js";

export type ExecutionOptions = {
  maxConcurrency?: number;
  onNodeStart?: (nodeId: string) => void;
  onNodeEnd?: (nodeId: string, result: TaskResult) => void;
  abortSignal?: AbortSignal;
};

export type ExecutionResult = {
  graph: TaskGraph;
  success: boolean;
  summary?: string;
  durationMs: number;
  nodeResults: Record<string, TaskResult>;
};
