import { describe, expect, it } from "vitest";
import { AgentRegistry } from "../src/agents/registry.js";
import { FunctionAdapter } from "../src/agents/function-adapter.js";
import { Orchestrator } from "../src/orchestrator.js";

describe("AgentRegistry", () => {
  it("registers and retrieves agents", () => {
    const registry = new AgentRegistry();
    const agent = new FunctionAdapter({ name: "test", fn: async () => "ok" });
    registry.add(agent);

    expect(registry.get("test")).toBe(agent);
    expect(registry.names()).toEqual(["test"]);
    expect(registry.list()).toHaveLength(1);
  });

  it("throws on duplicate name", () => {
    const registry = new AgentRegistry();
    registry.add(new FunctionAdapter({ name: "test", fn: async () => "ok" }));
    expect(() =>
      registry.add(new FunctionAdapter({ name: "test", fn: async () => "ok" })),
    ).toThrow('already registered');
  });

  it("removes agents", () => {
    const registry = new AgentRegistry();
    registry.add(new FunctionAdapter({ name: "test", fn: async () => "ok" }));
    expect(registry.remove("test")).toBe(true);
    expect(registry.get("test")).toBeUndefined();
    expect(registry.remove("test")).toBe(false);
  });

  it("finds agents by capability", () => {
    const registry = new AgentRegistry();
    registry.add(new FunctionAdapter({ name: "coder", fn: async () => "ok", capabilities: ["code", "debug"] }));
    registry.add(new FunctionAdapter({ name: "writer", fn: async () => "ok", capabilities: ["write", "summarize"] }));

    expect(registry.withCapability("code").map((a) => a.name)).toEqual(["coder"]);
    expect(registry.withCapability("summarize").map((a) => a.name)).toEqual(["writer"]);
    expect(registry.withCapability("unknown")).toEqual([]);
  });

  it("picks by name or capability", () => {
    const registry = new AgentRegistry();
    registry.add(new FunctionAdapter({ name: "coder", fn: async () => "ok", capabilities: ["code"] }));

    expect(registry.pick("coder")?.name).toBe("coder");
    expect(registry.pick("code")?.name).toBe("coder");
    expect(registry.pick("unknown")).toBeUndefined();
  });

  it("list returns empty array when no agents registered", () => {
    const registry = new AgentRegistry();
    expect(registry.list()).toEqual([]);
    expect(registry.names()).toEqual([]);
  });

  it("pick returns undefined on empty registry", () => {
    const registry = new AgentRegistry();
    expect(registry.pick("anything")).toBeUndefined();
  });

  it("withCapability returns empty when agents have no capabilities", () => {
    const registry = new AgentRegistry();
    registry.add(new FunctionAdapter({ name: "bare", fn: async () => "ok" }));
    expect(registry.withCapability("anything")).toEqual([]);
  });
});

describe("Orchestrator agent loop", () => {
  it("finishes immediately when thinker returns finish", async () => {
    const orch = new Orchestrator({
      thinker: async () => JSON.stringify({ action: "finish", answer: "Immediate answer." }),
    });
    orch.addAgent(new FunctionAdapter({ name: "mock", fn: async () => "ok" }));

    const result = await orch.run("simple question");
    expect(result.status).toBe("done");
    expect(result.steps).toHaveLength(0);
    expect(result.finalAnswer).toBe("Immediate answer.");
  });

  it("executes one step then finishes", async () => {
    let callCount = 0;
    const orch = new Orchestrator({
      thinker: async () => {
        callCount++;
        if (callCount === 1) {
          return JSON.stringify({
            action: "execute",
            tasks: [{ id: "t1", task: "do something" }],
          });
        }
        return JSON.stringify({ action: "finish", answer: "All done." });
      },
    });
    orch.addAgent(new FunctionAdapter({ name: "mock", fn: async (task) => `Done: ${task}` }));

    const result = await orch.run("test goal");
    expect(result.status).toBe("done");
    expect(result.steps).toHaveLength(1);
    expect(result.steps[0].tasks[0].status).toBe("done");
    expect(result.steps[0].tasks[0].result?.output).toContain("Done:");
    expect(result.finalAnswer).toBe("All done.");
  });

  it("executes multiple steps", async () => {
    let callCount = 0;
    const orch = new Orchestrator({
      thinker: async () => {
        callCount++;
        if (callCount <= 2) {
          return JSON.stringify({
            action: "execute",
            tasks: [{ id: `t${callCount}`, task: `step ${callCount}` }],
          });
        }
        return JSON.stringify({ action: "finish", answer: "Done after 2 steps." });
      },
    });
    orch.addAgent(new FunctionAdapter({ name: "mock", fn: async (task) => `Result: ${task}` }));

    const result = await orch.run("multi-step goal");
    expect(result.status).toBe("done");
    expect(result.steps).toHaveLength(2);
    expect(result.finalAnswer).toBe("Done after 2 steps.");
  });

  it("handles task failure gracefully", async () => {
    let callCount = 0;
    const orch = new Orchestrator({
      thinker: async () => {
        callCount++;
        if (callCount === 1) {
          return JSON.stringify({
            action: "execute",
            tasks: [{ id: "fail-task", task: "this will fail" }],
          });
        }
        return JSON.stringify({ action: "finish", answer: "Handled failure." });
      },
    });
    orch.addAgent(new FunctionAdapter({
      name: "mock",
      fn: async () => { throw new Error("boom"); },
    }));

    const result = await orch.run("goal with failure");
    expect(result.status).toBe("done");
    expect(result.steps[0].tasks[0].status).toBe("failed");
    expect(result.finalAnswer).toBe("Handled failure.");
  });

  it("respects maxSteps and force-finishes", async () => {
    const orch = new Orchestrator({
      thinker: async () =>
        JSON.stringify({ action: "execute", tasks: [{ id: "loop", task: "repeat" }] }),
    });
    orch.addAgent(new FunctionAdapter({ name: "mock", fn: async () => "ok" }));

    const result = await orch.run("infinite goal", { maxSteps: 2 });
    expect(result.status).toBe("done");
    expect(result.steps).toHaveLength(2);
    // finalAnswer is from emergency synthesize since thinker never returns finish
    expect(result.finalAnswer).toBeDefined();
  });

  it("calls callbacks in correct order", async () => {
    const events: string[] = [];
    let callCount = 0;
    const orch = new Orchestrator({
      thinker: async () => {
        callCount++;
        if (callCount === 1) {
          return JSON.stringify({
            action: "execute",
            tasks: [{ id: "a", task: "task a" }],
          });
        }
        return JSON.stringify({ action: "finish", answer: "done" });
      },
    });
    orch.addAgent(new FunctionAdapter({ name: "mock", fn: async () => "ok" }));

    await orch.run("callback test", {}, {
      onThinking: (n) => events.push(`thinking:${n}`),
      onStepStart: (n) => events.push(`step-start:${n}`),
      onTaskStart: (n, id) => events.push(`task-start:${n}:${id}`),
      onTaskEnd: (n, id) => events.push(`task-end:${n}:${id}`),
      onStepEnd: (n) => events.push(`step-end:${n}`),
      onFinish: () => events.push("finish"),
    });

    expect(events).toEqual([
      "thinking:1",
      "step-start:1",
      "task-start:1:a",
      "task-end:1:a",
      "step-end:1",
      "thinking:2",
      "finish",
    ]);
  });

  it("routes tasks to agents by name", async () => {
    const log: string[] = [];
    let callCount = 0;
    const orch = new Orchestrator({
      thinker: async () => {
        callCount++;
        if (callCount === 1) {
          return JSON.stringify({
            action: "execute",
            tasks: [
              { id: "search", task: "find info", agent: "researcher" },
              { id: "build", task: "write code", agent: "coder" },
            ],
          });
        }
        return JSON.stringify({ action: "finish", answer: "done" });
      },
    });
    orch.addAgent(new FunctionAdapter({
      name: "researcher",
      fn: async (task) => { log.push(`researcher:${task}`); return `researched: ${task}`; },
      capabilities: ["search", "web"],
    }));
    orch.addAgent(new FunctionAdapter({
      name: "coder",
      fn: async (task) => { log.push(`coder:${task}`); return `coded: ${task}`; },
      capabilities: ["code", "debug"],
    }));

    const result = await orch.run("multi-agent goal");
    expect(result.status).toBe("done");
    expect(log).toContain("researcher:find info");
    expect(log).toContain("coder:write code");
    // Verify each task went to the correct agent
    expect(log.find((l) => l.startsWith("coder:find"))).toBeUndefined();
    expect(log.find((l) => l.startsWith("researcher:write"))).toBeUndefined();
  });

  it("routes tasks to agents by capability", async () => {
    let callCount = 0;
    const log: string[] = [];
    const orch = new Orchestrator({
      thinker: async () => {
        callCount++;
        if (callCount === 1) {
          return JSON.stringify({
            action: "execute",
            tasks: [{ id: "t1", task: "do search", agent: "web" }],
          });
        }
        return JSON.stringify({ action: "finish", answer: "done" });
      },
    });
    orch.addAgent(new FunctionAdapter({
      name: "researcher",
      fn: async (task) => { log.push(`researcher:${task}`); return "ok"; },
      capabilities: ["web", "search"],
    }));
    orch.addAgent(new FunctionAdapter({
      name: "coder",
      fn: async (task) => { log.push(`coder:${task}`); return "ok"; },
      capabilities: ["code"],
    }));

    await orch.run("cap routing test");
    expect(log).toEqual(["researcher:do search"]);
  });

  it("falls back to first agent for unknown agent name", async () => {
    let callCount = 0;
    const orch = new Orchestrator({
      thinker: async () => {
        callCount++;
        if (callCount === 1) {
          return JSON.stringify({
            action: "execute",
            tasks: [{ id: "t1", task: "do stuff", agent: "nonexistent" }],
          });
        }
        return JSON.stringify({ action: "finish", answer: "done" });
      },
    });
    orch.addAgent(new FunctionAdapter({ name: "fallback", fn: async () => "fell back" }));

    const result = await orch.run("fallback test");
    expect(result.steps[0].tasks[0].status).toBe("done");
    expect(result.steps[0].tasks[0].result?.output).toBe("fell back");
  });

  // --- Bad input / edge case tests ---

  it("recovers when thinker returns JSON wrapped in markdown fences", async () => {
    let callCount = 0;
    const orch = new Orchestrator({
      thinker: async () => {
        callCount++;
        if (callCount === 1) {
          return '```json\n{"action":"execute","tasks":[{"id":"t1","task":"do it"}]}\n```';
        }
        return JSON.stringify({ action: "finish", answer: "done" });
      },
    });
    orch.addAgent(new FunctionAdapter({ name: "mock", fn: async () => "ok" }));

    const result = await orch.run("fenced json");
    expect(result.status).toBe("done");
    expect(result.steps).toHaveLength(1);
  });

  it("recovers when thinker returns prose before JSON", async () => {
    let callCount = 0;
    const orch = new Orchestrator({
      thinker: async () => {
        callCount++;
        if (callCount === 1) {
          return 'Let me think about this.\n\n{"action":"execute","tasks":[{"id":"t1","task":"do it"}]}';
        }
        return JSON.stringify({ action: "finish", answer: "done" });
      },
    });
    orch.addAgent(new FunctionAdapter({ name: "mock", fn: async () => "ok" }));

    const result = await orch.run("prose before json");
    expect(result.status).toBe("done");
    expect(result.steps).toHaveLength(1);
  });

  it("retries once when thinker returns complete garbage then valid JSON", async () => {
    let callCount = 0;
    const orch = new Orchestrator({
      thinker: async () => {
        callCount++;
        if (callCount === 1) return "I don't understand the question.";
        if (callCount === 2) return JSON.stringify({ action: "finish", answer: "recovered" });
        return JSON.stringify({ action: "finish", answer: "recovered" });
      },
    });
    orch.addAgent(new FunctionAdapter({ name: "mock", fn: async () => "ok" }));

    const result = await orch.run("garbage then recover");
    expect(result.status).toBe("done");
    expect(result.finalAnswer).toBe("recovered");
  });

  it("errors when thinker returns garbage on both attempts", async () => {
    const orch = new Orchestrator({
      thinker: async () => "This is not JSON at all and has no braces",
    });
    orch.addAgent(new FunctionAdapter({ name: "mock", fn: async () => "ok" }));

    const result = await orch.run("always garbage");
    expect(result.status).toBe("error");
    expect(result.error).toContain("no JSON object");
  });

  it("errors when thinker returns execute with empty tasks array", async () => {
    const orch = new Orchestrator({
      thinker: async () => JSON.stringify({ action: "execute", tasks: [] }),
    });
    orch.addAgent(new FunctionAdapter({ name: "mock", fn: async () => "ok" }));

    const result = await orch.run("empty tasks");
    expect(result.status).toBe("error");
    expect(result.error).toContain("no tasks");
  });

  it("errors when thinker returns finish with no answer", async () => {
    const orch = new Orchestrator({
      thinker: async () => JSON.stringify({ action: "finish", answer: "" }),
    });
    orch.addAgent(new FunctionAdapter({ name: "mock", fn: async () => "ok" }));

    const result = await orch.run("no answer");
    expect(result.status).toBe("error");
    expect(result.error).toContain("no answer");
  });

  it("errors when thinker returns unknown action", async () => {
    const orch = new Orchestrator({
      thinker: async () => JSON.stringify({ action: "dance", moves: ["moonwalk"] }),
    });
    orch.addAgent(new FunctionAdapter({ name: "mock", fn: async () => "ok" }));

    const result = await orch.run("unknown action");
    expect(result.status).toBe("error");
    expect(result.error).toContain("Unknown orchestrator action");
  });

  it("errors when thinker throws", async () => {
    const orch = new Orchestrator({
      thinker: async () => { throw new Error("LLM is down"); },
    });
    orch.addAgent(new FunctionAdapter({ name: "mock", fn: async () => "ok" }));

    const result = await orch.run("thinker crash");
    expect(result.status).toBe("error");
    expect(result.error).toContain("LLM is down");
  });

  it("handles no agents registered — tasks fail with descriptive error", async () => {
    let callCount = 0;
    const orch = new Orchestrator({
      thinker: async () => {
        callCount++;
        if (callCount === 1) {
          return JSON.stringify({
            action: "execute",
            tasks: [{ id: "t1", task: "do stuff" }],
          });
        }
        return JSON.stringify({ action: "finish", answer: "done" });
      },
    });
    // No agents added

    const result = await orch.run("no agents");
    expect(result.status).toBe("done");
    expect(result.steps[0].tasks[0].status).toBe("failed");
    expect(result.steps[0].tasks[0].result?.output).toContain("No agent available");
  });

  it("handles all tasks failing in a step — continues to next think", async () => {
    let callCount = 0;
    const orch = new Orchestrator({
      thinker: async () => {
        callCount++;
        if (callCount === 1) {
          return JSON.stringify({
            action: "execute",
            tasks: [
              { id: "a", task: "fail a" },
              { id: "b", task: "fail b" },
            ],
          });
        }
        return JSON.stringify({ action: "finish", answer: "all failed but we survived" });
      },
    });
    orch.addAgent(new FunctionAdapter({
      name: "mock",
      fn: async () => { throw new Error("nope"); },
    }));

    const result = await orch.run("all fail");
    expect(result.status).toBe("done");
    expect(result.steps[0].tasks.every((t) => t.status === "failed")).toBe(true);
    expect(result.finalAnswer).toBe("all failed but we survived");
  });

  it("handles mixed success/failure in same step", async () => {
    let callCount = 0;
    const orch = new Orchestrator({
      thinker: async () => {
        callCount++;
        if (callCount === 1) {
          return JSON.stringify({
            action: "execute",
            tasks: [
              { id: "good", task: "succeed" },
              { id: "bad", task: "fail" },
            ],
          });
        }
        return JSON.stringify({ action: "finish", answer: "partial success" });
      },
    });
    orch.addAgent(new FunctionAdapter({
      name: "mock",
      fn: async (task) => {
        if (task === "fail") throw new Error("intentional");
        return "success";
      },
    }));

    const result = await orch.run("mixed results");
    expect(result.status).toBe("done");
    const tasks = result.steps[0].tasks;
    expect(tasks.find((t) => t.id === "good")?.status).toBe("done");
    expect(tasks.find((t) => t.id === "bad")?.status).toBe("failed");
  });

  it("calls onError callback when run fails", async () => {
    let errorMsg = "";
    const orch = new Orchestrator({
      thinker: async () => { throw new Error("kaboom"); },
    });
    orch.addAgent(new FunctionAdapter({ name: "mock", fn: async () => "ok" }));

    const result = await orch.run("error callback test", {}, {
      onError: (err) => { errorMsg = err; },
    });
    expect(result.status).toBe("error");
    expect(errorMsg).toContain("kaboom");
  });

  it("salvages truncated finish JSON from gateway", async () => {
    const orch = new Orchestrator({
      thinker: async () =>
        '```json\n{"action":"finish","answer":"Here is the answer with lots of detail about HIPAA and GDPR compliance requirements including\\n\\n### Section 1\\nSome content here that goes on and on and then gets truncat',
    });
    orch.addAgent(new FunctionAdapter({ name: "mock", fn: async () => "ok" }));

    const result = await orch.run("truncated finish");
    expect(result.status).toBe("done");
    expect(result.finalAnswer).toContain("HIPAA and GDPR");
    expect(result.finalAnswer).toContain("Section 1");
  });

  it("emergency synthesize returns 'No results collected.' when no tasks succeeded", async () => {
    const orch = new Orchestrator({
      // Always returns execute, never finish — hits maxSteps,
      // then forceFinish also gets garbage, falls to emergencySynthesize
      thinker: async () => JSON.stringify({ action: "execute", tasks: [{ id: "x", task: "do" }] }),
    });
    orch.addAgent(new FunctionAdapter({
      name: "mock",
      fn: async () => { throw new Error("always fail"); },
    }));

    const result = await orch.run("no successes", { maxSteps: 1 });
    expect(result.status).toBe("done");
    expect(result.finalAnswer).toBe("No results collected.");
  });

  it("plan() returns the first action without executing", async () => {
    const orch = new Orchestrator({
      thinker: async () =>
        JSON.stringify({
          action: "execute",
          tasks: [{ id: "research", task: "research the topic" }],
        }),
    });

    const action = await orch.plan("test goal");
    expect(action.action).toBe("execute");
    if (action.action === "execute") {
      expect(action.tasks).toHaveLength(1);
      expect(action.tasks[0].id).toBe("research");
    }
  });
});
