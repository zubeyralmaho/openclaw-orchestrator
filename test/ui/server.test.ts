import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Orchestrator } from "../../src/orchestrator.js";
import { FunctionAdapter } from "../../src/agents/function-adapter.js";
import { DashboardServer } from "../../src/ui/server.js";

let server: DashboardServer;
let orchestrator: Orchestrator;
let baseUrl: string;

beforeAll(async () => {
  orchestrator = new Orchestrator();
  orchestrator.addAgent(
    new FunctionAdapter({
      name: "mock",
      fn: async (task) => `result: ${task}`,
      capabilities: ["general"],
    }),
  );

  server = new DashboardServer({ orchestrator, port: 0 }); // random port
  const addr = await server.start();
  baseUrl = `http://${addr.host}:${addr.port}`;
});

afterAll(() => {
  server.stop();
  orchestrator.shutdown();
});

describe("DashboardServer", () => {
  it("serves the dashboard HTML at GET /", async () => {
    const res = await fetch(`${baseUrl}/`);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/html");
    const body = await res.text();
    expect(body).toContain("OpenClaw Orchestrator");
  });

  it("returns health at GET /api/health", async () => {
    const res = await fetch(`${baseUrl}/api/health`);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.ok).toBe(true);
    expect(data.agents).toHaveLength(1);
    expect(data.agents[0].name).toBe("mock");
    expect(data.gateways).toEqual([]);
  });

  it("returns empty runs at GET /api/runs", async () => {
    const res = await fetch(`${baseUrl}/api/runs`);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(Array.isArray(data)).toBe(true);
  });

  it("returns 404 for unknown run", async () => {
    const res = await fetch(`${baseUrl}/api/runs/nonexistent`);
    expect(res.status).toBe(404);
  });

  it("returns 400 for missing goal", async () => {
    const res = await fetch(`${baseUrl}/api/runs`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toContain("goal");
  });

  it("returns 400 for invalid JSON", async () => {
    const res = await fetch(`${baseUrl}/api/runs`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "not json",
    });
    expect(res.status).toBe(400);
  });

  it("returns 404 for unknown routes", async () => {
    const res = await fetch(`${baseUrl}/api/unknown`);
    expect(res.status).toBe(404);
  });

  it("handles OPTIONS preflight", async () => {
    const res = await fetch(`${baseUrl}/api/runs`, { method: "OPTIONS" });
    expect(res.status).toBe(204);
    expect(res.headers.get("access-control-allow-origin")).toBe("*");
  });

  it("opens SSE connection at GET /api/events", async () => {
    const controller = new AbortController();
    const res = await fetch(`${baseUrl}/api/events`, {
      signal: controller.signal,
      headers: { Accept: "text/event-stream" },
    });
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("text/event-stream");
    controller.abort();
  });

  it("returns 400 for whitespace-only goal", async () => {
    const res = await fetch(`${baseUrl}/api/runs`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ goal: "   " }),
    });
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toContain("goal");
  });

  it("returns 400 for null goal", async () => {
    const res = await fetch(`${baseUrl}/api/runs`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ goal: null }),
    });
    expect(res.status).toBe(400);
  });

  it("returns 404 for POST to unknown API path", async () => {
    const res = await fetch(`${baseUrl}/api/runs/some-id/cancel`, {
      method: "POST",
    });
    expect(res.status).toBe(404);
  });

  it("returns 404 for DELETE (unsupported method)", async () => {
    const res = await fetch(`${baseUrl}/api/runs`, { method: "DELETE" });
    expect(res.status).toBe(404);
  });

  it("CORS headers are present on all responses", async () => {
    const res = await fetch(`${baseUrl}/api/health`);
    expect(res.headers.get("access-control-allow-origin")).toBe("*");
  });

  it("returns 400 for empty body on POST /api/runs", async () => {
    const res = await fetch(`${baseUrl}/api/runs`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "",
    });
    expect(res.status).toBe(400);
  });

  it("health endpoint includes agent capabilities", async () => {
    const res = await fetch(`${baseUrl}/api/health`);
    const data = await res.json();
    expect(data.agents[0].capabilities).toEqual(["general"]);
  });

  it("accepts a goal submission and creates a run", async () => {
    const res = await fetch(`${baseUrl}/api/runs`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ goal: "test goal" }),
    });
    expect(res.status).toBe(201);
    const data = await res.json();
    expect(data.runId).toBeDefined();
    expect(data.goal).toBe("test goal");

    // The run should appear in the list (may be in any state since execution is async)
    const runsRes = await fetch(`${baseUrl}/api/runs`);
    const runs = await runsRes.json();
    const run = runs.find((r: { runId: string }) => r.runId === data.runId);
    expect(run).toBeDefined();
    expect(run.goal).toBe("test goal");
  });
});
