import { randomUUID } from "node:crypto";
import type { GatewayClient } from "../gateway/client.js";
import type { TaskNode, TaskResult } from "../planner/types.js";
import { log } from "../utils/logger.js";
import type { AgentAdapter } from "./adapter.js";

export type OpenClawAdapterOptions = {
  name: string;
  client: GatewayClient;
  agentId?: string;
  description?: string;
  capabilities?: string[];
  /** Prepended to every task message to shape agent behavior. */
  rolePrompt?: string;
};

export class OpenClawAdapter implements AgentAdapter {
  readonly name: string;
  readonly type = "openclaw" as const;
  readonly description?: string;
  readonly capabilities?: string[];

  private client: GatewayClient;
  private agentId?: string;
  private rolePrompt?: string;

  constructor(opts: OpenClawAdapterOptions) {
    this.name = opts.name;
    this.client = opts.client;
    this.agentId = opts.agentId;
    this.description = opts.description;
    this.capabilities = opts.capabilities;
    this.rolePrompt = opts.rolePrompt;
  }

  async execute(task: TaskNode): Promise<TaskResult> {
    const start = Date.now();
    try {
      log.info(`[${this.name}] Executing task "${task.id}"`, { task: task.task.slice(0, 100) });

      const message = this.rolePrompt
        ? `[ROLE: ${this.rolePrompt}]\n\n${task.task}`
        : task.task;

      const output = await this.client.chat(message, {
        sessionKey: `task-${task.id}-${randomUUID().slice(0, 8)}`,
        agentId: this.agentId,
      });

      return {
        status: "ok",
        output,
        metadata: {
          gateway: this.client.config.name,
          agentId: this.agentId,
          durationMs: Date.now() - start,
        },
      };
    } catch (err) {
      log.error(`[${this.name}] Task "${task.id}" failed`, { error: String(err) });
      return {
        status: "error",
        output: String(err),
        metadata: { durationMs: Date.now() - start },
      };
    }
  }

  async healthCheck(): Promise<boolean> {
    return this.client.health();
  }
}
