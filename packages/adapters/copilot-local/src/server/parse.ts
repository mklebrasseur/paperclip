import { asString, asNumber, parseObject, parseJson } from "@paperclipai/adapter-utils/server-utils";

/**
 * Parse the full stdout from a copilot CLI run (--output-format json).
 *
 * Copilot emits JSONL with dot-notation event types and a `data` payload:
 * - `assistant.message_delta` → streaming text chunks in `data.deltaContent`
 * - `assistant.message` → completed message in `data.content`, `data.outputTokens`
 * - `assistant.reasoning` → thinking text in `data.content`
 * - `assistant.turn_end` → turn finished
 * - `result` → final status with `sessionId`, `exitCode`, `usage`
 */
export function parseCopilotJsonl(stdout: string) {
  let sessionId: string | null = null;
  const messages: string[] = [];
  let currentMessageId: string | null = null;
  let currentMessageParts: string[] = [];
  let errorMessage: string | null = null;
  const usage = {
    inputTokens: 0,
    cachedInputTokens: 0,
    outputTokens: 0,
  };
  let totalCostUsd = 0;

  for (const rawLine of stdout.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;

    const event = parseJson(line);
    if (!event) continue;

    const type = asString(event.type, "");
    const data = parseObject(event.data);

    // Session / conversation initialization
    if (
      type === "session.start" ||
      type === "session.created" ||
      type === "conversation.start" ||
      type === "conversation.created"
    ) {
      const sid =
        asString(data.sessionId, "") ||
        asString(data.conversationId, "") ||
        asString(data.id, "") ||
        asString(event.session_id, "") ||
        asString(event.sessionId, "");
      if (sid) sessionId = sid;
      continue;
    }

    // Streaming message deltas: accumulate deltaContent per messageId
    if (type === "assistant.message_delta") {
      const msgId = asString(data.messageId, "");
      const delta = asString(data.deltaContent, "");
      if (msgId && msgId !== currentMessageId) {
        // New message — flush previous
        if (currentMessageParts.length > 0) {
          messages.push(currentMessageParts.join(""));
        }
        currentMessageId = msgId;
        currentMessageParts = [];
      }
      if (delta) currentMessageParts.push(delta);
      continue;
    }

    // Completed message: full content replaces accumulated deltas for this message
    if (type === "assistant.message") {
      const fullText = asString(data.content, "");
      const msgId = asString(data.messageId, "");
      // Accumulate output tokens from the message event
      usage.outputTokens += asNumber(data.outputTokens, 0);
      if (fullText) {
        // If we were accumulating deltas for this message, discard them
        if (msgId && msgId === currentMessageId) {
          currentMessageParts = [];
          currentMessageId = null;
        }
        messages.push(fullText);
      } else if (currentMessageParts.length > 0) {
        messages.push(currentMessageParts.join(""));
        currentMessageParts = [];
        currentMessageId = null;
      }
      continue;
    }

    // Legacy completed message variants
    if (
      type === "assistant.message_complete" ||
      type === "assistant.message_completed" ||
      type === "assistant.message_end"
    ) {
      const fullText =
        asString(data.content, "") ||
        asString(data.text, "") ||
        asString(data.message, "");
      if (fullText) {
        currentMessageParts = [];
        currentMessageId = null;
        messages.push(fullText);
      } else if (currentMessageParts.length > 0) {
        messages.push(currentMessageParts.join(""));
        currentMessageParts = [];
        currentMessageId = null;
      }
      continue;
    }

    // Reasoning / thinking (ignored for summary, but could be captured)
    if (type === "assistant.reasoning") {
      continue;
    }

    // Turn end (no-op for parsing)
    if (type === "assistant.turn_end") {
      continue;
    }

    // Final result event: carries sessionId and usage at top level
    if (type === "result") {
      const sid = asString(event.sessionId, "");
      if (sid) sessionId = sid;
      const usageObj = parseObject(event.usage);
      // Copilot usage reports premiumRequests, durations, and codeChanges
      // rather than token counts, but we extract what we can
      usage.inputTokens += asNumber(
        usageObj.input_tokens,
        asNumber(usageObj.inputTokens, 0),
      );
      usage.cachedInputTokens += asNumber(
        usageObj.cached_input_tokens,
        asNumber(usageObj.cachedInputTokens, 0),
      );
      usage.outputTokens += asNumber(
        usageObj.output_tokens,
        asNumber(usageObj.outputTokens, 0),
      );
      totalCostUsd += asNumber(
        event.total_cost_usd,
        asNumber(usageObj.total_cost_usd, 0),
      );
      continue;
    }

    // Turn / session completed with usage (legacy / future events)
    if (
      type === "turn.complete" ||
      type === "turn.completed" ||
      type === "session.complete" ||
      type === "session.completed"
    ) {
      const usageObj = parseObject(data.usage ?? event.usage);
      usage.inputTokens += asNumber(
        usageObj.input_tokens,
        asNumber(usageObj.inputTokens, 0),
      );
      usage.cachedInputTokens += asNumber(
        usageObj.cached_input_tokens,
        asNumber(usageObj.cachedInputTokens, asNumber(usageObj.cache_read_input_tokens, 0)),
      );
      usage.outputTokens += asNumber(
        usageObj.output_tokens,
        asNumber(usageObj.outputTokens, 0),
      );
      totalCostUsd += asNumber(
        data.total_cost_usd,
        asNumber(event.total_cost_usd, asNumber(data.cost_usd, asNumber(event.cost_usd, 0))),
      );
      const sid = asString(data.sessionId, asString(data.conversationId, ""));
      if (sid && !sessionId) sessionId = sid;
      continue;
    }

    // Errors
    if (type === "error") {
      const msg =
        asString(data.message, "") ||
        asString(event.message, "") ||
        asString(data.error, "") ||
        asString(event.error, "");
      if (msg.trim()) errorMessage = msg.trim();
      continue;
    }

    if (type === "turn.failed" || type === "session.failed") {
      const errObj = parseObject(data.error ?? event.error);
      const msg =
        asString(errObj.message, "") ||
        asString(data.message, "") ||
        asString(event.message, "");
      if (msg.trim()) errorMessage = msg.trim();
      continue;
    }
  }

  // Flush any remaining delta-accumulated text
  if (currentMessageParts.length > 0) {
    messages.push(currentMessageParts.join(""));
  }

  return {
    sessionId,
    summary: messages.join("\n\n").trim(),
    usage,
    costUsd: totalCostUsd > 0 ? totalCostUsd : null,
    errorMessage,
  };
}

export function isCopilotUnknownSessionError(stdout: string, stderr: string): boolean {
  const haystack = `${stdout}\n${stderr}`
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .join("\n");
  return /unknown (session|conversation)|session .* not found|conversation .* not found|invalid session/i.test(
    haystack,
  );
}
