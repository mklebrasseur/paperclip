import { describe, expect, it, vi, beforeEach } from "vitest";

const { executeCursorMock, testEnvironmentCursorMock } = vi.hoisted(() => ({
  executeCursorMock: vi.fn(async (ctx: unknown) => ({
    exitCode: 0,
    signal: null,
    timedOut: false,
    resultJson: ctx,
  })),
  testEnvironmentCursorMock: vi.fn(async (ctx: unknown) => ({
    adapterType: (ctx as { adapterType?: string }).adapterType ?? "copilot_local",
    status: "pass" as const,
    checks: [],
    testedAt: new Date(0).toISOString(),
  })),
}));

vi.mock("@paperclipai/adapter-cursor-local/server", () => ({
  execute: executeCursorMock,
  testEnvironment: testEnvironmentCursorMock,
  parseCursorJsonl: vi.fn(),
  isCursorUnknownSessionError: vi.fn(),
  sessionCodec: {
    deserialize: vi.fn(),
    serialize: vi.fn(),
    getDisplayId: vi.fn(),
  },
}));

import { execute, testEnvironment } from "@paperclipai/adapter-copilot-local/server";

describe("copilot_local adapter wrapper", () => {
  beforeEach(() => {
    executeCursorMock.mockClear();
    testEnvironmentCursorMock.mockClear();
  });

  it("defaults command to copilot and rewrites adapterType in onMeta", async () => {
    const onMeta = vi.fn(async () => {});
    const onLog = vi.fn(async () => {});

    await execute({
      runId: "run-1",
      agent: { id: "agent-1", companyId: "company-1", name: "Agent", role: "engineer" },
      runtime: { sessionId: null, sessionParams: null },
      config: {},
      context: {},
      onLog,
      onMeta,
    });

    expect(executeCursorMock).toHaveBeenCalledTimes(1);
    const forwarded = executeCursorMock.mock.calls[0]?.[0] as {
      config: Record<string, unknown>;
      onMeta?: (meta: Record<string, unknown>) => Promise<void>;
    };

    expect(forwarded.config.command).toBe("copilot");
    expect(forwarded.config.includeWorkspaceArg).toBe(false);
    expect(forwarded.config.passPromptAsArgument).toBe(true);
    expect(typeof forwarded.onMeta).toBe("function");

    await forwarded.onMeta?.({ adapterType: "cursor", command: "copilot" });
    expect(onMeta).toHaveBeenCalledWith(expect.objectContaining({ adapterType: "copilot_local" }));
  });

  it("preserves explicitly configured command", async () => {
    await execute({
      runId: "run-1",
      agent: { id: "agent-1", companyId: "company-1", name: "Agent", role: "engineer" },
      runtime: { sessionId: null, sessionParams: null },
      config: { command: "/usr/local/bin/copilot" },
      context: {},
      onLog: async () => {},
    });

    const forwarded = executeCursorMock.mock.calls[0]?.[0] as { config: Record<string, unknown> };
    expect(forwarded.config.command).toBe("/usr/local/bin/copilot");
  });

  it("defaults environment test command to copilot", async () => {
    await testEnvironment({
      companyId: "company-1",
      adapterType: "copilot_local",
      config: {},
    });

    expect(testEnvironmentCursorMock).toHaveBeenCalledTimes(1);
    const forwarded = testEnvironmentCursorMock.mock.calls[0]?.[0] as { config: Record<string, unknown> };
    expect(forwarded.config.command).toBe("copilot");
  });
});
