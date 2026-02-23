import { describe, expect, it } from "vitest";
import type { AgentAdapter } from "../src/agents/adapter.js";
import { AgentRegistry } from "../src/agents/registry.js";
import { Executor } from "../src/executor/executor.js";
import type { TaskGraph, TaskResult } from "../src/planner/types.js";

function mockAgent(name: string, handler?: (task: string) => string): AgentAdapter {
  return {
    name,
    type: "function",
    async execute(node) {
      const output = handler ? handler(node.task) : `done: ${node.task}`;
      return { status: "ok", output } satisfies TaskResult;
    },
  };
}

function failingAgent(name: string): AgentAdapter {
  return {
    name,
    type: "function",
    async execute(node) {
      return { status: "error", output: `failed: ${node.task}` } satisfies TaskResult;
    },
  };
}

describe("Executor", () => {
  it("executes a simple linear graph", async () => {
    const agents = new AgentRegistry();
    agents.add(mockAgent("default"));
    const executor = new Executor(agents);

    const graph: TaskGraph = {
      id: "test",
      goal: "test",
      nodes: [
        { id: "a", task: "step 1", dependsOn: [], status: "pending" },
        { id: "b", task: "step 2", dependsOn: ["a"], status: "pending" },
      ],
    };

    const result = await executor.execute(graph);

    expect(result.success).toBe(true);
    expect(result.nodeResults["a"].status).toBe("ok");
    expect(result.nodeResults["b"].status).toBe("ok");
    expect(graph.nodes[0].status).toBe("done");
    expect(graph.nodes[1].status).toBe("done");
  });

  it("executes parallel tasks concurrently", async () => {
    const order: string[] = [];
    const agents = new AgentRegistry();
    agents.add({
      name: "default",
      type: "function",
      async execute(node) {
        order.push(`start:${node.id}`);
        await new Promise((r) => setTimeout(r, 10));
        order.push(`end:${node.id}`);
        return { status: "ok", output: "ok" };
      },
    });
    const executor = new Executor(agents);

    const graph: TaskGraph = {
      id: "test",
      goal: "test",
      nodes: [
        { id: "a", task: "parallel 1", dependsOn: [], status: "pending" },
        { id: "b", task: "parallel 2", dependsOn: [], status: "pending" },
        { id: "c", task: "after both", dependsOn: ["a", "b"], status: "pending" },
      ],
    };

    const result = await executor.execute(graph);

    expect(result.success).toBe(true);
    // a and b should both start before either ends
    expect(order.indexOf("start:a")).toBeLessThan(order.indexOf("end:a"));
    expect(order.indexOf("start:b")).toBeLessThan(order.indexOf("end:b"));
    // c should start after both a and b end
    expect(order.indexOf("start:c")).toBeGreaterThan(order.indexOf("end:a"));
    expect(order.indexOf("start:c")).toBeGreaterThan(order.indexOf("end:b"));
  });

  it("skips downstream nodes on failure", async () => {
    const agents = new AgentRegistry();
    agents.add(failingAgent("default"));
    const executor = new Executor(agents);

    const graph: TaskGraph = {
      id: "test",
      goal: "test",
      nodes: [
        { id: "a", task: "will fail", dependsOn: [], status: "pending" },
        { id: "b", task: "depends on a", dependsOn: ["a"], status: "pending" },
        { id: "c", task: "independent", dependsOn: [], status: "pending" },
      ],
    };

    const result = await executor.execute(graph);

    expect(result.success).toBe(false);
    expect(graph.nodes[0].status).toBe("failed");
    expect(graph.nodes[1].status).toBe("skipped");
    expect(graph.nodes[2].status).toBe("failed"); // also fails because failingAgent
  });

  it("calls onNodeStart and onNodeEnd callbacks", async () => {
    const agents = new AgentRegistry();
    agents.add(mockAgent("default"));
    const executor = new Executor(agents);

    const starts: string[] = [];
    const ends: string[] = [];

    const graph: TaskGraph = {
      id: "test",
      goal: "test",
      nodes: [{ id: "a", task: "do it", dependsOn: [], status: "pending" }],
    };

    await executor.execute(graph, {
      onNodeStart: (id) => starts.push(id),
      onNodeEnd: (id) => ends.push(id),
    });

    expect(starts).toEqual(["a"]);
    expect(ends).toEqual(["a"]);
  });
});
