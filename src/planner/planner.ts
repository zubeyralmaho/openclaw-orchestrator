import { randomUUID } from "node:crypto";
import type { GatewayClient } from "../gateway/client.js";
import type { AgentAdapter } from "../agents/adapter.js";
import { log } from "../utils/logger.js";
import { createTaskGraph } from "./task-graph.js";
import type { TaskGraph, TaskNode } from "./types.js";

const PLANNER_SYSTEM_PROMPT = `You are a task planner. Given a goal, decompose it into a directed acyclic graph (DAG) of subtasks.

Output ONLY valid JSON matching this schema:
{
  "nodes": [
    {
      "id": "unique-id",
      "task": "description of the subtask",
      "dependsOn": ["id-of-dependency"],
      "assignTo": "agent-name-or-capability (optional)"
    }
  ],
  "synthesizerPrompt": "instructions for combining results (optional)"
}

Rules:
- Each node must have a unique "id" (short, descriptive, kebab-case)
- "dependsOn" is an array of node IDs that must complete before this node starts
- Independent tasks should have empty "dependsOn": [] so they run in parallel
- Keep tasks atomic and focused
- Output raw JSON only, no markdown fences`;

export type PlannerOptions = {
  /** Gateway client to use for LLM calls. */
  gateway?: GatewayClient;
  /** Or a custom agent adapter for planning. */
  plannerAgent?: AgentAdapter;
  /** Available agent names/capabilities for task assignment hints. */
  availableAgents?: string[];
};

type PlannerLlmResponse = {
  nodes: Array<{
    id: string;
    task: string;
    dependsOn: string[];
    assignTo?: string;
  }>;
  synthesizerPrompt?: string;
};

export class Planner {
  private gateway?: GatewayClient;
  private plannerAgent?: AgentAdapter;
  private availableAgents: string[];

  constructor(opts: PlannerOptions) {
    this.gateway = opts.gateway;
    this.plannerAgent = opts.plannerAgent;
    this.availableAgents = opts.availableAgents ?? [];
  }

  async plan(goal: string): Promise<TaskGraph> {
    const prompt = this.buildPrompt(goal);
    const raw = await this.callLlm(prompt);
    const parsed = this.parseResponse(raw);
    return createTaskGraph(goal, parsed.nodes, parsed.synthesizerPrompt);
  }

  private buildPrompt(goal: string): string {
    let prompt = `Goal: ${goal}`;
    if (this.availableAgents.length > 0) {
      prompt += `\n\nAvailable agents: ${this.availableAgents.join(", ")}`;
    }
    return prompt;
  }

  private async callLlm(prompt: string): Promise<string> {
    if (this.plannerAgent) {
      const result = await this.plannerAgent.execute({
        id: "plan",
        task: `${PLANNER_SYSTEM_PROMPT}\n\n${prompt}`,
        dependsOn: [],
        status: "pending",
      });
      if (result.status !== "ok") {
        throw new Error(`Planner agent failed: ${result.output}`);
      }
      return result.output;
    }

    if (this.gateway) {
      return this.gateway.chat(`${PLANNER_SYSTEM_PROMPT}\n\n${prompt}`, {
        sessionKey: `planner-${randomUUID().slice(0, 8)}`,
      });
    }

    throw new Error("No LLM source configured. Provide a gateway or plannerAgent.");
  }

  private parseResponse(raw: string): PlannerLlmResponse {
    // Strip markdown fences if present
    const cleaned = raw.replace(/^```(?:json)?\s*\n?/m, "").replace(/\n?```\s*$/m, "").trim();

    let parsed: PlannerLlmResponse;
    try {
      parsed = JSON.parse(cleaned);
    } catch (err) {
      log.error("Failed to parse planner response", { raw: raw.slice(0, 500) });
      throw new Error(`Planner returned invalid JSON: ${err}`);
    }

    if (!Array.isArray(parsed.nodes) || parsed.nodes.length === 0) {
      throw new Error("Planner returned empty or invalid nodes array");
    }

    // Validate each node has required fields
    for (const node of parsed.nodes) {
      if (!node.id || typeof node.id !== "string") {
        throw new Error(`Node missing valid "id": ${JSON.stringify(node)}`);
      }
      if (!node.task || typeof node.task !== "string") {
        throw new Error(`Node "${node.id}" missing valid "task"`);
      }
      if (!Array.isArray(node.dependsOn)) {
        node.dependsOn = [];
      }
    }

    return parsed;
  }
}
