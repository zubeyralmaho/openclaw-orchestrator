import { describe, expect, it } from "vitest";
import {
  createTaskGraph,
  isComplete,
  readyNodes,
  skipDownstream,
  topologicalSort,
  validate,
} from "../src/planner/task-graph.js";
import type { TaskGraph } from "../src/planner/types.js";

describe("createTaskGraph", () => {
  it("creates a valid graph with pending nodes", () => {
    const graph = createTaskGraph("test goal", [
      { id: "a", task: "do A", dependsOn: [] },
      { id: "b", task: "do B", dependsOn: ["a"] },
    ]);

    expect(graph.goal).toBe("test goal");
    expect(graph.nodes).toHaveLength(2);
    expect(graph.nodes[0].status).toBe("pending");
    expect(graph.nodes[1].status).toBe("pending");
  });
});

describe("validate", () => {
  it("throws on missing dependency", () => {
    const graph: TaskGraph = {
      id: "test",
      goal: "test",
      nodes: [{ id: "a", task: "do A", dependsOn: ["nonexistent"], status: "pending" }],
    };
    expect(() => validate(graph)).toThrow('depends on unknown node "nonexistent"');
  });

  it("throws on self-dependency", () => {
    const graph: TaskGraph = {
      id: "test",
      goal: "test",
      nodes: [{ id: "a", task: "do A", dependsOn: ["a"], status: "pending" }],
    };
    expect(() => validate(graph)).toThrow('depends on itself');
  });

  it("throws on cycle", () => {
    const graph: TaskGraph = {
      id: "test",
      goal: "test",
      nodes: [
        { id: "a", task: "do A", dependsOn: ["b"], status: "pending" },
        { id: "b", task: "do B", dependsOn: ["a"], status: "pending" },
      ],
    };
    expect(() => validate(graph)).toThrow("cycle");
  });

  it("accepts a valid DAG", () => {
    const graph: TaskGraph = {
      id: "test",
      goal: "test",
      nodes: [
        { id: "a", task: "do A", dependsOn: [], status: "pending" },
        { id: "b", task: "do B", dependsOn: ["a"], status: "pending" },
        { id: "c", task: "do C", dependsOn: ["a"], status: "pending" },
        { id: "d", task: "do D", dependsOn: ["b", "c"], status: "pending" },
      ],
    };
    expect(() => validate(graph)).not.toThrow();
  });
});

describe("topologicalSort", () => {
  it("returns nodes in dependency order", () => {
    const graph: TaskGraph = {
      id: "test",
      goal: "test",
      nodes: [
        { id: "c", task: "do C", dependsOn: ["a", "b"], status: "pending" },
        { id: "a", task: "do A", dependsOn: [], status: "pending" },
        { id: "b", task: "do B", dependsOn: ["a"], status: "pending" },
      ],
    };

    const sorted = topologicalSort(graph);
    const ids = sorted.map((n) => n.id);

    expect(ids.indexOf("a")).toBeLessThan(ids.indexOf("b"));
    expect(ids.indexOf("a")).toBeLessThan(ids.indexOf("c"));
    expect(ids.indexOf("b")).toBeLessThan(ids.indexOf("c"));
  });
});

describe("readyNodes", () => {
  it("returns nodes with all deps done", () => {
    const graph: TaskGraph = {
      id: "test",
      goal: "test",
      nodes: [
        { id: "a", task: "do A", dependsOn: [], status: "done", result: { status: "ok", output: "" } },
        { id: "b", task: "do B", dependsOn: ["a"], status: "pending" },
        { id: "c", task: "do C", dependsOn: ["b"], status: "pending" },
      ],
    };

    const ready = readyNodes(graph);
    expect(ready.map((n) => n.id)).toEqual(["b"]);
  });

  it("returns multiple independent ready nodes", () => {
    const graph: TaskGraph = {
      id: "test",
      goal: "test",
      nodes: [
        { id: "a", task: "do A", dependsOn: [], status: "pending" },
        { id: "b", task: "do B", dependsOn: [], status: "pending" },
        { id: "c", task: "do C", dependsOn: ["a", "b"], status: "pending" },
      ],
    };

    const ready = readyNodes(graph);
    expect(ready.map((n) => n.id)).toEqual(["a", "b"]);
  });
});

describe("isComplete", () => {
  it("returns true when all nodes are terminal", () => {
    const graph: TaskGraph = {
      id: "test",
      goal: "test",
      nodes: [
        { id: "a", task: "do A", dependsOn: [], status: "done" },
        { id: "b", task: "do B", dependsOn: [], status: "failed" },
        { id: "c", task: "do C", dependsOn: [], status: "skipped" },
      ],
    };
    expect(isComplete(graph)).toBe(true);
  });

  it("returns false when nodes are pending", () => {
    const graph: TaskGraph = {
      id: "test",
      goal: "test",
      nodes: [
        { id: "a", task: "do A", dependsOn: [], status: "done" },
        { id: "b", task: "do B", dependsOn: [], status: "pending" },
      ],
    };
    expect(isComplete(graph)).toBe(false);
  });
});

describe("skipDownstream", () => {
  it("marks transitive dependents as skipped", () => {
    const graph: TaskGraph = {
      id: "test",
      goal: "test",
      nodes: [
        { id: "a", task: "do A", dependsOn: [], status: "failed" },
        { id: "b", task: "do B", dependsOn: ["a"], status: "pending" },
        { id: "c", task: "do C", dependsOn: ["b"], status: "pending" },
        { id: "d", task: "do D", dependsOn: [], status: "pending" },
      ],
    };

    skipDownstream(graph, "a");

    expect(graph.nodes[1].status).toBe("skipped"); // b
    expect(graph.nodes[2].status).toBe("skipped"); // c
    expect(graph.nodes[3].status).toBe("pending"); // d (independent)
  });
});
