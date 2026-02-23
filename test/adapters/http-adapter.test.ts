import { describe, expect, it } from "vitest";
import { HttpAdapter } from "../../src/agents/http-adapter.js";
import type { TaskNode } from "../../src/planner/types.js";

const makeNode = (task: string): TaskNode => ({
  id: "test-node",
  task,
  dependsOn: [],
  status: "pending",
});

describe("HttpAdapter", () => {
  it("has correct type and name", () => {
    const adapter = new HttpAdapter({ name: "api", url: "http://localhost:3000" });
    expect(adapter.name).toBe("api");
    expect(adapter.type).toBe("http");
  });

  it("returns error for unreachable endpoint", async () => {
    const adapter = new HttpAdapter({
      name: "down",
      url: "http://127.0.0.1:1", // unreachable
      timeout: 500,
    });

    const result = await adapter.execute(makeNode("test"));
    expect(result.status).toBe("error");
    expect(result.metadata?.durationMs).toBeDefined();
  });

  it("health check returns false for unreachable endpoint", async () => {
    const adapter = new HttpAdapter({
      name: "down",
      url: "http://127.0.0.1:1",
    });

    const ok = await adapter.healthCheck();
    expect(ok).toBe(false);
  });
});
