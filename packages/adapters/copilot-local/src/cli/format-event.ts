import pc from "picocolors";

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

export function printCopilotStreamEvent(raw: string, _debug: boolean): void {
  const line = raw.trim();
  if (!line) return;

  let parsed: Record<string, unknown> | null = null;
  try {
    parsed = JSON.parse(line) as Record<string, unknown>;
  } catch {
    console.log(line);
    return;
  }

  const type = asString(parsed.type);
  const data = asRecord(parsed.data) ?? {};

  if (
    type === "session.start" ||
    type === "session.created" ||
    type === "conversation.start" ||
    type === "conversation.created"
  ) {
    const id = asString(data.sessionId) || asString(data.conversationId) || asString(data.id);
    const model = asString(data.model);
    const details = [id ? `session: ${id}` : "", model ? `model: ${model}` : ""]
      .filter(Boolean)
      .join(", ");
    console.log(pc.blue(`Copilot session started${details ? ` (${details})` : ""}`));
    return;
  }

  if (type === "assistant.message_delta") {
    const text = asString(data.deltaContent);
    if (text) process.stdout.write(pc.green(text));
    return;
  }

  // Completed message with full content
  if (type === "assistant.message") {
    const reasoningText = asString(data.reasoningText);
    if (reasoningText) console.log(pc.gray(`thinking: ${reasoningText}`));
    const text = asString(data.content);
    if (text) console.log(pc.green(`\nassistant: ${text}`));
    return;
  }

  // Reasoning / thinking
  if (type === "assistant.reasoning") {
    const text = asString(data.content);
    if (text) console.log(pc.gray(`thinking: ${text}`));
    return;
  }

  // Turn end
  if (type === "assistant.turn_end") {
    return;
  }

  if (
    type === "assistant.message_complete" ||
    type === "assistant.message_completed" ||
    type === "assistant.message_end"
  ) {
    const text = asString(data.content) || asString(data.text) || asString(data.message);
    if (text) console.log(pc.green(`\nassistant: ${text}`));
    else console.log(""); // newline after delta stream
    return;
  }

  if (type === "assistant.message_start" || type === "assistant.message_created") {
    return;
  }

  if (type === "thinking.delta" || type === "assistant.thinking_delta") {
    const text = asString(data.deltaContent) || asString(data.text);
    if (text) process.stdout.write(pc.gray(text));
    return;
  }

  if (
    type === "tool.call" ||
    type === "tool.call_start" ||
    type === "tool.call_started"
  ) {
    const name = asString(data.name, asString(data.tool, "tool"));
    console.log(pc.yellow(`tool_call: ${name}`));
    if (data.input !== undefined) {
      try {
        console.log(pc.gray(JSON.stringify(data.input, null, 2)));
      } catch {
        /* empty */
      }
    }
    return;
  }

  if (
    type === "tool.call_complete" ||
    type === "tool.call_completed" ||
    type === "tool.result"
  ) {
    const isError = data.is_error === true || asString(data.status) === "error";
    const text = asString(data.output) || asString(data.result) || asString(data.content);
    console.log((isError ? pc.red : pc.cyan)(`tool_result${isError ? " (error)" : ""}`));
    if (text) console.log((isError ? pc.red : pc.gray)(text));
    return;
  }

  if (type === "turn.start" || type === "turn.started") {
    console.log(pc.blue("turn started"));
    return;
  }

  if (type === "turn.complete" || type === "turn.completed") {
    const usage = asRecord(data.usage ?? parsed.usage) ?? {};
    const input = asNumber(usage.input_tokens, asNumber(usage.inputTokens));
    const output = asNumber(usage.output_tokens, asNumber(usage.outputTokens));
    const cached = asNumber(usage.cached_input_tokens, asNumber(usage.cachedInputTokens));
    const cost = asNumber(data.total_cost_usd, asNumber(parsed.total_cost_usd));
    console.log(
      pc.blue(`tokens: in=${input} out=${output} cached=${cached} cost=$${cost.toFixed(6)}`),
    );
    return;
  }

  // Final result event
  if (type === "result") {
    const sid = asString(parsed.sessionId);
    const exitCode = asNumber(parsed.exitCode, -1);
    const usage = asRecord(parsed.usage) ?? {};
    const premiumRequests = asNumber(usage.premiumRequests);
    const sessionDurationMs = asNumber(usage.sessionDurationMs);
    const codeChanges = asRecord(usage.codeChanges);
    const linesAdded = codeChanges ? asNumber(codeChanges.linesAdded) : 0;
    const linesRemoved = codeChanges ? asNumber(codeChanges.linesRemoved) : 0;

    const parts: string[] = [];
    if (sid) parts.push(`session: ${sid}`);
    parts.push(`exit: ${exitCode}`);
    if (premiumRequests > 0) parts.push(`premium requests: ${premiumRequests}`);
    if (sessionDurationMs > 0) parts.push(`duration: ${(sessionDurationMs / 1000).toFixed(1)}s`);
    if (linesAdded > 0 || linesRemoved > 0) parts.push(`changes: +${linesAdded} -${linesRemoved}`);
    console.log(pc.blue(parts.join(" | ")));
    return;
  }

  if (type === "turn.failed" || type === "session.failed") {
    const message = errorText(data.error ?? parsed.error ?? data.message ?? parsed.message);
    console.log(pc.red(`turn failed${message ? `: ${message}` : ""}`));
    return;
  }

  if (type === "error") {
    const message =
      asString(data.message) || asString(parsed.message) ||
      asString(data.error) || asString(parsed.error);
    if (message) console.log(pc.red(`error: ${message}`));
    return;
  }

  // Unknown events: pass through
  console.log(line);
}
