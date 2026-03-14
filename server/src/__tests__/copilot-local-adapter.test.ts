import { describe, expect, it, vi, beforeEach } from "vitest";

const { runChildProcessMock } = vi.hoisted(() => ({
  runChildProcessMock: vi.fn(async () => ({
    exitCode: 0,
    signal: null,
    timedOut: false,
    stdout: "",
    stderr: "",
  })),
}));

vi.mock("@paperclipai/adapter-utils/server-utils", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@paperclipai/adapter-utils/server-utils")>();
  return {
    ...actual,
    runChildProcess: runChildProcessMock,
    ensureCommandResolvable: vi.fn(async () => {}),
    ensureAbsoluteDirectory: vi.fn(async () => {}),
  };
});

import { execute, parseCopilotJsonl } from "@paperclipai/adapter-copilot-local/server";
import { parseCopilotStdoutLine } from "@paperclipai/adapter-copilot-local/ui";

function makeCtx(overrides: Record<string, unknown> = {}) {
  return {
    runId: "run-1",
    agent: { id: "agent-1", companyId: "company-1", name: "Agent", adapterType: "copilot_local", adapterConfig: {} },
    runtime: { sessionId: null, sessionParams: null, sessionDisplayId: null, taskKey: null },
    config: {} as Record<string, unknown>,
    context: {} as Record<string, unknown>,
    onLog: vi.fn(async () => {}),
    ...overrides,
  };
}

describe("copilot_local adapter", () => {
  beforeEach(() => {
    runChildProcessMock.mockClear();
  });

  it("passes prompt as -p argument value (not stdin)", async () => {
    await execute(makeCtx());

    expect(runChildProcessMock).toHaveBeenCalledTimes(1);
    const call = runChildProcessMock.mock.calls[0] as unknown as [
      string, string, string[], { stdin?: string },
    ];
    const [, command, args, options] = call;

    expect(command).toBe("copilot");
    // prompt should be passed as arg after -p, not via stdin
    expect(args[0]).toBe("-p");
    expect(typeof args[1]).toBe("string");
    expect(args[1]!.length).toBeGreaterThan(0);
    expect(args).toContain("--output-format");
    expect(args).toContain("json");
    // no --workspace flag
    expect(args).not.toContain("--workspace");
    // no stdin
    expect(options.stdin).toBeUndefined();
  });

  it("defaults command to copilot", async () => {
    await execute(makeCtx());

    const call = runChildProcessMock.mock.calls[0] as unknown as [string, string];
    expect(call[1]).toBe("copilot");
  });

  it("preserves explicitly configured command", async () => {
    await execute(makeCtx({ config: { command: "/usr/local/bin/copilot" } }));

    const call = runChildProcessMock.mock.calls[0] as unknown as [string, string];
    expect(call[1]).toBe("/usr/local/bin/copilot");
  });

  it("reports adapterType as copilot_local in onMeta", async () => {
    const onMeta = vi.fn(async () => {});
    await execute(makeCtx({ onMeta }));

    expect(onMeta).toHaveBeenCalledTimes(1);
    expect(onMeta).toHaveBeenCalledWith(
      expect.objectContaining({ adapterType: "copilot_local" }),
    );
  });

  it("reports billingType as subscription", async () => {
    const result = await execute(makeCtx());
    expect(result.billingType).toBe("subscription");
  });

  it("adds --yolo by default for trust bypass", async () => {
    await execute(makeCtx());

    const call = runChildProcessMock.mock.calls[0] as unknown as [string, string, string[]];
    expect(call[2]).toContain("--yolo");
  });
});

describe("copilot parser", () => {
  it("accumulates message deltas into summary", () => {
    const stdout = [
      JSON.stringify({ type: "assistant.message_delta", data: { messageId: "msg-1", deltaContent: "Hello" } }),
      JSON.stringify({ type: "assistant.message_delta", data: { messageId: "msg-1", deltaContent: " world" } }),
    ].join("\n");

    const parsed = parseCopilotJsonl(stdout);
    expect(parsed.summary).toBe("Hello world");
  });

  it("uses assistant.message content and extracts outputTokens", () => {
    const stdout = [
      JSON.stringify({ type: "assistant.message_delta", data: { messageId: "msg-1", deltaContent: "partial" } }),
      JSON.stringify({
        type: "assistant.message",
        data: { messageId: "msg-1", content: "Full message text", outputTokens: 312, phase: "final_answer" },
      }),
    ].join("\n");

    const parsed = parseCopilotJsonl(stdout);
    expect(parsed.summary).toBe("Full message text");
    expect(parsed.usage.outputTokens).toBe(312);
  });

  it("extracts sessionId from result event", () => {
    const stdout = [
      JSON.stringify({ type: "assistant.message_delta", data: { messageId: "msg-1", deltaContent: "hi" } }),
      JSON.stringify({
        type: "result",
        sessionId: "f024ad55-94ea-47c2-89d9-5ece06569ccd",
        exitCode: 0,
        usage: { premiumRequests: 1, sessionDurationMs: 503183 },
      }),
    ].join("\n");

    const parsed = parseCopilotJsonl(stdout);
    expect(parsed.sessionId).toBe("f024ad55-94ea-47c2-89d9-5ece06569ccd");
    expect(parsed.summary).toBe("hi");
  });

  it("extracts error from error event", () => {
    const stdout = JSON.stringify({ type: "error", data: { message: "model access denied" } });
    const parsed = parseCopilotJsonl(stdout);
    expect(parsed.errorMessage).toBe("model access denied");
  });
});

describe("copilot ui stdout parser", () => {
  it("parses assistant.message_delta as delta entry", () => {
    const ts = "2026-03-13T00:00:00.000Z";
    const entries = parseCopilotStdoutLine(
      JSON.stringify({ type: "assistant.message_delta", data: { messageId: "msg-1", deltaContent: "hello" } }),
      ts,
    );
    expect(entries).toEqual([{ kind: "assistant", ts, text: "hello", delta: true }]);
  });

  it("parses assistant.message as assistant entry with reasoning", () => {
    const ts = "2026-03-13T00:00:00.000Z";
    const entries = parseCopilotStdoutLine(
      JSON.stringify({
        type: "assistant.message",
        data: {
          messageId: "msg-1",
          content: "Task complete.",
          reasoningText: "Planning next steps",
          outputTokens: 50,
          phase: "final_answer",
        },
      }),
      ts,
    );
    expect(entries).toEqual([
      { kind: "thinking", ts, text: "Planning next steps" },
      { kind: "assistant", ts, text: "Task complete." },
    ]);
  });

  it("parses assistant.reasoning as thinking entry", () => {
    const ts = "2026-03-13T00:00:00.000Z";
    const entries = parseCopilotStdoutLine(
      JSON.stringify({ type: "assistant.reasoning", data: { reasoningId: "r-1", content: "Composing response" } }),
      ts,
    );
    expect(entries).toEqual([{ kind: "thinking", ts, text: "Composing response" }]);
  });

  it("parses result event with session and usage", () => {
    const ts = "2026-03-13T00:00:00.000Z";
    const entries = parseCopilotStdoutLine(
      JSON.stringify({
        type: "result",
        sessionId: "sess-1",
        exitCode: 0,
        usage: {
          premiumRequests: 1,
          sessionDurationMs: 60000,
          codeChanges: { linesAdded: 10, linesRemoved: 2, filesModified: ["a.ts"] },
        },
      }),
      ts,
    );
    expect(entries.length).toBe(1);
    expect(entries[0]!.kind).toBe("result");
    if (entries[0]!.kind === "result") {
      expect(entries[0]!.isError).toBe(false);
      expect(entries[0]!.text).toContain("session: sess-1");
      expect(entries[0]!.text).toContain("changes: +10 -2");
    }
  });

  it("parses error events", () => {
    const ts = "2026-03-13T00:00:00.000Z";
    const entries = parseCopilotStdoutLine(
      JSON.stringify({ type: "error", data: { message: "rate limit" } }),
      ts,
    );
    expect(entries).toEqual([{ kind: "stderr", ts, text: "rate limit" }]);
  });

  it("passes unknown events as stdout", () => {
    const ts = "2026-03-13T00:00:00.000Z";
    const raw = JSON.stringify({ type: "custom.unknown", data: { foo: "bar" } });
    const entries = parseCopilotStdoutLine(raw, ts);
    expect(entries).toEqual([{ kind: "stdout", ts, text: raw }]);
  });
});
