import type { TranscriptEntry } from "@paperclipai/adapter-utils";

function safeJsonParse(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function asString(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function asNumber(value: unknown, fallback = 0): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function errorText(value: unknown): string {
  if (typeof value === "string") return value;
  const rec = asRecord(value);
  if (!rec) return "";
  return (
    (typeof rec.message === "string" && rec.message) ||
    (typeof rec.error === "string" && rec.error) ||
    (typeof rec.code === "string" && rec.code) ||
    ""
  );
}

function stringifyUnknown(value: unknown): string {
  if (typeof value === "string") return value;
  if (value === null || value === undefined) return "";
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

/**
 * Parse a single copilot JSONL stdout line into transcript entries.
 *
 * Copilot uses dot-notation event types (`assistant.message_delta`) and a
 * `data` payload, which differs from Cursor's stream-json format.
 */
export function parseCopilotStdoutLine(line: string, ts: string): TranscriptEntry[] {
  const parsed = asRecord(safeJsonParse(line));
  if (!parsed) {
    return [{ kind: "stdout", ts, text: line }];
  }

  const type = asString(parsed.type);
  const data = asRecord(parsed.data) ?? {};

  // Session / conversation start
  if (
    type === "session.start" ||
    type === "session.created" ||
    type === "conversation.start" ||
    type === "conversation.created"
  ) {
    const sessionId =
      asString(data.sessionId) ||
      asString(data.conversationId) ||
      asString(data.id) ||
      asString(parsed.session_id) ||
      asString(parsed.sessionId);
    return [{
      kind: "init",
      ts,
      model: asString(data.model, "copilot"),
      sessionId,
    }];
  }

  // Assistant message deltas → merged by UI via delta: true
  if (type === "assistant.message_delta") {
    const text = asString(data.deltaContent);
    if (!text) return [];
    return [{ kind: "assistant", ts, text, delta: true }];
  }

  // Completed message with full content
  if (type === "assistant.message") {
    const entries: TranscriptEntry[] = [];
    // Reasoning text (thinking) from the message event
    const reasoningText = asString(data.reasoningText);
    if (reasoningText) {
      entries.push({ kind: "thinking", ts, text: reasoningText });
    }
    const text = asString(data.content);
    if (text) {
      entries.push({ kind: "assistant", ts, text });
    }
    return entries.length > 0 ? entries : [];
  }

  // Reasoning / thinking event
  if (type === "assistant.reasoning") {
    const text = asString(data.content);
    if (!text) return [];
    return [{ kind: "thinking", ts, text }];
  }

  // Turn end — no-op for transcript
  if (type === "assistant.turn_end") {
    return [];
  }

  // Assistant message lifecycle (start/created are no-ops)
  if (type === "assistant.message_start" || type === "assistant.message_created") {
    return [];
  }

  // Legacy completed message variants
  if (
    type === "assistant.message_complete" ||
    type === "assistant.message_completed" ||
    type === "assistant.message_end"
  ) {
    const text = asString(data.content) || asString(data.text) || asString(data.message);
    if (text) return [{ kind: "assistant", ts, text }];
    return [];
  }

  // Thinking deltas (legacy / future)
  if (type === "thinking.delta" || type === "assistant.thinking_delta") {
    const text = asString(data.deltaContent) || asString(data.text);
    if (!text) return [];
    return [{ kind: "thinking", ts, text, delta: true }];
  }

  // Tool call started
  if (
    type === "tool.call" ||
    type === "tool.call_start" ||
    type === "tool.call_started"
  ) {
    const name = asString(data.name, asString(data.tool, "tool"));
    const toolUseId = asString(data.id) || asString(data.callId) || asString(parsed.id);
    return [{
      kind: "tool_call",
      ts,
      name,
      toolUseId,
      input: data.input ?? data.arguments ?? data.args ?? {},
    }];
  }

  // Tool call completed / result
  if (
    type === "tool.call_complete" ||
    type === "tool.call_completed" ||
    type === "tool.result"
  ) {
    const toolUseId =
      asString(data.id) || asString(data.callId) || asString(parsed.id) || "tool_result";
    const rawOutput = data.output ?? data.result ?? data.content ?? data.text;
    const content = typeof rawOutput === "string" ? rawOutput : stringifyUnknown(rawOutput);
    const isError = data.is_error === true || asString(data.status) === "error";
    return [{
      kind: "tool_result",
      ts,
      toolUseId,
      content,
      isError,
    }];
  }

  // Turn lifecycle
  if (type === "turn.start" || type === "turn.started") {
    return [{ kind: "system", ts, text: "turn started" }];
  }

  if (type === "turn.complete" || type === "turn.completed") {
    const usage = asRecord(data.usage ?? parsed.usage) ?? {};
    const inputTokens = asNumber(usage.input_tokens, asNumber(usage.inputTokens));
    const outputTokens = asNumber(usage.output_tokens, asNumber(usage.outputTokens));
    const cachedTokens = asNumber(
      usage.cached_input_tokens,
      asNumber(usage.cachedInputTokens, asNumber(usage.cache_read_input_tokens)),
    );
    return [{
      kind: "result",
      ts,
      text: asString(data.result, asString(parsed.result)),
      inputTokens,
      outputTokens,
      cachedTokens,
      costUsd: asNumber(data.total_cost_usd, asNumber(parsed.total_cost_usd)),
      subtype: asString(data.subtype, asString(parsed.subtype)),
      isError: data.is_error === true || parsed.is_error === true,
      errors: [],
    }];
  }

  // Final result event: carries sessionId, exitCode, usage at top level
  if (type === "result") {
    const usageRec = asRecord(parsed.usage) ?? {};
    const exitCode = asNumber(parsed.exitCode, -1);
    const sid = asString(parsed.sessionId);
    const premiumRequests = asNumber(usageRec.premiumRequests);
    const sessionDurationMs = asNumber(usageRec.sessionDurationMs);
    const codeChanges = asRecord(usageRec.codeChanges);
    const linesAdded = codeChanges ? asNumber(codeChanges.linesAdded) : 0;
    const linesRemoved = codeChanges ? asNumber(codeChanges.linesRemoved) : 0;

    const parts: string[] = [];
    if (sid) parts.push(`session: ${sid}`);
    parts.push(`exit: ${exitCode}`);
    if (premiumRequests > 0) parts.push(`premium requests: ${premiumRequests}`);
    if (sessionDurationMs > 0) parts.push(`duration: ${(sessionDurationMs / 1000).toFixed(1)}s`);
    if (linesAdded > 0 || linesRemoved > 0) parts.push(`changes: +${linesAdded} -${linesRemoved}`);

    return [{
      kind: "result",
      ts,
      text: parts.join(" | "),
      inputTokens: asNumber(usageRec.input_tokens, asNumber(usageRec.inputTokens)),
      outputTokens: asNumber(usageRec.output_tokens, asNumber(usageRec.outputTokens)),
      cachedTokens: asNumber(usageRec.cached_input_tokens, asNumber(usageRec.cachedInputTokens)),
      costUsd: asNumber(parsed.total_cost_usd),
      subtype: "result",
      isError: exitCode !== 0,
      errors: [],
    }];
  }

  if (type === "turn.failed" || type === "session.failed") {
    const message = errorText(data.error ?? parsed.error ?? data.message ?? parsed.message);
    return [{
      kind: "result",
      ts,
      text: "",
      inputTokens: 0,
      outputTokens: 0,
      cachedTokens: 0,
      costUsd: 0,
      subtype: type,
      isError: true,
      errors: message ? [message] : [],
    }];
  }

  // Error
  if (type === "error") {
    const message =
      asString(data.message) || asString(parsed.message) ||
      asString(data.error) || asString(parsed.error) ||
      line;
    return [{ kind: "stderr", ts, text: message }];
  }

  // Unknown event types: show as stdout so the user sees the raw line
  return [{ kind: "stdout", ts, text: line }];
}
