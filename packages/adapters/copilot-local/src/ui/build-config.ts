import type { CreateConfigValues } from "@paperclipai/adapter-utils";
import { buildCodexLocalConfig } from "@paperclipai/adapter-codex-local/ui";

export function buildCopilotLocalConfig(v: CreateConfigValues): Record<string, unknown> {
  const config = buildCodexLocalConfig(v);
  if (typeof config.command !== "string" || config.command.trim().length === 0) {
    config.command = "copilot";
  }
  return config;
}
